#!/usr/bin/env node
import { existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const POSTS_DIR = join(ROOT, 'content', 'posts')

// YAML文字列内の特殊文字をエスケープ（Bug 1: YAML注入対策）
const esc = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

const VALID_CATEGORIES = [
  '虫歯治療', '根管治療', '歯周病治療', '予防歯科', '小児歯科',
  '親知らず', 'インプラント', 'その他', 'お知らせ',
]

const CATEGORY_SLUG_FALLBACK = {
  '虫歯治療': 'cavity',
  '根管治療': 'root-canal',
  '歯周病治療': 'periodontal',
  '予防歯科': 'preventive',
  '小児歯科': 'pediatric',
  '親知らず': 'wisdom-tooth',
  'インプラント': 'implant',
  'その他': 'other',
  'お知らせ': 'news',
}

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2)
      const value = (argv[i + 1] && !argv[i + 1].startsWith('--')) ? argv[++i] : true
      args[key] = value
    }
  }
  return args
}

function titleToSlug(title, category) {
  const slug = title
    .toLowerCase()
    .replace(/[^\x00-\x7F]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30)

  if (slug.length >= 3) return slug

  const fallback = CATEGORY_SLUG_FALLBACK[category] ?? 'post'
  return slug.length > 0 ? `${fallback}-${slug}` : fallback
}

function buildFrontmatter({ title, date, category, excerpt, tags }) {
  const tagsYaml = tags.map((t) => `  - ${esc(t)}`).join('\n')
  return `---
title: "${esc(title)}"
date: "${date}"
category: "${category}"
excerpt: "${esc(excerpt)}"
tags:
${tagsYaml}
author: 藍想会メディア編集部
reviewed: false
image: ""
---`
}

function buildBody() {
  return `
## はじめに

（導入文：患者が抱える疑問・背景を共感的に述べる。2〜3文）

## メインテーマ1

（本論1：原因・仕組み・特徴などを解説。断定表現を避ける）

## メインテーマ2

（本論2：治療・対処・予防など）

## まとめ

（要点を2〜3文でまとめる。受診を促す場合も断定しない）
`
}

const args = parseArgs(process.argv.slice(2))
const { title, category, excerpt, tags: tagsRaw } = args

const missing = ['title', 'category', 'excerpt', 'tags'].filter((k) => !args[k])
if (missing.length > 0) {
  console.error(`エラー: 必須引数が不足しています: ${missing.map((k) => `--${k}`).join(', ')}`)
  process.exit(1)
}

if (!VALID_CATEGORIES.includes(category)) {
  console.error(`エラー: 無効なカテゴリ "${category}"`)
  console.error(`有効なカテゴリ: ${VALID_CATEGORIES.join(' / ')}`)
  process.exit(1)
}

// Bug 2: ブール値の場合の型チェック
if (typeof tagsRaw !== 'string') {
  console.error('エラー: --tags には値を指定してください (例: --tags "タグ1,タグ2")')
  process.exit(1)
}
const tags = tagsRaw.split(',').map((t) => t.trim()).filter(Boolean)
const date = new Date().toISOString().slice(0, 10)
const slug = titleToSlug(title, category)
const filename = `${date}-${slug}.md`
const filePath = join(POSTS_DIR, filename)

if (existsSync(filePath)) {
  console.error(`エラー: ファイルが既に存在します: content/posts/${filename}`)
  process.exit(1)
}

const content = buildFrontmatter({ title, date, category, excerpt, tags }) + '\n' + buildBody()
// Bug 3: ディレクトリが存在しない環境対応
mkdirSync(POSTS_DIR, { recursive: true })
writeFileSync(filePath, content, 'utf8')
console.log(`✅ 作成しました: content/posts/${filename}`)
