const TEMPLATE_REQUEST_RE = /^(ブログ|記事|投稿)(を)?(書いて|作って)(?:ください|お願い)?$/i

function trimText(text) {
  return String(text ?? '').trim()
}

function isApprovalMessage(text) {
  return /^approve\b/i.test(text)
}

function isRejectionMessage(text) {
  return /^reject\b/i.test(text)
}

function isJapaneseApproval(text) {
  return /^(承認|OK|投稿|公開|これで|これでOK)\s*$/i.test(text)
}

function isJapaneseRejection(text) {
  return /^(差し戻し|修正|NG|やり直し)\s*$/i.test(text)
}

function isTemplateRequestText(text) {
  return TEMPLATE_REQUEST_RE.test(text)
}

export function buildSafeTemplateThemePrompt(requestText, existingPostsContext = '') {
  const lines = [
    'あなたは歯科医院の医療情報ライターです。',
    '患者向けの安全な一般歯科啓発テーマを5つ提案してください。',
    '各テーマは診断の断定や治療の保証表現を含まない、一般的で安全な内容にしてください。',
    '出力は1行に1テーマのみ（番号・前置き・説明は不要）。',
  ]

  if (existingPostsContext) {
    lines.push(
      '',
      '【既掲載記事（同テーマ・同カテゴリを避けること）】',
      existingPostsContext,
    )
  }

  lines.push(
    '',
    '提案例（参考のみ、このまま使わないこと）:',
    '- 根管治療後の痛みが続く場合の対処',
    '- 歯周病と生活習慣の関係',
    '- 銀歯とセラミックの違い',
    '- 子どもの仕上げ磨きの目安年齢',
    '- インプラント治療の流れと期間',
    '',
    `依頼: ${requestText}`,
    '',
    '5つのテーマを1行ずつ出力（番号なし）:',
  )

  return lines.join('\n')
}

export function classifyTelegramMessage(text) {
  const t = trimText(text)
  if (!t) return { type: 'skip', reason: '空です' }

  if (isApprovalMessage(t)) {
    const m = t.match(/^approve\s+(\S+)(?:\s+by\s*(.+))?$/i)
    if (m) return { type: 'approve', slug: m[1].trim(), reviewedBy: m[2]?.trim() ?? '' }
    return { type: 'skip', reason: 'approve 形式不正（書式: approve <slug> [by <名前>]）' }
  }

  if (isRejectionMessage(t)) {
    const m = t.match(/^reject\s+(\S+)(?:\s+(.+))?$/i)
    if (m) return { type: 'reject', slug: m[1].trim(), reason: m[2]?.trim() ?? '' }
    return { type: 'skip', reason: 'reject 形式不正（書式: reject <slug> [<理由>]）' }
  }

  if (isJapaneseApproval(t)) return { type: 'jp_approve' }
  if (isJapaneseRejection(t)) return { type: 'jp_reject' }

  if (isTemplateRequestText(t)) {
    return { type: 'request', requestMode: 'template', text: t }
  }

  if (/^publish\b/i.test(t)) return { type: 'skip', reason: 'publish コマンドは Telegram から禁止' }
  if (/^push\b/i.test(t))    return { type: 'skip', reason: 'push コマンドは Telegram から禁止' }
  if (/^deploy\b/i.test(t))  return { type: 'skip', reason: 'deploy コマンドは禁止' }
  if (/^\/[a-z]/i.test(t))   return { type: 'skip', reason: 'Bot コマンド（/ 始まり）' }
  if (/npm run/i.test(t))    return { type: 'skip', reason: 'npm run コマンド' }

  if (t.length < 8) return { type: 'skip', reason: '短すぎます（8文字未満）' }

  return { type: 'request', requestMode: 'freeform', text: t }
}
