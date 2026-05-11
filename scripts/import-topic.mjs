#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCsv } from './csv-parser.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const TOPICS_PATH = join(ROOT, 'data', 'article-topics.sample.csv')
const POSTS_DIR = join(ROOT, 'content', 'posts')

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

const FIELD_ALIASES = {
  id: ['id', 'topic_id'],
  title: ['title_candidate', 'title'],
  category: ['category'],
  keyword: ['target_keyword', 'keyword'],
  intent: ['patient_intent', 'search_intent'],
  priority: ['priority', 'urgency'],
  medicalRisk: ['medical_risk'],
  publishDate: ['publish_date', 'suggested_publish_date'],
  topic: ['topic'],
  sourceType: ['source_type'],
  notes: ['notes'],
  conversionPotential: ['conversion_potential'],
}

const CATEGORY_CONTEXT = {
  '虫歯治療': {
    background: '虫歯は、歯の表面の細菌が糖を利用して酸をつくり、歯を少しずつ溶かしていくことで進行します。初期は自覚症状が少ないこともあります。',
    visit: '冷たいものがしみる、痛みが続く、噛むと違和感がある場合は、早めに歯科医院へ相談すると安心です。',
    clinic: '状態に応じて、むし歯の除去、詰め物の調整、経過観察などを検討します。',
  },
  '根管治療': {
    background: '歯の神経に近い部分までむし歯が進んだり、過去の治療歯にトラブルが出たりしたときに、根管治療が必要になることがあります。',
    visit: '強い痛み、噛むと響く感じ、腫れがある場合は、放置せず相談してください。',
    clinic: '感染の状態を確認しながら、根の中を清掃・消毒し、必要に応じて仮詰めや被せ物へ進めます。',
  },
  '歯周病治療': {
    background: '歯ぐきの炎症や歯石の蓄積が背景にあり、進行度によって必要なケアが変わります。',
    visit: '出血、腫れ、口臭、歯のぐらつきが気になる場合は、早めに確認するとよいでしょう。',
    clinic: '歯ぐきの状態を確認し、歯石除去やクリーニング、生活習慣の見直しを組み合わせて対応します。',
  },
  '予防歯科': {
    background: '定期検診やクリーニングで、むし歯や歯周病の兆候を早めに見つけていく考え方です。',
    visit: '症状がなくても、定期的にチェックすると変化を早く見つけやすくなります。',
    clinic: 'ブラッシング確認、歯石除去、フッ素塗布などを通じて、予防しやすい環境づくりを支えます。',
  },
  '小児歯科': {
    background: '成長段階や生え変わりの時期によって、確認したいポイントが変わります。保護者の仕上げ磨きや生活習慣も大切です。',
    visit: '痛みがある、しみる、歯並びや生え方が気になる場合は、相談のタイミングです。',
    clinic: 'お子さんの年齢や様子に合わせて、むし歯予防、フッ素塗布、仕上げ磨きの確認などを行います。',
  },
  '親知らず': {
    background: '親知らずは生え方や周囲のスペースによって、痛みや腫れの出方が変わります。',
    visit: '腫れや痛みを繰り返す、口が開けにくい、食事がしづらい場合は受診を検討してください。',
    clinic: 'レントゲンなどで位置を確認し、経過観察・洗浄・抜歯の必要性を整理します。',
  },
  'インプラント': {
    background: '骨や歯ぐきの状態、噛み合わせなどを総合的に確認する必要があります。',
    visit: '治療方法を比較したい、手術やメンテナンスが気になる場合は、相談して情報を整理するとよいでしょう。',
    clinic: '検査結果をふまえて、治療の流れ、必要な期間、メンテナンスの考え方を説明します。',
  },
  'その他': {
    background: '歯科の悩みは、むし歯・歯周病だけでなく、噛み合わせや見た目、通院の不安など幅広くあります。',
    visit: '症状や悩みが続く場合は、内容を整理して相談すると受診しやすくなります。',
    clinic: '症状や背景を整理しながら、必要な検査や治療の選択肢を一緒に考えます。',
  },
}

const DEFAULT_CONTEXT = CATEGORY_CONTEXT['その他']

