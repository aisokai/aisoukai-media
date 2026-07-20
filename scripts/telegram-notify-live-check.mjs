#!/usr/bin/env node
// Intentionally hard-disabled until a separately reviewed, receipt-verified Human Gate exists.
// argv, env, dotenv and network transport are deliberately never evaluated here.
import { pathToFileURL } from 'node:url'

export function runTelegramLiveCheck() {
  return { sent: false, reason: 'HUMAN_GATE_REQUIRED' }
}

async function main() {
  const result = await runTelegramLiveCheck()
  if (result.reason === 'HUMAN_GATE_REQUIRED') {
    console.error('HUMAN_GATE_REQUIRED: live Telegram send is hard-disabled pending an independently reviewed receipt-verified Human Gate implementation.')
    process.exitCode = 1
    return
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`❌ Telegram送信失敗: ${err.message}`)
    process.exitCode = 1
  })
}
