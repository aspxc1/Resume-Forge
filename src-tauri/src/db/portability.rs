use super::{read, snapshots::snapshot_path, write_row, Table};
use base64::{engine::general_purpose::STANDARD, Engine};
use rusqlite::{Connection, TransactionBehavior};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::{
    collections::{BTreeMap, HashSet},
    fs,
    path::{Path, PathBuf},
};

#[derive(Serialize, Deserialize)]
pub struct Backup {
    version: u32,
    tables: Map<String, Value>,
    snapshot_pdfs: BTreeMap<String, String>,
}

pub fn backup(conn: &Connection, root: &Path) -> Result<Backup, String> {
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    let mut tables = Map::new();
    let mut snapshot_pdfs = BTreeMap::new();
    for table in Table::ALL {
        let mut rows = read(&tx, table)?;
        if matches!(table, Table::Snapshot) {
            for row in &mut rows {
                if row["pdf_path"].is_null() {
                    continue;
                }
                let id = row["id"].as_str().ok_or("Invalid snapshot identifier")?;
                let path = snapshot_path(root, id)?;
                let bytes =
                    fs::read(path).map_err(|e| format!("Could not read snapshot PDF {id}: {e}"))?;
                snapshot_pdfs.insert(id.to_owned(), STANDARD.encode(bytes));
                row["pdf_path"] = Value::from(format!("snapshots/{id}.pdf"));
            }
        }
        tables.insert(table.name().into(), Value::Array(rows));
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(Backup {
        version: 1,
        tables,
        snapshot_pdfs,
    })
}

pub fn restore(conn: &mut Connection, root: &Path, mut backup: Backup) -> Result<(), String> {
    if backup.version != 1 {
        return Err("Unsupported ResumeForge backup version".into());
    }
    if backup.tables[Table::Profile.name()]
        .as_array()
        .map(Vec::len)
        != Some(1)
    {
        return Err("A backup must contain one profile".into());
    }
    let mut written = NewPdfs::default();

    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|e| e.to_string())?;
    let previous = read(&tx, Table::Snapshot)?;
    for table in Table::ALL.into_iter().rev() {
        tx.execute(&format!("DELETE FROM {}", table.name()), [])
            .map_err(|e| e.to_string())?;
    }
    for table in Table::ALL {
        let rows = backup
            .tables
            .get_mut(table.name())
            .and_then(Value::as_array_mut)
            .ok_or_else(|| format!("Backup table {} is missing or invalid", table.name()))?;
        if matches!(table, Table::ApplicationEvent) {
            tx.execute("DELETE FROM application_stage_events", [])
                .map_err(|e| e.to_string())?;
        }
        for row in rows {
            if matches!(table, Table::Snapshot) {
                let id = row["id"].as_str().ok_or("Invalid snapshot identifier")?;
                let path = snapshot_path(root, id)?;
                let frozen: crate::resume::Resume =
                    serde_json::from_value(row["frozen_data_json"].clone())
                        .map_err(|e| format!("Invalid frozen resume: {e}"))?;
                frozen.layout.validate()?;
                if !row["pdf_path"].is_null() {
                    let encoded = backup
                        .snapshot_pdfs
                        .remove(id)
                        .ok_or("Backup is missing a snapshot PDF")?;
                    let bytes = STANDARD
                        .decode(encoded)
                        .map_err(|_| "Invalid snapshot PDF encoding")?;
                    if !bytes.starts_with(b"%PDF-") {
                        return Err("Invalid snapshot PDF".into());
                    }
                    match fs::read(&path) {
                        Ok(existing) if existing != bytes => {
                            return Err(format!(
                                "The PDF for snapshot {id} differs from the existing file"
                            ))
                        }
                        Ok(_) => {}
                        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                            fs::create_dir_all(root.join("snapshots"))
                                .map_err(|e| e.to_string())?;
                            crate::pdf::write_new_file(&path, &bytes)?;
                            written.0.push(path.clone());
                        }
                        Err(error) => return Err(error.to_string()),
                    }
                    row["pdf_path"] = serde_json::to_value(path).map_err(|e| e.to_string())?;
                }
            }
            write_row(&tx, table, row, true)?;
        }
    }
    if !backup.snapshot_pdfs.is_empty() {
        return Err("Backup contains unrelated snapshot PDFs".into());
    }
    // Keep old PDFs reachable until SQLite commits. An interrupted restore
    // can leave unused files, but cannot take PDFs away from live rows.
    tx.commit().map_err(|e| e.to_string())?;
    written.0.clear();
    prune_previous(conn, root, previous);
    Ok(())
}

fn prune_previous(conn: &mut Connection, root: &Path, previous: Vec<Value>) {
    // Hold a fresh write reservation while pruning and re-check which IDs
    // are live. A second instance may have completed a restore after ours.
    let Ok(tx) = conn.transaction_with_behavior(TransactionBehavior::Immediate) else {
        return;
    };
    let Ok(current) = read(&tx, Table::Snapshot) else {
        return;
    };
    let live: HashSet<_> = current
        .iter()
        .filter(|row| !row["pdf_path"].is_null())
        .filter_map(|row| row["id"].as_str())
        .collect();
    for snapshot in previous.iter().filter(|row| !row["pdf_path"].is_null()) {
        if let Some(id) = snapshot["id"].as_str().filter(|id| !live.contains(id)) {
            if let Ok(path) = snapshot_path(root, id) {
                let _ = fs::remove_file(path);
            }
        }
    }
}

#[derive(Default)]
struct NewPdfs(Vec<PathBuf>);

impl Drop for NewPdfs {
    fn drop(&mut self) {
        for path in &self.0 {
            let _ = fs::remove_file(path);
        }
    }
}

pub fn applications_csv(conn: &Connection) -> Result<String, String> {
    let fields = Table::Application
        .fields()
        .split_whitespace()
        .collect::<Vec<_>>();
    let mut csv = format!("{}\r\n", fields.join(","));
    for row in read(conn, Table::Application)? {
        let cells = fields
            .iter()
            .map(|field| {
                let value = &row[*field];
                let text = match value {
                    Value::String(text) => text.clone(),
                    Value::Null => String::new(),
                    other => other.to_string(),
                };
                let formula = text.trim_start().starts_with(['=', '+', '-', '@']);
                format!(
                    "\"{}{}\"",
                    if formula { "'" } else { "" },
                    text.replace('"', "\"\"")
                )
            })
            .collect::<Vec<_>>();
        csv.push_str(&cells.join(","));
        csv.push_str("\r\n");
    }
    Ok(csv)
}
