export const sections = ['education', 'experience', 'projects', 'leadership', 'publications'] as const
export type Section = typeof sections[number]
export type SectionKey = Section | 'skills'
export const sectionNames: Record<SectionKey, string> = {
  education: 'Education', experience: 'Experience', projects: 'Projects',
  leadership: 'Leadership', publications: 'Publications', skills: 'Technical Skills',
}
export const roleTracks = ['SWE', 'AI/ML', 'Systems', 'Embedded'] as const
export type RoleTrack = typeof roleTracks[number]
export type Track = RoleTrack | 'General'
export const tracks: Track[] = [...roleTracks, 'General']
export type VariantTrack = RoleTrack | 'Custom'
export type AppTrack = RoleTrack | 'Other'
export const stages = ['wishlist', 'applied', 'oa', 'technical', 'final', 'offer', 'rejected', 'ghosted'] as const
export type Stage = typeof stages[number]

export interface Profile {
  id: number
  full_name: string
  phone: string
  email: string
  linkedin_url: string
  linkedin_display: string
  github_url: string
  github_display: string
  portfolio_url: string
  portfolio_display: string
  location: string
}
export interface Item {
  id: string
  section: Section
  title: string
  subtitle: string
  location: string
  date_range: string
  url: string
  extra_line: string
  tags_json: Track[]
  sort_order: number
  updated_at: string
}
export interface Bullet { id: string; item_id: string; content: string; tracks_json: Track[]; sort_order: number }
export interface Category { id: string; name: string; sort_order: number }
export interface Skill { id: string; category_id: string; name: string; tracks_json: Track[]; sort_order: number }
export interface Layout {
  margin_x_in: number
  margin_y_in: number
  font_size_pt: number
  line_height: number
  section_gap_pt: number
  item_gap_pt: number
  bullet_gap_pt: number
}
export interface ItemSelection { item_id: string; bullet_ids: string[] }
export interface SkillSelection { category_id: string; skill_ids: string[] }
export interface VariantConfig {
  profile_override?: Profile
  page_size: 'letter' | 'a4'
  section_order: SectionKey[]
  section_titles: Partial<Record<SectionKey, string>>
  selected_items: ItemSelection[]
  selected_skills: SkillSelection[]
  layout: Layout
}
export interface Variant {
  id: string
  name: string
  track: VariantTrack
  config_json: VariantConfig
  created_at: string
  updated_at: string
}
export interface ResumeDocument {
  profile: Profile
  sections: { key: SectionKey; title: string; items: (Item & { bullets: Bullet[] })[]; skills: (Category & { skills: Skill[] })[] }[]
  page_size: VariantConfig['page_size']
  layout: Layout
}
export interface Snapshot {
  id: string
  source_variant_id: string | null
  variant_name: string
  track: VariantTrack
  frozen_data_json: ResumeDocument
  tex_source: string
  pdf_path: string | null
  created_at: string
}
export interface ApplicationEvent { id: string; application_id: string; stage: Stage; created_at: string }
export interface Application {
  sort_order: number
  id: string
  company: string
  role: string
  track: AppTrack
  stage: Stage
  location: string
  compensation: string
  job_url: string
  job_description: string
  applied_date: string | null
  oa_deadline: string | null
  oa_platform: string
  referral: string
  notes: string
  snapshot_id: string | null
  created_at: string
  updated_at: string
}
export interface Setting { key: string; value: string }
export interface Data {
  profile: Profile[]
  master_items: Item[]
  master_bullets: Bullet[]
  skill_categories: Category[]
  master_skills: Skill[]
  resume_variants: Variant[]
  resume_snapshots: Snapshot[]
  applications: Application[]
  application_stage_events: ApplicationEvent[]
  settings: Setting[]
}
export const emptyProfile: Profile = {
  id: 1, full_name: '', email: '', phone: '', linkedin_url: '', linkedin_display: '',
  github_url: '', github_display: '', portfolio_url: '', portfolio_display: '', location: '',
}
export const emptyData: Data = {
  profile: [emptyProfile], master_items: [], master_bullets: [], skill_categories: [], master_skills: [],
  resume_variants: [], resume_snapshots: [], applications: [], application_stage_events: [], settings: [],
}
