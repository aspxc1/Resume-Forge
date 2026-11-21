ALTER TABLE applications ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
CREATE TABLE application_stage_events (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    stage TEXT NOT NULL CHECK(stage IN ('wishlist','applied','oa','technical','final','offer','rejected','ghosted')),
    created_at TEXT NOT NULL
);
CREATE INDEX stage_events_application ON application_stage_events(application_id);
INSERT INTO application_stage_events (application_id, stage, created_at)
    SELECT id, stage, updated_at FROM applications;
CREATE TRIGGER application_created AFTER INSERT ON applications
    BEGIN INSERT INTO application_stage_events (application_id, stage, created_at)
        VALUES (NEW.id, NEW.stage, NEW.created_at); END;
CREATE TRIGGER application_changed_stage AFTER UPDATE OF stage ON applications
    WHEN OLD.stage <> NEW.stage
    BEGIN INSERT INTO application_stage_events (application_id, stage, created_at)
        VALUES (NEW.id, NEW.stage, NEW.updated_at); END;
