import source from './data/keywords.txt?raw'
import { type Data, type ResumeDocument } from './model'

const normalize = (text: string) => text.normalize('NFKC').replace(/\*\*/g, '').replace(/[–—]/g, '-')
const keyOf = (text: string) => normalize(text).trim().toLowerCase()
const escape = (text: string) => text.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')
function pattern(terms: string[]) {
  const variants = [...new Set(terms.map(keyOf).filter(Boolean))]
    .sort((a, b) => b.length - a.length)
    .map((term) => term.split(/\s+/).map(escape).join('\\s+'))
  if (!variants.length) return /(?!)/
  return new RegExp('(?<![\\p{L}\\p{N}_.])(?:' + variants.join('|') + ')(?![\\p{L}\\p{N}_+#]|\\.[\\p{L}\\p{N}_])', 'iu')
}

export function containsTerm(text: string, terms: string[]) {
  return pattern(terms).test(normalize(text))
}

export const dictionary = source.trim().split(/\r?\n/).map((line) => {
  const [name, ...aliases] = line.split('|')
  return { name, aliases, regex: pattern([name, ...aliases]) }
})
const dictionaryKeys = new Set(dictionary.flatMap(({ name, aliases }) => [name, ...aliases]).map(keyOf))

export type Source =
  | { kind: 'item'; id: string; label: string }
  | { kind: 'bullet'; id: string; itemId: string; label: string; text: string }
  | { kind: 'skill'; id: string; categoryId: string; label: string }

export interface KeywordResult {
  name: string
  status: 'active' | 'available' | 'missing'
  sources: Source[]
}

const itemText = (item: Data['master_items'][number]) => [item.title, item.subtitle, item.extra_line].join('\n')

export function matchJob(job: string, resume: ResumeDocument, data: Data, custom: string[]): KeywordResult[] {
  const input = normalize(job)
  if (!input.trim()) return []
  const activeText = normalize(resume.sections.flatMap((section) => [
    ...section.items.flatMap((item) => [itemText(item), ...item.bullets.map((bullet) => bullet.content)]),
    ...section.skills.flatMap((category) => category.skills.map((skill) => skill.name)),
  ]).join('\n'))
  const sourceBank: { source: Source; text: string }[] = [
    ...data.master_skills.map((skill) => ({
      source: { kind: 'skill' as const, id: skill.id, categoryId: skill.category_id, label: skill.name },
      text: normalize(skill.name),
    })),
    ...data.master_items.flatMap((item) => [
      { source: { kind: 'item' as const, id: item.id, label: item.title }, text: normalize(itemText(item)) },
      ...data.master_bullets.filter((bullet) => bullet.item_id === item.id).map((bullet) => ({
        source: { kind: 'bullet' as const, id: bullet.id, itemId: item.id, label: item.title, text: bullet.content },
        text: normalize(bullet.content),
      })),
    ]),
  ]
  const customTerms = [...new Map(custom.map((word) => [keyOf(word), word.trim()])).entries()]
    .filter(([key]) => key && !dictionaryKeys.has(key))
    .map(([, name]) => ({ name, regex: pattern([name]) }))
  const matched: { index: number; result: KeywordResult }[] = []
  for (const { name, regex } of [...dictionary, ...customTerms]) {
    const found = regex.exec(input)
    if (!found) continue
    if (regex.test(activeText)) {
      matched.push({ index: found.index, result: { name, status: 'active', sources: [] } })
      continue
    }
    const sources = sourceBank.filter(({ text }) => regex.test(text)).map(({ source }) => source)
    matched.push({ index: found.index, result: { name, status: sources.length ? 'available' : 'missing', sources } })
  }
  return matched.sort((a, b) => a.index - b.index).map(({ result }) => result)
}
