use super::{files, Database};
use crate::{
    db::{self, portability, snapshots, Table},
    latex, pdf,
    resume::Resume,
};
use serde::Deserialize;
use serde_json::Value;
use std::fs;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

#[derive(Deserialize)]
pub(super) struct FreezeRequest {
    variant_id: String,
    application_id: Option<String>,
    application: Value,
    resume: Value,
    markup: String,
}

#[tauri::command]
pub(super) async fn freeze_application(
    app: AppHandle,
    request: FreezeRequest,
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let database = app.state::<Database>();
        let settings = files::settings(&database)?;
        let resume: Resume = serde_json::from_value(request.resume.clone())
            .map_err(|e| format!("Invalid resume: {e}"))?;
        let tex = latex::generate(&resume)?;
        let bytes = pdf::render(
            &resume.page_size,
            &request.markup,
            &tex,
            files::pdf_engine(&settings),
        )?;
        let mut conn = database.connection()?;
        snapshots::freeze(
            &mut conn,
            &files::data_dir(&app)?,
            &request.variant_id,
            request.application_id.as_deref(),
            request.application,
            request.resume,
            tex,
            &bytes,
        )?;
        db::state(&conn)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub(super) fn clone_snapshot(
    database: State<'_, Database>,
    id: String,
    name: String,
) -> Result<String, String> {
    let mut conn = database.connection()?;
    snapshots::clone_variant(&mut conn, &id, &name)
}

#[tauri::command]
pub(super) fn open_snapshot_pdf(
    app: AppHandle,
    database: State<'_, Database>,
    id: String,
) -> Result<(), String> {
    let snapshot =
        db::read_id(&*database.connection()?, Table::Snapshot, &id)?.ok_or("Snapshot not found")?;
    let path = snapshots::snapshot_path(&files::data_dir(&app)?, &id)?;
    if snapshot["pdf_path"].is_null() || !path.is_file() {
        return Err("The snapshot PDF could not be found".into());
    }
    app.opener()
        .open_path(path.to_string_lossy().into_owned(), None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(super) async fn export_workspace(
    app: AppHandle,
    format: String,
) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (name, label, extension) = match format.as_str() {
            "json" => ("ResumeForge-backup.json", "ResumeForge backup", "json"),
            "csv" => ("ResumeForge-applications.csv", "Applications CSV", "csv"),
            _ => return Err("Invalid workspace export format".into()),
        };
        let database = app.state::<Database>();
        let settings = files::settings(&database)?;
        let Some(path) = files::choose_save(
            &app,
            settings.get("default_export_dir").map(String::as_str),
            name,
            label,
            extension,
        )?
        else {
            return Ok(None);
        };
        let bytes = {
            let conn = database.connection()?;
            if extension == "json" {
                let backup = portability::backup(&conn, &files::data_dir(&app)?)?;
                serde_json::to_vec_pretty(&backup).map_err(|e| e.to_string())?
            } else {
                portability::applications_csv(&conn)?.into_bytes()
            }
        };
        pdf::write_file(&path, &bytes)?;
        Ok(Some(path.to_string_lossy().into_owned()))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub(super) async fn restore_workspace(app: AppHandle) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let database = app.state::<Database>();
        let Some(path) = app
            .dialog()
            .file()
            .add_filter("ResumeForge backup", &["json"])
            .blocking_pick_file()
        else {
            return db::state(&*database.connection()?);
        };
        let path = path.into_path().map_err(|e| e.to_string())?;
        let reader = fs::File::open(path).map_err(|e| e.to_string())?;
        let backup = serde_json::from_reader(std::io::BufReader::new(reader))
            .map_err(|e| format!("Invalid backup JSON: {e}"))?;
        let mut conn = database.connection()?;
        portability::restore(&mut conn, &files::data_dir(&app)?, backup)?;
        db::state(&conn)
    })
    .await
    .map_err(|e| e.to_string())?
}
