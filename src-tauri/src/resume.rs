use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PageSize {
    Letter,
    A4,
}

impl PageSize {
    pub fn css(&self) -> &'static str {
        match self {
            Self::Letter => "letter",
            Self::A4 => "A4",
        }
    }

    pub fn tex(&self) -> &'static str {
        match self {
            Self::Letter => "letterpaper",
            Self::A4 => "a4paper",
        }
    }
}

#[derive(Deserialize)]
pub struct Resume {
    pub profile: Profile,
    pub sections: Vec<Section>,
    pub layout: Layout,
    pub page_size: PageSize,
}

#[derive(Deserialize)]
pub struct Profile {
    pub full_name: String,
    pub email: String,
    pub phone: String,
    pub location: String,
    pub linkedin_url: String,
    pub linkedin_display: String,
    pub github_url: String,
    pub github_display: String,
    pub portfolio_url: String,
    pub portfolio_display: String,
}

#[derive(Deserialize)]
pub struct Layout {
    pub margin_x_in: f64,
    pub margin_y_in: f64,
    pub font_size_pt: f64,
    pub line_height: f64,
    pub section_gap_pt: f64,
    pub item_gap_pt: f64,
    pub bullet_gap_pt: f64,
}

impl Layout {
    pub fn validate(&self) -> Result<(), String> {
        let limits = [
            (self.margin_x_in, 0.35..=0.65),
            (self.margin_y_in, 0.35..=0.65),
            (self.font_size_pt, 9.5..=11.0),
            (self.line_height, 1.05..=1.35),
            (self.section_gap_pt, 3.0..=14.0),
            (self.item_gap_pt, 0.0..=10.0),
            (self.bullet_gap_pt, 0.0..=5.0),
        ];
        if limits.iter().any(|(value, range)| !range.contains(value)) {
            return Err("Resume layout settings are out of range".into());
        }
        Ok(())
    }
}

#[derive(Deserialize)]
pub struct Section {
    pub key: String,
    pub title: String,
    pub items: Vec<Entry>,
    pub skills: Vec<SkillCategory>,
}

#[derive(Deserialize)]
pub struct Entry {
    pub title: String,
    pub subtitle: String,
    pub location: String,
    pub date_range: String,
    pub url: String,
    pub extra_line: String,
    pub bullets: Vec<Bullet>,
}

#[derive(Deserialize)]
pub struct Bullet {
    pub content: String,
}

#[derive(Deserialize)]
pub struct SkillCategory {
    pub name: String,
    pub skills: Vec<Skill>,
}

#[derive(Deserialize)]
pub struct Skill {
    pub name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
enum SectionKey {
    Education,
    Experience,
    Projects,
    Leadership,
    Publications,
    Skills,
}

#[derive(Deserialize)]
struct VariantConfig {
    #[serde(rename = "page_size")]
    _page_size: PageSize,
    #[serde(rename = "section_order")]
    _section_order: Vec<SectionKey>,
    #[serde(rename = "section_titles")]
    _section_titles: std::collections::HashMap<String, String>,
    #[serde(rename = "selected_items")]
    _selected_items: Vec<ItemSelection>,
    #[serde(rename = "selected_skills")]
    _selected_skills: Vec<SkillSelection>,
    #[serde(rename = "profile_override")]
    _profile_override: Option<Profile>,
    layout: Layout,
}

#[derive(Deserialize)]
struct ItemSelection {
    #[serde(rename = "item_id")]
    _item_id: String,
    #[serde(rename = "bullet_ids")]
    _bullet_ids: Vec<String>,
}

#[derive(Deserialize)]
struct SkillSelection {
    #[serde(rename = "category_id")]
    _category_id: String,
    #[serde(rename = "skill_ids")]
    _skill_ids: Vec<String>,
}

pub(crate) fn validate_variant(value: serde_json::Value) -> Result<(), String> {
    let config: VariantConfig =
        serde_json::from_value(value).map_err(|e| format!("Invalid variant configuration: {e}"))?;
    config.layout.validate()
}