function esc(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function parseArgs(argv) {
  const args = { _: [] }
  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i]
    if (current.startsWith('--')) {
      const key = current.slice(2).replace(/-/g, '_')
      const next = argv[i + 1]
      const value = next && !next.startsWith('--') ? argv[++i] : true
      args[key] = value
      continue
    }
    args._.push(current)
  }
  return args
}

function getField(row, keys) {
  for (const key of keys) {
    const value = String(row[key] ?? '').trim()
    if (value !== '') return value
  }
  return ''
}

function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())
}

function slugifyTopicId(topicId) {
  return topicId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function splitKeywordTokens(text) {
  return String(text)
    .split(/[\s　,、/／・|｜:：?!！？「」『』（）()\-]+/g)
    .map((token) => token.trim())
    .filter(Boolean)
}

function buildTags(row) {
  const tags = []
  const push = (value) => {
    const tag = String(value ?? '').trim()
    if (!tag || tags.includes(tag)) return
    tags.push(tag)
  }

  push(getField(row, FIELD_ALIASES.category))
  for (const token of splitKeywordTokens(getField(row, FIELD_ALIASES.keyword))) push(token)
  if (tags.length < 3) {
    for (const token of splitKeywordTokens(getField(row, FIELD_ALIASES.title))) push(token)
  }
  if (tags.length < 3) {
    for (const token of splitKeywordTokens(getField(row, FIELD_ALIASES.topic))) push(token)
  }

  return tags.slice(0, 4)
}

function buildExcerpt(title, category) {
  if (category === 'お知らせ') {
    return `${title}についてお知らせします。`
  }
  return `${title}について、原因・受診目安・注意点を整理します。`
}

function buildFrontmatter({ title, date, category, excerpt, tags }) {
  const tagsYaml = tags.map((tag) => `  - "${esc(tag)}"`).join('\n')
  return `---
title: "${esc(title)}"
date: "${date}"
category: "${esc(category)}"
excerpt: "${esc(excerpt)}"
tags:
${tagsYaml}
author: 藍想会メディア編集部
reviewed: false
image: ""
---`
}

function buildNewsBody(row) {
  const title = getField(row, FIELD_ALIASES.title)
  const keyword = getField(row, FIELD_ALIASES.keyword)
  const notes = getField(row, FIELD_ALIASES.notes)

  const intro = `${title}についてお知らせします。`
  const targetDesc = keyword
    ? `${keyword}に関連する患者様・ご家族の方へのご案内です。`
    : '当院を受診予定の患者様・ご家族の方へのご案内です。'

  return `
## お知らせ概要

${intro}

## 対象となる方

${targetDesc}

## 実施日・変更日

（担当者が公開前に記入してください）

## ご確認いただきたいこと

${notes || '詳細は受付・スタッフまでお気軽にお問い合わせください。'}

## まとめ

ご不明な点がございましたら、お電話またはご来院時に受付スタッフへお申し付けください。

## 注意書き

- 内容は予告なく変更となる場合があります。
- 最新情報はお電話にてご確認ください。
`
}

function buildMedicalBody(row) {
  const category = getField(row, FIELD_ALIASES.category)
  const title = getField(row, FIELD_ALIASES.title)
  const keyword = getField(row, FIELD_ALIASES.keyword)
  const priority = getField(row, FIELD_ALIASES.priority)
  const medicalRisk = getField(row, FIELD_ALIASES.medicalRisk)
  const context = CATEGORY_CONTEXT[category] ?? DEFAULT_CONTEXT

  const intro = `${title}について、受診の目安や歯科医院で確認したい点を整理します。`
  const whatYouLearn = [
    '気になる症状や背景を整理できます',
    keyword ? `${keyword} に関連する確認ポイントがわかります` : '検索時に気になるポイントを整理できます',
    '歯科医院へ相談するタイミングを把握できます',
  ]

  const summary = priority === 'high' || medicalRisk === 'high'
    ? '強い痛みや腫れがある場合は、自己判断で様子を見すぎず、早めに歯科医院へ相談してください。'
    : '気になる症状が続く場合や、日常生活に支障が出る場合は、早めに相談すると安心です。'

  return `
## 導入文

${intro}

## この記事でわかること

- ${whatYouLearn[0]}
- ${whatYouLearn[1]}
- ${whatYouLearn[2]}

## 主な原因・背景

${context.background}

${keyword ? `今回のテーマは「${keyword}」です。症状の出方や背景を整理しながら、無理のない範囲で確認していきましょう。` : ''}

## 受診目安

${context.visit}

## 当院でできる対応

${context.clinic}

## まとめ

${summary}

## 注意書き

- 症状には個人差があります。
- 強い痛み・腫れ・発熱などがある場合は早めに歯科医院へ相談してください。
`
}

function buildBody(row) {
  const category = getField(row, FIELD_ALIASES.category)
  if (category === 'お知らせ') return buildNewsBody(row)
  return buildMedicalBody(row)
}

function loadTopics() {
  let raw
  try {
    raw = readFileSync(TOPICS_PATH, 'utf8')
  } catch (error) {
    console.error(`エラー: ${TOPICS_PATH} が見つかりません`)
    console.error(String(error?.message ?? error))
    process.exit(1)
  }

  return parseCsv(raw)
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const topicId = String(args.topic_id ?? args._[0] ?? '').trim()

  if (!topicId || topicId === '--help' || topicId === '-h') {
    console.error('使い方: npm run import:topic -- TOPIC-20260511-007')
    console.error('補足: --topic-id / --topic_id でも指定できます')
    process.exit(1)
  }

  const rows = loadTopics()
  if (rows.length === 0) {
    console.error('エラー: CSV にデータ行がありません')
    process.exit(1)
  }

  // 重複 ID 検出: 複数ヒットはデータ不整合なのでエラー終了
  const matches = rows.filter((item) => getField(item, FIELD_ALIASES.id) === topicId)
  if (matches.length === 0) {
    console.error(`エラー: topic_id が見つかりません: ${topicId}`)
    console.error(`候補: ${rows.slice(0, 10).map((item) => getField(item, FIELD_ALIASES.id)).join(', ')}`)
    process.exit(1)
  }
  if (matches.length > 1) {
    console.error(`エラー: topic_id が CSV に ${matches.length} 件重複しています: ${topicId}`)
    console.error('CSV を確認し、重複行を削除してください。')
    process.exit(1)
  }
  const row = matches[0]

  const title = getField(row, FIELD_ALIASES.title)
  const category = getField(row, FIELD_ALIASES.category)
  const publishDate = getField(row, FIELD_ALIASES.publishDate)
  const keyword = getField(row, FIELD_ALIASES.keyword)
  const intent = getField(row, FIELD_ALIASES.intent)

  if (!title) {
    console.error(`エラー: title_candidate が空です: ${topicId}`)
    process.exit(1)
  }

  if (!VALID_CATEGORIES.has(category)) {
    console.error(`エラー: category が無効です: ${category || '(空)'}`)
    process.exit(1)
  }

  if (!isValidDate(publishDate)) {
    console.error(`エラー: publish_date が YYYY-MM-DD ではありません: ${publishDate || '(空)'}`)
    process.exit(1)
  }

  if (!keyword) {
    console.error(`エラー: target_keyword が空です: ${topicId}`)
    process.exit(1)
  }

  if (!intent) {
    console.error(`エラー: patient_intent が空です: ${topicId}`)
    process.exit(1)
  }

  const slug = slugifyTopicId(topicId)
  const filename = `${publishDate}-${slug}.md`
  const filePath = join(POSTS_DIR, filename)

  if (existsSync(filePath)) {
    console.error(`エラー: ファイルが既に存在します: content/posts/${filename}`)
    process.exit(1)
  }

  mkdirSync(POSTS_DIR, { recursive: true })

  const excerpt = buildExcerpt(title, category)
  const tags = buildTags(row)
  const content = `${buildFrontmatter({ title, date: publishDate, category, excerpt, tags })}\n${buildBody(row)}`

  writeFileSync(filePath, content, 'utf8')
  console.log(`✅ 作成しました: content/posts/${filename}`)
}

main()
