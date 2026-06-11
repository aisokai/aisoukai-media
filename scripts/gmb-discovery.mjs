#!/usr/bin/env node
// GMB account / location discovery (Phase 2 / Batch 5)。読み取り専用。
// 結果を config/gmb-location.json に保存する (秘密値は含めない)。
// 認証情報 (.env.local) が無い場合は明示エラーで停止する。
//
// 使い方:
//   npm run media:gmb:discover            # account/location一覧を表示し、1件なら自動保存
//   npm run media:gmb:discover -- --save accounts/123:locations/456

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { GMB_LOCATION_CONFIG_PATH, listAccounts, listLocations } from './lib/gmb-api.mjs'
import { getJstTimestamp } from './lib/media-queue.mjs'

function saveLocationConfig({ accountId, locationId, title }) {
  if (existsSync(GMB_LOCATION_CONFIG_PATH)) {
    const existing = JSON.parse(readFileSync(GMB_LOCATION_CONFIG_PATH, 'utf8'))
    if (existing.account_id !== accountId || existing.location_id !== locationId) {
      console.warn('⚠️  既存の gmb-location.json と異なるIDです。上書きは --force を付けてください')
      if (!process.argv.includes('--force')) return false
    }
  }
  writeFileSync(GMB_LOCATION_CONFIG_PATH, `${JSON.stringify({
    account_id: accountId,
    location_id: locationId,
    title: title ?? null,
    discovered_at: getJstTimestamp(),
  }, null, 2)}\n`)
  console.log(`✅ config/gmb-location.json に保存しました (account ${accountId} / location ${locationId})`)
  return true
}

async function main() {
  const saveIdx = process.argv.indexOf('--save')
  if (saveIdx >= 0) {
    const m = String(process.argv[saveIdx + 1] ?? '').match(/accounts\/(\S+?):locations\/(\S+)/)
    if (!m) {
      console.error('書式: --save accounts/<id>:locations/<id>')
      process.exit(1)
    }
    saveLocationConfig({ accountId: m[1], locationId: m[2] })
    return
  }

  console.log('GMB discovery (読み取り専用) を開始します…')
  const accounts = await listAccounts()
  if (accounts.length === 0) {
    console.log('アカウントが見つかりません。GBP APIの有効化とOAuthスコープを確認してください')
    return
  }
  for (const account of accounts) {
    const accountId = account.name?.split('/').pop()
    console.log(`📁 ${account.name} (${account.accountName ?? account.type ?? ''})`)
    const locations = await listLocations(account.name)
    for (const loc of locations) {
      const locationId = loc.name?.split('/').pop()
      console.log(`   📍 ${loc.name} — ${loc.title ?? ''}`)
      console.log(`      保存: npm run media:gmb:discover -- --save accounts/${accountId}:locations/${locationId}`)
    }
    if (accounts.length === 1 && locations.length === 1) {
      const locationId = locations[0].name?.split('/').pop()
      saveLocationConfig({ accountId, locationId, title: locations[0].title })
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`❌ ${err.message}`)
    process.exit(1)
  })
}
