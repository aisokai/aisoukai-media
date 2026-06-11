// gmb-api.mjs
// Google Business Profile API クライアント (Phase 2-3)。
// 認証情報は .env.local の GMB_CLIENT_ID / GMB_CLIENT_SECRET / GMB_REFRESH_TOKEN。
// 秘密値は一切ログ・ファイルに出力しない。
//
// 役割分担:
//   - 読み取り (accounts / locations / reviews) : watcher / discovery から使用
//   - 送信 (reply / localPost)                  : scripts/lib/media-apply.mjs 経由のみ。
//     直接CLIから送信する経路は gmb-apply.mjs (approved job + --apply 必須) だけ。

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from './media-queue.mjs'

export const GMB_LOCATION_CONFIG_PATH = join(ROOT, 'config', 'gmb-location.json')

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const ACCOUNT_API = 'https://mybusinessaccountmanagement.googleapis.com/v1'
const BUSINESS_API = 'https://mybusinessbusinessinformation.googleapis.com/v1'
const V4_API = 'https://mybusiness.googleapis.com/v4'

export function loadEnvLocal() {
  const envPath = join(ROOT, '.env.local')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.+)$/)
    if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
  }
}

export function getGmbCredentials() {
  loadEnvLocal()
  const { GMB_CLIENT_ID, GMB_CLIENT_SECRET, GMB_REFRESH_TOKEN } = process.env
  return { clientId: GMB_CLIENT_ID, clientSecret: GMB_CLIENT_SECRET, refreshToken: GMB_REFRESH_TOKEN }
}

export function requireCredentials() {
  const creds = getGmbCredentials()
  const missing = []
  if (!creds.clientId) missing.push('GMB_CLIENT_ID')
  if (!creds.clientSecret) missing.push('GMB_CLIENT_SECRET')
  if (!creds.refreshToken) missing.push('GMB_REFRESH_TOKEN')
  if (missing.length > 0) {
    throw new Error(`GMB認証情報が未設定です: ${missing.join(', ')} (.env.local に設定してください。手順: docs/gmb-oauth-setup-guide.md)`)
  }
  return creds
}

let cachedToken = null
let cachedTokenExpiry = 0

export async function getAccessToken({ fetchImpl = fetch } = {}) {
  if (cachedToken && Date.now() < cachedTokenExpiry - 60_000) return cachedToken
  const { clientId, clientSecret, refreshToken } = requireCredentials()
  const res = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  const json = await res.json()
  if (!res.ok || !json.access_token) {
    // エラー詳細に秘密値が含まれる可能性があるため、状態コードのみ伝える
    throw new Error(`GMBアクセストークン取得に失敗しました (HTTP ${res.status})。認証情報を確認してください`)
  }
  cachedToken = json.access_token
  cachedTokenExpiry = Date.now() + (json.expires_in ?? 3600) * 1000
  return cachedToken
}

async function apiCall(url, { method = 'GET', body = null, fetchImpl = fetch } = {}) {
  const token = await getAccessToken({ fetchImpl })
  const res = await fetchImpl(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  if (res.status === 204) return {}
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = json?.error?.message ?? `HTTP ${res.status}`
    throw new Error(`GMB API エラー: ${msg}`)
  }
  return json
}

// ── 読み取り系 ────────────────────────────────────────────────────────────

export async function listAccounts({ fetchImpl = fetch } = {}) {
  const json = await apiCall(`${ACCOUNT_API}/accounts`, { fetchImpl })
  return json.accounts ?? []
}

export async function listLocations(accountName, { fetchImpl = fetch } = {}) {
  const json = await apiCall(
    `${BUSINESS_API}/${accountName}/locations?readMask=name,title&pageSize=100`,
    { fetchImpl },
  )
  return json.locations ?? []
}

export function loadLocationConfig(path = GMB_LOCATION_CONFIG_PATH) {
  if (!existsSync(path)) {
    throw new Error('config/gmb-location.json がありません。先に npm run media:gmb:discover を実行してください')
  }
  const config = JSON.parse(readFileSync(path, 'utf8'))
  if (!config.account_id || !config.location_id) {
    throw new Error('config/gmb-location.json に account_id / location_id がありません')
  }
  return config
}

// v4 API の starRating enum → 数値
export const STAR_RATING_MAP = Object.freeze({ ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 })

// v4 reviews レスポンス → watcher が使う共通review形式
export function mapApiReview(apiReview) {
  return {
    review_id: apiReview.reviewId ?? apiReview.name?.split('/').pop() ?? '',
    rating: STAR_RATING_MAP[apiReview.starRating] ?? 0,
    text: apiReview.comment ?? '',
    reviewer_display: apiReview.reviewer?.displayName ?? '匿名',
    has_reply: Boolean(apiReview.reviewReply),
  }
}

export async function listReviews({ fetchImpl = fetch, locationConfig = null } = {}) {
  const cfg = locationConfig ?? loadLocationConfig()
  const parent = `accounts/${cfg.account_id}/locations/${cfg.location_id}`
  const json = await apiCall(`${V4_API}/${parent}/reviews?pageSize=50`, { fetchImpl })
  return (json.reviews ?? []).map(mapApiReview)
}

// ── 送信系 (media-apply.mjs 経由でのみ使用する) ──────────────────────────

export async function putReviewReply({ reviewId, comment, fetchImpl = fetch, locationConfig = null }) {
  const cfg = locationConfig ?? loadLocationConfig()
  const name = `accounts/${cfg.account_id}/locations/${cfg.location_id}/reviews/${reviewId}`
  const json = await apiCall(`${V4_API}/${name}/reply`, {
    method: 'PUT', body: { comment }, fetchImpl,
  })
  return { reply_name: `${name}/reply`, updated_at: json.updateTime ?? null }
}

export async function deleteReviewReply({ reviewId, fetchImpl = fetch, locationConfig = null }) {
  const cfg = locationConfig ?? loadLocationConfig()
  const name = `accounts/${cfg.account_id}/locations/${cfg.location_id}/reviews/${reviewId}`
  await apiCall(`${V4_API}/${name}/reply`, { method: 'DELETE', fetchImpl })
  return { deleted: true, reply_name: `${name}/reply` }
}

export function buildLocalPostPayload({ draftText, ctaUrl = null }) {
  return {
    languageCode: 'ja',
    topicType: 'STANDARD',
    summary: draftText,
    ...(ctaUrl ? { callToAction: { actionType: 'LEARN_MORE', url: ctaUrl } } : {}),
  }
}

export async function createLocalPost({ draftText, ctaUrl = null, fetchImpl = fetch, locationConfig = null }) {
  const cfg = locationConfig ?? loadLocationConfig()
  const parent = `accounts/${cfg.account_id}/locations/${cfg.location_id}`
  const json = await apiCall(`${V4_API}/${parent}/localPosts`, {
    method: 'POST', body: buildLocalPostPayload({ draftText, ctaUrl }), fetchImpl,
  })
  return { post_name: json.name ?? null, state: json.state ?? null }
}

export async function deleteLocalPost({ postName, fetchImpl = fetch }) {
  await apiCall(`${V4_API}/${postName}`, { method: 'DELETE', fetchImpl })
  return { deleted: true, post_name: postName }
}
