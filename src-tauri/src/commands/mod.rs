mod files;
mod tracker;

use crate::db::{self, Table};
use rusqlite::Connection;
use serde_json::Value;
use std::sync::Mutex;
use tauri::{Manager, State};
use tauri_plugin_opener::OpenerExt;

struct Database(Mutex<Connection>);

impl Database {
    fn connection(&self) -> Result<std::sync::MutexGuard<'_, Connection>, String> {
        self.0.lock().map_err(|_| "Database is unavailable".into())
    }
}

#[tauri::command]
fn load_data(database: State<'_, Database>) -> Result<Value, String> {
    db::state(&*database.connection()?)
}

#[tauri::command]
fn save_records(
    database: State<'_, Database>,
    table: Table,
    records: Vec<Value>,
) -> Result<Value, String> {
    if matches!(table, Table::Snapshot | Table::ApplicationEvent) {
        return Err("Use the snapshot workflow to freeze a resume".into());
    }
    let mut conn = database.connection()?;
    if matches!(table, Table::Application) {
        for row in &records {
            let old = match row["id"].as_str() {
                Some(id) => db::read_id(&conn, table, id)?,
                None => None,
            };
            if let Some(snapshot_id) = row.get("snapshot_id") {
                if old.as_ref().map_or(&Value::Null, |app| &app["snapshot_id"]) != snapshot_id {
                    return Err("Use the snapshot workflow to attach a resume".into());
                }
            }
        }
    }
    db::save_many(&mut conn, table, &records)?;
    db::state(&conn)
}

#[tauri::command]
fn delete_record(database: State<'_, Database>, table: Table, id: String) -> Result<Value, String> {
    let conn = database.connection()?;
    db::delete(&conn, table, &id)?;
    db::state(&conn)
}

#[tauri::command]
fn seed_demo(database: State<'_, Database>) -> Result<Value, String> {
    let mut conn = database.connection()?;
    db::seed(&mut conn)?;
    db::state(&conn)
}

#[tauri::command]
fn open_link(app: tauri::AppHandle, url: String) -> Result<(), String> {
    if !["https://", "http://", "mailto:"]
        .iter()
        .any(|scheme| url.starts_with(scheme))
    {
        return Err("Only web and email links can be opened".into());
    }
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn save_entry(
    database: State<'_, Database>,
    item: Value,
    bullets: Vec<Value>,
) -> Result<Value, String> {
    let id = item["id"].as_str().ok_or("Invalid entry ID")?;
    let mut conn = database.connection()?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    db::save(&tx, Table::Item, &item)?;
    let prior = db::read(&tx, Table::Bullet)?;
    for bullet in prior.iter().filter(|bullet| bullet["item_id"] == id) {
        if !bullets.iter().any(|row| row["id"] == bullet["id"]) {
            db::delete(&tx, Table::Bullet, bullet["id"].as_str().unwrap())?;
        }
    }
    for bullet in bullets {
        if bullet["item_id"] != id
            || prior
                .iter()
                .any(|row| row["id"] == bullet["id"] && row["item_id"] != id)
        {
            return Err("Bullet was assigned to the wrong entry".into());
        }
        db::save(&tx, Table::Bullet, &bullet)?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    db::state(&conn)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let path = files::data_dir(app.handle()).map_err(std::io::Error::other)?;
            let connection =
                db::open(&path.join("resumeforge.db")).map_err(std::io::Error::other)?;
            app.manage(Database(Mutex::new(connection)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_data,
            save_records,
            delete_record,
            seed_demo,
            open_link,
            files::export_resume,
            files::check_pdflatex,
            files::reveal_file,
            files::pick_directory,
            save_entry,
            tracker::freeze_application,
            tracker::clone_snapshot,
            tracker::open_snapshot_pdf,
            tracker::export_workspace,
            tracker::restore_workspace
        ])
        .run(tauri::generate_context!())
        .expect("ResumeForge could not start");
}
