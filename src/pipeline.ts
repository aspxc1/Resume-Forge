import { type Application, type ApplicationEvent, type Stage } from './model'

export const stageNames: Record<Stage, string> = {
  wishlist: 'Wishlist', applied: 'Applied', oa: 'OA', technical: 'Technical', final: 'Final', offer: 'Offer', rejected: 'Rejected', ghosted: 'Ghosted',
}
export const boardStages = ['wishlist', 'applied', 'oa', 'technical', 'final', 'offer', 'rejected'] as const
export type BoardStage = typeof boardStages[number]
export const boardStage = (stage: Stage): BoardStage => stage === 'ghosted' ? 'rejected' : stage
export const funnelStages = ['applied', 'oa', 'technical', 'final', 'offer'] as const

export function localDate(date = new Date()) {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()].map((value, index) =>
    String(value).padStart(index === 0 ? 4 : 2, '0')).join('-')
}
const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
const dayNumber = (value: string) => Date.parse(value + 'T00:00:00Z') / 86400000

export function countdown(value: string | null, now = new Date()) {
  if (!value) return undefined
  const time = new Date(value)
  if (!Number.isFinite(time.getTime())) return undefined
  const days = dayNumber(isDate(value) ? value : localDate(time)) - dayNumber(localDate(now))
  if (days > 7 || !Number.isFinite(days)) return undefined
  const overdue = days < 0 || (!isDate(value) && time.getTime() < now.getTime())
  return {
    days,
    overdue,
    label: overdue ? 'Overdue' : days === 0 ? 'Due Today' : 'Due in ' + days + 'd',
    tone: overdue || days === 0 ? 'error' : days <= 2 ? 'warning' : 'success',
  }
}

export function formatDate(value: string | null) {
  if (!value) return '—'
  const date = new Date(isDate(value) ? value + 'T00:00:00' : value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function dateTimeInput(value: string | null) {
  if (!value) return ''
  if (isDate(value)) return value + 'T23:59'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return localDate(date) + 'T' + [date.getHours(), date.getMinutes()].map((part) => String(part).padStart(2, '0')).join(':')
}

export function deadlineSortKey(value: string | null) {
  if (!value) return Infinity
  const time = Date.parse(isDate(value) ? value + 'T23:59:59' : value)
  return Number.isFinite(time) ? time : Infinity
}

export function newApplication(): Application {
  return {
    id: crypto.randomUUID(), company: '', role: '', track: 'SWE', stage: 'wishlist', location: '', compensation: '',
    job_url: '', job_description: '', applied_date: null, oa_deadline: null, oa_platform: '', referral: '', notes: '',
    snapshot_id: null, created_at: '', updated_at: '', sort_order: 0,
  }
}

export function moveApplication(app: Application, column: BoardStage, sort_order: number): Application {
  const stage = boardStage(app.stage) === column ? app.stage : column
  const applied_date = app.applied_date ?? (funnelStages.some((step) => step === stage) ? localDate() : null)
  return { ...app, stage, applied_date, sort_order }
}

export function reachedByApplication(apps: Application[], events: ApplicationEvent[]) {
  const lookup = new Map<string, Set<Stage>>(apps.map((app) => [app.id, new Set([app.stage])]))
  for (const event of events) lookup.get(event.application_id)?.add(event.stage)
  return lookup
}

export function applied(app: Application, visited: Set<Stage> | undefined) {
  return !!app.applied_date || funnelStages.some((stage) => visited?.has(stage) || app.stage === stage)
}

export function pct(numerator: number, denominator: number) {
  return denominator ? Math.round(numerator / denominator * 100) : 0
}

export function funnel(apps: Application[], events: ApplicationEvent[]) {
  const reached = reachedByApplication(apps, events)
  const submitted = apps.filter((app) => applied(app, reached.get(app.id))).length
  return funnelStages.map((stage) => {
    const count = stage === 'applied' ? submitted : apps.filter((app) => reached.get(app.id)?.has(stage)).length
    return { stage, count, percent: pct(count, submitted) }
  })
}

export function weeklyActivity(apps: Application[], now = new Date()) {
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (now.getDay() + 6) % 7)
  return Array.from({ length: 12 }, (_, index) => {
    const first = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - (11 - index) * 7)
    const next = new Date(first.getFullYear(), first.getMonth(), first.getDate() + 7)
    const start = localDate(first), end = localDate(next)
    return { start, label: first.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      count: apps.filter((app) => app.applied_date && app.applied_date >= start && app.applied_date < end).length }
  })
}
