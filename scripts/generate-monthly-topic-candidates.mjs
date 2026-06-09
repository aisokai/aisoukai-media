#!/usr/bin/env node
// 月次ネタ候補を24件生成する。記事本文は生成しない。
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT_DIR = join(ROOT, 'data', 'monthly-topic-candidates')
const POSTS_DIR = join(ROOT, 'content', 'posts')
const candidateCount = 24
const targetPostCount = 12

const CATEGORIES = [
  '予防歯科',
  '虫歯治療',
  '歯周病治療',
  '小児歯科',
  '根管治療',
  '親知らず',
  'インプラント',
  'その他',
]

const TOPIC_BANK = [
  ['予防歯科', '定期検診は何か月ごとが目安？通院間隔の考え方', '歯科定期検診 頻度', '定期検診の適切な受診ペースを知りたい', 'low'],
  ['虫歯治療', '冷たいものがしみるのは虫歯？受診が必要なサイン', '冷たいもの しみる 虫歯', 'しみる原因と受診目安を知りたい', 'medium'],
  ['歯周病治療', '歯ぐきから血が出るときに確認したいポイント', '歯ぐき 出血 歯周病', '出血の原因と受診目安を知りたい', 'medium'],
  ['小児歯科', '子どもの仕上げ磨きはいつまで必要？年齢ごとの目安', '仕上げ磨き いつまで', '仕上げ磨きの終わりどきを知りたい', 'low'],
  ['根管治療', '根管治療後の違和感はいつまで？注意したい症状', '根管治療後 違和感', '治療後の違和感の目安を知りたい', 'high'],
  ['親知らず', '親知らずが腫れたときはどうする？受診を急ぐ目安', '親知らず 腫れ どうする', '腫れたときの対応を知りたい', 'high'],
  ['インプラント', 'インプラント相談前に確認したい検査と通院の流れ', 'インプラント 相談 流れ', '相談前に必要な準備を知りたい', 'medium'],
  ['その他', '歯医者が苦手な人が受診前にできる準備', '歯医者 苦手 受診', '不安を減らして受診したい', 'low'],
  ['予防歯科', '歯石は自分で取れる？歯科で取るべき理由', '歯石 自分で取る', '歯石の扱いと注意点を知りたい', 'medium'],
  ['虫歯治療', '詰め物が取れたらどうする？受診までの注意点', '詰め物 取れた どうする', '応急対応と受診目安を知りたい', 'high'],
  ['歯周病治療', '口臭が続くときは歯周病のサイン？確認したいこと', '口臭 歯周病', '口臭と歯周病の関係を知りたい', 'medium'],
  ['小児歯科', 'フッ素塗布は何歳から？子どもの予防ケアの基本', 'フッ素塗布 何歳から', '子どもの虫歯予防を始めたい', 'low'],
  ['根管治療', '根管治療は何回かかる？通院回数の目安', '根管治療 回数', '何回通うのか知りたい', 'high'],
  ['親知らず', '親知らずは抜くべき？相談の目安と判断材料', '親知らず 抜くべき', '抜歯が必要か知りたい', 'medium'],
  ['インプラント', 'インプラントのメンテナンスはどれくらい必要？', 'インプラント メンテナンス 頻度', '治療後の通院頻度を知りたい', 'medium'],
  ['その他', '急な歯の痛みで予約するときに伝えるとよいこと', '歯 痛い 予約', '急な症状でどう予約すべきか知りたい', 'medium'],
  ['予防歯科', '歯ブラシだけで足りる？デンタルフロスの使いどころ', 'デンタルフロス 必要', 'セルフケアを見直したい', 'low'],
  ['虫歯治療', '初期虫歯はどう見分ける？白い斑点やしみる症状', '初期虫歯 見分け方', '初期虫歯か確認したい', 'medium'],
  ['歯周病治療', '歯ぐきが下がった気がするときに考えられる原因', '歯ぐき 下がる 原因', '歯ぐきの変化が心配', 'medium'],
  ['小児歯科', '乳歯の虫歯は放置してもいい？受診が必要な理由', '乳歯 虫歯 放置', '乳歯の虫歯対応を知りたい', 'medium'],
  ['根管治療', '根管治療中の仮詰めが取れたときの注意点', '根管治療 仮詰め 取れた', '仮詰めが取れた時の対応を知りたい', 'high'],
  ['親知らず', '親知らず抜歯後の腫れはいつまで？過ごし方の注意点', '親知らず 抜歯後 腫れ', '抜歯後の回復目安を知りたい', 'high'],
  ['インプラント', 'インプラントと入れ歯の違いは？相談前の整理', 'インプラント 入れ歯 違い', '治療選択肢の違いを知りたい', 'medium'],
  ['その他', 'セカンドオピニオンを相談したいときの準備', '歯科 セカンドオピニオン', '別の意見を聞く準備を知りたい', 'low'],
]

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2).replace(/-/g, '_')
      const next = argv[i + 1]
      args[key] = next && !next.startsWith('--') ? argv[++i] : true
    }
  }
  return args
}

