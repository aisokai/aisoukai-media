import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { prepareMwfCheckout } from '../scripts/ops-mwf.mjs'

const target = 'a'.repeat(40)
function fixture(overrides = {}, pathExists = () => false) {
  const calls = []
  const responses = {
    'branch --show-current': 'main\n',
    'rev-parse --git-path index.lock': '.git/index.lock\n',
    'fetch --quiet origin main': '',
    'rev-list --left-right --count HEAD...origin/main': '0\t3\n',
    'rev-parse --verify origin/main^{commit}': `${target}\n`,
    'status --porcelain --untracked-files=all': '',
    [`-c merge.autostash=false merge --ff-only --no-edit ${target}`]: '',
    'rev-parse HEAD': `${target}\n`,
    ...overrides,
  }
  const result = prepareMwfCheckout({
    root: '/tmp/synthetic-mwf',
    pathExists,
    runCommand(command, args) {
      assert.equal(command, '/usr/bin/git')
      const key = args.join(' ')
      calls.push(key)
      assert.ok(Object.hasOwn(responses, key), `unexpected command: ${key}`)
      const value = typeof responses[key] === 'function' ? responses[key]() : responses[key]
      return typeof value === 'string' ? { ok: true, output: value } : value
    },
  })
  return { result, calls }
}

test('behind-only clean checkout fetches, fast-forwards the fetched SHA, and verifies HEAD and cleanliness', () => {
  const { result, calls } = fixture()
  assert.deepEqual(result, { ok: true, updated: true, head: target })
  assert.deepEqual(calls, [
    'branch --show-current', 'rev-parse --git-path index.lock', 'fetch --quiet origin main',
    'rev-list --left-right --count HEAD...origin/main', 'rev-parse --verify origin/main^{commit}',
    'status --porcelain --untracked-files=all',
    `-c merge.autostash=false merge --ff-only --no-edit ${target}`,
    'rev-parse HEAD', 'status --porcelain --untracked-files=all',
  ])
})

test('aligned checkout preserves the existing owned-draft sync checks without merging', () => {
  const { result, calls } = fixture({ 'rev-list --left-right --count HEAD...origin/main': '0 0' })
  assert.deepEqual(result, { ok: true, updated: false })
  assert.equal(calls.some((value) => value.includes('merge')), false)
})

for (const [name, overrides] of Object.entries({
  detached: { 'branch --show-current': '' },
  branch: { 'branch --show-current': 'feature' },
  ahead: { 'rev-list --left-right --count HEAD...origin/main': '1 0' },
  diverged: { 'rev-list --left-right --count HEAD...origin/main': '1 2' },
  malformed: { 'rev-list --left-right --count HEAD...origin/main': '0 garbage' },
  tracked: { 'status --porcelain --untracked-files=all': ' M package.json\n' },
  staged: { 'status --porcelain --untracked-files=all': 'M  package.json\n' },
  untracked: { 'status --porcelain --untracked-files=all': '?? content/posts/2026-09-09-synthetic.md\n' },
  'invalid SHA': { 'rev-parse --verify origin/main^{commit}': 'not-a-sha' },
})) {
  test(`${name} fails closed without fast-forward`, () => {
    const { result, calls } = fixture(overrides)
    assert.equal(result.ok, false)
    assert.equal(calls.some((value) => value.startsWith('-c')), false)
  })
}

for (const command of [
  'branch --show-current', 'rev-parse --git-path index.lock', 'fetch --quiet origin main',
  'rev-list --left-right --count HEAD...origin/main', 'rev-parse --verify origin/main^{commit}',
  'status --porcelain --untracked-files=all',
]) {
  test(`failed ${command} prevents merge`, () => {
    const { result, calls } = fixture({ [command]: { ok: false, output: '' } })
    assert.equal(result.ok, false)
    assert.equal(calls.some((value) => value.startsWith('-c')), false)
  })
}

test('index lock is checked before fetch and again immediately before merge', () => {
  for (const lockedAt of [1, 2]) {
    let checks = 0
    const { result, calls } = fixture({}, (path) => {
      assert.equal(path, '/tmp/synthetic-mwf/.git/index.lock')
      checks += 1
      return checks === lockedAt
    })
    assert.equal(result.ok, false)
    assert.equal(calls.some((value) => value.startsWith('-c')), false)
    if (lockedAt === 1) assert.equal(calls.includes('fetch --quiet origin main'), false)
  }
})

test('merge failure, mismatched HEAD and dirty post-merge state never report success', () => {
  let statusChecks = 0
  for (const overrides of [
    { [`-c merge.autostash=false merge --ff-only --no-edit ${target}`]: { ok: false, output: '' } },
    { 'rev-parse HEAD': 'b'.repeat(40) },
    { 'rev-parse HEAD': { ok: false, output: '' } },
    { 'status --porcelain --untracked-files=all': () => ++statusChecks === 1 ? '' : ' M package.json' },
  ]) assert.equal(fixture(overrides).result.ok, false)
})

test('normal entry prepares before env/reconcile/generation; dry-run exits before any preparation', () => {
  const source = readFileSync(new URL('../scripts/ops-mwf.mjs', import.meta.url), 'utf8')
  const main = source.slice(source.indexOf('async function main()'))
  const prepare = main.indexOf('const preparation = prepareMwfCheckout()')
  assert.ok(main.indexOf('if (dryRun)') < prepare)
  assert.ok(main.indexOf('const runLock = acquireRunLock()') < prepare)
  assert.ok(prepare < main.indexOf('  loadEnv()'))
  assert.ok(prepare < main.indexOf('const reconciled = await reconcileBeforeGeneration'))
  assert.ok(prepare < main.indexOf('runScheduledArticle(resultPath)'))
  const preparationBlock = main.slice(prepare, main.indexOf('  loadEnv()'))
  assert.match(preparationBlock, /if \(!preparation.ok\)[\s\S]*console.error/)
  assert.doesNotMatch(preparationBlock, /\breturn\b|process.exit|throw|noGenerate\s*=/)
})

