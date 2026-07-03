#!/usr/bin/env node
// generate-instagram-draft.mjs
// topic 起点の Instagram ドラフト生成 (DMP Phase 2A)。
// data/monthly-topic-candidates/YYYY-MM.json の topic からカルーセル構成の下書きを AI 生成し、
// content/sns-drafts/ 規約 (lib/sns-drafts.mjs) と media queue に乗せる。
// publish_mode は manual_only のみ。外部投稿は一切しない。
//
// 使い方:
//   npm run sns:instagram:draft -- --topic 2026-08-topic-001 [--dry-run]
// 必要: ANTHROPIC_API_KEY (.env.local 可)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import Anthropic from '@anthropic-ai/sdk'
import matter from 'gray-matter'
import { SNS_DRAFTS_DIR, validateSnsDraftData } from './lib/sns-drafts.mjs'
import {
  ROOT, createJob, detectMedicalAdWarnings, getTodayJst, saveJob, transitionJob,
} from './lib/media-queue.mjs'

const TOPICS_DIR = join(ROOT, 'data', 'monthly-topic-candidates')

export function findTopicById(topicId) {
  const m = String(topicId).match(/^(\d{4}-\d{2})-topic-\d+$/)
  if (!m) throw new Error(`topic id の形式が不正です: "${topicId}" (例: 2026-08-topic-001)`)
  const monthPath = join(TOPICS_DIR, `${m[1]}.json`)
  if (!existsSync(monthPath)) throw new Error(`topic 候補ファイルがありません: ${relative(ROOT, monthPath)}`)
  const { topics } = JSON.parse(readFileSync(monthPath, 'utf8'))
  const topic = (topics ?? []).find((t) => t.id === topicId)
  if (!topic) throw new Error(`topic が見つかりません: ${topicId}`)
  return topic
}

export function buildInstagramDraftData({ topic, date = getTodayJst() }) {
  if (topic.medicalRisk === 'high') {
    throw new Error(`medicalRisk が high の topic は SNS ドラフト化できません: ${topic.id}`)
  }
  const slugBase = topic.id
  const filename = `${date}-instagram-${slugBase}.md`
  const data = {
    channel: 'instagram',
    platform: 'instagram',
    title: topic.title,
    date,
    status: 'pending_review',
    reviewed: false,
    approved_for_manual_post: false,
    ai_generated: true,
    medical_risk: topic.medicalRisk ?? 'low',
    source_topic_id: topic.id,
    publish_mode: 'manual_only',
  }
  return { filename, data }
}

export function buildInstagramPrompt({ topic }) {
  return [
    'あなたは歯科医院「三谷ファミリー歯科クリニック」(医療法人藍想会) のInstagram投稿ドラフトを作る編集者です。',
    '医療広告ガイドラインを厳守してください。断定表現(「必ず治る」「誰でも白くなる」等)、効果保証、',
    '不安を煽って受診を促す表現、根拠のない比較・誇大表現は禁止です。',
    '「気になる場合は相談」「状態により異なります」のような抑えた表現を使ってください。',
    '',
    `テーマ: ${topic.title}`,
    `カテゴリ: ${topic.category}`,
    `患者さんの関心: ${topic.patientConcern ?? ''}`,
    `キーワード: ${topic.targetKeyword ?? ''}`,
    '',
    '次の Markdown 構成で出力してください。見出しは変更しないこと。',
    '',
    '## 投稿目的',
    '(1-2文)',
    '',
    '## カルーセル構成',
    '',
    '1. 表紙 — (キャッチコピー)',
    '2. 課題 — (患者さんの悩み)',
    '3. 原因 — (わかりやすい説明)',
    '4. セルフケア — (家庭でできること)',
    '5. 受診目安 — (相談した方がよいサイン)',
    '6. 藍想会からの案内 — (押し付けない受診案内)',
    '',
    '## キャプション',
    '(300字以内。絵文字は控えめ)',
    '',
    '## ハッシュタグ',
    '(10個以内。治療結果を保証するタグは禁止)',
    '',
    '## 医療広告チェックメモ',
    '(この投稿で注意した表現を箇条書き)',
    '',
    '## 手動投稿チェックリスト',
    '- [ ] 画像とテキストの整合確認',
    '- [ ] 医療広告表現の最終確認',
    '- [ ] 投稿後にステータスを posted に更新',
  ].join('\n')
}

function loadEnv() {
  const envPath = join(ROOT, '.env.local')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.+)$/)
    if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
  }
}

export async function generateInstagramDraft({ topicId, dryRun = false }) {
  const topic = findTopicById(topicId)
  const { filename, data } = buildInstagramDraftData({ topic })

  loadEnv()
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY が未設定です (.env.local に設定可)')

  console.log(`⏳ Claude に Instagram ドラフトを生成中... (topic: ${topic.id})`)
  const client = new Anthropic({ apiKey })
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2500,
    messages: [{ role: 'user', content: buildInstagramPrompt({ topic }) }],
  })
  const body = response.content[0]?.type === 'text' ? response.content[0].text.trim() : ''
  if (!body) throw new Error('API からの応答が空でした')

  const validation = validateSnsDraftData(filename, data, body)
  if (validation.errors.length > 0) {
    throw new Error(`生成ドラフトが SNS 規約に違反: ${validation.errors.join(' / ')}`)
  }
  const warnings = detectMedicalAdWarnings(body)

  let job = createJob({
    type: 'sns_repurpose',
    source: 'manual',
    sourceText: `instagram draft from topic: ${topic.id}`,
    targetChannels: ['instagram'],
    riskLevel: data.medical_risk === 'medium' ? 'medium' : 'low',
  })
  job = transitionJob(job, 'draft_generated')
  job = transitionJob(job, 'review_pending')

  let outputPath = null
  if (!dryRun) {
    mkdirSync(SNS_DRAFTS_DIR, { recursive: true })
    outputPath = join(SNS_DRAFTS_DIR, filename)
    writeFileSync(outputPath, matter.stringify(body, { ...data, media_job_id: job.id }))
    job = { ...job, output_paths: [relative(ROOT, outputPath)] }
    saveJob(job)
  }
  return { topic, filename, outputPath, job, warnings, dryRun }
}

function main() {
  const args = process.argv.slice(2)
  const topicIdx = args.indexOf('--topic')
  const topicId = topicIdx >= 0 ? args[topicIdx + 1] : null
  const dryRun = args.includes('--dry-run')
  if (!topicId) {
    console.error('使い方: npm run sns:instagram:draft -- --topic <topic-id> [--dry-run]')
    process.exit(1)
  }
  generateInstagramDraft({ topicId, dryRun }).then(({ filename, outputPath, job, warnings, dryRun }) => {
    console.log(`✅ Instagram ドラフト生成: ${filename}${dryRun ? ' (dry-run: 保存なし)' : ''}`)
    if (outputPath) console.log(`   保存先: ${relative(ROOT, outputPath)}`)
    if (!dryRun) console.log(`   media queue job: ${job.id} (${job.status}, gate=${job.gate_policy})`)
    for (const w of warnings) console.warn(`   ⚠ 医療広告チェック: ${w}`)
    console.log('   投稿は sns:approve での Human 承認後に手動で行ってください。')
  }).catch((error) => {
    console.error(`❌ ${error.message}`)
    process.exit(1)
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
