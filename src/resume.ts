import { emptyProfile, sectionNames, sections, type Data, type Layout, type ResumeDocument, type RoleTrack, type Track, type VariantConfig } from './model'

export const classicLayout: Layout = {
  margin_x_in: .55, margin_y_in: .48, font_size_pt: 10.5, line_height: 1.17,
  section_gap_pt: 8, item_gap_pt: 5, bullet_gap_pt: 1,
}
export const allSections = [...sections, 'skills'] as const
export function newConfig(): VariantConfig {
  return { page_size: 'letter', section_order: [...allSections], section_titles: {}, selected_items: [], selected_skills: [], layout: { ...classicLayout } }
}

export function buildResume(data: Data, config: VariantConfig): ResumeDocument {
  const selected = config.selected_items.flatMap(({ item_id, bullet_ids }) => {
    const item = data.master_items.find((item) => item.id === item_id)
    if (!item) return []
    const bullets = bullet_ids.flatMap((id) => data.master_bullets.filter((bullet) => bullet.id === id && bullet.item_id === item_id))
    return [{ ...item, bullets }]
  })
  const skills = config.selected_skills.flatMap(({ category_id, skill_ids }) => {
    const category = data.skill_categories.find((category) => category.id === category_id)
    const entries = skill_ids.flatMap((id) => data.master_skills.filter((skill) => skill.id === id && skill.category_id === category_id))
    return category && entries.length ? [{ ...category, skills: entries }] : []
  })
  return {
    profile: data.profile[0] ?? emptyProfile, page_size: config.page_size, layout: config.layout,
    sections: config.section_order.map((key) => ({
      key, title: config.section_titles[key]?.trim() || sectionNames[key],
      items: selected.filter((item) => item.section === key), skills: key === 'skills' ? skills : [],
    })).filter((section) => section.items.length || section.skills.length),
  }
}

export function selectTrack(data: Data, config: VariantConfig, track: RoleTrack): VariantConfig {
  const matches = (tags: Track[]) => tags.includes(track) || tags.includes('General')
  const selected_items = data.master_items.flatMap((item) => {
    const bullet_ids = data.master_bullets.filter((bullet) => bullet.item_id === item.id && matches(bullet.tracks_json)).map((bullet) => bullet.id)
    return item.section === 'education' || matches(item.tags_json) || bullet_ids.length ? [{ item_id: item.id, bullet_ids }] : []
  })
  const selected_skills = data.skill_categories.flatMap((category) => {
    const skill_ids = data.master_skills.filter((skill) => skill.category_id === category.id && matches(skill.tracks_json)).map((skill) => skill.id)
    return skill_ids.length ? [{ category_id: category.id, skill_ids }] : []
  })
  return { ...config, selected_items, selected_skills }
}

export function toggleItem(config: VariantConfig, item_id: string, enabled: boolean, bullet_ids: string[] = []): VariantConfig {
  if (enabled && config.selected_items.some((item) => item.item_id === item_id)) return config
  return { ...config, selected_items: enabled ? [...config.selected_items, { item_id, bullet_ids }] : config.selected_items.filter((item) => item.item_id !== item_id) }
}

export function toggleBullet(config: VariantConfig, item_id: string, id: string, enabled: boolean): VariantConfig {
  const item = config.selected_items.find((item) => item.item_id === item_id)
  if (!item) return enabled ? toggleItem(config, item_id, true, [id]) : config
  const bullet_ids = enabled ? [...new Set([...item.bullet_ids, id])] : item.bullet_ids.filter((bullet) => bullet !== id)
  return { ...config, selected_items: config.selected_items.map((item) => item.item_id === item_id ? { item_id, bullet_ids } : item) }
}

export function toggleSkill(config: VariantConfig, category_id: string, id: string, enabled: boolean): VariantConfig {
  const category = config.selected_skills.find((category) => category.category_id === category_id)
  const skill_ids = enabled ? [...new Set([...(category?.skill_ids ?? []), id])] : (category?.skill_ids ?? []).filter((skill) => skill !== id)
  const selected_skills = category
    ? config.selected_skills.map((category) => category.category_id === category_id ? { category_id, skill_ids } : category)
    : [...config.selected_skills, { category_id, skill_ids }]
  return { ...config, selected_skills: selected_skills.filter((category) => category.skill_ids.length) }
}

export function orderedRows<T extends { id: string }>(rows: T[], ids: string[]) {
  const lookup = new Map(rows.map((row) => [row.id, row]))
  const selected = ids.flatMap((id) => {
    const row = lookup.get(id)
    lookup.delete(id)
    return row ? [row] : []
  })
  return [...selected, ...lookup.values()]
}

export function safeUrl(value: string, protocol = ['https:', 'http:']): string | undefined {
  if (!value.trim()) return undefined
  try {
    const url = new URL(value)
    return protocol.includes(url.protocol) ? url.href : undefined
  } catch {
    return undefined
  }
}
