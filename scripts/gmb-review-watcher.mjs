#!/usr/bin/env node
// GMB Review Watcher。
// source: mock (デフォルト・sample JSONから) または api (実GMB APIの**読み取り専用**取得)。
// どちらのsourceでも、未返信・未処理の口コミを検出し、ルールベース分類 → 返信案生成 →
// ローカル保存するだけで、**返信送信・投稿は一切行わない**
// (送信は gmb-apply.mjs の approved job + --apply 経由のみ)。
// console / log には masked_text のみ出す。raw_text は snapshot ファイル内にのみ保持する。
//
// 使い方:
//   node scripts/gmb-review-watcher.mjs                 # mockから検出・下書き保存 (media:gmb:reviews:check)
//   node scripts/gmb-review-watcher.mjs --source api    # 実APIから読み取り (要 認証情報+gmb-location.json)
//   node scripts/gmb-review-watcher.mjs --no-write      # 表示のみ・ファイルも書かない (media:gmb:reviews:dry-run)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { GMB_REVIEWS_DIR, fetchReviews } from './lib/gmb-adapter.mjs'
import { GMB_LOCATION_CONFIG_PATH } from './lib/gmb-api.mjs'
import { classifyReview, REPLY_TEMPLATES, selectReplyTemplate } from './lib/review-rules.mjs'
import {
  ROOT, appendMediaLog, createJob, getJstTimestamp, maskPersonalInfo, saveJob, transitionJob,
} from './lib/media-queue.mjs'

export const PROCESSED_IDS_PATH = join(GMB_REVIEWS_DIR, 'processed-ids.json')
export const SNAPSHOTS_DIR = join(GMB_REVIEWS_DIR, 'snapshots')
export const REPLIES_DIR = join(GMB_REVIEWS_DIR, 'replies')

export function loadProcessedIds(path = PROCESSED_IDS_PATH) {
  if (!existsSync(path)) return []
  try {
    return JSON.parse(readFileSync(path, 'utf8')).ids ?? []
  } catch {
    return []
  }
}

export function buildReviewArtifacts(review) {
  const { classification, riskLevel, matchedRule } = classifyReview(review)
  const templateId = selectReplyTemplate({ classification, rating: review.rating, text: review.text })
  const snapshot = {
    review_id: review.review_id,
    rating: review.rating,
    raw_text: String(review.text ?? ''),
    masked_text: maskPersonalInfo(String(review.text ?? '')),
    reviewer_display: String(review.reviewer_display ?? '匿名'),
    has_reply: Boolean(review.has_reply),
    classification,
    matched_rule: matchedRule,
    risk_level: riskLevel,
    detected_at: getJstTimestamp(),
    processed: true,
  }
  const replyDraft = {
    review_id: review.review_id,
    template_id: templateId,
    draft_text: REPLY_TEMPLATES[templateId],
    risk_level: riskLevel,
    external_result: null,
    replied_at: null,
    created_at: getJstTimestamp(),
  }
  return { snapshot, replyDraft }
}

