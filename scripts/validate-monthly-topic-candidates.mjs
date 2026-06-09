#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const DIR = join(ROOT, 'data', 'monthly-topic-candidates')
const VALID_STATUSES = new Set(['pending', 'selected', 'backup', 'hold', 'rejected'])
const VALID_RISKS = new Set(['low', 'medium', 'high'])
const VALID_PRIORITIES = new Set(['low', 'medium', 'high'])
const VALID_CADENCE = new Set(['MWF'])
const VALID_CATEGORIES = new Set([
  '虫歯治療',
  '根管治療',
  '歯周病治療',
  '予防歯科',
  '小児歯科',
  '親知らず',
  'インプラント',
  'その他',
  'お知らせ',
])

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2).replace(/-/g, '_')
      const next = argv[i + 1]
      args[key] = next && !next.startsWith('--') ? argv[++i] : true
    }
  }
  return args
}

function nextMonth(today = new Date()) {
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1)).toISOString().slice(0, 7)
}

function isDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())
}

function requireText(errors, topic, field) {
  if (!String(topic[field] ?? '').trim()) errors.push(`${topic.id ?? '(idなし)'}: ${field} が空です`)
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const month = String(args.month ?? nextMonth()).trim()
  const filePath = join(DIR, `${month}.json`)
  const errors = []

  if (!existsSync(filePath)) {
    console.error(`エラー: data/monthly-topic-candidates/${month}.json が見つかりません`)
    process.exit(1)
  }

  const file = JSON.parse(readFileSync(filePath, 'utf8'))
  if (file.month !== month) errors.push(`month がファイル名と一致しません: ${file.month}`)
  if (file.targetPostCount !== 12) errors.push('targetPostCount は 12 にしてください')
  if (file.candidateCount !== 24) errors.push('candidateCount は 24 にしてください')
  if (!VALID_CADENCE.has(file.cadence)) errors.push('cadence は MWF にしてください')
  if (!Array.isArray(file.topics)) errors.push('topics は配列にしてください')

  const topics = Array.isArray(file.topics) ? file.topics : []
  if (topics.length !== file.candidateCount) errors.push(`topics は ${file.candidateCount} 件必要です`)

  const seen = new Set()
  const titles = new Set()
  for (const topic of topics) {
    if (!/^\d{4}-\d{2}-topic-\d{3}$/.test(String(topic.id ?? ''))) errors.push(`id の形式が不正です: ${topic.id}`)
    if (seen.has(topic.id)) errors.push(`id が重複しています: ${topic.id}`)
    seen.add(topic.id)

    for (const field of ['title', 'targetReader', 'searchIntent', 'patientConcern', 'recommendedReason', 'targetKeyword']) {
      requireText(errors, topic, field)
    }

    if (titles.has(topic.title)) errors.push(`title が重複しています: ${topic.title}`)
    titles.add(topic.title)
    if (!VALID_CATEGORIES.has(topic.category)) errors.push(`${topic.id}: category が不正です: ${topic.category}`)
    if (!VALID_RISKS.has(topic.medicalRisk)) errors.push(`${topic.id}: medicalRisk が不正です`)
    if (!VALID_RISKS.has(topic.duplicateRisk)) errors.push(`${topic.id}: duplicateRisk が不正です`)
    if (!VALID_PRIORITIES.has(topic.priority)) errors.push(`${topic.id}: priority が不正です`)
    if (!VALID_STATUSES.has(topic.status)) errors.push(`${topic.id}: status が不正です`)
    if (!isDate(topic.recommendedPublishDate)) errors.push(`${topic.id}: recommendedPublishDate が不正です`)
  }

  const selectedCount = topics.filter((topic) => topic.status === 'selected').length
  if (selectedCount > file.targetPostCount) {
    errors.push(`selectedCount が多すぎます: ${selectedCount} / ${file.targetPostCount}`)
  }

  if (errors.length > 0) {
    for (const error of errors) console.error(`❌ ${error}`)
    process.exit(1)
  }

  console.log(`✅ Monthly topic candidates valid (${month}: ${topics.length} 件, selected ${selectedCount}/${file.targetPostCount})`)
}

main()
