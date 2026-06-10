#!/usr/bin/env node
import { SNS_DRAFTS_DIR, listSnsDraftFiles, validateSnsDraftFile } from './lib/sns-drafts.mjs'

const files = listSnsDraftFiles(SNS_DRAFTS_DIR)

if (files.length === 0) {
  console.log('✅ SNS drafts directory ready (0 件)')
  process.exit(0)
}

let hasErrors = false
let hasWarnings = false
const report = files.map((filePath) => {
  const result = validateSnsDraftFile(filePath)
  if (result.errors.length > 0) hasErrors = true
  if (result.warnings.length > 0) hasWarnings = true
  return result
})

if (!hasErrors) {
  if (hasWarnings) {
    console.log(`✅ All SNS drafts valid (${files.length} 件) — 警告あり`)
    for (const { file, warnings } of report) {
      if (warnings.length > 0) {
        console.warn(`⚠️  ${file}`)
        for (const warning of warnings) console.warn(`   ⚠ ${warning}`)
      }
    }
    process.exit(0)
  }
  console.log(`✅ All SNS drafts valid (${files.length} 件)`)
  process.exit(0)
}

for (const { file, errors, warnings } of report) {
  if (errors.length > 0) {
    console.error(`❌ ${file}`)
    for (const error of errors) console.error(`   - ${error}`)
  }
  if (warnings.length > 0) {
    console.warn(`⚠️  ${file}`)
    for (const warning of warnings) console.warn(`   ⚠ ${warning}`)
  }
}

process.exit(1)

