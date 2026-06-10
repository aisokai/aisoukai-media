// review-rules.mjs
// GMB口コミのルールベース分類と返信テンプレート。
// AIに分類を判断させない。rating / 本文 / キーワード辞書のみで決める。
// 分類表の正本: docs/gmb-review-automation-plan.md §3

import { containsPersonalInfo } from './media-queue.mjs'

// NGキーワード辞書（high risk直行）
export const NEGATIVE_KEYWORDS = Object.freeze([
  '訴訟', '訴える', '返金', '事故', '苦情', 'クレーム', '最悪', '二度と行かない',
  '痛い思い', 'トラブル', '弁護士', '消費者センター',
])

// 治療内容への具体的言及（high risk直行）
export const TREATMENT_KEYWORDS = Object.freeze([
  'インプラント', '抜歯', '矯正', '根管治療', '神経', 'セラミック', 'ホワイトニング',
  '麻酔', '親知らず', '入れ歯', 'ブリッジ',
])

// 短い好意的コメント判定用のポジティブ辞書
export const POSITIVE_KEYWORDS = Object.freeze([
  'ありがとう', '丁寧', '優しい', '親切', '安心', 'きれい', '綺麗', '良かった',
  'よかった', '助かり', 'おすすめ', '通いやすい', '感謝',
])

export const CLASSIFICATIONS = Object.freeze([
  'low_template_only', 'low_short_positive', 'low_normal', 'high',
])

const SHORT_POSITIVE_MAX_LENGTH = 60

// 固定優先順位で上から評価。最初にマッチした行を採用する。
export function classifyReview({ rating, text }) {
  const body = typeof text === 'string' ? text.trim() : ''
  if (containsPersonalInfo(body)) {
    return { classification: 'high', riskLevel: 'high', matchedRule: 1 }
  }
  if (NEGATIVE_KEYWORDS.some((kw) => body.includes(kw))) {
    return { classification: 'high', riskLevel: 'high', matchedRule: 2 }
  }
  if (TREATMENT_KEYWORDS.some((kw) => body.includes(kw))) {
    return { classification: 'high', riskLevel: 'high', matchedRule: 3 }
  }
  if (!Number.isInteger(rating) || rating <= 3) {
    return { classification: 'high', riskLevel: 'high', matchedRule: 4 }
  }
  if (body === '') {
    return { classification: 'low_template_only', riskLevel: 'low', matchedRule: 5 }
  }
  if (body.length <= SHORT_POSITIVE_MAX_LENGTH && POSITIVE_KEYWORDS.some((kw) => body.includes(kw))) {
    return { classification: 'low_short_positive', riskLevel: 'low', matchedRule: 6 }
  }
  return { classification: 'low_normal', riskLevel: 'low', matchedRule: 7 }
}

// 返信テンプレート。AIの自由生成はせず、固定文のみ (将来は変数部の短い補正のみ許可)。
// 制約: 感謝 / 医療内容に踏み込まない / 結果を保証しない / 個人情報に触れない / 200字以内
export const REPLY_TEMPLATES = Object.freeze({
  thanks_no_text:
    'この度はご来院いただき、また高い評価をいただき誠にありがとうございます。今後とも皆さまに安心して通っていただける医院づくりに努めてまいります。',
  thanks_short:
    '温かいお言葉をいただき誠にありがとうございます。スタッフ一同、大変励みになります。今後とも安心して通っていただけるよう努めてまいります。',
  thanks_normal:
    'ご来院ならびに口コミの投稿、誠にありがとうございます。いただいたお言葉を励みに、スタッフ一同より良い医院づくりに努めてまいります。今後ともよろしくお願いいたします。',
  apology_low_rating:
    'この度はご不快な思いをおかけし、誠に申し訳ございません。いただいたご意見を真摯に受け止め、改善に努めてまいります。差し支えなければ、詳しいお話をお電話にてお聞かせいただけますと幸いです。',
  calm_hostile:
    '貴重なご意見をいただきありがとうございます。いただいた内容を確認し、改善に努めてまいります。詳細につきましては、お手数ですが直接ご連絡いただけますと幸いです。',
})

export function selectReplyTemplate({ classification, rating, text }) {
  if (classification === 'low_template_only') return 'thanks_no_text'
  if (classification === 'low_short_positive') return 'thanks_short'
  if (classification === 'low_normal') return 'thanks_normal'
  const body = typeof text === 'string' ? text : ''
  if (NEGATIVE_KEYWORDS.some((kw) => body.includes(kw))) return 'calm_hostile'
  if (Number.isInteger(rating) && rating <= 3) return 'apology_low_rating'
  return 'thanks_normal'
}
