use super::{now, read_id, save, Table};
use crate::{pdf, resume::Resume};
use rusqlite::{params, Connection, TransactionBehavior};
use serde_json::{json, Value};
use std::{
    fs,
    path::{Path, PathBuf},
};
use uuid::Uuid;

pub fn snapshot_path(root: &Path, id: &str) -> Result<PathBuf, String> {
    let uuid = Uuid::parse_str(id).map_err(|_| "Invalid snapshot identifier")?;
    if uuid.to_string() != id {
        return Err("Invalid snapshot identifier".into());
    }
    Ok(root.join("snapshots").join(format!("{id}.pdf")))
}

#[allow(clippy::too_many_arguments)]
pub fn freeze(
    conn: &mut Connection,
    root: &Path,
    variant_id: &str,
    application_id: Option<&str>,
    mut application: Value,
    frozen: Value,
    tex: String,
    pdf_bytes: &[u8],
) -> Result<String, String> {
    let resume: Resume =
        serde_json::from_value(frozen.clone()).map_err(|e| format!("Invalid resume: {e}"))?;
    resume.layout.validate()?;
    if !pdf_bytes.starts_with(b"%PDF-") {
        return Err("A valid PDF is required to freeze a resume".into());
    }
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|e| e.to_string())?;
    let variant =
        read_id(&tx, Table::Variant, variant_id)?.ok_or("The source variant was deleted")?;
    let record = application
        .as_object_mut()
        .ok_or("Expected an application record")?;
    if let Some(id) = application_id {
        let existing =
            read_id(&tx, Table::Application, id)?.ok_or("The application was deleted")?;
        if !existing["snapshot_id"].is_null() {
            return Err("This application already has a frozen resume".into());
        }
        record.insert("id".into(), json!(id));
    } else if let Some(id) = record.get("id").and_then(Value::as_str) {
        if read_id(&tx, Table::Application, id)?.is_some() {
            return Err("The application already exists".into());
        }
    } else {
        record.insert("id".into(), json!(Uuid::new_v4().to_string()));
    }
    for field in ["company", "role"] {
        if record
            .get(field)
            .and_then(Value::as_str)
            .is_none_or(|s| s.trim().is_empty())
        {
            return Err(format!("An application {field} is required"));
        }
    }
    if !record.get("stage").is_some_and(|stage| {
        matches!(
            stage.as_str(),
            Some("oa" | "technical" | "final" | "offer" | "rejected" | "ghosted")
        )
    }) {
        record.insert("stage".into(), json!("applied"));
    }
    if record.get("applied_date").is_none_or(Value::is_null) {
        record.insert(
            "applied_date".into(),
            json!(chrono::Local::now().date_naive().to_string()),
        );
    }
    let id = Uuid::new_v4().to_string();
    let path = snapshot_path(root, &id)?;
    let row = json!({
        "id":id, "source_variant_id":variant_id, "variant_name":variant["name"], "track":variant["track"],
        "frozen_data_json":frozen, "tex_source":tex, "pdf_path":path, "created_at":now()
    });
    save(&tx, Table::Snapshot, &row)?;
    record.insert("snapshot_id".into(), json!(id));
    save(&tx, Table::Application, &application)?;
    fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
    pdf::write_new_file(&path, pdf_bytes)?;
    if let Err(error) = tx.commit() {
        let _ = fs::remove_file(path);
        return Err(error.to_string());
    }
    Ok(id)
}

fn array<'a>(value: &'a Value, field: &str) -> Result<&'a Vec<Value>, String> {
    value[field]
        .as_array()
        .ok_or_else(|| format!("Invalid snapshot field {field}"))
}

pub fn clone_variant(
    conn: &mut Connection,
    snapshot_id: &str,
    name: &str,
) -> Result<String, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("A variant name is required".into());
    }
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let snapshot = read_id(&tx, Table::Snapshot, snapshot_id)?.ok_or("Snapshot not found")?;
    let document = &snapshot["frozen_data_json"];
    let mut selected_items = Vec::new();
    let mut selected_skills = Vec::new();
    let mut section_order = Vec::new();
    let mut section_titles = serde_json::Map::new();
    let mut category_order: i64 = tx
        .query_row(
            "SELECT coalesce(max(sort_order), -1) + 1 FROM skill_categories",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    for section in array(document, "sections")? {
        let key = section["key"].as_str().ok_or("Invalid section key")?;
        section_order.push(key);
        section_titles.insert(key.to_owned(), section["title"].clone());
        let mut item_order: i64 = tx
            .query_row(
                "SELECT coalesce(max(sort_order), -1) + 1 FROM master_items WHERE section = ?1",
                params![key],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        for entry in array(section, "items")? {
            let id = Uuid::new_v4().to_string();
            let mut item = entry.clone();
            item["id"] = json!(id);
            item["section"] = json!(key);
            item["sort_order"] = json!(item_order);
            save(&tx, Table::Item, &item)?;
            item_order += 1;
            let mut bullet_ids = Vec::new();
            for (order, bullet) in array(entry, "bullets")?.iter().enumerate() {
                let bullet_id = Uuid::new_v4().to_string();
                let mut new_bullet = bullet.clone();
                new_bullet["id"] = json!(bullet_id);
                new_bullet["item_id"] = json!(id);
                new_bullet["sort_order"] = json!(order);
                save(&tx, Table::Bullet, &new_bullet)?;
                bullet_ids.push(bullet_id);
            }
            selected_items.push(json!({"item_id":id, "bullet_ids":bullet_ids}));
        }
        for category in array(section, "skills")? {
            let category_id = Uuid::new_v4().to_string();
            save(
                &tx,
                Table::Category,
                &json!({"id":category_id, "name": category["name"], "sort_order":category_order}),
            )?;
            category_order += 1;
            let mut skill_ids = Vec::new();
            for (order, skill) in array(category, "skills")?.iter().enumerate() {
                let id = Uuid::new_v4().to_string();
                let mut new_skill = skill.clone();
                new_skill["id"] = json!(id);
                new_skill["category_id"] = json!(category_id);
                new_skill["sort_order"] = json!(order);
                save(&tx, Table::Skill, &new_skill)?;
                skill_ids.push(id);
            }
            selected_skills.push(json!({"category_id":category_id,"skill_ids":skill_ids}));
        }
    }
    for key in [
        "education",
        "experience",
        "projects",
        "leadership",
        "publications",
        "skills",
    ] {
        if !section_order.contains(&key) {
            section_order.push(key);
        }
    }
    let id = Uuid::new_v4().to_string();
    save(
        &tx,
        Table::Variant,
        &json!({
            "id":id, "name":name, "track":snapshot["track"],
            "config_json":{"page_size":document["page_size"], "layout":document["layout"],
                "section_order":section_order, "section_titles":section_titles,
                "selected_items":selected_items,"selected_skills":selected_skills, "profile_override":document["profile"]}
        }),
    )?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(id)
}
