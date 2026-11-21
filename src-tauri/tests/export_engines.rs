use resumeforge::{
    db::{self, snapshots, Table},
    latex,
    pdf::{self, EngineChoice},
    resume::Resume,
};
use serde_json::json;
use std::{fs, process::Command};

#[test]
#[ignore = "requires Microsoft Edge or Chromium and Poppler"]
fn builtin_pdf_has_selectable_text_and_hyperlinks() {
    check_engines(
        &[
            ("builtin", EngineChoice::Builtin),
            ("a4", EngineChoice::Builtin),
        ],
        true,
    );
}

#[test]
#[ignore = "requires pdflatex and Poppler"]
fn latex_pdf_has_selectable_text_and_hyperlinks() {
    check_engines(&[("latex", EngineChoice::Latex(None))], true);
}

#[cfg(windows)]
#[test]
#[ignore = "requires Microsoft Edge or Chrome"]
fn windows_builtin_renders_pdf() {
    check_engines(
        &[
            ("builtin", EngineChoice::Builtin),
            ("a4", EngineChoice::Builtin),
        ],
        false,
    );
}

fn check_engines(engines: &[(&str, EngineChoice<'_>)], inspect_content: bool) {
    let frozen = json!({
        "profile": {
            "id": 1, "full_name": "Alex Morgan", "phone": "", "email": "alex@example.com", "location": "",
            "linkedin_url": "", "linkedin_display": "", "github_url": "", "github_display": "",
            "portfolio_url": "https://example.com/a_b?p=50%25&r=R%26D#abc", "portfolio_display": "Portfolio"
        },
        "sections": [{
            "key": "projects", "title": "Projects", "skills": [],
            "items": [{
                "id": "pulse", "section":"projects", "tags_json":["SWE"], "sort_order":0,"updated_at":"",
                "title": "Vector Test", "subtitle": "Rust & C++", "location": "", "date_range": "May 2026",
                "url": "", "extra_line": "",
                "bullets": [{"id":"bullet-6","item_id":"pulse","tracks_json":["SWE"],"sort_order":0,"content": "**C# and R&D** cut latency 50% on snake_case data."}]
            }]
        }],
        "page_size": "letter",
        "layout": {
            "margin_x_in": 0.55, "margin_y_in": 0.48, "font_size_pt": 10.5,
            "line_height": 1.17, "section_gap_pt": 8, "item_gap_pt": 5, "bullet_gap_pt": 1
        }
    });
    let mut resume: Resume = serde_json::from_value(frozen.clone()).unwrap();
    let temp = tempfile::tempdir().unwrap();
    let sample_markup = r#"<article class="resume-paper" style="--paper-width:8.5in;--paper-height:11in;--margin-x:.55in;--margin-y:.48in;--base-size:10.5pt;--resume-line:1.17;--section-gap:8pt;--item-gap:5pt;--bullet-gap:1pt"><div class="resume-content"><header class="resume-header"><h1 class="resume-name">Alex Morgan</h1><p class="resume-contact"><a href="https://example.com/a_b?p=50%25&amp;r=R%26D#abc">Portfolio</a></p></header><section class="resume-section"><h2 class="resume-section-title">Projects</h2><div class="resume-entry"><div class="resume-row"><span><strong>Vector Test</strong> | <em>Rust &amp; C++</em></span><span>May 2026</span></div><ul class="resume-bullets"><li><strong>C# and R&amp;D</strong> cut latency 50% on snake_case data.</li></ul></div></section></div></article>"#;
    for &(name, ref engine) in engines {
        if name == "a4" {
            resume.page_size = resumeforge::resume::PageSize::A4;
        }
        let tex = latex::generate(&resume).unwrap();
        let markup = if name == "a4" {
            sample_markup
                .replace("8.5in", "210mm")
                .replace("11in", "297mm")
        } else {
            sample_markup.to_owned()
        };
        let bytes = pdf::render(&resume.page_size, &markup, &tex, *engine).unwrap();
        assert!(bytes.starts_with(b"%PDF-") && bytes.len() > 1000);
        if !inspect_content {
            continue;
        }
        let path = if name == "latex" {
            let mut connection =
                db::migrate(rusqlite::Connection::open_in_memory().unwrap()).unwrap();
            db::seed(&mut connection).unwrap();
            let application =
                json!({"company":"Orbit","role":"Intern","track":"Systems","stage":"applied"});
            let id = snapshots::freeze(
                &mut connection,
                temp.path(),
                "base-swe",
                None,
                application,
                frozen.clone(),
                tex,
                &bytes,
            )
            .unwrap();
            db::delete(&connection, Table::Bullet, "bullet-6").unwrap();
            assert_eq!(
                db::read(&connection, Table::Snapshot).unwrap()[0]["frozen_data_json"],
                frozen
            );
            let path = snapshots::snapshot_path(temp.path(), &id).unwrap();
            assert_eq!(fs::read(&path).unwrap(), bytes);
            path
        } else {
            let path = temp.path().join(format!("{name}.pdf"));
            fs::write(&path, bytes).unwrap();
            path
        };
        let text = Command::new("pdftotext")
            .arg(&path)
            .arg("-")
            .output()
            .unwrap();
        assert!(text.status.success());
        let text = String::from_utf8_lossy(&text.stdout);
        assert!(
            text.contains("snake_case") && text.contains("C# and R&D") && text.contains("50%"),
            "{name}: {text}"
        );
        let links = Command::new("pdfinfo")
            .arg("-url")
            .arg(&path)
            .output()
            .unwrap();
        assert!(
            String::from_utf8_lossy(&links.stdout)
                .contains("https://example.com/a_b?p=50%25&r=R%26D#abc"),
            "{name}: {:?}",
            links
        );
        let info = Command::new("pdfinfo").arg(&path).output().unwrap();
        assert!(
            String::from_utf8_lossy(&info.stdout)
                .lines()
                .any(|line| line.starts_with("Pages:") && line.ends_with(" 1")),
            "{name}: {:?}",
            info
        );
    }
}