// Only synthetic source text and a local file-transport bare repository are used.
// Keep fixtures in tmp; never inherit user Git config, credentials or hooks.
function realGitFixture() {
  const root = mkdtempSync(join(tmpdir(), 'mwf-checkout-test-'))
  const remote = join(root, 'remote.git')
  const producer = join(root, 'producer')
  const checkout = join(root, 'checkout')
  const hooks = join(root, 'empty-hooks')
  mkdirSync(hooks)
  const env = {
    PATH: '/usr/bin:/bin', HOME: root,
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_TERMINAL_PROMPT: '0', GIT_AUTHOR_NAME: 'Synthetic Test',
    GIT_AUTHOR_EMAIL: 'synthetic@example.invalid', GIT_COMMITTER_NAME: 'Synthetic Test',
    GIT_COMMITTER_EMAIL: 'synthetic@example.invalid',
  }
  const run = (cwd, args) => {
    const value = spawnSync('/usr/bin/git', [
      '-c', `core.hooksPath=${hooks}`, '-c', 'protocol.allow=never',
      '-c', 'protocol.file.allow=always', ...args,
    ], { cwd, env, encoding: 'utf8' })
    return { ok: value.status === 0 && !value.error, output: value.status === 0 ? (value.stdout ?? '') : `${value.stdout ?? ''}${value.stderr ?? ''}` }
  }
  const git = (cwd, args) => {
    const value = run(cwd, args)
    assert.equal(value.ok, true, `synthetic Git failed: ${args.join(' ')}: ${value.output}`)
    return value.output.trim()
  }
  git(root, ['init', '--bare', '--initial-branch=main', remote])
  git(root, ['init', '--initial-branch=main', producer])
  writeFileSync(join(producer, 'source.txt'), 'synthetic initial source\n')
  git(producer, ['add', '--', 'source.txt'])
  git(producer, ['commit', '-m', 'synthetic initial commit'])
  git(producer, ['remote', 'add', 'origin', remote])
  git(producer, ['push', 'origin', 'main'])
  git(root, ['clone', remote, checkout])
  const advance = (iteration) => {
    writeFileSync(join(producer, `advance-${iteration}.txt`), `synthetic advance ${iteration}\n`)
    git(producer, ['add', '--', `advance-${iteration}.txt`])
    git(producer, ['commit', '-m', `synthetic advance ${iteration}`])
    git(producer, ['push', 'origin', 'main'])
    return git(producer, ['rev-parse', 'HEAD'])
  }
  const prepare = () => prepareMwfCheckout({
    root: checkout, pathExists: existsSync,
    runCommand(command, args) {
      assert.equal(command, '/usr/bin/git')
      return run(checkout, args)
    },
  })
  return { root, checkout, git, advance, prepare }
}

test('real Git: successive remote advances each fast-forward and end exactly aligned', () => {
  const { checkout, git, advance, prepare } = realGitFixture()
  for (const iteration of [1, 2]) {
    const expected = advance(iteration)
    assert.notEqual(git(checkout, ['rev-parse', 'HEAD']), expected)
    assert.deepEqual(prepare(), { ok: true, updated: true, head: expected })
    assert.equal(git(checkout, ['rev-parse', 'HEAD']), expected)
    assert.equal(git(checkout, ['rev-list', '--left-right', '--count', 'HEAD...origin/main']), '0\t0')
    assert.equal(git(checkout, ['status', '--porcelain']), '')
  }
  assert.deepEqual(prepare(), { ok: true, updated: false })
})

for (const kind of ['tracked', 'untracked', 'diverged']) {
  test(`real Git: ${kind} behind checkout retains local state and HEAD`, () => {
    const { checkout, git, advance, prepare } = realGitFixture()
    const filename = kind === 'tracked' ? 'source.txt' : 'local-only.txt'
    const content = `synthetic ${kind} local work\n`
    writeFileSync(join(checkout, filename), content)
    if (kind === 'diverged') {
      git(checkout, ['add', '--', filename])
      git(checkout, ['commit', '-m', 'synthetic local commit'])
    }
    const originalHead = git(checkout, ['rev-parse', 'HEAD'])
    const originalStatus = git(checkout, ['status', '--porcelain'])
    advance(1)
    assert.equal(prepare().ok, false)
    assert.equal(git(checkout, ['rev-parse', 'HEAD']), originalHead)
    assert.equal(git(checkout, ['status', '--porcelain']), originalStatus)
    assert.equal(readFileSync(join(checkout, filename), 'utf8'), content)
  })
}

test('real Git: unavailable file remote fails fetch without changing HEAD or working tree', () => {
  const { root, checkout, git, advance, prepare } = realGitFixture()
  advance(1)
  const originalHead = git(checkout, ['rev-parse', 'HEAD'])
  git(checkout, ['remote', 'set-url', 'origin', join(root, 'absent-remote.git')])
  assert.equal(prepare().ok, false)
  assert.equal(git(checkout, ['rev-parse', 'HEAD']), originalHead)
  assert.equal(git(checkout, ['status', '--porcelain']), '')
  assert.equal(existsSync(join(checkout, 'advance-1.txt')), false)
})
