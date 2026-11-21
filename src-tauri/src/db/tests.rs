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
