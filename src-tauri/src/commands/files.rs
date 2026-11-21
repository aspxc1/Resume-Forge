use super::Database;
use crate::{
    db::{self, Table},
    latex, pdf,
    resume::Resume,
};
use serde_json::Value;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

pub(super) fn settings(
    database: &Database,
) -> Result<std::collections::HashMap<String, String>, String> {
    let conn = database.connection()?;
    Ok(db::read(&conn, Table::Setting)?
        .into_iter()
        .filter_map(|row| {
            Some((
                row["key"].as_str()?.to_owned(),
                row["value"].as_str()?.to_owned(),
            ))
        })
        .collect())
}

pub(super) fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .data_dir()
        .map(|path| path.join("ResumeForge"))
        .map_err(|error| error.to_string())
}

pub(super) fn choose_save(
    app: &AppHandle,
    directory: Option<&str>,
    name: &str,
    label: &str,
    extension: &str,
) -> Result<Option<PathBuf>, String> {
    let mut dialog = app
        .dialog()
        .file()
        .set_file_name(name)
        .add_filter(label, &[extension]);
    if let Some(path) = directory.map(PathBuf::from).filter(|path| path.is_dir()) {
        dialog = dialog.set_directory(path);
    }
    dialog
        .blocking_save_file()
        .map(|path| path.into_path().map_err(|e| e.to_string()))
        .transpose()
}

pub(super) fn pdf_engine(
    settings: &std::collections::HashMap<String, String>,
) -> pdf::EngineChoice<'_> {
    if settings
        .get("pdf_engine")
        .is_some_and(|value| value == "pdflatex")
    {
        pdf::EngineChoice::Latex(settings.get("pdflatex_path").map(String::as_str))
    } else {
        pdf::EngineChoice::Builtin
    }
}

#[derive(serde::Deserialize)]
pub(super) struct ExportRequest {
    resume: Value,
    markup: String,
    format: String,
    variant: String,
    company: String,
    role: String,
}

#[tauri::command]
pub(super) async fn export_resume(
    app: AppHandle,
    request: ExportRequest,
) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let settings = settings(&app.state::<Database>())?;
        let resume: Resume =
            serde_json::from_value(request.resume).map_err(|e| format!("Invalid resume: {e}"))?;
        let (label, extension) = match request.format.as_str() {
            "pdf" => ("PDF document", "pdf"),
            "tex" => ("LaTeX source", "tex"),
            _ => return Err("Unknown export format".into()),
        };
        let tex = latex::generate(&resume)?;
        let pattern = settings
            .get("filename_pattern")
            .map(String::as_str)
            .filter(|s| !s.trim().is_empty())
            .unwrap_or(pdf::DEFAULT_PATTERN);
        let name = pdf::filename(
            pattern,
            &resume.profile.full_name,
            &request.company,
            &request.role,
            &request.variant,
            extension,
        );
        let Some(path) = choose_save(
            &app,
            settings.get("default_export_dir").map(String::as_str),
            &name,
            label,
            extension,
        )?
        else {
            return Ok(None);
        };
        let bytes = if extension == "pdf" {
            pdf::render(
                &resume.page_size,
                &request.markup,
                &tex,
                pdf_engine(&settings),
            )?
        } else {
            tex.into_bytes()
        };
        pdf::write_file(&path, &bytes)?;
        Ok(Some(path.to_string_lossy().into_owned()))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub(super) fn check_pdflatex(path: Option<String>) -> Option<String> {
    pdf::pdflatex(path.as_deref()).map(|path| path.to_string_lossy().into_owned())
}

#[tauri::command]
pub(super) fn reveal_file(app: AppHandle, path: String) -> Result<(), String> {
    let path = PathBuf::from(path);
    if !path.is_absolute() || !path.is_file() {
        return Err("The exported file could not be found".into());
    }
    app.opener()
        .reveal_item_in_dir(path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(super) async fn pick_directory(app: AppHandle) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .blocking_pick_folder()
            .map(|path| {
                path.into_path()
                    .map(|path| path.to_string_lossy().into_owned())
                    .map_err(|e| e.to_string())
            })
            .transpose()
    })
    .await
    .map_err(|e| e.to_string())?
}
