#!/usr/bin/env node
// Human-gated localhost OAuth helper. No GMB content is read, posted, or replied to.

import { execFile } from 'node:child_process'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'
import {
  getGmbKeychainCredentials,
  saveGmbRefreshToken,
} from './lib/gmb-keychain.mjs'

const HOST = '127.0.0.1'
const CALLBACK_PATH = '/oauth/callback'
const SCOPE = 'https://www.googleapis.com/auth/business.manage'
const CONFIRMATION = 'GMB_OAUTH_KEYCHAIN'
const TIMEOUT_MS = 5 * 60 * 1000

export function buildAuthorizationUrl({ clientId, redirectUri, state }) {
  return 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'select_account consent',
    state,
  })
}

function exactConfirmationPresent(argv) {
  const index = argv.indexOf('--confirm')
  return argv[index + 1] === CONFIRMATION
}

function requireClientCredentials() {
  const credentials = getGmbKeychainCredentials()
  if (!credentials.clientId || !credentials.clientSecret) {
    throw new Error('GMB OAuth client情報がMac mini Keychainにありません')
  }
  return credentials
}

async function exchangeAuthorizationCode({ code, clientId, clientSecret, redirectUri, fetchImpl = fetch }) {
  const response = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || typeof payload.refresh_token !== 'string') {
    throw new Error(`OAuth token交換に失敗しました (HTTP ${response.status})`)
  }
  return payload.refresh_token
}

function stateMatches(expected, actual) {
  const expectedBytes = Buffer.from(expected)
  const actualBytes = Buffer.from(actual)
  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes)
}

async function authorize() {
  const { clientId, clientSecret } = requireClientCredentials()
  const state = randomBytes(32).toString('hex')

  await new Promise((resolve, reject) => {
    let settled = false
    const finish = (error) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      server.close(() => error ? reject(error) : resolve())
    }

    const server = createServer(async (request, response) => {
      try {
        const requestUrl = new URL(request.url ?? '/', `http://${HOST}`)
        if (requestUrl.pathname !== CALLBACK_PATH) {
          response.writeHead(404).end('Not found')
          return
        }
        const returnedState = requestUrl.searchParams.get('state') ?? ''
        const code = requestUrl.searchParams.get('code') ?? ''
        if (!stateMatches(state, returnedState) || !code) {
          response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
          response.end('OAuth verification failed. Close this tab.')
          finish(new Error('OAuth callback検証に失敗しました'))
          return
        }
        const address = server.address()
        if (!address || typeof address === 'string') throw new Error('OAuth callback address unavailable')
        const redirectUri = `http://${HOST}:${address.port}${CALLBACK_PATH}`
        const refreshToken = await exchangeAuthorizationCode({ code, clientId, clientSecret, redirectUri })
        saveGmbRefreshToken(refreshToken)
        response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
        response.end('MitaniOS GMB OAuth completed. You can close this tab.')
        finish()
      } catch (error) {
        if (!response.headersSent) response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
        response.end('OAuth setup failed. Close this tab and return to MitaniOS.')
        finish(error instanceof Error ? error : new Error('OAuth setup failed'))
      }
    })

    const timeout = setTimeout(() => finish(new Error('OAuth認証がタイムアウトしました')), TIMEOUT_MS)
    server.listen(0, HOST, () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        finish(new Error('OAuth callback serverを開始できません'))
        return
      }
      const redirectUri = `http://${HOST}:${address.port}${CALLBACK_PATH}`
      const authorizationUrl = buildAuthorizationUrl({ clientId, redirectUri, state })
      execFile('/usr/bin/open', [authorizationUrl], { stdio: 'ignore' }, (error) => {
        if (error) finish(new Error('Google認証画面を開けませんでした'))
      })
      console.log('Google認証画面を開きました。GMB管理アカウントで承認してください。')
      console.log('Refresh Tokenは値を表示せずMac mini Keychainへ保存します。')
    })
  })

  console.log('GMB OAuth接続をKeychainへ保存しました。投稿・返信は実行していません。')
}

async function main(argv = process.argv.slice(2)) {
  if (!argv.includes('--authorize') || !exactConfirmationPresent(argv)) {
    console.error(`実行には --authorize --confirm ${CONFIRMATION} が必要です。`)
    process.exitCode = 1
    return
  }
  await authorize()
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'GMB OAuth setup failed')
    process.exitCode = 1
  })
}
