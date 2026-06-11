#!/usr/bin/env node
// GMB OAuth 初回認可ヘルパー (先生が手動実行する)。
// refresh token を取得し、明示指定時のみ .env.local に直接保存する。
// 秘密値は stdout / log / Markdown に表示しない。
//
// 使い方:
//   1) .env.local に GMB_CLIENT_ID / GMB_CLIENT_SECRET を設定
//   2) node scripts/gmb-auth.mjs --url                         → 認可URLを表示。ブラウザで開いて承認
//   3) node scripts/gmb-auth.mjs --exchange <code> --write-env → refresh token を .env.local に保存
//      --write-env の明示なしには交換しない (codeを消費しない)

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { getGmbCredentials } from './lib/gmb-api.mjs'
import { ROOT } from './lib/media-queue.mjs'

const REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob'
const SCOPE = 'https://www.googleapis.com/auth/business.manage'

function requireClient() {
  const { clientId, clientSecret } = getGmbCredentials()
  if (!clientId || !clientSecret) {
    console.error('❌ GMB_CLIENT_ID / GMB_CLIENT_SECRET を .env.local に設定してください (手順: docs/gmb-oauth-setup-guide.md)')
    process.exit(1)
  }
  return { clientId, clientSecret }
}

export function upsertEnvValue(raw, key, value) {
  const lines = String(raw ?? '').split('\n')
  let replaced = false
  const out = lines.map((line) => {
    if (line.match(new RegExp(`^${key}\\s*=`))) {
      replaced = true
      return `${key}=${value}`
    }
    return line
  })
  if (!replaced) {
    if (out.length > 0 && out[out.length - 1] !== '') out.push('')
    out.push(`${key}=${value}`)
  }
  return `${out.filter((line, i) => !(i === out.length - 1 && line === '')).join('\n')}\n`
}

function saveRefreshTokenToEnv(refreshToken, envPath = join(ROOT, '.env.local')) {
  const current = existsSync(envPath) ? readFileSync(envPath, 'utf8') : ''
  writeFileSync(envPath, upsertEnvValue(current, 'GMB_REFRESH_TOKEN', refreshToken), 'utf8')
}

async function main() {
  if (process.argv.includes('--url')) {
    const { clientId } = requireClient()
    const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: SCOPE,
      access_type: 'offline',
      prompt: 'consent',
    })
    console.log('以下のURLをブラウザで開き、承認後に表示されるcodeをコピーしてください:\n')
    console.log(url)
    console.log('\n次: node scripts/gmb-auth.mjs --exchange <code> --write-env')
    return
  }

  const exIdx = process.argv.indexOf('--exchange')
  if (exIdx >= 0) {
    const code = process.argv[exIdx + 1]
    if (!code) {
      console.error('書式: node scripts/gmb-auth.mjs --exchange <code> --write-env')
      process.exit(1)
    }
    // 安全装置: refresh token は秘密値のため stdout には出さない。
    // --write-env が無ければ交換自体を行わず、使い捨てcodeを消費しない。
    if (!process.argv.includes('--write-env')) {
      console.error('⛔ refresh token は秘密値のため表示しません。保存する場合のみ --write-env を付けて再実行してください:')
      console.error(`   node scripts/gmb-auth.mjs --exchange ${code.slice(0, 4)}... --write-env`)
      console.error('   (.env.local はgitignore対象です。チャット・ログ・commit・スクリーンショットに秘密値を含めないでください)')
      process.exit(1)
    }
    const { clientId, clientSecret } = requireClient()
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: REDIRECT_URI,
      }),
    })
    const json = await res.json()
    if (!res.ok || !json.refresh_token) {
      console.error(`❌ 交換に失敗しました (HTTP ${res.status})。codeの期限切れ・redirect URI設定を確認してください`)
      process.exit(1)
    }
    saveRefreshTokenToEnv(json.refresh_token)
    console.log('✅ refresh token を取得し、.env.local に保存しました (値は表示していません)')
    console.log('   .env.local はgitignore対象です。チャット・ログ・commitに含めないでください。')
    return
  }

  console.log('使い方: --url で認可URL表示 → --exchange <code> --write-env で refresh token を .env.local に保存')
  console.log('(refresh token はstdoutに表示しません)')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`❌ ${err.message}`)
    process.exit(1)
  })
}
