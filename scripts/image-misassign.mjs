#!/usr/bin/env node
// image-misassign.mjs
// 既存記事の割当画像が適切かスコアリングで検査し、怪しい割当を一覧化する。
// 読み取り専用。ファイルは変更しない。
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'

const __dirname    = dirname(fileURLToPath(import.meta.url))
const ROOT         = join(__dirname, '..')
const POSTS_DIR    = join(ROOT, 'content', 'posts')
const LIBRARY_PATH = join(ROOT, 'data', 'image-library.json')

// 割当スコアがこれ未満かつ代替候補が存在する場合に 🔴 RED フラグ
const SCORE_THRESHOLD = 2

const ARTICLE_CAT_TO_LIB_CAT = {
  '虫歯治療':    'cavity',
  '歯周病治療':  'general',
  '根管治療':    'general',
  '親知らず':    'general',
  '予防歯科':    'preventive',
  'インプラント': 'implant',
  '小児歯科':    'pediatric',
  'お知らせ':    'announcement',
}

function tokenize(text) {
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

function scoreImage(image, articleTokens) {
  let score = 0
  for (const tag of image.tags ?? []) {
    if (articleTokens.has(tag)) { score += 2; continue }
    for (const token of articleTokens) {
      if (tag.includes(token) || token.includes(tag)) { score += 0.5; break }
    }
  }
  return score
}

function main() {
  const BAR = '═'.repeat(62)
  const DIV = '─'.repeat(62)

  console.log(BAR)
  console.log('  image:misassign — 誤割当検出レポート')
  console.log(BAR)

  if (!existsSync(LIBRARY_PATH)) {
    console.error('エラー: data/image-library.json が見つかりません')
    process.exit(1)
  }
  let lib
  try {
    lib = JSON.parse(readFileSync(LIBRARY_PATH, 'utf8'))
  } catch (e) {
    console.error(`パースエラー: ${e.message}`)
    process.exit(1)
  }
  const images    = lib.images ?? []
  const pathToId  = new Map(images.map((img) => [img.path, img.id]))
  const idToImage = new Map(images.map((img) => [img.id, img]))

  const postFiles = existsSync(POSTS_DIR)
    ? readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md')).sort()
    : []

  const redFlags    = []  // スコア不一致（タグ不一致）
  const yellowFlags = []  // カテゴリ不一致

  for (const f of postFiles) {
    let data, content
    try {
      const parsed = matter(readFileSync(join(POSTS_DIR, f), 'utf8'))
      data    = parsed.data
      content = parsed.content
    } catch { continue }

    const imgPath = typeof data.image === 'string' ? data.image.trim() : ''
    if (!imgPath) continue  // 未割当はスキップ

    const assignedId  = pathToId.get(imgPath)
    const assignedImg = idToImage.get(assignedId)
    if (!assignedImg) continue  // ライブラリ未登録

    const articleText = [
      data.title ?? '',
      data.category ?? '',
      data.excerpt ?? data.description ?? '',
      content.slice(0, 300),
    ].join(' ')
    const tokens = tokenize(articleText)

    const assignedScore = scoreImage(assignedImg, tokens)

    // 代替候補（割当済み以外でスコア最大）
    const best = images
      .filter((img) => img.id !== assignedId)
      .map((img) => ({ img, score: scoreImage(img, tokens) }))
      .sort((a, b) => b.score - a.score)[0]

    const slug = f.replace(/\.md$/, '')

    // 🔴 RED: assigned スコアが閾値未満 かつ 代替候補のスコアが assigned より大きい
    if (assignedScore < SCORE_THRESHOLD && best && best.score > assignedScore) {
      redFlags.push({
        slug,
        title:        data.title ?? slug,
        category:     data.category ?? '',
        assignedId,
        assignedScore,
        assignedImg,
        bestId:       best.img.id,
        bestScore:    best.score,
        bestImg:      best.img,
      })
      continue
    }

    // 🟡 YELLOW: カテゴリ不一致（assigned image の category が期待値と異なる）
    const expectedLibCat = ARTICLE_CAT_TO_LIB_CAT[data.category ?? '']
    if (
      expectedLibCat &&
      assignedImg.category !== expectedLibCat &&
      assignedImg.category !== 'general'
    ) {
      yellowFlags.push({
        slug,
        title:        data.title ?? slug,
        category:     data.category ?? '',
        assignedId,
        assignedScore,
        assignedImg,
        expectedLibCat,
        bestId:       best?.img.id ?? '',
        bestScore:    best?.score ?? 0,
        bestImg:      best?.img ?? null,
      })
    }
  }

  // ── 🔴 RED フラグ ──
  if (redFlags.length > 0) {
    console.log()
    console.log(`🔴 スコア不一致（${redFlags.length} 件）— 要確認:`)
    console.log(DIV)
    for (const r of redFlags) {
      console.log(`  ${r.slug}`)
      console.log(`    タイトル: ${r.title}`)
      console.log(`    カテゴリ: ${r.category}`)
      console.log(`    現割当: [${r.assignedId}]  スコア: ${r.assignedScore}  cat: ${r.assignedImg.category ?? ''}`)
      console.log(`      alt: ${(r.assignedImg.alt ?? '').slice(0, 50)}`)
      console.log(`    推奨  : [${r.bestId}]  スコア: ${r.bestScore}  cat: ${r.bestImg.category ?? ''}`)
      console.log(`      alt: ${(r.bestImg.alt ?? '').slice(0, 50)}`)
      console.log(`    修正  : npm run image:assign -- ${r.slug} --image ${r.bestId}`)
      console.log()
    }
    console.log(DIV)
  }

  // ── 🟡 YELLOW フラグ ──
  if (yellowFlags.length > 0) {
    console.log()
    console.log(`🟡 カテゴリ不一致（${yellowFlags.length} 件）— 参考:`)
    console.log(DIV)
    for (const y of yellowFlags) {
      console.log(`  ${y.slug}`)
      console.log(`    カテゴリ: ${y.category}（期待ライブラリcat: ${y.expectedLibCat}）`)
      console.log(`    現割当: [${y.assignedId}]  cat: ${y.assignedImg.category ?? ''}  スコア: ${y.assignedScore}`)
      if (y.bestImg) {
        console.log(`    代替候補: [${y.bestId}]  cat: ${y.bestImg.category ?? ''}  スコア: ${y.bestScore}`)
        console.log(`    修正  : npm run image:assign -- ${y.slug} --image ${y.bestId}`)
      }
      console.log()
    }
    console.log(DIV)
  }

  if (redFlags.length === 0 && yellowFlags.length === 0) {
    console.log()
    console.log('  ✅ 誤割当の疑いがある記事は見つかりませんでした')
  }

  console.log()
  console.log(BAR)
}

main()