function nextMonth(today = new Date()) {
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1)).toISOString().slice(0, 7)
}

function mondayWednesdayFridayDates(month) {
  const dates = []
  const start = new Date(`${month}-01T00:00:00Z`)
  for (let day = 1; day <= 31; day++) {
    const date = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), day))
    if (date.getUTCMonth() !== start.getUTCMonth()) break
    if ([1, 3, 5].includes(date.getUTCDay())) dates.push(date.toISOString().slice(0, 10))
  }
  return dates
}

function existingTitles() {
  if (!existsSync(POSTS_DIR)) return []
  return readdirSync(POSTS_DIR)
    .filter((file) => file.endsWith('.md'))
    .map((file) => matter(readFileSync(join(POSTS_DIR, file), 'utf8')).data.title)
    .filter(Boolean)
    .map(String)
}

function duplicateRisk(title, titles) {
  const tokens = title.split(/[、。・\s]+/).filter((token) => token.length >= 2)
  if (titles.some((existing) => existing === title)) return 'high'
  if (titles.some((existing) => tokens.some((token) => existing.includes(token)))) return 'medium'
  return 'low'
}

function buildFile(month) {
  const dates = mondayWednesdayFridayDates(month)
  const titles = existingTitles()
  const topics = TOPIC_BANK.slice(0, candidateCount).map(([category, title, keyword, intent, risk], index) => ({
    id: `${month}-topic-${String(index + 1).padStart(3, '0')}`,
    title,
    category: CATEGORIES.includes(category) ? category : 'その他',
    targetReader: '三谷ファミリー歯科クリニックの受診を検討している患者さん',
    searchIntent: intent,
    patientConcern: intent,
    recommendedReason: `${category}カテゴリの検索需要と患者さんの不安解消につながるため。`,
    targetKeyword: keyword,
    sourceType: index % 3 === 0 ? 'seo' : index % 3 === 1 ? 'patient_question' : 'clinic',
    medicalRisk: risk,
    duplicateRisk: duplicateRisk(title, titles),
    priority: index < targetPostCount ? 'high' : 'medium',
    recommendedPublishDate: dates[index % dates.length],
    status: 'pending',
  }))

  return {
    month,
    generatedAt: new Date().toISOString(),
    targetPostCount,
    candidateCount,
    cadence: 'MWF',
    notes: '週3回投稿のため、24件候補から12件を今月採用する。',
    topics,
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const month = String(args.month ?? nextMonth()).trim()
  const yes = args.yes === true
  if (!/^\d{4}-\d{2}$/.test(month)) {
    console.error('エラー: --month は YYYY-MM で指定してください')
    process.exit(1)
  }

  const file = buildFile(month)
  const outPath = join(OUT_DIR, `${month}.json`)
  console.log(`月次ネタ候補: ${month}`)
  console.log(`候補: ${file.topics.length}件 / 採用目標: ${file.targetPostCount}件 / 投稿曜日: MWF`)
  console.log(`出力先: data/monthly-topic-candidates/${month}.json`)

  if (!yes) {
    console.log('DRY-RUNです。保存するには --yes を付けてください。')
    return
  }

  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(outPath, `${JSON.stringify(file, null, 2)}\n`, 'utf8')
  console.log('✅ 月次ネタ候補を保存しました')
}

main()
