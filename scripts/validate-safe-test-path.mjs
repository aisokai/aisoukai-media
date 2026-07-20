#!/usr/bin/env node
// Fail closed when ordinary validation could discover or import a live sender.
// This intentionally uses no .env access and performs no network operation.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SAFE_TEST_COMMAND = 'node --test tests/*.test.mjs scripts/*.test.mjs scripts/lib/*.test.mjs'
const IGNORED_DIRECTORIES = new Set(['.git', '.next', 'node_modules', 'coverage'])
const LIVE_TEST_NAME = /(?:^|\/)(?:test-[^/]*?(?:live|send|notify)|[^/]*-live\.test)\.mjs$/i
const ISOLATED_NETWORK_MODULE = /(?:telegram-live-send|telegram-notify-live-check)\.mjs$/i

function filesUnder(root, directory = '') {
  const current = join(root, directory)
  if (!existsSync(current)) return []
  return readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
    const next = join(directory, entry.name)
    if (entry.isDirectory()) return IGNORED_DIRECTORIES.has(entry.name) ? [] : filesUnder(root, next)
    return entry.isFile() ? [next] : []
  })
}

function relativeImports(source) {
  return [...source.matchAll(/(?:import|export)\s+(?:[^'"`]*?\s+from\s+)?['"](\.{1,2}\/[^'"]+)['"]/g), ...source.matchAll(/import\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g)]
    .map((match) => match[1])
}

function isNormalTestFile(file) {
  return file.startsWith('tests/') || file === 'scripts/' || file.startsWith('scripts/lib/') || file.startsWith('scripts/')
}

function resolvesToLiveModule(root, fromFile, specifier) {
  const base = resolve(root, dirname(fromFile), specifier)
  const candidates = [base, `${base}.mjs`, join(base, 'index.mjs')]
  return candidates.some((candidate) => ISOLATED_NETWORK_MODULE.test(relative(root, candidate)))
}

export function validateSafeTestPath({ root = ROOT } = {}) {
  const violations = []
  const packagePath = join(root, 'package.json')
  if (!existsSync(packagePath)) return { ok: false, violations: ['missing package.json'] }
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'))
  const scripts = packageJson.scripts ?? {}

  if (scripts.test !== SAFE_TEST_COMMAND) violations.push(`test command must exactly be: ${SAFE_TEST_COMMAND}`)
  for (const [name, command] of Object.entries(scripts)) {
    if (/\bnode\s+--test\s*$/.test(command)) violations.push(`bare node --test in package script: ${name}`)
    if (/\bnode\s+--test\b[^\n]*\*\*/.test(command)) violations.push(`broad glob in package script: ${name}`)
    if (/--send\b/.test(command)) violations.push(`--send default in package script: ${name}`)
    if (/^test[:_-]/.test(name) && /(live|send|notify|telegram)/i.test(`${name} ${command}`)) violations.push(`live-like test script: ${name}`)
  }

  const allFiles = filesUnder(root)
  for (const file of allFiles) {
    if (!file.endsWith('.mjs')) continue
    if (file.startsWith('scripts/test-')) violations.push(`live-like test filename: ${file}`)
    if (!isNormalTestFile(file) || !file.endsWith('.test.mjs')) continue
    if (LIVE_TEST_NAME.test(file)) violations.push(`live-like test filename: ${file}`)
    const source = readFileSync(join(root, file), 'utf8')
    for (const specifier of relativeImports(source)) {
      if (resolvesToLiveModule(root, file, specifier)) violations.push(`test imports a live/network module: ${file} -> ${specifier}`)
    }
    if (/from\s+['"](?:node:)?(?:https?|net|tls|dgram)['"]/.test(source)) violations.push(`test imports a network transport: ${file}`)
  }

  const liveCli = join(root, 'scripts/telegram-notify-live-check.mjs')
  const gate = join(root, 'scripts/lib/explicit-execution-gate.mjs')
  if (existsSync(liveCli)) {
    const source = readFileSync(liveCli, 'utf8')
    const gateSource = existsSync(gate) ? readFileSync(gate, 'utf8') : ''
    if (!gateSource.includes("'--send'") || !gateSource.includes("'--human-approved'")) violations.push('live CLI must require two explicit Human Gate flags')
    if (!/import\(\s*['"]\.\/telegram-live-send\.mjs['"]\s*\)/.test(source)) violations.push('live CLI must lazy-load its network transport after guards')
  }
  return { ok: violations.length === 0, violations }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = validateSafeTestPath()
  if (!result.ok) {
    console.error(result.violations.map((value) => `UNSAFE: ${value}`).join('\n'))
    process.exitCode = 1
  } else console.log('safe-validation-path: PASS')
}
