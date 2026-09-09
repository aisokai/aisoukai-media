#!/usr/bin/env node
// Historical MWF generation, draft sync, and notification are retired.
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function retiredMwfResult() {
  return {
    status: 'retired',
    message: 'ops:mwf は退役済みです。生成・Git同期・通知・approve / publish は実行していません。',
  }
}

// No option (including --force / --no-generate) enables the retired flow.
// Importing this module has no runtime work or output.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(retiredMwfResult().message)
}
