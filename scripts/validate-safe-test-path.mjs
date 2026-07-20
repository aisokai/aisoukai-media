#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { NORMAL_TEST_FILES } from './safe-test-manifest.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SAFE_TEST_COMMAND = 'sh scripts/network-denied-launcher.sh'
const INTEGRATION = new Set(['scripts/generate-canonical-source.integration.mjs', 'scripts/gmb-readonly-check.integration.mjs', 'scripts/lib/dmp-core-state.integration.mjs', 'scripts/lib/openai-blog-generator.integration.mjs', 'tests/activation.integration.mjs', 'tests/content-status-notification.integration.mjs', 'tests/gmb-api.integration.mjs', 'tests/gmb-reviews.integration.mjs', 'tests/gmb-watcher-setup-pending.integration.mjs', 'tests/instagram-draft.integration.mjs', 'tests/lineworks-adapter.integration.mjs', 'tests/media-apply.integration.mjs', 'tests/media-executor.integration.mjs', 'tests/media-health.integration.mjs', 'tests/safety-gates.integration.mjs', 'tests/sns-notify.integration.mjs', 'tests/telegram-instruction.integration.mjs', 'tests/telegram-media-commands.integration.mjs', 'tests/theme-blog-flow.integration.mjs'])
const FORBIDDEN = /node:child_process|node:(?:https?|net|tls|dgram)|\b(?:spawn|exec|fork)\s*\(|\.env\.local/i

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
  const dynamic = [...source.matchAll(/\bimport\(([^)]*)\)/g)]
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
  if (!real.startsWith(`${realpathSync(root)}/`)) { violations.push(`symlink/path escape: ${entry}`); return }
  if (seen.has(real)) return
  seen.add(real)
  const source = readFileSync(real, 'utf8')
  if (FORBIDDEN.test(source)) violations.push(`forbidden runtime reference from ${rootEntry}: ${relative(root, real)}`)
  const { staticImports, dynamic } = imports(source)
  for (const expression of dynamic) if (!/^\s*['"]\.{1,2}\//.test(expression)) violations.push(`dynamic nonliteral import from ${rootEntry}: ${relative(root, real)}`)
  for (const specifier of staticImports) {
    const target = resolveImport(root, relative(root, real), specifier)
    if (!target) violations.push(`unresolved relative import: ${relative(root, real)} -> ${specifier}`)
    else inspectClosure(root, relative(root, target), violations, seen, rootEntry)
  }
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
    const contract = JSON.parse(readFileSync(coveragePath, 'utf8')).integrationFiles ?? {}
    for (const file of INTEGRATION) if (!contract[file]?.reason || !contract[file]?.mockCoverage) violations.push(`missing integration coverage contract entry: ${file}`)
  }
  for (const entry of NORMAL_TEST_FILES) inspectClosure(root, entry, violations)
  const wrapper = readFileSync(join(root, 'scripts/network-denied-launcher.sh'), 'utf8')
  if (!wrapper.includes('(deny network*)') || /allow\s+network\*/.test(wrapper)) violations.push('sandbox must deny all network without localhost allow')
  if (!wrapper.includes('command -v sandbox-exec') || /NETWORK_DENIED_ACTIVE/.test(wrapper)) violations.push('sandbox absence/bypass must fail closed')
  const live = readFileSync(join(root, 'scripts/telegram-notify-live-check.mjs'), 'utf8')
  if (!live.includes('HUMAN_GATE_REQUIRED') || /telegram-live-send|\.env|process\.env|--send/.test(live)) violations.push('live CLI is not hard-disabled before env/transport access')
  if (existsSync(join(root, 'scripts/telegram-live-send.mjs'))) violations.push('production live transport module must not exist')
  return { ok: violations.length === 0, violations }
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = validateSafeTestPath()
  if (!result.ok) { console.error(result.violations.map((item) => `UNSAFE: ${item}`).join('\n')); process.exitCode = 1 } else console.log('safe-validation-path: PASS')
}
