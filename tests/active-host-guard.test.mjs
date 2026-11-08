import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assertActiveHost, checkActiveHost, normalizeHostname, parseCurrentHost } from '../scripts/lib/active-host-guard.mjs'

const dir = mkdtempSync(join(tmpdir(), 'active-host-guard-'))
function declaration(name, body) {
  const file = join(dir, name)
  writeFileSync(file, body)
  return file
}
const declared = (host) => `# Active host\n\n- current: ${host}\n- since: 2026-11-08\n\n## 切り替え履歴\n- 2026-11-08: mac-mini → macbook-pro\n`

// Runs a fake job behind the guard; exit/log are captured instead of touching the real process.
function runJob(env, { hostname = () => 'not-a-mapped-host.local', rootDir = dir } = {}) {
  const logs = []
  const exits = []
  let worked = false
  if (assertActiveHost({ rootDir, env, hostname, exit: (code) => exits.push(code), log: (line) => logs.push(line) })) worked = true
  return { worked, logs, exits }
}

test('current == this host → job proceeds silently', () => {
  const env = { ACTIVE_HOST_FILE: declaration('mini.md', declared('mac-mini')), ACTIVE_HOST_ID: 'mac-mini' }
  const r = runJob(env)
  assert.equal(r.worked, true)
  assert.deepEqual(r.exits, [])
  assert.deepEqual(r.logs, [])
})

test('current == this host via os.hostname() mapping (caelus-mini.local → mac-mini)', () => {
  const env = { ACTIVE_HOST_FILE: declaration('mini2.md', declared('mac-mini')) }
  assert.equal(checkActiveHost({ env, hostname: () => 'caelus-mini.local' }).reason, 'active_owner')
  assert.equal(checkActiveHost({ env, hostname: () => 'Caelus-Mini' }).reason, 'active_owner')
})

test('current == other known host → exit 0 with one log line, no work', () => {
  const env = { ACTIVE_HOST_FILE: declaration('mbp.md', declared('macbook-pro')), ACTIVE_HOST_ID: 'mac-mini' }
  const r = runJob(env)
  assert.equal(r.worked, false)
  assert.deepEqual(r.exits, [0])
  assert.equal(r.logs.length, 1)
  assert.match(r.logs[0], /^\[active-host-guard\] this host is not the active owner \(current: macbook-pro/)
  assert.equal(checkActiveHost({ env, hostname: () => 'caelus-mini.local', }).proceed, false)
})

test('file missing → fail-safe, job proceeds with a note', () => {
  const r = runJob({ ACTIVE_HOST_FILE: join(dir, 'does-not-exist.md'), ACTIVE_HOST_ID: 'mac-mini' })
  assert.equal(r.worked, true)
  assert.deepEqual(r.exits, [])
  assert.equal(r.logs.length, 1)
  assert.match(r.logs[0], /note: .*file_unreadable.*proceeding/)
  // default path under rootDir that has no docs/ops/active-host.md
  assert.equal(checkActiveHost({ rootDir: dir, env: {}, hostname: () => 'caelus-mini.local' }).reason, 'file_unreadable')
})

test('file present but unparseable → fail-safe, job proceeds', () => {
  for (const [name, body] of [
    ['empty.md', ''],
    ['nocurrent.md', '# Active host\n\n- since: 2026-11-08\n'],
    ['blank.md', '- current:\n'],
    ['garbage.md', '- current: mac mini!!\n'],
    ['ambiguous.md', '- current: mac-mini\n- current: macbook-pro\n'],
    ['binary.md', '\u0000\u0001\u0002'],
  ]) {
    const r = runJob({ ACTIVE_HOST_FILE: declaration(name, body), ACTIVE_HOST_ID: 'mac-mini' })
    assert.equal(r.worked, true, name)
    assert.deepEqual(r.exits, [], name)
    assert.match(r.logs[0], /current_unparseable/, name)
  }
  // a syntactically valid but unknown host id is also not a reason to stop
  const r = runJob({ ACTIVE_HOST_FILE: declaration('unknown-id.md', declared('raspberry-pi')), ACTIVE_HOST_ID: 'mac-mini' })
  assert.equal(r.worked, true)
  assert.match(r.logs[0], /current_unknown_host_id/)
})

test('unknown hostname → fail-safe, job proceeds (even when current is another host)', () => {
  const env = { ACTIVE_HOST_FILE: declaration('mbp2.md', declared('macbook-pro')) }
  const r = runJob(env, { hostname: () => 'some-other-machine.local' })
  assert.equal(r.worked, true)
  assert.deepEqual(r.exits, [])
  assert.match(r.logs[0], /hostname_not_mapped/)
  // the MacBook placeholder key can never match a real hostname
  assert.equal(checkActiveHost({ env, hostname: () => 'MacBook-Pro.local' }).proceed, true)
})

test('unknown ACTIVE_HOST_ID override is ignored → falls back to hostname mapping', () => {
  const env = { ACTIVE_HOST_FILE: declaration('mbp4.md', declared('macbook-pro')), ACTIVE_HOST_ID: 'foo' }
  assert.equal(runJob(env, { hostname: () => 'unmapped.local' }).worked, true)
  assert.equal(checkActiveHost({ env, hostname: () => 'unmapped.local' }).reason, 'hostname_not_mapped')
  assert.equal(checkActiveHost({ env, hostname: () => 'caelus-mini.local' }).proceed, false)
})

test('guard internals never throw: hostname() or readFile throwing → proceeds', () => {
  const env = { ACTIVE_HOST_FILE: declaration('mbp3.md', declared('macbook-pro')) }
  assert.equal(checkActiveHost({ env, hostname: () => { throw new Error('boom') } }).proceed, true)
  assert.equal(checkActiveHost({ env: {}, readFile: () => { throw new Error('EACCES') } }).proceed, true)
  assert.equal(runJob(env, { hostname: () => { throw new Error('boom') } }).worked, true)
})

test('parser and normalizer details', () => {
  assert.equal(parseCurrentHost('- current: `mac-mini`\n'), 'mac-mini')
  assert.equal(parseCurrentHost('current: MAC-MINI  \n'), 'mac-mini')
  assert.equal(parseCurrentHost('- note: current owner is x\n- current: mac-mini'), 'mac-mini')
  assert.equal(parseCurrentHost('- current: mac-mini\n- current: mac-mini\n'), 'mac-mini')
  assert.equal(normalizeHostname('caelus-mini.local'), 'caelus-mini')
  assert.equal(normalizeHostname('caelus-mini.local.'), 'caelus-mini')
})

test('the repository declaration file itself is parseable', () => {
  assert.notEqual(checkActiveHost({ env: {}, hostname: () => 'caelus-mini.local' }).reason, 'current_unparseable')
  assert.notEqual(checkActiveHost({ env: {}, hostname: () => 'caelus-mini.local' }).reason, 'file_unreadable')
})