export async function runWatcher({
  source = 'mock',
  write = true,
  gmbLocationConfigPath = GMB_LOCATION_CONFIG_PATH,
} = {}) {
  // 前提条件チェック: 実API読み取りには gmb-location.json が必要。
  // 未設定はエラーではなくセットアップ待ち (fail-soft)。launchd を exit 1 で落とさない。
  if (source === 'api' && !existsSync(gmbLocationConfigPath)) {
    if (write) appendMediaLog({ event: 'watcher_setup_pending', reason: 'gmb-location.json missing' })
    return { setupPending: true, total: 0, newCount: 0, results: [] }
  }
  const reviews = await fetchReviews({ source })
  const processedIds = loadProcessedIds()
  const newReviews = reviews.filter((r) => !r.has_reply && !processedIds.includes(r.review_id))
  const results = []

  for (const review of newReviews) {
    try {
      const { snapshot, replyDraft } = buildReviewArtifacts(review)

      let job = createJob({
        type: 'review_reply',
        source: 'watcher',
        sourceText: `review ${snapshot.review_id} (rating ${snapshot.rating}): ${snapshot.masked_text}`,
        targetChannels: ['gmb'],
        riskLevel: snapshot.risk_level,
      })
      job = transitionJob(job, 'draft_generated')
      job = transitionJob(job, snapshot.risk_level === 'high' ? 'human_required' : 'review_pending')

      if (write) {
        mkdirSync(SNAPSHOTS_DIR, { recursive: true })
        mkdirSync(REPLIES_DIR, { recursive: true })
        const snapshotPath = join(SNAPSHOTS_DIR, `${snapshot.review_id}.json`)
        const replyJsonPath = join(REPLIES_DIR, `${snapshot.review_id}.json`)
        const replyMdPath = join(REPLIES_DIR, `${snapshot.review_id}.md`)
        writeFileSync(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`)
        const fullDraft = { ...replyDraft, job_id: job.id, gate_policy: job.gate_policy }
        writeFileSync(replyJsonPath, `${JSON.stringify(fullDraft, null, 2)}\n`)
        writeFileSync(replyMdPath,
          `# 返信案: ${snapshot.review_id}\n\n- rating: ${snapshot.rating}\n- 分類: ${snapshot.classification} (rule ${snapshot.matched_rule})\n- gate: ${job.gate_policy}\n\n## 口コミ (マスク済み)\n\n${snapshot.masked_text || '(本文なし)'}\n\n## 返信案 (${replyDraft.template_id})\n\n${replyDraft.draft_text}\n`)
        job = { ...job, output_paths: [snapshotPath, replyJsonPath, replyMdPath].map((p) => relative(ROOT, p)) }
        saveJob(job)
      }

      results.push({ snapshot, replyDraft, job, error: null })
    } catch (error) {
      // 失敗は該当reviewのみ。watcher全体は止めない。
      results.push({ snapshot: { review_id: review.review_id }, replyDraft: null, job: null, error: error.message })
      appendMediaLog({ event: 'review_failed', review_id: review.review_id, error: String(error.message) })
    }
  }

  if (write && results.some((r) => !r.error)) {
    const ids = [...processedIds, ...results.filter((r) => !r.error).map((r) => r.snapshot.review_id)]
    mkdirSync(GMB_REVIEWS_DIR, { recursive: true })
    writeFileSync(PROCESSED_IDS_PATH, `${JSON.stringify({ ids }, null, 2)}\n`)
  }

  return { total: reviews.length, newCount: newReviews.length, results }
}

function main() {
  const write = !process.argv.includes('--no-write')
  const sourceIdx = process.argv.indexOf('--source')
  const source = sourceIdx >= 0 ? process.argv[sourceIdx + 1] : 'mock'
  runWatcher({ source, write }).then(({ setupPending, total, newCount, results }) => {
    if (setupPending) {
      console.log('⏸ GMB review watcher: セットアップ待ち。config/gmb-location.json がありません。')
      console.log('   有効化するには先生が npm run media:gmb:discover を実行してください (GMB API 認証が必要)。')
      return
    }
    console.log(`✅ GMB review watcher (${source === 'api' ? '実API読み取り' : 'dry-run / mock'}): 取得 ${total} 件, 新規未返信 ${newCount} 件 ${write ? '(下書き保存済み)' : '(表示のみ)'}`)
    for (const { snapshot, job, error } of results) {
      if (error) {
        console.error(`   ❌ ${snapshot.review_id}: failed — ${error}`)
        continue
      }
      console.log(`   - ${snapshot.review_id} ★${snapshot.rating} [${snapshot.classification}] → ${job.status} gate=${job.gate_policy}`)
      console.log(`     "${snapshot.masked_text || '(本文なし)'}"`)
    }
    console.log(`   ${source === 'api' ? '読み取り専用のAPI取得です。' : '実APIは呼んでいません (mock)。'}返信送信・投稿はこのスクリプトからは行えません (Human Gate)。`)
  }).catch((error) => {
    console.error(`❌ ${error.message}`)
    process.exit(1)
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
