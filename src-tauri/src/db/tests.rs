use super::*;

#[test]
fn migration_and_seed_are_idempotent() {
    let mut db = migrate(Connection::open_in_memory().unwrap()).unwrap();
    assert_eq!(read(&db, Table::Profile).unwrap().len(), 1);
    assert!(read(&db, Table::Item).unwrap().is_empty());
    seed(&mut db).unwrap();
    seed(&mut db).unwrap();
    let db = migrate(db).unwrap();
    assert_eq!(read(&db, Table::Variant).unwrap().len(), 2);
    assert_eq!(read(&db, Table::Application).unwrap().len(), 5);
}

#[test]
fn item_updates_persist_and_deletion_cascades() {
    let directory = std::env::temp_dir().join(uuid::Uuid::new_v4().to_string());
    let path = directory.join("resumeforge.db");
    let db = open(&path).unwrap();
    save(
        &db,
        Table::Item,
        &serde_json::json!({"id":"item","title":"Kernel","section":"projects","sort_order":2}),
    )
    .unwrap();
    save(&db, Table::Bullet, &serde_json::json!({"id":"bullet","item_id":"item","content":"Built it","tracks_json":["Systems"]})).unwrap();
    drop(db);
    let db = open(&path).unwrap();
    assert_eq!(
        read(&db, Table::Bullet).unwrap()[0]["tracks_json"][0],
        "Systems"
    );
    assert_eq!(read(&db, Table::Item).unwrap()[0]["sort_order"], 2);
    delete(&db, Table::Item, "item").unwrap();
    assert!(read(&db, Table::Bullet).unwrap().is_empty());
    drop(db);
    std::fs::remove_dir_all(directory).unwrap();
}

#[test]
fn frozen_resume_survives_master_deletion_and_backup_round_trip() {
    use super::{portability, snapshots};
    let mut db = migrate(Connection::open_in_memory().unwrap()).unwrap();
    seed(&mut db).unwrap();
    let directory = tempfile::tempdir().unwrap();
    let frozen = serde_json::json!({
        "profile": read(&db, Table::Profile).unwrap()[0],
        "sections": [{
            "key": "projects", "title": "Projects", "skills": [],
            "items": [{ "id":"pulse", "title":"PulseDB", "subtitle":"Rust", "location":"",
                "date_range":"Jan. 2026", "url":"", "extra_line":"", "section":"projects", "tags_json":["SWE"],
                "bullets":[{"id":"bullet-6","content":"Measured **48K writes/sec**.","tracks_json":["SWE"]}]}]
        }],
        "page_size":"letter",
        "layout":{"margin_x_in":0.55,"margin_y_in":0.48,"font_size_pt":10.5,"line_height":1.17,"section_gap_pt":8,"item_gap_pt":5,"bullet_gap_pt":1}
    });
    let pdf = b"%PDF-1.7\nimmutable test fixture";
    let app = serde_json::json!({"id":"frozen-app","company":"Orbit","role":"Systems Intern","track":"Systems","stage":"applied"});
    let snapshot = snapshots::freeze(
        &mut db,
        directory.path(),
        "base-swe",
        None,
        app,
        frozen.clone(),
        "tex".into(),
        pdf,
    )
    .unwrap();
    assert!(db
        .execute("UPDATE resume_snapshots SET track='Custom'", [])
        .is_err());
    delete(&db, Table::Item, "pulse").unwrap();
    assert_eq!(
        read(&db, Table::Snapshot).unwrap()[0]["frozen_data_json"],
        frozen
    );
    let new_variant = snapshots::clone_variant(&mut db, &snapshot, "Historical branch").unwrap();
    assert!(read(&db, Table::Variant)
        .unwrap()
        .iter()
        .any(|variant| variant["id"] == new_variant));
    assert!(read(&db, Table::Bullet)
        .unwrap()
        .iter()
        .any(|bullet| bullet["content"] == "Measured **48K writes/sec**."));
    let backup = portability::backup(&db, directory.path()).unwrap();
    let restored_dir = tempfile::tempdir().unwrap();
    let mut restored = migrate(Connection::open_in_memory().unwrap()).unwrap();
    portability::restore(&mut restored, restored_dir.path(), backup).unwrap();
    let restored_snapshot = &read(&restored, Table::Snapshot).unwrap()[0];
    assert_eq!(restored_snapshot["frozen_data_json"], frozen);
    assert_eq!(
        std::fs::read(restored_snapshot["pdf_path"].as_str().unwrap()).unwrap(),
        pdf
    );
    assert_eq!(
        read(&restored, Table::ApplicationEvent).unwrap().len(),
        read(&db, Table::ApplicationEvent).unwrap().len()
    );
}

