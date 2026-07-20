#!/usr/bin/env node
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { NORMAL_TEST_FILES } from './safe-test-manifest.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SAFE_TEST_COMMAND = 'sh scripts/network-denied-launcher.sh'
const INTEGRATION = new Set(['scripts/generate-canonical-source.integration.mjs', 'scripts/gmb-readonly-check.integration.mjs', 'scripts/lib/dmp-core-state.integration.mjs', 'scripts/lib/openai-blog-generator.integration.mjs', 'tests/activation.integration.mjs', 'tests/content-status-notification.integration.mjs', 'tests/gmb-api.integration.mjs', 'tests/gmb-reviews.integration.mjs', 'tests/gmb-watcher-setup-pending.integration.mjs', 'tests/instagram-draft.integration.mjs', 'tests/lineworks-adapter.integration.mjs', 'tests/media-apply.integration.mjs', 'tests/media-executor.integration.mjs', 'tests/media-health.integration.mjs', 'tests/safety-gates.integration.mjs', 'tests/sns-notify.integration.mjs', 'tests/telegram-instruction.integration.mjs', 'tests/telegram-media-commands.integration.mjs', 'tests/theme-blog-flow.integration.mjs'])
const FORBIDDEN = /node:child_process|node:(?:https?|net|tls|dns|dgram)|\b(?:spawn|exec|fork)\s*\(|\bfetch\s*\(|\b(?:WebSocket|EventSource)\s*\(|\b(?:axios|undici)\b|\.env\.local/i

function walk(root, sub = '') {
  const dir = join(root, sub)
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const next = join(sub, entry.name)
    if (entry.isDirectory()) return ['node_modules', '.git', '.next', 'coverage'].includes(entry.name) ? [] : walk(root, next)
    return entry.isFile() ? [next] : []
  })
}
function imports(source) {
  const staticImports = [...source.matchAll(/(?:import|export)\s+(?:[^'"`]*?\s+from\s+)?['"](\.{1,2}\/[^'"]+)['"]/g)].map((m) => m[1])
  const dynamic = [...source.matchAll(/\bimport\(([^)]*)\)/g)].map((m) => m[1])
  return { staticImports, dynamic }
}
function resolveImport(root, from, specifier) {
  const base = resolve(root, dirname(from), specifier)
  for (const candidate of [base, `${base}.mjs`, join(base, 'index.mjs')]) if (existsSync(candidate)) return candidate
  return null
}
function inspectClosure(root, entry, violations, seen = new Set(), rootEntry = entry) {
  const absolute = join(root, entry)
  let real
  try { real = realpathSync(absolute) } catch { violations.push(`missing manifest test: ${entry}`); return }
  if (lstatSync(absolute).isSymbolicLink()) { violations.push(`SYMLINK_PATH_ESCAPE: ${entry}`); return }
  if (!real.startsWith(`${realpathSync(root)}/`)) { violations.push(`symlink/path escape: ${entry}`); return }
  if (seen.has(real)) return
  seen.add(real)
  const source = readFileSync(real, 'utf8')
  const rel = relative(root, real)
  if (!(rootEntry === 'tests/safe-validation-guard.test.mjs' && rel === 'scripts/validate-safe-test-path.mjs') && FORBIDDEN.test(source)) violations.push(`forbidden runtime reference from ${rootEntry}: ${rel}`)
  if (/(?:live|notify|telegram)[A-Za-z_-]*(?:transport|send)|(?:transport|send)[A-Za-z_-]*(?:live|notify|telegram)/i.test(rel)) violations.push(`live/notify transport reference from ${rootEntry}: ${rel}`)
  const { staticImports, dynamic } = imports(source)
  for (const expression of dynamic) {
    const literal = expression.match(/^\s*['"](\.{1,2}\/[^'"]+)['"]\s*$/)
    if (!literal) violations.push(`dynamic nonliteral import from ${rootEntry}: ${relative(root, real)}`)
    else {
      const target = resolveImport(root, relative(root, real), literal[1])
      if (!target) violations.push(`unresolved literal dynamic import from ${rootEntry}: ${relative(root, real)} -> ${literal[1]}`)
      else inspectClosure(root, relative(root, target), violations, seen, rootEntry)
    }
  }
  for (const specifier of staticImports) {
    const target = resolveImport(root, relative(root, real), specifier)
    if (!target) violations.push(`unresolved relative import: ${relative(root, real)} -> ${specifier}`)
    else inspectClosure(root, relative(root, target), violations, seen, rootEntry)
  }
}
export function inspectTestClosure({ root, entry }) {
  const violations = []
  inspectClosure(resolve(root), entry, violations)
  return { ok: violations.length === 0, violations }
}
export function validateSafeTestPath({ root = ROOT } = {}) {
  const violations = []
  const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  if (packageJson.scripts?.test !== SAFE_TEST_COMMAND) violations.push('npm test must use the network-denied wrapper')
  const discovered = walk(root).filter((file) => file.endsWith('.test.mjs')).sort()
  const manifest = [...NORMAL_TEST_FILES].sort()
  if (JSON.stringify(discovered) !== JSON.stringify(manifest)) violations.push('normal test manifest does not exactly match discovered *.test.mjs files')
  for (const file of walk(root).filter((file) => file.endsWith('.integration.mjs'))) if (!INTEGRATION.has(file)) violations.push(`unregistered integration test: ${file}`)
  const coveragePath = join(root, 'docs/evidence/t07-integration-coverage.json')
  if (!existsSync(coveragePath)) violations.push('missing integration coverage contract')
  else {
    const records = JSON.parse(readFileSync(coveragePath, 'utf8')).integrationFiles
    if (!Array.isArray(records)) violations.push('integration coverage records must be an array')
    else {
      const seenIntegration = new Set()
      const seenMappings = new Set()
      for (const record of records) {
        if (!INTEGRATION.has(record.integrationFile) || seenIntegration.has(record.integrationFile)) violations.push(`unknown/duplicate integration coverage: ${record.integrationFile}`)
        seenIntegration.add(record.integrationFile)
        if (!record.reason || record.runStatus !== 'not_run' || typeof record.humanGateRequired !== 'boolean' || !['verified', 'unproven'].includes(record.coverageStatus) || !Array.isArray(record.coverage)) violations.push(`invalid integration coverage record: ${record.integrationFile}`)
        if (record.coverageStatus === 'verified' && record.coverage.length === 0) violations.push(`verified integration lacks coverage: ${record.integrationFile}`)
        if (record.coverageStatus === 'unproven' && record.coverage.length !== 0) violations.push(`unproven integration has coverage: ${record.integrationFile}`)
        for (const coverage of record.coverage) {
          const mapping = `${coverage.normalTestFile}:${coverage.testId}`
          if (seenMappings.has(mapping)) violations.push(`duplicate coverage mapping: ${mapping}`)
          seenMappings.add(mapping)
          if (!NORMAL_TEST_FILES.includes(coverage.normalTestFile)) { violations.push(`unknown normal coverage file: ${coverage.normalTestFile}`); continue }
          const target = join(root, coverage.normalTestFile)
          if (lstatSync(target).isSymbolicLink()) violations.push(`coverage normal test must not be symlink: ${coverage.normalTestFile}`)
          const source = readFileSync(target, 'utf8')
          const hash = createHash('sha256').update(source).digest('hex')
          if (hash !== coverage.sourceSha256) violations.push(`coverage hash mismatch: ${coverage.normalTestFile}`)
          if ((source.match(new RegExp(coverage.testId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length !== 1) violations.push(`coverage testId missing/nonunique: ${mapping}`)
        }
      }
      for (const file of INTEGRATION) if (!seenIntegration.has(file)) violations.push(`missing integration coverage contract entry: ${file}`)
    }
  }
  for (const entry of NORMAL_TEST_FILES) inspectClosure(root, entry, violations)
  const wrapper = readFileSync(join(root, 'scripts/network-denied-launcher.sh'), 'utf8')
  if (!wrapper.includes('(deny network*)') || /allow\s+network\*/.test(wrapper)) violations.push('sandbox must deny all network without localhost allow')
  if (!wrapper.includes('command -v sandbox-exec') || /NETWORK_DENIED_ACTIVE/.test(wrapper)) violations.push('sandbox absence/bypass must fail closed')
  if (existsSync(join(root, 'scripts/network-denied-inner.sh')) || existsSync(join(root, 'scripts/network-denied-validation.sh'))) violations.push('legacy/direct inner validation runner must not exist')
  const live = readFileSync(join(root, 'scripts/telegram-notify-live-check.mjs'), 'utf8')
  if (!live.includes('HUMAN_GATE_REQUIRED') || /telegram-live-send|\.env|process\.env|--send/.test(live)) violations.push('live CLI is not hard-disabled before env/transport access')
  if (existsSync(join(root, 'scripts/telegram-live-send.mjs'))) violations.push('production live transport module must not exist')
  return { ok: violations.length === 0, violations }
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = validateSafeTestPath()
  if (!result.ok) { console.error(result.violations.map((item) => `UNSAFE: ${item}`).join('\n')); process.exitCode = 1 } else console.log('safe-validation-path: PASS')
}
