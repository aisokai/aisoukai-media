// lineworks-adapter.mjs (Phase 5)
// LINE WORKS API 2.0 クライアント。院内通知の送信のみ (外部顧客向け送信は存在しない)。
// 認証情報は .env.local:
//   LW_CLIENT_ID / LW_CLIENT_SECRET / LW_SERVICE_ACCOUNT / LW_PRIVATE_KEY / LW_BOT_ID / LW_CHANNEL_ID
// LW_PRIVATE_KEY は PEM 文字列 (改行は \n エスケープ可)。秘密値はログ・ファイルに出さない。
//
// 受信について: LINE WORKS はwebhook(公開エンドポイント)が必要なためv1ではポーリング受信なし。
// 受信は content/lineworks-requests/inbox/*.json を介する (将来webhook relayで投入する設計)。

import { createSign } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from './media-queue.mjs'

const TOKEN_URL = 'https://auth.worksmobile.com/oauth2/v2.0/token'
const API_BASE = 'https://www.worksapis.com/v1.0'

function loadEnv() {
  const envPath = join(ROOT, '.env.local')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.+)$/)
    if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
  }
}

export function getLineworksCredentials() {
  loadEnv()
  const {
    LW_CLIENT_ID, LW_CLIENT_SECRET, LW_SERVICE_ACCOUNT, LW_PRIVATE_KEY, LW_BOT_ID, LW_CHANNEL_ID,
  } = process.env
  return {
    clientId: LW_CLIENT_ID,
    clientSecret: LW_CLIENT_SECRET,
    serviceAccount: LW_SERVICE_ACCOUNT,
    privateKey: LW_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    botId: LW_BOT_ID,
    channelId: LW_CHANNEL_ID,
  }
}

export function requireLineworksCredentials() {
  const creds = getLineworksCredentials()
  const missing = Object.entries({
    LW_CLIENT_ID: creds.clientId,
    LW_CLIENT_SECRET: creds.clientSecret,
    LW_SERVICE_ACCOUNT: creds.serviceAccount,
    LW_PRIVATE_KEY: creds.privateKey,
    LW_BOT_ID: creds.botId,
    LW_CHANNEL_ID: creds.channelId,
  }).filter(([, v]) => !v).map(([k]) => k)
  if (missing.length > 0) {
    throw new Error(`LINE WORKS認証情報が未設定です: ${missing.join(', ')} (.env.local に設定してください)`)
  }
  return creds
}

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// JWT (RS256) を組み立てる。テスト可能なよう純関数に分離。
export function buildJwtAssertion({ clientId, serviceAccount, privateKey, now = Math.floor(Date.now() / 1000) }) {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = base64url(JSON.stringify({
    iss: clientId, sub: serviceAccount, iat: now, exp: now + 3600,
  }))
  const signer = createSign('RSA-SHA256')
  signer.update(`${header}.${payload}`)
  const signature = signer.sign(privateKey, 'base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${header}.${payload}.${signature}`
}

let cachedToken = null
let cachedExpiry = 0

export async function getLineworksToken({ fetchImpl = fetch } = {}) {
  if (cachedToken && Date.now() < cachedExpiry - 60_000) return cachedToken
  const creds = requireLineworksCredentials()
  const assertion = buildJwtAssertion(creds)
  const res = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      assertion,
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      scope: 'bot',
    }),
  })
  const json = await res.json()
  if (!res.ok || !json.access_token) {
    throw new Error(`LINE WORKSトークン取得に失敗しました (HTTP ${res.status})`)
  }
  cachedToken = json.access_token
  cachedExpiry = Date.now() + (Number(json.expires_in) || 3600) * 1000
  return cachedToken
}

// 院内チャンネルへのBotメッセージ送信。呼び出し側 (lineworks-notify.mjs) が
// lineworks_internal_auto フラグ + --apply をゲートする。
export async function sendInternalMessage({ text, fetchImpl = fetch }) {
  const creds = requireLineworksCredentials()
  const token = await getLineworksToken({ fetchImpl })
  const res = await fetchImpl(
    `${API_BASE}/bots/${creds.botId}/channels/${creds.channelId}/messages`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: { type: 'text', text } }),
    },
  )
  if (!res.ok) {
    const json = await res.json().catch(() => ({}))
    throw new Error(`LINE WORKS送信エラー: ${json.message ?? `HTTP ${res.status}`}`)
  }
  return { sent: true }
}
