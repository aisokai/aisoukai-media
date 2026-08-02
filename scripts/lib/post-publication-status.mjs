// scripts/lib/post-publication-status.mjs
// 公開可否の理由を CLI / 通知系で共有する。
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import matter from 'gray-matter'
import { hasStaleReviewedContent } from '../../src/lib/reviewContentFingerprint.mjs'

const JST_OFFSET_MS = 9 * 60 * 60 * 1000

export function getTodayJst(now = new Date()) {
  return new Date(now.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10)
}

export function toDateStr(val) {
  if (val instanceof Date) return val.toISOString().slice(0, 10)
  return String(val ?? '')
}

function addBlocker(blockers, code, message) {
  blockers.push({ code, message })
}

export function getPostPublicationStatus(data, { today = getTodayJst(), content = '' } = {}) {
  const blockers = []
  const publishAt = data.publish_at ? toDateStr(data.publish_at) : toDateStr(data.date)
  const humanApproved =
    data.reviewed === true &&
    Boolean(toDateStr(data.reviewed_at)) &&
    Boolean(String(data.reviewed_by ?? '').trim())
  const autoApproved = false
  const approved = humanApproved

  if (data.archived === true) {
    addBlocker(blockers, 'archived', 'archived:true のため公開対象外')
  }

  if (data.rejection_reason) {
    addBlocker(blockers, 'rejected', `rejection_reason あり: ${data.rejection_reason}`)
  }

  if (data.draft === true) {
    addBlocker(blockers, 'draft', 'draft:true のため公開対象外')
  }

  if (!approved) {
    addBlocker(
      blockers,
      'approval_missing',
      '本文確認済みではありません（reviewed:true / reviewed_at / reviewed_by が必要）',
    )
  }

  if (hasStaleReviewedContent(data, content)) {
    addBlocker(blockers, 'review_content_stale', '承認後に内容が変更されています。Human review をやり直してください')
  }

  if (data.publish_at) {
    const publishAtStr = toDateStr(data.publish_at)
    if (publishAtStr && publishAtStr > today) {
      addBlocker(blockers, 'future_publish_at', `publish_at:${publishAtStr} は未来日付`)
    }
  } else if (data.date) {
    const dateStr = toDateStr(data.date)
    if (dateStr && dateStr > today) {
      addBlocker(blockers, 'future_date', `date:${dateStr} は未来日付`)
    }
  }

  return {
    publishable: blockers.length === 0,
    approved,
    humanApproved,
    autoApproved,
    publishAt,
    today,
    blockers,
    reasons: blockers.map((b) => b.message),
    isFuture: blockers.some((b) => b.code === 'future_publish_at' || b.code === 'future_date'),
  }
}

export function evaluatePostFile(filePath, options = {}) {
  const raw = readFileSync(filePath, 'utf8')
  const parsed = matter(raw)
  const status = getPostPublicationStatus(parsed.data, { ...options, content: parsed.content })

  return {
    ...status,
    slug: basename(filePath).replace(/\.md$/, ''),
    title: String(parsed.data.title ?? '（タイトル未設定）'),
    file: filePath,
  }
}
