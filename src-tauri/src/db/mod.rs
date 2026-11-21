use rusqlite::{params_from_iter, types::Value as SqlValue, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::{path::Path, time::Duration};

mod sample;
pub use sample::seed;

#[derive(Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Table {
    Profile, Item, Bullet, Category, Skill, Variant, Snapshot, Application, Setting,
}

impl Table {
    pub const ALL: [Self; 9] = [
        Self::Profile, Self::Item, Self::Bullet, Self::Category, Self::Skill,
        Self::Variant, Self::Snapshot, Self::Application, Self::Setting,
    ];

    pub fn name(self) -> &'static str {
        match self {
            Self::Profile => "profile",
            Self::Item => "master_items",
            Self::Bullet => "master_bullets",
            Self::Category => "skill_categories",
            Self::Skill => "master_skills",
            Self::Variant => "resume_variants",
            Self::Snapshot => "resume_snapshots",
            Self::Application => "applications",
            Self::Setting => "settings",
        }
    }

    fn fields(self) -> &'static str {
        match self {
            Self::Profile => "id full_name phone email linkedin_url linkedin_display github_url github_display portfolio_url portfolio_display location",
            Self::Item => "id section title subtitle location date_range url extra_line tags_json sort_order updated_at",
            Self::Bullet => "id item_id content tracks_json sort_order",
            Self::Category => "id name sort_order",
            Self::Skill => "id category_id name tracks_json sort_order",
            Self::Variant => "id name track config_json created_at updated_at",
            Self::Snapshot => "id source_variant_id variant_name track frozen_data_json tex_source pdf_path created_at",
            Self::Application => "id company role track stage location compensation job_url job_description applied_date oa_deadline oa_platform referral notes snapshot_id created_at updated_at",
            Self::Setting => "key value",
        }
    }

    fn key(self) -> &'static str {
        if matches!(self, Self::Setting) { "key" } else { "id" }
    }

    fn order(self) -> &'static str {
        match self {
            Self::Item | Self::Bullet | Self::Category | Self::Skill => "sort_order, id",
            Self::Variant | Self::Snapshot | Self::Application => "created_at DESC, id",
            Self::Setting => "key",
            Self::Profile => "id",
        }
    }
}

pub fn open(path: &Path) -> Result<Connection, String> {
    if let Some(parent) = path.parent().filter(|p| !p.as_os_str().is_empty()) {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    migrate(Connection::open(path).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())
}

pub fn migrate(mut conn: Connection) -> rusqlite::Result<Connection> {
    conn.busy_timeout(Duration::from_secs(5))?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    let tx = conn.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
    let version: u32 = tx.pragma_query_value(None, "user_version", |row| row.get(0))?;
    if version == 0 {
        tx.execute_batch(include_str!("schema.sql"))?;
        tx.pragma_update(None, "user_version", 1)?;
    } else if version > 1 {
        return Err(rusqlite::Error::InvalidQuery);
    }
    tx.commit()?;
    Ok(conn)
}

pub fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

pub fn read(conn: &Connection, table: Table) -> Result<Vec<Value>, String> {
    let fields: Vec<_> = table.fields().split_whitespace().collect();
    let sql = format!("SELECT {} FROM {} ORDER BY {}", fields.join(","), table.name(), table.order());
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let mut object = Map::new();
        for (index, field) in fields.iter().enumerate() {
            let value = match row.get::<_, SqlValue>(index).map_err(|e| e.to_string())? {
                SqlValue::Null => Value::Null,
                SqlValue::Integer(n) => Value::from(n),
                SqlValue::Text(s) if field.ends_with("_json") => serde_json::from_str(&s).map_err(|e| e.to_string())?,
                SqlValue::Text(s) => Value::from(s),
                _ => return Err(format!("Unexpected value in {field}")),
            };
            object.insert((*field).into(), value);
        }
        result.push(Value::Object(object));
    }
    Ok(result)
}

pub fn state(conn: &Connection) -> Result<Value, String> {
    Table::ALL.into_iter().map(|table| {
        read(conn, table).map(|rows| (table.name().to_string(), Value::Array(rows)))
    }).collect::<Result<Map<_, _>, _>>().map(Value::Object)
}

pub fn save(conn: &Connection, table: Table, value: &Value) -> Result<(), String> {
    write_row(conn, table, value, false)
}

pub(crate) fn write_row(conn: &Connection, table: Table, value: &Value, preserve: bool) -> Result<(), String> {
    let mut data = value.as_object().ok_or("Expected a record")?.clone();
    let key = table.key();
    if matches!(table, Table::Profile) {
        data.insert("id".into(), Value::from(1));
    } else if data.get(key).and_then(Value::as_str).filter(|s| !s.trim().is_empty()).is_none() {
        return Err(format!("Missing {key}"));
    }
    let fields: Vec<_> = table.fields().split_whitespace().collect();
    if !preserve {
        if fields.contains(&"updated_at") {
            data.insert("updated_at".into(), Value::from(now()));
        }
        if fields.contains(&"created_at") {
            data.insert("created_at".into(), Value::from(now()));
        }
    }

    let mut columns = Vec::new();
    let mut values = Vec::new();
    for field in fields {
        let Some(value) = data.get(field) else { continue };
        let sql_value = match value {
            Value::Null => SqlValue::Null,
            value if field.ends_with("_json") => SqlValue::Text(value.to_string()),
            Value::Number(n) if n.is_i64() => SqlValue::Integer(n.as_i64().unwrap()),
            Value::String(s) => SqlValue::Text(s.clone()),
            _ => return Err(format!("Invalid value for {field}")),
        };
        columns.push(field);
        values.push(sql_value);
    }
    let bindings = vec!["?"; columns.len()].join(",");
    let updates: Vec<_> = columns.iter().filter(|&&col| col != key && col != "created_at")
        .map(|col| format!("{col}=excluded.{col}")).collect();
    let conflict = if matches!(table, Table::Snapshot) {
        String::new()
    } else if updates.is_empty() {
        format!(" ON CONFLICT({key}) DO NOTHING")
    } else {
        format!(" ON CONFLICT({key}) DO UPDATE SET {}", updates.join(","))
    };
    let sql = format!("INSERT INTO {} ({}) VALUES ({bindings}){conflict}", table.name(), columns.join(","));
    conn.execute(&sql, params_from_iter(values)).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn delete(conn: &Connection, table: Table, id: &str) -> Result<(), String> {
    if matches!(table, Table::Profile | Table::Snapshot) {
        return Err("This record cannot be deleted".into());
    }
    conn.execute(&format!("DELETE FROM {} WHERE {}=?", table.name(), table.key()), [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn save_many(conn: &mut Connection, table: Table, records: &[Value]) -> Result<(), String> {
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    for record in records {
        save(&tx, table, record)?;
    }
    tx.commit().map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests;
