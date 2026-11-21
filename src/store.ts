import { create } from 'zustand'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { localDate } from './pipeline'
import sampleRows from './data/sample.json'
import { emptyData, type Data } from './model'

export type View = 'studio' | 'bank' | 'applications' | 'analytics' | 'settings'
const tableKeys = {
  profile: 'profile', item: 'master_items', bullet: 'master_bullets', category: 'skill_categories',
  skill: 'master_skills', variant: 'resume_variants', snapshot: 'resume_snapshots',
  application: 'applications', setting: 'settings',
} as const
type Table = keyof typeof tableKeys
type Row<T extends Table> = Data[(typeof tableKeys)[T]][number]
type AnyRow = Data[keyof Data][number]
const storageKey = 'resumeforge-dev'
const native = isTauri()
function devData(): Data {
  if (!import.meta.env.DEV) throw new Error('Open ResumeForge in the desktop application.')
  const saved = localStorage.getItem(storageKey)
  return saved ? { ...emptyData, ...JSON.parse(saved) } : structuredClone(emptyData)
}
function persistDev(data: Data) {
  localStorage.setItem(storageKey, JSON.stringify(data))
  return data
}

interface Store {
  data: Data
  loaded: boolean
  writing: number
  view: View
  variantId: string
  job: { text: string; applicationId?: string }
  setVariantId: (id: string) => void
  setJob: (job: Store["job"]) => void
  error: string
  notice: string
  noticePath?: string
  setView: (view: View) => void
  setNotice: (notice: string, noticePath?: string) => void
  setError: (error: string) => void
  load: () => Promise<boolean>
  seed: () => Promise<boolean>
  save: <T extends Table>(table: T, ...records: Row<T>[]) => Promise<boolean>
  remove: (table: Table, id: string) => Promise<boolean>
  saveEntry: (item: Row<'item'>, bullets: Row<'bullet'>[]) => Promise<boolean>
  refresh: (command: string, args: Record<string, unknown>) => Promise<boolean>
}

export const useStore = create<Store>((set) => {
  let pending = Promise.resolve(true)
  function update(action: () => Promise<Data>) {
    set((s) => ({ writing: s.writing + 1 }))
    const next = pending.then(async () => {
      try {
        const data = await action()
        set({ data, loaded: true, error: '' })
        return true
      } catch (error) {
        set({ error: String(error) })
        return false
      } finally {
        set((s) => ({ writing: s.writing - 1 }))
      }
    })
    pending = next
    return next
  }
  return {
    data: emptyData, loaded: false, writing: 0, view: 'studio', variantId: '', job: { text: '' }, error: '', notice: '',
    setJob: (job) => set({ job }),
    setVariantId: (variantId) => set({ variantId }),
    setView: (view) => set({ view }),
    setNotice: (notice, noticePath) => set({ notice, noticePath }),
    setError: (error) => set({ error }),
    load: () => update(async () => native ? invoke<Data>('load_data') : devData()),
    refresh: (command, args) => update(() => invoke<Data>(command, args)),
    seed: () => update(async () => {
      if (native) return invoke<Data>('seed_demo')
      const sample = structuredClone(sampleRows) as Partial<Data>
      const data = devData()
      if (data.profile.some((p) => Object.entries(p).some(([key, value]) => key !== 'id' && value))
        || data.master_items.length || data.skill_categories.length || data.resume_variants.length || data.applications.length) return data
      const now = new Date()
      sample.applications = (sample.applications ?? []).map((app, i) => ({
        ...app, sort_order: i, applied_date: i ? localDate(new Date(now.getTime() - i * 3 * 86400000)) : null,
        oa_deadline: app.stage === 'oa' ? localDate(new Date(now.getTime() + 2 * 86400000)) : null,
      }))
      const application_stage_events = sample.applications.map((app) => ({ id: crypto.randomUUID(), application_id: app.id, stage: app.stage, created_at: now.toISOString() }))
      return persistDev({ ...data, ...sample, application_stage_events, settings: [{ key: 'onboarded', value: 'true' }] })
    }),
    save: (table, ...records) => update(async () => {
      if (native) return invoke<Data>('save_records', { table, records })
      const data = devData()
      const key = tableKeys[table]
      const rows = data[key] as AnyRow[]
      const id = (row: AnyRow) => 'id' in row ? row.id : row.key
      for (const record of records) {
        const index = rows.findIndex((row) => id(row) === id(record))
        const now = new Date().toISOString()
        const row = { ...record }
        if ('company' in row) {
          if (!row.applied_date && !['wishlist', 'rejected', 'ghosted'].includes(row.stage)) row.applied_date = localDate()
          const previous = data.applications.find((app) => app.id === row.id)
          if (!previous || previous.stage !== row.stage) {
            data.application_stage_events.push({ id: crypto.randomUUID(), application_id: row.id, stage: row.stage, created_at: now })
          }
        }
        if ('updated_at' in row) row.updated_at = now
        if ('created_at' in row && !row.created_at) row.created_at = now
        if (index === -1) rows.push(row)
        else rows[index] = row
      }
      rows.sort((a, b) => 'sort_order' in a && 'sort_order' in b ? a.sort_order - b.sort_order : 0)
      return persistDev(data)
    }),
    saveEntry: (item, bullets) => update(async () => {
      if (native) return invoke<Data>('save_entry', { item, bullets })
      const data = devData()
      data.master_items = [...data.master_items.filter((row) => row.id !== item.id), { ...item, updated_at: new Date().toISOString() }]
        .sort((a, b) => a.sort_order - b.sort_order)
      data.master_bullets = [...data.master_bullets.filter((row) => row.item_id !== item.id), ...bullets]
        .sort((a, b) => a.sort_order - b.sort_order)
      return persistDev(data)
    }),
    remove: (table, id) => update(async () => {
      if (native) return invoke<Data>('delete_record', { table, id })
      const data = devData()
      const rows = data[tableKeys[table]] as AnyRow[]
      const index = rows.findIndex((row) => ('id' in row ? row.id : row.key) === id)
      if (index !== -1) rows.splice(index, 1)
      if (table === 'item') data.master_bullets = data.master_bullets.filter((bullet) => bullet.item_id !== id)
      if (table === 'application') data.application_stage_events = data.application_stage_events.filter((event) => event.application_id !== id)
      if (table === 'category') data.master_skills = data.master_skills.filter((skill) => skill.category_id !== id)
      return persistDev(data)
    }),
  }
})
