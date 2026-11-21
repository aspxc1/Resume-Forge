import { expect, it } from 'vitest'
import { countdown, funnel, localDate, moveApplication, newApplication } from './pipeline'
import type { ApplicationEvent } from './model'

it('uses local calendar days for date-only deadlines and detects overdue times', () => {
  const now = new Date(2026, 8, 12, 15)
  expect(countdown('2026-09-12', now)?.label).toBe('Due Today')
  expect(countdown('2026-09-14', now)?.label).toBe('Due in 2d')
  expect(countdown('2026-09-20', now)).toBeUndefined()
  expect(countdown('2026-09-12T09:00', now)?.label).toBe('Overdue')
  expect(localDate(now)).toBe('2026-09-12')
})

it('retains an actual OA after rejection and counts an interview without assuming an OA', () => {
  const app = { ...newApplication(), stage: 'rejected' as const, applied_date: '2026-09-11' }
  const other = { ...newApplication(), stage: 'technical' as const, applied_date: '2026-09-12' }
  const events: ApplicationEvent[] = [{ id: 'oa', application_id: app.id, stage: 'oa', created_at: '' }]
  expect(funnel([app, other], events).map((row) => row.count)).toEqual([2, 1, 1, 0, 0])
  expect(moveApplication({ ...newApplication(), stage: 'ghosted' }, 'rejected', 3).stage).toBe('ghosted')
})
