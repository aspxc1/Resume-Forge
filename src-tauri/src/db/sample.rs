use super::{save, Connection, Table};
use serde_json::{json, Value};

pub fn seed(conn: &mut Connection) -> Result<(), String> {
    let tx = conn
        .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
        .map_err(|e| e.to_string())?;
    let occupied: bool = tx.query_row(
        "SELECT EXISTS(SELECT 1 FROM profile WHERE full_name <> '' OR email <> '' OR phone <> '' OR linkedin_url <> '' OR linkedin_display <> '' OR github_url <> '' OR github_display <> '' OR portfolio_url <> '' OR portfolio_display <> '' OR location <> '') OR EXISTS(SELECT 1 FROM master_items) OR EXISTS(SELECT 1 FROM skill_categories) OR EXISTS(SELECT 1 FROM resume_variants) OR EXISTS(SELECT 1 FROM applications) OR EXISTS(SELECT 1 FROM resume_snapshots)",
        [], |row| row.get(0)
    ).map_err(|e| e.to_string())?;
    if !occupied {
        let sample: Value = serde_json::from_str(include_str!("../../../src/data/sample.json"))
            .map_err(|e| e.to_string())?;
        for table in Table::ALL {
            if let Some(rows) = sample[table.name()].as_array() {
                for row in rows {
                    save(&tx, table, row)?;
                }
            }
        }
        save(
            &tx,
            Table::Setting,
            &json!({"key":"onboarded","value":"true"}),
        )?;
    }
    tx.commit().map_err(|e| e.to_string())
}
