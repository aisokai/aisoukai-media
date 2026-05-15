#!/usr/bin/env node
// image-feedback.mjs
// 画像フィードバック（approve/reject）を data/image-feedback.json に記録する CLI。
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'

const __dirname       = dirname(fileURLToPath(import.meta.url))
const ROOT            = join(__dirname, '..')
const POSTS_DIR       = join(ROOT, 'content', 'posts')
const FEEDBACK_PATH   = join(ROOT, 'data', 'image-feedback.json')
const LIBRARY_PATH    = join(ROOT, 'data', 'image-library.json')

function parseArgs(argv) {
  const args = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key  = argv[i].slice(2).replace(/-/g, '_')
      const next = argv[i + 1]
      args[key]  = next && !next.startsWith('--') ? argv[++i] : true
    } else {
      args._.push(argv[i])
    }
  }
  return args
}

function getJstTimestamp() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace('Z', '+09:00')
}

function loadFeedbackStore() {
  if (!existsSync(FEEDBACK_PATH)) return { version: 1, entries: [] }
  try {
    const data = JSON.parse(readFileSync(FEEDBACK_PATH, 'utf8'))
    if (!Array.isArray(data.entries)) data.entries = []
    return data
  } catch {
    return { version: 1, entries: [] }
  }
}

function saveFeedbackStore(store) {
  writeFileSync(FEEDBACK_PATH, JSON.stringify(store, null, 2) + '\n', 'utf8')
}

function main() {
  const args  = parseArgs(process.argv.slice(2))
  const slug  = String(args.slug ?? args._[0] ?? '').trim()
  const imageId      = String(args.image ?? '').trim()
  const action       = String(args.action ?? '').trim()
  const reason       = String(args.reason ?? '').trim() || null
  const correctImage = String(args.correct_image ?? '').trim() || null

  if (!slug || !imageId || !action) {
    console.error('使い方: npm run image:feedback -- <slug> --image <id> --action approve|reject [--reason "理由"] [--correct_image <id>]')
    process.exit(1)
  }

  if (!['approve', 'reject'].includes(action)) {
    console.error('エラー: --action は approve または reject を指定してください')
    process.exit(1)
  }

  const filename = slug.endsWith('.md') ? slug : `${slug}.md`
  const filePath = join(POSTS_DIR, filename)

  if (!existsSync(filePath)) {
    console.error(`エラー: 記事ファイルが見つかりません: content/posts/${filename}`)
    process.exit(1)
  }

  // 画像IDの存在確認
  if (existsSync(LIBRARY_PATH)) {
    try {
      const lib = JSON.parse(readFileSync(LIBRARY_PATH, 'utf8'))
      const found = (lib.images ?? []).find((img) => img.id === imageId)
      if (!found) {
        console.error(`エラー: 画像ID "${imageId}" はライブラリに存在しません`)
        process.exit(1)
      }
      if (correctImage) {
        const foundCorrect = (lib.images ?? []).find((img) => img.id === correctImage)
        if (!foundCorrect) {
          console.error(`エラー: --correct_image "${correctImage}" はライブラリに存在しません`)
          process.exit(1)
        }
      }
    } catch (e) {
      console.error(`警告: ライブラリ読込エラー（検証スキップ）: ${e.message}`)
    }
  }

  // 記事の category / tags を読み込む
  let articleCategory = ''
  let articleTags     = []
  try {
    const { data } = matter(readFileSync(filePath, 'utf8'))
    articleCategory = String(data.category ?? '')
    articleTags     = Array.isArray(data.tags) ? data.tags.map(String) : []
  } catch (e) {
    console.error(`警告: 記事 frontmatter 読込エラー: ${e.message}`)
  }

  const store = loadFeedbackStore()
  const id    = `fb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  const entry = {
    id,
    slug,
    image_id:         imageId,
    action,
    reason,
    correct_image:    correctImage,
    article_category: articleCategory,
    article_tags:     articleTags,
    recorded_at:      getJstTimestamp(),
  }

  store.entries.push(entry)
  saveFeedbackStore(store)

  const BAR = '━'.repeat(58)
  console.log(BAR)
  console.log(`画像フィードバック記録完了`)
  console.log(BAR)
  console.log(`  id           : ${id}`)
  console.log(`  slug         : ${slug}`)
  console.log(`  image_id     : ${imageId}`)
  console.log(`  action       : ${action}`)
  console.log(`  reason       : ${reason ?? '（未入力）'}`)
  console.log(`  correct_image: ${correctImage ?? '（未指定）'}`)
  console.log(`  category     : ${articleCategory}`)
  console.log(`  recorded_at  : ${entry.recorded_at}`)
  console.log(BAR)
  console.log(`合計フィードバック件数: ${store.entries.length}`)
}

main()
