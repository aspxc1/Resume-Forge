import { create } from 'zustand'
import { invoke, isTauri } from '@tauri-apps/api/core'
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
  view: View
  error: string
  notice: string
  setView: (view: View) => void
  setNotice: (notice: string) => void
  setError: (error: string) => void
  load: () => Promise<boolean>
  seed: () => Promise<boolean>
  save: <T extends Table>(table: T, ...records: Row<T>[]) => Promise<boolean>
  remove: (table: Table, id: string) => Promise<boolean>
  refresh: (command: string, args: Record<string, unknown>) => Promise<boolean>
}

export const useStore = create<Store>((set) => {
  let pending = Promise.resolve(true)
  function update(action: () => Promise<Data>) {
    const next = pending.then(async () => {
      try {
        const data = await action()
        set({ data, loaded: true, error: '' })
        return true
      } catch (error) {
        set({ error: String(error) })
        return false
      }
    })
    pending = next
    return next
  }
  return {
    data: emptyData, loaded: false, view: 'studio', error: '', notice: '',
    setView: (view) => set({ view }),
    setNotice: (notice) => set({ notice }),
    setError: (error) => set({ error }),
    load: () => update(async () => native ? invoke<Data>('load_data') : devData()),
    refresh: (command, args) => update(() => invoke<Data>(command, args)),
    seed: () => update(async () => {
      if (native) return invoke<Data>('seed_demo')
      const sample = (await import('./data/sample.json')).default as Data
      const data = devData()
      if (data.profile.some((p) => Object.entries(p).some(([key, value]) => key !== 'id' && value))
        || data.master_items.length || data.skill_categories.length || data.resume_variants.length || data.applications.length) return data
      const now = new Date()
      sample.applications = sample.applications.map((app, i) => ({
        ...app, applied_date: i ? new Date(now.getTime() - i * 3 * 86400000).toISOString().slice(0, 10) : null,
        oa_deadline: app.stage === 'oa' ? new Date(now.getTime() + 2 * 86400000).toISOString().slice(0, 10) : null,
      }))
      return persistDev({ ...data, ...sample, settings: [{ key: 'onboarded', value: 'true' }] })
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
        if ('updated_at' in row) row.updated_at = now
        if ('created_at' in row && !row.created_at) row.created_at = now
        if (index === -1) rows.push(row)
        else rows[index] = row
      }
      rows.sort((a, b) => 'sort_order' in a && 'sort_order' in b ? a.sort_order - b.sort_order : 0)
      return persistDev(data)
    }),
    remove: (table, id) => update(async () => {
      if (native) return invoke<Data>('delete_record', { table, id })
      const data = devData()
      const rows = data[tableKeys[table]] as AnyRow[]
      const index = rows.findIndex((row) => ('id' in row ? row.id : row.key) === id)
      if (index !== -1) rows.splice(index, 1)
      if (table === 'item') data.master_bullets = data.master_bullets.filter((bullet) => bullet.item_id !== id)
      if (table === 'category') data.master_skills = data.master_skills.filter((skill) => skill.category_id !== id)
      return persistDev(data)
    }),
  }
})
