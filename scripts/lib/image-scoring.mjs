// scripts/lib/image-scoring.mjs
// 画像スコアリング共通ロジック（image-suggest / telegram-ops 共用）
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname       = dirname(fileURLToPath(import.meta.url))
export const ROOT     = join(__dirname, '..', '..')
const FEEDBACK_PATH   = join(ROOT, 'data', 'image-feedback.json')

// 記事テキストをトークン集合に変換（タグ単位 + 2文字以上）
export function tokenize(text) {
  const set = new Set()
  const str = String(text ?? '')
  for (const token of str.split(/[\s、。・「」【】（）()[\]：:,，！？!?]+/)) {
    if (token.length >= 2) set.add(token)
  }
  for (const w of (str.toLowerCase().match(/[a-z0-9]{2,}/g) ?? [])) {
    set.add(w)
  }
  return set
}

// タグ一致ベースのベーススコア
export function scoreImage(image, articleTokens) {
  let score = 0
  for (const tag of image.tags ?? []) {
    if (articleTokens.has(tag)) { score += 2; continue }
    for (const token of articleTokens) {
      if (tag.includes(token) || token.includes(tag)) { score += 0.5; break }
    }
  }
  return score
}

// フィードバックデータを読み込む（ファイル不在時は空配列）
export function loadFeedback() {
  if (!existsSync(FEEDBACK_PATH)) return []
  try {
    const data = JSON.parse(readFileSync(FEEDBACK_PATH, 'utf8'))
    return Array.isArray(data.entries) ? data.entries : []
  } catch {
    return []
  }
}

/**
 * フィードバック履歴を基にスコアを調整する。
 *
 * ルール:
 *   reject（同カテゴリ）:    -1.5
 *   reject（異カテゴリ）:    -0.5
 *   approve（同カテゴリ）:   +1.0
 *   approve（タグ重複あり）: +0.5
 *   correct_image に指定:    +1.0（同カテゴリ）/ +0.5（異カテゴリ）
 */
export function feedbackAdjustment(imageId, articleCategory, articleTokens, entries) {
  let adj = 0
  for (const e of entries) {
    const sameCategory = e.article_category === articleCategory

    if (e.action === 'reject' && e.image_id === imageId) {
      adj += sameCategory ? -1.5 : -0.5
    }

    if (e.action === 'approve' && e.image_id === imageId) {
      if (sameCategory) {
        adj += 1.0
      } else {
        const entryTags = new Set(e.article_tags ?? [])
        const overlap   = [...entryTags].some((t) => articleTokens.has(t))
        if (overlap) adj += 0.5
      }
    }

    // correct_image は approve 扱い
    if (e.correct_image === imageId) {
      adj += sameCategory ? 1.0 : 0.5
    }
  }
  return adj
}

// カテゴリ日本語→ライブラリカテゴリ英語マッピング
const ARTICLE_CAT_TO_LIB_CAT = {
  '虫歯治療':    'cavity',
  '根管治療':    'root-canal',
  '歯周病治療':  'periodontal',
  '予防歯科':    'preventive',
  '小児歯科':    'pediatric',
  '親知らず':    'general',
  'インプラント': 'implant',
  'お知らせ':    'announcement',
}

/**
 * スコア上位 limit 件の画像候補を返す（フィードバック調整済み）。
 */
export function findCandidates({
  images,
  title,
  category,
  excerpt     = '',
  bodyContent = '',
  usedImages  = new Set(),
  limit       = 3,
  feedback,
}) {
  if (!images || images.length === 0) return []

  const entries       = feedback ?? loadFeedback()
  const articleText   = [title, category, excerpt, bodyContent.slice(0, 300)].join(' ')
  const articleTokens = tokenize(articleText)

  const scored = images
    .filter((img) => !usedImages.has(img.id))
    .map((img) => {
      const base = scoreImage(img, articleTokens)
      const adj  = feedbackAdjustment(img.id, category, articleTokens, entries)
      return { img, score: base + adj, base, adj }
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)

  if (scored.length > 0) return scored.map(({ img }) => img)

  // カテゴリ fallback（スコア 0 の時）
  const libCat = ARTICLE_CAT_TO_LIB_CAT[category] ?? 'general'
  return images
    .filter((img) => (img.category === libCat || img.category === 'general') && !usedImages.has(img.id))
    .slice(0, limit)
}
