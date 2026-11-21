export function lintBullet(content: string) {
  const text = content.replace(/\*\*/g, '').trim()
  if (!text) return []
  const hints: string[] = []
  if (/^(worked on|helped with|responsible for|assisted in)\b/i.test(text)) hints.push('Weak opener')
  if (!/[\d%]/.test(text)) hints.push('Add a metric')
  if (Array.from(text).length > 190) hints.push('Over 190 characters')
  return hints
}
