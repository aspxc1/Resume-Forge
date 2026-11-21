import { expect, it } from 'vitest'
import { containsTerm, dictionary, matchJob } from './matcher'
import { emptyData, type Data } from './model'
import sample from './data/sample.json'
import { buildResume, newConfig, toggleSkill } from './resume'

const data = { ...emptyData, ...sample } as Data

it('extracts symbol terms, aliases and multi-word phrases without substring matches', () => {
  const result = matchJob('C++17, C#, .NET, Node.js, CI/CD, distributed   systems, CPP and react.js. No foopython or Rediscover.', buildResume(data, newConfig()), data, [])
  const names = result.map((term) => term.name)
  expect(names).toEqual(expect.arrayContaining(['C++', 'C#', '.NET', 'Node.js', 'CI/CD', 'Distributed Systems', 'React']))
  expect(names).not.toEqual(expect.arrayContaining(['Python', 'Redis']))
  expect(names).not.toContain('Python')
  expect(names).not.toContain('Redis')
  expect(names).not.toContain('C')
  expect(names).not.toContain('JavaScript')
  expect(containsTerm('C++ and C#', ['C'])).toBe(false)
  expect(dictionary.length).toBeGreaterThanOrEqual(200)
})

it('classifies and promotes an available skill when included', () => {
  let config = newConfig()
  const job = 'Docker, CUDA, Kubernetes, custom probe.'
  expect(matchJob(job, buildResume(data, config), data, ['custom probe']).map(({ name, status }) => [name, status])).toEqual([
    ['Docker', 'available'], ['CUDA', 'available'], ['Kubernetes', 'missing'], ['custom probe', 'missing'],
  ])
  config = toggleSkill(config, 'tools', 'skill-17', true)
  const matched = matchJob(job, buildResume(data, config), data, ['custom probe'])
  expect(matched.find(({ name }) => name === 'CUDA')?.status).toBe('active')
  expect(matched.find(({ name }) => name === 'Docker')?.sources.some((source) => source.kind === 'skill')).toBe(true)
})
