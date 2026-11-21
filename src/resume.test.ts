import { expect, it } from 'vitest'
import sample from './data/sample.json'
import { emptyData, type Data } from './model'
import { buildResume, newConfig, selectTrack, toggleBullet } from './resume'

const data = { ...emptyData, ...sample } as Data
it('keeps explicit item order and skips deleted or unrelated IDs', () => {
  const config = newConfig()
  config.selected_items = [
    { item_id: 'pulse', bullet_ids: ['bullet-7', 'missing', 'bullet-0', 'bullet-6'] },
    { item_id: 'vision', bullet_ids: [] },
    { item_id: 'missing', bullet_ids: [] },
  ]
  const projects = buildResume(data, config).sections.find((section) => section.key === 'projects')
  expect(projects?.items.map((item) => item.id)).toEqual(['pulse', 'vision'])
  expect(projects?.items[0].bullets.map((bullet) => bullet.id)).toEqual(['bullet-7', 'bullet-6'])
})

it('auto-selects General and matching alternates and can enable an unchecked parent', () => {
  const config = selectTrack(data, newConfig(), 'Systems')
  expect(config.selected_items.find((item) => item.item_id === 'lab')?.bullet_ids).toEqual(['bullet-0', 'bullet-2'])
  const next = toggleBullet(newConfig(), 'pulse', 'bullet-6', true)
  expect(next.selected_items).toEqual([{ item_id: 'pulse', bullet_ids: ['bullet-6'] }])
})
