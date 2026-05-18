// scripts/lib/content-status.mjs
// コンテンツ状態の集計・通知文言・重複テーマ警告を共通化する。
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import matter from 'gray-matter'

const HTML_BREAK_RE = /<br\s*\/?>/gi

function getTodayJst() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)
}

export function toDateStr(val) {
  if (val instanceof Date) return val.toISOString().slice(0, 10)
  return String(val ?? '')
}

export function resolvePostFileName(input) {
  const name = input.endsWith('.md') ? input : `${input}.md`
  return name
}

export function loadContentStatus(postsDir) {
  if (!existsSync(postsDir)) {
    return { live: [], scheduled: [], pending: [], pendingFuture: [], rejected: [] }
  }

  const today = getTodayJst()
  const live = []
  const scheduled = []
  const pending = []
  const pendingFuture = []
  const rejected = []

  for (const file of readdirSync(postsDir).filter((f) => f.endsWith('.md'))) {
    const raw = readFileSync(join(postsDir, file), 'utf8')
    const { data } = matter(raw)
    const publishAt = data.publish_at ? toDateStr(data.publish_at) : toDateStr(data.date)
    const isFuture = publishAt > today
    const reviewed = data.reviewed === true
    const draft = data.draft === true
    const hasReject = !!data.rejection_reason
    const entry = {
      slug: file.replace(/\.md$/, ''),
      title: String(data.title ?? '（タイトル未設定）'),
      publishAt,
      isFuture,
      category: String(data.category ?? ''),
      draft,
    }

    if (reviewed) {
      if (!draft && !isFuture) live.push(entry)
      else if (isFuture) scheduled.push(entry)
    } else if (hasReject) {
      rejected.push(entry)
    } else if (isFuture) {
      pendingFuture.push(entry)
    } else {
      pending.push(entry)
    }
  }

  const byDateDesc = (a, b) => (a.publishAt < b.publishAt ? 1 : a.publishAt > b.publishAt ? -1 : 0)
  pending.sort(byDateDesc)
  pendingFuture.sort(byDateDesc)
  live.sort(byDateDesc)
  scheduled.sort(byDateDesc)
  rejected.sort(byDateDesc)

  return { live, scheduled, pending, pendingFuture, rejected }
}

function extractTokens(text) {
  const out = new Set()
  const normalized = String(text ?? '').replace(HTML_BREAK_RE, ' ')
  for (const token of normalized.split(/[\s、。・「」【】（）()[\]：:,，！？!?\/]+/)) {
    if (token.length >= 2) out.add(token)
  }
  for (const word of (normalized.toLowerCase().match(/[a-z0-9]{2,}/g) ?? [])) {
    out.add(word)
  }
  return out
}

function diceSimilarity(a, b) {
  if (a.size === 0 && b.size === 0) return 0
  let hits = 0
  for (const token of a) {
    if (b.has(token)) hits++
  }
  return (2 * hits) / (a.size + b.size)
}

function isDuplicatePair(a, b) {
  if (!a || !b) return false
  if (a.category && b.category && a.category !== b.category) return false

  const aTokens = extractTokens(a.title)
  const bTokens = extractTokens(b.title)
  const dice = diceSimilarity(aTokens, bTokens)
  const aAscii = [...aTokens].filter((t) => /^[a-z0-9]{3,}$/i.test(t))
  const bAscii = new Set([...bTokens].filter((t) => /^[a-z0-9]{3,}$/i.test(t)))
  const sharedAscii = aAscii.some((t) => bAscii.has(t))

  return dice > 0.30 || sharedAscii
}

function buildThemeLabel(items) {
  const tokenCounts = new Map()
  for (const item of items) {
    for (const token of extractTokens(item.title)) {
      if (token.length < 2) continue
      tokenCounts.set(token, (tokenCounts.get(token) ?? 0) + 1)
    }
  }

  const ranked = [...tokenCounts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1]
      return b[0].length - a[0].length
    })

  return ranked[0]?.[0] ?? '重複テーマ'
}

