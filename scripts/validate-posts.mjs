#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const POSTS_DIR = join(ROOT, 'content', 'posts')

import { validatePostArtifact } from './lib/post-artifact-validation.mjs'
function validatePost(filename) {
  try {
    return validatePostArtifact(filename, readFileSync(join(POSTS_DIR, filename), 'utf8'), {
      imageExists: image => existsSync(join(ROOT, 'public', image)),
    })
  } catch { return { errors: ['記事ファイルを読み込めません'], warnings: [] } }
}

let files
try {
  files = readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md')).sort()
} catch {
  console.error('エラー: content/posts/ が見つかりません')
  process.exit(1)
}

if (files.length === 0) {
  console.log('⚠️  記事が存在しません: content/posts/')
  process.exit(0)
}

let hasErrors   = false
let hasWarnings = false
const report    = []

for (const file of files) {
  const { errors, warnings } = validatePost(file)
  report.push({ file, errors, warnings })
  if (errors.length   > 0) hasErrors   = true
  if (warnings.length > 0) hasWarnings = true
}

if (!hasErrors) {
  if (hasWarnings) {
    console.log(`✅ All posts valid (${files.length} 件) — 警告あり`)
    for (const { file, warnings } of report) {
      if (warnings.length > 0) {
        console.warn(`⚠️  ${file}`)
        for (const w of warnings) console.warn(`   ⚠ ${w}`)
      }
    }
    process.exit(0)
  }
  console.log(`✅ All posts valid (${files.length} 件)`)
  process.exit(0)
}

for (const { file, errors, warnings } of report) {
  if (errors.length > 0) {
    console.error(`❌ ${file}`)
    for (const err of errors) console.error(`   - ${err}`)
  }
  if (warnings.length > 0) {
    console.warn(`⚠️  ${file}`)
    for (const w of warnings) console.warn(`   ⚠ ${w}`)
  }
}
process.exit(1)
