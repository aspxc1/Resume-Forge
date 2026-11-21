CREATE TABLE profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    full_name TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '',
    linkedin_url TEXT NOT NULL DEFAULT '', linkedin_display TEXT NOT NULL DEFAULT '',
    github_url TEXT NOT NULL DEFAULT '', github_display TEXT NOT NULL DEFAULT '',
    portfolio_url TEXT NOT NULL DEFAULT '', portfolio_display TEXT NOT NULL DEFAULT '', location TEXT NOT NULL DEFAULT ''
);
INSERT INTO profile (id) VALUES (1);

CREATE TABLE master_items (
    id TEXT PRIMARY KEY, section TEXT NOT NULL CHECK(section IN ('education','experience','projects','leadership','publications')),
    title TEXT NOT NULL, subtitle TEXT NOT NULL DEFAULT '', location TEXT NOT NULL DEFAULT '',
    date_range TEXT NOT NULL DEFAULT '', url TEXT NOT NULL DEFAULT '', extra_line TEXT NOT NULL DEFAULT '',
    tags_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(tags_json)),
    sort_order INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL
);
CREATE TABLE master_bullets (
    id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES master_items(id) ON DELETE CASCADE,
    content TEXT NOT NULL, tracks_json TEXT NOT NULL DEFAULT '["General"]' CHECK(json_valid(tracks_json)),
    sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX bullets_item ON master_bullets(item_id);
CREATE TABLE skill_categories (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, sort_order INTEGER NOT NULL
);
CREATE TABLE master_skills (
    id TEXT PRIMARY KEY, category_id TEXT NOT NULL REFERENCES skill_categories(id) ON DELETE CASCADE,
    name TEXT NOT NULL, tracks_json TEXT NOT NULL DEFAULT '["General"]' CHECK(json_valid(tracks_json)),
    sort_order INTEGER NOT NULL
);
CREATE INDEX skills_category ON master_skills(category_id);
CREATE TABLE resume_variants (
    id TEXT PRIMARY KEY, name TEXT NOT NULL,
    track TEXT NOT NULL CHECK(track IN ('SWE','AI/ML','Systems','Embedded','Custom')),
    config_json TEXT NOT NULL CHECK(json_valid(config_json)),
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE resume_snapshots (
    id TEXT PRIMARY KEY, source_variant_id TEXT, variant_name TEXT NOT NULL, track TEXT NOT NULL,
    frozen_data_json TEXT NOT NULL CHECK(json_valid(frozen_data_json)),
    tex_source TEXT NOT NULL, pdf_path TEXT, created_at TEXT NOT NULL
);
CREATE TRIGGER snapshot_immutable BEFORE UPDATE ON resume_snapshots
    BEGIN SELECT RAISE(ABORT, 'Resume snapshots are immutable'); END;
CREATE TABLE applications (
    id TEXT PRIMARY KEY, company TEXT NOT NULL, role TEXT NOT NULL,
    track TEXT NOT NULL CHECK(track IN ('SWE','AI/ML','Systems','Embedded','Other')),
    stage TEXT NOT NULL CHECK(stage IN ('wishlist','applied','oa','technical','final','offer','rejected','ghosted')),
    location TEXT NOT NULL DEFAULT '', compensation TEXT NOT NULL DEFAULT '', job_url TEXT NOT NULL DEFAULT '',
    job_description TEXT NOT NULL DEFAULT '', applied_date TEXT, oa_deadline TEXT,
    oa_platform TEXT NOT NULL DEFAULT '' CHECK(oa_platform IN ('','CodeSignal','HackerRank','Karat','LeetCode','Take-Home','Other')),
    referral TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
    snapshot_id TEXT REFERENCES resume_snapshots(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
