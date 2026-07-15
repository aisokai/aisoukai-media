#!/usr/bin/env node
// Read-only OAuth/GBP readiness check. Never prints account names, IDs, reviews, or tokens.

import { pathToFileURL } from 'node:url'
import { listAccounts, listLocations } from './lib/gmb-api.mjs'

export async function checkGmbReadiness({
  listAccountsImpl = listAccounts,
  listLocationsImpl = listLocations,
} = {}) {
  const accounts = await listAccountsImpl()
  let locationCount = 0
  for (const account of accounts) {
    if (typeof account?.name !== 'string' || !account.name.startsWith('accounts/')) continue
    const locations = await listLocationsImpl(account.name)
    locationCount += locations.length
  }
  return {
    ok: accounts.length > 0 && locationCount > 0,
    mode: 'read_only',
    accountCount: accounts.length,
    locationCount,
    reviewsRead: false,
    externalMutation: false,
  }
}

async function main() {
  const result = await checkGmbReadiness()
  console.log(JSON.stringify(result))
  if (!result.ok) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message.replace(/accounts\/[^\s/]+/g, 'accounts/[redacted]') : 'GMB readiness check failed'
    console.error(message)
    process.exitCode = 1
  })
}
