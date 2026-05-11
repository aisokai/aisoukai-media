// 医療安全チェックリスト
// なぜ: 医療情報を扱う歯科メディアでは断定・煽り・誇大表現が患者に不適切な判断を促す恐れがあるため、
//       候補生成・レビュー時に必ず確認すべき基準を定数として管理する
export const MEDICAL_SAFETY_RULES = [
  '断定的表現（「必ず〜」「絶対〜」「確実に〜」）を使用しない',
  '過度な不安を煽る表現（「放置すると〇〇になる」等）を避ける',
  '誇大表現（「最先端」「奇跡の」「完全に治る」等）を使用しない',
  '根拠のない断言（「〇〇すれば治る」等）を含めない',
  'source_url がない候補は reason に根拠メモを必ず記入する',
  '生成物は必ず人間が確認してから topic DB に手入力する',
]

// 有効なカテゴリ（generate-draft.mjs の VALID_CATEGORIES と一致させる）
export const VALID_CATEGORIES = [
  '虫歯治療', '根管治療', '歯周病治療', '予防歯科', '小児歯科',
  '親知らず', 'インプラント', 'その他', 'お知らせ',
]

// CSV ヘッダー（出力フィールド順）
export const CSV_HEADERS = [
  'researched_at', 'source_type', 'source_url', 'topic',
  'title_candidate', 'category', 'target_keyword', 'patient_intent',
  'priority', 'medical_risk', 'confidence', 'status', 'publish_date',
  'reason', 'notes',
]
