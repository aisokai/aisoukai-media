import { parseCsvRows } from '../../scripts/csv-parser.mjs'
import { BLOG_POLICY_VERSION, isProtectedEditorialInput, issueTopicAdoption, topicContentVersion, verifyBlogEvidence } from './tieredPublication.mjs'

export const TOPIC_CSV_COLUMNS = ['id', 'discovered_at', 'source_type', 'source_url', 'topic', 'title_candidate', 'category', 'target_keyword', 'patient_intent', 'priority', 'medical_risk', 'status', 'publish_date', 'notes']
const escapeCsv = value => `"${String(value ?? '').replace(/"/g, '""')}"`

// Called only by the authenticated Human finalize action. CSV approval alone is
// never an adoption: selected candidates must agree with the current CSV row.
export async function planSelectedTopicAdoptions(file, existingCsv, { loadAdoption, secret = undefined, today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10) }) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(file?.month ?? '') || !Array.isArray(file?.topics) || !Number.isInteger(file.targetPostCount) || file.targetPostCount < 1) throw Error('候補一覧の形式が不正です')
  const candidateIds = new Set()
  for (const candidate of file.topics) {
    if (!new RegExp(`^${file.month}-topic-\\d{3}$`).test(candidate.id) || candidateIds.has(candidate.id)) throw Error('候補IDが不正または重複しています')
    candidateIds.add(candidate.id)
  }
  const selected = file.topics.filter(topic => topic.status === 'selected')
  if (!selected.length || selected.length > file.targetPostCount) throw Error('今月採用の件数を確認してください')
  const [headers, ...csvRows] = parseCsvRows(existingCsv)
  if (!headers || headers.length !== TOPIC_CSV_COLUMNS.length || headers.some((key, i) => key !== TOPIC_CSV_COLUMNS[i])) throw Error('記事ネタCSVの列が不正です')
  const existing = new Map()
  for (const cells of csvRows) {
    if (cells.every(cell => !cell)) continue
    if (cells.length !== headers.length || !cells[0] || existing.has(cells[0])) throw Error('記事ネタCSVのIDが空欄または重複しています')
    existing.set(cells[0], Object.fromEntries(headers.map((key, i) => [key, cells[i]])))
  }
  const lines = [], adoptions = []
  let preservedCount = 0
  for (const topic of selected) {
    if (isProtectedEditorialInput(topic)) throw Error('保護対象の候補は確定できません')
    if (topic.archived || topic.rejection_reason || !['trend', 'news', 'seasonal', 'clinic', 'seo', 'patient_question'].includes(topic.sourceType)) throw Error('採用候補の状態を確認してください')
    if (['title', 'category', 'targetKeyword', 'searchIntent'].some(key => typeof topic[key] !== 'string' || !topic[key].trim()) || !['low', 'medium', 'high'].includes(topic.medicalRisk) || !['low', 'medium', 'high'].includes(topic.priority) || !/^\d{4}-\d{2}-\d{2}$/.test(topic.recommendedPublishDate ?? '') || !topic.recommendedPublishDate.startsWith(`${file.month}-`)) throw Error('採用候補の内容を確認してください')
    const id = `MONTHLY-${topic.id.replace(/-/g, '').toUpperCase()}`
    const proposed = { id, discovered_at: today, source_type: topic.sourceType, source_url: topic.sourceUrl ?? '', topic: topic.title, title_candidate: topic.title, category: topic.category, target_keyword: topic.targetKeyword, patient_intent: topic.searchIntent, priority: topic.priority, medical_risk: topic.medicalRisk, status: 'approved', publish_date: topic.recommendedPublishDate, notes: `月次ネタ候補 ${file.month} / MWF 月曜・水曜・金曜の週3投稿枠` }
    const row = existing.get(id) ?? proposed
    if (isProtectedEditorialInput(row) || TOPIC_CSV_COLUMNS.some(key => key !== 'discovered_at' && String(row[key]).trim() !== String(proposed[key]).trim())) throw Error('採用候補と記事ネタCSVの内容が一致しません。内容を確認してください')
    const previous = await loadAdoption(`data/topic-adoptions/${id}.json`)
    if (previous !== null) {
      const payload = verifyBlogEvidence(previous, 'teacher-topic-adoption', secret)
      if (!payload || payload.topicId !== id || payload.editorialPolicy !== BLOG_POLICY_VERSION) throw Error('既存の採用記録を検証できません')
      if (payload.topicVersion === topicContentVersion(row)) { preservedCount++ } else {
        // Human is explicitly re-adopting the currently selected, matching row.
        adoptions.push({ path: `data/topic-adoptions/${id}.json`, content: `${JSON.stringify(issueTopicAdoption(row, secret), null, 2)}\n` })
      }
    } else {
      adoptions.push({ path: `data/topic-adoptions/${id}.json`, content: `${JSON.stringify(issueTopicAdoption(row, secret), null, 2)}\n` })
    }
    if (!existing.has(id)) lines.push(TOPIC_CSV_COLUMNS.map(key => escapeCsv(row[key])).join(','))
  }
  return { selectedCount: selected.length, lines, adoptions, preservedCount }
}
