import { expect, it } from 'vitest'
import { lintBullet } from './linter'

it('flags weak openers, missing metrics, and long bullets independently', () => {
  expect(lintBullet('  **Helped with** a dashboard')).toEqual(['Weak opener', 'Add a metric'])
  expect(lintBullet('Cut median latency by **38%**.')).toEqual([])
  expect(lintBullet('Built '.repeat(35) + 'at 38 ms')).toEqual(['Over 190 characters'])
  expect(lintBullet('')).toEqual([])
})
