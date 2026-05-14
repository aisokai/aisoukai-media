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

export function buildSafeTemplateThemePrompt(requestText) {
  return [
    'あなたは歯科医院の医療情報ライターです。',
    '依頼文は短く、記事テーマの指定がありません。',
    '患者向けの安全な一般歯科啓発テーマを1つだけ選んでください。',
    '選ぶテーマは、診断の断定や治療の保証表現を含まない、一般的で安全な内容にしてください。',
    '候補の例:',
    '- 定期検診の受診目安',
    '- 初期虫歯の気づき方',
    '- 歯周病の初期サイン',
    '- 仕上げ磨きのコツ',
    '- 親知らずを相談するタイミング',
    '- 歯科受診の目安',
    '出力はテーマ名1行のみ。前置きや説明は不要です。',
    '',
    `依頼: ${requestText}`,
  ].join('\n')
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