#[test]
fn sqlite_keeps_stage_history_after_rejection() {
    let mut db = migrate(Connection::open_in_memory().unwrap()).unwrap();
    for stage in ["applied", "oa", "technical", "rejected", "rejected"] {
        save_many(&mut db, Table::Application, &[serde_json::json!({"id":"app","company":"Test","role":"Intern","track":"SWE","stage":stage})]).unwrap();
    }
    let events = read(&db, Table::ApplicationEvent).unwrap();
    assert_eq!(events.len(), 4);
    assert!(events.iter().any(|event| event["stage"] == "oa"));
    assert!(events.iter().any(|event| event["stage"] == "technical"));
}

#[test]
fn freeze_rolls_back_when_pdf_folder_is_unavailable() {
    let mut db = migrate(Connection::open_in_memory().unwrap()).unwrap();
    seed(&mut db).unwrap();
    let directory = tempfile::tempdir().unwrap();
    std::fs::write(directory.path().join("snapshots"), "not a directory").unwrap();
    let frozen = serde_json::json!({
        "profile": read(&db, Table::Profile).unwrap()[0], "sections":[], "page_size":"letter",
        "layout": read(&db, Table::Variant).unwrap()[0]["config_json"]["layout"]
    });
    let app =
        serde_json::json!({"id":"failed","company":"Orbit","role":"Intern","track":"Systems"});
    assert!(snapshots::freeze(
        &mut db,
        directory.path(),
        "base-swe",
        None,
        app,
        frozen,
        "tex".into(),
        b"%PDF-1.7\nfixture"
    )
    .is_err());
    assert!(read(&db, Table::Snapshot).unwrap().is_empty());
    assert!(read_id(&db, Table::Application, "failed")
        .unwrap()
        .is_none());
}

#[test]
fn invalid_backup_rolls_back_database_changes() {
    let mut db = migrate(Connection::open_in_memory().unwrap()).unwrap();
    seed(&mut db).unwrap();
    let directory = tempfile::tempdir().unwrap();
    let data = state(&db).unwrap();
    let mut backup =
        serde_json::to_value(portability::backup(&db, directory.path()).unwrap()).unwrap();
    backup["tables"]["master_items"][0]["section"] = serde_json::json!("unknown");
    let invalid = serde_json::from_value(backup).unwrap();
    assert!(portability::restore(&mut db, directory.path(), invalid).is_err());
    assert_eq!(state(&db).unwrap(), data);
}

#[test]
fn upgrades_an_existing_v1_workspace_without_losing_application_data() {
    let db = Connection::open_in_memory().unwrap();
    db.execute_batch(include_str!("schema.sql")).unwrap();
    db.pragma_update(None, "user_version", 1).unwrap();
    db.execute(
        "INSERT INTO applications (id, company, role, track, stage, created_at, updated_at)
         VALUES ('legacy', 'Orbit', 'Intern', 'Systems', 'oa', '2026-05-01', '2026-05-03')",
        [],
    )
    .unwrap();

    let db = migrate(db).unwrap();
    assert_eq!(
        db.pragma_query_value(None, "user_version", |row| row.get::<_, u32>(0))
            .unwrap(),
        2
    );
    let row = read_id(&db, Table::Application, "legacy").unwrap().unwrap();
    assert_eq!(row["company"], "Orbit");
    assert_eq!(row["sort_order"], 0);
    let events = read(&db, Table::ApplicationEvent).unwrap();
    assert_eq!(events.len(), 1);
    assert_eq!(events[0]["stage"], "oa");
}
