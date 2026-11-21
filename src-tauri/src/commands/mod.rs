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
fn save_records(database: State<'_, Database>, table: Table, records: Vec<Value>) -> Result<Value, String> {
    if matches!(table, Table::Snapshot) {
        return Err("Use the snapshot workflow to freeze a resume".into());
    }
    let mut conn = database.connection()?;
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
    if !["https://", "http://", "mailto:"].iter().any(|scheme| url.starts_with(scheme)) {
        return Err("Only web and email links can be opened".into());
    }
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let path = app.path().data_dir()?.join("ResumeForge");
            let connection = db::open(&path.join("resumeforge.db")).map_err(std::io::Error::other)?;
            app.manage(Database(Mutex::new(connection)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![load_data, save_records, delete_record, seed_demo, open_link])
        .run(tauri::generate_context!())
        .expect("ResumeForge could not start");
}
