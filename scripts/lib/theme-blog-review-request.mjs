import { reserveNotificationSend } from './notification-dedupe.mjs'

function value(value) {
  return String(value ?? '').trim()
}

export function isExplicitHttpsReviewUrl(reviewUrl) {
  try {
    const parsed = new URL(value(reviewUrl))
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password
  } catch {
    return false
  }
}

function requireText(name, input) {
  const result = value(input)
  if (!result) throw new Error(`${name} is required`)
  return result
}

function assertSafeMessage(text) {
  if (/\b(?:approve|publish)\b/i.test(text) || /(?:--(?:approve|publish)|\/(?:approve|publish))(?:\b|\s)/i.test(text)) {
    throw new Error('review request contains a forbidden command')
  }
}

export function buildTelegramApprovalRequest({
  title,
  topicId,
  snapshotHash,
  audit,
  publishDate,
  reviewUrl,
} = {}) {
  const cleanTitle = requireText('title', title)
  const cleanTopicId = requireText('topicId', topicId)
  const cleanSnapshotHash = requireText('snapshotHash', snapshotHash)
  const cleanPublishDate = requireText('publishDate', publishDate)
  const cleanReviewUrl = requireText('reviewUrl', reviewUrl)
  if (!isExplicitHttpsReviewUrl(cleanReviewUrl)) throw new Error('reviewUrl must be an explicit https URL')
  const auditPass = audit?.status === 'PASS' || audit?.audit === 'PASS'
  if (!auditPass) {
    throw new Error('audit must be PASS before creating a review request')
  }

  const payload = {
    kind: 'theme_blog_review_request',
    title: cleanTitle,
    topic_id: cleanTopicId,
    snapshot_hash_short: cleanSnapshotHash.slice(0, 12),
    audit: 'PASS',
    publish_date: cleanPublishDate,
    review_url: cleanReviewUrl,
  }
  payload.text = [
    'ブログ記事レビュー依頼',
    `タイトル: ${payload.title}`,
    `テーマID: ${payload.topic_id}`,
    `スナップショット: ${payload.snapshot_hash_short}`,
    '監査: PASS',
    `公開予定日: ${payload.publish_date}`,
    `レビューURL: ${payload.review_url}`,
  ].join('\n')
  assertSafeMessage(payload.text)
  return Object.freeze(payload)
}

export async function sendTelegramApprovalRequest({
  request,
  root,
  date,
  botToken,
  chatId,
  fetchImpl = globalThis.fetch,
  reserveImpl = reserveNotificationSend,
} = {}) {
  if (!request || request.audit !== 'PASS') throw new Error('a PASS review request is required')
  if (!isExplicitHttpsReviewUrl(request.review_url)) throw new Error('review request URL must be https')
  const token = value(botToken ?? process.env.TELEGRAM_BOT_TOKEN)
  const targetChatId = value(chatId ?? process.env.TELEGRAM_CHAT_ID)
  if (!token || !targetChatId) throw new Error('Telegram token and chat id are required')
  if (typeof fetchImpl !== 'function') throw new Error('fetch implementation is required')
  if (typeof reserveImpl !== 'function') throw new Error('dedupe reservation implementation is required')

  const reservation = reserveImpl({
    root,
    date: requireText('date', date),
    job: 'theme-blog-review-request',
    text: request.text,
  })
  if (!reservation?.shouldSend) {
    return { sent: false, reason: reservation?.reason || 'duplicate', key: reservation?.key }
  }

  try {
    const response = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: targetChatId, text: request.text }),
    })
    if (!response || response.ok === false) throw new Error(`HTTP ${response?.status ?? 'error'}`)
    const result = await response.json()
    if (!result?.ok) throw new Error(result?.description || 'Telegram API rejected the request')
    reservation.commit({ channel: 'telegram', request_kind: request.kind })
    return { sent: true, reason: 'sent', key: reservation.key }
  } catch (error) {
    try { reservation.release() } catch {}
    throw new Error(`Telegram review request failed: ${error.message}`)
  }
}

export const buildBlogReviewRequest = buildTelegramApprovalRequest
export const buildReviewRequestPayload = buildTelegramApprovalRequest
export const buildTelegramReviewRequest = buildTelegramApprovalRequest
export const createTelegramApprovalRequest = buildTelegramApprovalRequest
export const sendBlogReviewRequest = sendTelegramApprovalRequest
export const sendTelegramReviewRequest = sendTelegramApprovalRequest