export function findDuplicateThemes(items) {
  const clusters = []
  const used = new Set()

  for (let i = 0; i < items.length; i++) {
    if (used.has(i)) continue

    const clusterIndexes = new Set([i])
    let changed = true

    while (changed) {
      changed = false
      for (let j = 0; j < items.length; j++) {
        if (clusterIndexes.has(j)) continue
        for (const idx of clusterIndexes) {
          if (isDuplicatePair(items[idx], items[j])) {
            clusterIndexes.add(j)
            changed = true
            break
          }
        }
      }
    }

    for (const idx of clusterIndexes) used.add(idx)
    if (clusterIndexes.size >= 2) {
      const clusterItems = [...clusterIndexes].map((idx) => items[idx])
      clusters.push({
        label: buildThemeLabel(clusterItems),
        items: clusterItems,
      })
    }
  }

  return clusters
}

function listDisplayTitle(item) {
  const title = String(item.title ?? '').replace(/\s+/g, ' ').trim()
  return title.length > 28 ? `${title.slice(0, 28)}…` : title
}

function formatReviewItem(item) {
  const scope = item.isFuture ? '公開日待ち' : '今すぐ承認可'
  return `- ${listDisplayTitle(item)} [${scope} / ${item.publishAt}]`
}

function buildNextAction(status) {
  const reviewCount = status.pending.length + status.pendingFuture.length
  if (status.pending.length > 0) {
    return `今やること: review待ち ${status.pending.length}件を承認してください`
  }
  if (status.pendingFuture.length > 0) {
    return `今やること: review待ち ${reviewCount}件の公開日を確認してください`
  }
  if (status.scheduled.length > 0) {
    return `今やること: 公開予定 ${status.scheduled.length}件を確認してください`
  }
  return '今やること: 承認待ちはありません'
}

export function formatContentStatusLines(status, {
  dashboardUrl,
  heading = 'コンテンツ状態サマリー',
  maxItems = 3,
  noPendingText = '承認待ちはありません',
  showNextAction = true,
} = {}) {
  const reviewCount = status.pending.length + status.pendingFuture.length
  const lines = [heading, '']

  lines.push(`✅ 公開中:            ${status.live.length}件`)
  lines.push(`📅 公開予定(reviewed): ${status.scheduled.length}件`)
  if (reviewCount > 0) {
    lines.push(`📝 review待ち:         ${reviewCount}件（今すぐ承認可 ${status.pending.length}件 / 公開日待ち ${status.pendingFuture.length}件）`)
  } else {
    lines.push(`📝 ${noPendingText}`)
  }
  lines.push(`🚫 差し戻し済み:       ${status.rejected.length}件`)

  if (showNextAction) {
    lines.push('')
    lines.push(buildNextAction(status))
  }

  const reviewQueue = [...status.pending, ...status.pendingFuture].slice(0, maxItems)
  if (reviewQueue.length > 0) {
    lines.push('')
    lines.push('review待ち:')
    for (const item of reviewQueue) {
      lines.push(formatReviewItem(item))
    }
    const totalReview = status.pending.length + status.pendingFuture.length
    if (totalReview > maxItems) {
      lines.push(`...他 ${totalReview - maxItems} 件`)
    }
  }

  const duplicateThemes = findDuplicateThemes([...status.pending, ...status.pendingFuture])
  if (duplicateThemes.length > 0) {
    lines.push('')
    lines.push('⚠️ 重複テーマの可能性')
    for (const group of duplicateThemes.slice(0, 3)) {
      lines.push(`- ${group.label}: ${group.items.length}件`)
    }
  }

  lines.push('')
  lines.push(`管理URL: ${dashboardUrl}`)

  return lines
}

export function buildReviewSummary(status, options = {}) {
  return formatContentStatusLines(status, options).join('\n')
}
