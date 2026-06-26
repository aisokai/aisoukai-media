// scripts/lib/content-status.mjs
// コンテンツ状態の集計・通知文言・重複テーマ警告を共通化する。
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import matter from 'gray-matter'
import {
  getPostPublicationStatus,
  getTodayJst,
  toDateStr,
} from './post-publication-status.mjs'

const HTML_BREAK_RE = /<br\s*\/?>/gi
export { toDateStr }

export function resolvePostFileName(input) {
  const name = input.endsWith('.md') ? input : `${input}.md`
  return name
}

function emptyContentStatus() {
  return { live: [], scheduled: [], pending: [], pendingFuture: [], rejected: [] }
}

function buildContentStatus(entries) {
  if (entries.length === 0) {
    return emptyContentStatus()
  }

  const today = getTodayJst()
  const live = []
  const scheduled = []
  const pending = []
  const pendingFuture = []
  const rejected = []

  for (const entry of entries) {
    const { data } = matter(entry.raw)
    const publishAt = data.publish_at ? toDateStr(data.publish_at) : toDateStr(data.date)
    const publicationStatus = getPostPublicationStatus(data, { today })
    const isFuture = publicationStatus.isFuture
    const approved = publicationStatus.approved
    const hasReject = !!data.rejection_reason
    const item = {
      slug: entry.file.replace(/\.md$/, ''),
      title: String(data.title ?? '（タイトル未設定）'),
      publishAt,
      publishAtSource: data.publish_at ? 'publish_at' : 'date',
      isFuture,
      category: String(data.category ?? ''),
      draft: data.draft === true,
      reviewed: publicationStatus.humanApproved,
      autoApproved: publicationStatus.autoApproved,
      file: entry.file,
      path: entry.path,
      source: entry.source,
    }

    if (hasReject) {
      rejected.push(item)
    } else if (approved) {
      if (publicationStatus.publishable) live.push(item)
      else if (isFuture) scheduled.push(item)
      else pending.push(item)
    } else if (isFuture) {
      pendingFuture.push(item)
    } else {
      pending.push(item)
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

export function loadContentStatus(postsDir) {
  if (!existsSync(postsDir)) {
    return { live: [], scheduled: [], pending: [], pendingFuture: [], rejected: [] }
  }

  const entries = readdirSync(postsDir)
    .filter((f) => f.endsWith('.md'))
    .map((file) => ({
      file,
      path: `content/posts/${file}`,
      raw: readFileSync(join(postsDir, file), 'utf8'),
      source: 'local',
    }))

  return buildContentStatus(entries)
}

function runGit(root, args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
}

function hasGitRef(root, ref) {
  try {
    runGit(root, ['rev-parse', '--verify', `${ref}^{commit}`])
    return true
  } catch {
    return false
  }
}

export function loadContentStatusFromGitRef(root, ref = 'origin/main') {
  if (!hasGitRef(root, ref)) {
    return { ok: false, ref, status: emptyContentStatus(), error: `git ref not found: ${ref}` }
  }

  try {
    const paths = runGit(root, ['ls-tree', '-r', '--name-only', ref, 'content/posts'])
      .split('\n')
      .filter((path) => path.endsWith('.md'))

    const entries = paths.map((path) => ({
      file: path.replace(/^content\/posts\//, ''),
      path,
      raw: runGit(root, ['show', `${ref}:${path}`]),
      source: ref,
    }))

    return { ok: true, ref, status: buildContentStatus(entries) }
  } catch (error) {
    return { ok: false, ref, status: emptyContentStatus(), error: error.message }
  }
}

function reviewQueue(status) {
  return [...status.pending, ...status.pendingFuture]
}

function isLocalDashboardUrl(url) {
  try {
    const hostname = new URL(url).hostname
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
  } catch {
    return false
  }
}

export function buildNotificationReviewContext(postsDir, {
  root = process.cwd(),
  dashboardUrl = '',
  originRef = 'origin/main',
} = {}) {
  const localStatus = loadContentStatus(postsDir)
  const origin = loadContentStatusFromGitRef(root, originRef)
  const useLocalDashboard = isLocalDashboardUrl(dashboardUrl)
  const visibleStatus = useLocalDashboard || !origin.ok ? localStatus : origin.status
  const visibleSlugs = new Set(reviewQueue(visibleStatus).map((item) => item.slug))
  const localOnly = useLocalDashboard
    ? []
    : reviewQueue(localStatus).filter((item) => !visibleSlugs.has(item.slug))

  return {
    dashboardKind: useLocalDashboard ? 'local' : 'production',
    dashboardUrl,
    visibleStatus,
    localStatus,
    originRef,
    originAvailable: origin.ok,
    originError: origin.error,
    localOnly,
  }
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

// 丸数字（① ② ... ⑩）。11件以上は (11) 等にフォールバック
const CIRCLE_NUMBERS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩']

function circleNum(n) {
  return CIRCLE_NUMBERS[n - 1] ?? `(${n})`
}

// タイトルを最大 MAX_TITLE_LEN 文字に切り詰める（超えたら … を付ける）
const MAX_TITLE_LEN = 30

function trimTitle(title) {
  const t = String(title ?? '').replace(/\s+/g, ' ').trim()
  return t.length > MAX_TITLE_LEN ? `${t.slice(0, MAX_TITLE_LEN)}…` : t
}

export function formatContentStatusLines(status, {
  dashboardUrl,
  maxItems = 5,
  hiddenLocalItems = [],
  dashboardKind = 'production',
  originRef = 'origin/main',
  originAvailable = true,
  localReviewUrl = 'http://localhost:3000/admin/pending-review',
} = {}) {
  const reviewQueue = [...status.pending, ...status.pendingFuture]
  const reviewCount = reviewQueue.length

  // --- 0件のシンプル表示 ---
  if (reviewCount === 0) {
    const lines = [
      '✅ review待ちはありません',
      `（公開中: ${status.live.length}件）`,
    ]
    if (hiddenLocalItems.length > 0) {
      lines.push('')
      lines.push(`⚠️ ローカルのみ / needs-push ${hiddenLocalItems.length}件`)
      lines.push('本番レビュー画面には未反映。push後に表示されます。')
      for (const item of hiddenLocalItems.slice(0, 3)) {
        lines.push(`- ${trimTitle(item.title)}（${item.publishAt}）`)
      }
      if (hiddenLocalItems.length > 3) {
        lines.push(`- 他 ${hiddenLocalItems.length - 3}件`)
      }
      lines.push(`ローカル確認: ${localReviewUrl}`)
    }
    return lines
  }

  // --- 重複検出: どのインデックスが重複クラスタに属するか ---
  const duplicateClusters = findDuplicateThemes(reviewQueue)

  // slug → 表示番号（1始まり）のマップを作成
  // reviewQueue の並び順が番号に対応する
  const slugToNum = new Map()
  reviewQueue.forEach((item, idx) => {
    slugToNum.set(item.slug, idx + 1)
  })

  // 各インデックスが重複クラスタに含まれるかを判定するセット
  const duplicateIndexes = new Set()
  for (const cluster of duplicateClusters) {
    for (const item of cluster.items) {
      const num = slugToNum.get(item.slug)
      if (num != null) duplicateIndexes.add(num)
    }
  }

  // --- 見出し ---
  const lines = [`📋 review待ち ${reviewCount}件`, '']

  // --- 番号付きリスト（最大 maxItems 件） ---
  const displayItems = reviewQueue.slice(0, maxItems)
  for (let i = 0; i < displayItems.length; i++) {
    const item = displayItems[i]
    const num = i + 1
    const badge = duplicateIndexes.has(num) ? '⚠️' : ''
    lines.push(`${circleNum(num)} ${trimTitle(item.title)}（${item.publishAt}）${badge}`)
  }

  // 5件超の場合は残件数を追記
  if (reviewCount > maxItems) {
    lines.push(`（他 ${reviewCount - maxItems}件は管理画面で確認）`)
  }

  // --- 重複説明行 ---
  for (const cluster of duplicateClusters) {
    // クラスタ内の記事を番号でリストアップ（maxItems 表示範囲内のもののみ）
    const nums = cluster.items
      .map((item) => slugToNum.get(item.slug))
      .filter((n) => n != null && n <= maxItems)
      .sort((a, b) => a - b)
      .map(circleNum)
    if (nums.length >= 2) {
      lines.push('')
      lines.push(`⚠️ 重複候補: ${nums.join('')} 同タイトル`)
    }
  }

  // --- 管理画面リンク ---
  lines.push('')
  lines.push(dashboardKind === 'local' ? '承認・却下はこちら（ローカル）:' : '承認・却下はこちら（本番）:')
  lines.push(dashboardUrl)

  if (!originAvailable && dashboardKind === 'production') {
    lines.push('')
    lines.push(`⚠️ ${originRef} を確認できないため、本番反映状況は未検証です。`)
  }

  if (hiddenLocalItems.length > 0) {
    lines.push('')
    lines.push(`⚠️ ローカルのみ / needs-push ${hiddenLocalItems.length}件`)
    lines.push('本番レビュー画面には未反映。push後に表示されます。')
    for (const item of hiddenLocalItems.slice(0, 3)) {
      lines.push(`- ${trimTitle(item.title)}（${item.publishAt}）`)
    }
    if (hiddenLocalItems.length > 3) {
      lines.push(`- 他 ${hiddenLocalItems.length - 3}件`)
    }
    lines.push(`ローカル確認: ${localReviewUrl}`)
  }

  lines.push('')
  lines.push('スマホで本文確認 → 承認/却下できます。')

  return lines
}

export function buildReviewSummary(status, options = {}) {
  return formatContentStatusLines(status, options).join('\n')
}
