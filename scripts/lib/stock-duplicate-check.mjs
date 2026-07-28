import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
export function normalizeStockTitle(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('ja-JP')
    .replace(/[\s\p{P}\p{S}_]+/gu, '')
}

export function normalizeKeyword(value) {
  return String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('ja-JP')
}

function frontmatterOnly(raw) {
  if (!raw.startsWith('---')) return {}
  const closing = raw.indexOf('\n---', 3)
  if (closing < 0) return {}
  const data = {}
  let activeList = ''
  for (const line of raw.slice(4, closing).split('\n')) {
    const listItem = line.match(/^\s*-\s*(.+)$/)
    if (listItem && activeList) {
      data[activeList] ??= []
      data[activeList].push(unquote(listItem[1]))
      continue
    }
    const field = line.match(/^([A-Za-z0-9_]+):(?:\s*(.*))?$/)
    if (!field) continue
    const [, key, value = ''] = field
    activeList = value === '' ? key : ''
    data[key] = value === '' ? [] : unquote(value)
  }
  return data
}

function unquote(value) {
  return String(value).trim().replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, '$1$2')
}

function existingKeywords(data) {
  const explicit = data.target_keyword ?? data.keyword
  if (explicit) return [normalizeKeyword(explicit)].filter(Boolean)
  return Array.isArray(data.tags) ? data.tags.map(normalizeKeyword).filter(Boolean) : []
}

/**
 * Deterministic duplicate preflight only. It never infers semantic similarity and
 * never mutates posts; callers must explicitly decide whether to continue.
 */
export function findStockDuplicateCandidates({ postsDir, topicId, title, keyword, ignoreFilePath = '' }) {
  if (!existsSync(postsDir)) return []

  const normalizedTitle = normalizeStockTitle(title)
  const normalizedKeyword = normalizeKeyword(keyword)
  const ignored = String(ignoreFilePath)
  const matches = []

  for (const fileName of readdirSync(postsDir).filter((file) => file.endsWith('.md'))) {
    const filePath = join(postsDir, fileName)
    if (filePath === ignored) continue
    const data = frontmatterOnly(readFileSync(filePath, 'utf8'))
    const reasons = []
    if (topicId && String(data.source_topic_id ?? '').trim() === topicId) reasons.push('topic_id')
    if (normalizedTitle && normalizeStockTitle(data.title) === normalizedTitle) reasons.push('normalized_title')
    if (normalizedKeyword && existingKeywords(data).includes(normalizedKeyword)) reasons.push('keyword')
    if (reasons.length > 0) matches.push({ slug: fileName.replace(/\.md$/, ''), reasons })
  }

  return matches
}
