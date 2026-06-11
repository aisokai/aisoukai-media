#!/usr/bin/env node
// Telegram Instruction dry-run CLI。
// 実装本体は scripts/lib/telegram-media-commands.mjs (telegram-ops.mjs と共用)。
// このCLIはTelegram送信を一切せず、mock入力をローカルで解釈・実行するだけ。
//
// 使い方:
//   node scripts/telegram-instruction-dry-run.mjs --input "/notice 本日午後休診" [--dry-run]
//   --dry-run 指定時はファイル書き込み・状態遷移もしない (表示のみ)

import { pathToFileURL } from 'node:url'
import {
  BLOCKED_COMMANDS, COMMAND_ALLOWLIST, handleMediaCommand, parseInstruction,
} from './lib/telegram-media-commands.mjs'

export { BLOCKED_COMMANDS, COMMAND_ALLOWLIST, parseInstruction }

function getArg(name) {
  const idx = process.argv.indexOf(`--${name}`)
  return idx >= 0 ? process.argv[idx + 1] : undefined
}

async function main() {
  const input = getArg('input') ?? '/status'
  const dryRun = process.argv.includes('--dry-run')
  // CLI実行者はローカルのHuman前提のため authorized=true。
  // Telegram経由の権限判定は telegram-ops.mjs 側で ALLOWED_CHAT_IDS により行う。
  const result = await handleMediaCommand(input, {
    authorized: true, fromUser: 'cli', dryRun,
  })
  console.log(`✅ Telegram指示を解釈しました (mock / Telegram送信なし${dryRun ? ' / dry-run' : ''})`)
  console.log(`   ${result.summary}`)
  if (result.reply) {
    console.log(result.reply.split('\n').map((l) => `   | ${l}`).join('\n'))
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
