import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { canSkipStateOnlyBuild } from '../scripts/vercel-ignore-state-only.mjs'

const script = fileURLToPath(new URL('../scripts/vercel-ignore-state-only.mjs', import.meta.url))
const request = `data/mwf/requests/${'a'.repeat(64)}.json`
const claim = `data/mwf/claims/${'b'.repeat(64)}.json`
// All contents are synthetic; fixtures are retained, with no destructive cleanup.
const env = { PATH: '/usr/bin:/bin:/usr/local/bin', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0' }
function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), 'mwf-ignore-test-'))
  const git = (...args) => {
    const result = spawnSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', '-c', 'user.name=Synthetic', '-c', 'user.email=synthetic@example.invalid', ...args], { cwd, env, encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    return result.stdout.trim()
  }
  git('init', '-q')
  const commit = (path, content = 'synthetic\n') => {
    mkdirSync(dirname(join(cwd, path)), { recursive: true })
    writeFileSync(join(cwd, path), content)
    git('add', '--', path)
    git('commit', '-qm', 'synthetic fixture')
    return git('rev-parse', 'HEAD')
  }
  const previousSha = commit('app.mjs')
  const options = currentSha => ({ cwd, previousSha, currentSha, vercel: '1', environment: 'production', branch: 'main' })
  return { cwd, git, commit, previousSha, options }
}

test('skips request, claim and completed claim cumulatively since last successful deployment', () => {
  const f = fixture()
  assert.equal(canSkipStateOnlyBuild(f.options(f.commit(request, '{"synthetic":"request"}'))), true)
  assert.equal(canSkipStateOnlyBuild(f.options(f.commit(claim, '{"synthetic":"claimed"}'))), true)
  assert.equal(canSkipStateOnlyBuild(f.options(f.commit(claim, '{"synthetic":"done"}'))), true)
})

test('builds when a previous undeployed commit changed code, even if HEAD changed only state', () => {
  const f = fixture()
  f.commit('app.mjs', 'synthetic revision\n')
  assert.equal(canSkipStateOnlyBuild(f.options(f.commit(request))), false)
})

test('builds for articles, policy, adoption, inventory, proposals, assets and malformed state paths', () => {
  for (const path of ['content/posts/synthetic.md', 'data/editorial-policy.json', 'data/topic-adoptions/synthetic.json', `data/mwf/inventories/${'c'.repeat(64)}.json`, `data/mwf/proposals/${'c'.repeat(64)}.json`, 'public/synthetic.svg', 'next.config.ts', 'vercel.json', 'data/mwf/requests/unknown.json', `${request}.backup`, `data/mwf/claims/nested/${'b'.repeat(64)}.json`, `${claim}\n`]) {
    const f = fixture()
    f.commit(request)
    assert.equal(canSkipStateOnlyBuild(f.options(f.commit(path))), false, path)
  }
})

test('initial, unknown, identical, mismatched SHA and non-production/main always build', () => {
  const f = fixture(), current = f.commit(request), options = f.options(current)
  for (const override of [{ previousSha: undefined }, { previousSha: '' }, { previousSha: 'f'.repeat(40) }, { previousSha: current }, { previousSha: '--help' }, { currentSha: f.previousSha }, { currentSha: '' }, { vercel: undefined }, { environment: 'preview' }, { branch: 'feature' }, { git: '/nonexistent/synthetic-git' }]) {
    assert.equal(canSkipStateOnlyBuild({ ...options, ...override }), false)
  }
})

test('diverged history builds and no ancestor fetch is attempted', () => {
  const f = fixture(), deployed = f.commit(claim)
  f.git('checkout', '-qb', 'synthetic-diverged', f.previousSha)
  const current = f.commit(request)
  assert.equal(canSkipStateOnlyBuild({ ...f.options(current), previousSha: deployed }), false)
})

test('empty net diff, symlinks and executable mode changes build', () => {
  const f = fixture()
  f.commit(request, 'temporary synthetic\n')
  const deployed = f.commit(request, 'original synthetic\n')
  f.commit(request, 'changed synthetic\n')
  const reverted = f.commit(request, 'original synthetic\n')
  assert.equal(canSkipStateOnlyBuild({ ...f.options(reverted), previousSha: deployed }), false)
  const symbolic = fixture()
  mkdirSync(dirname(join(symbolic.cwd, request)), { recursive: true })
  symlinkSync('../../../app.mjs', join(symbolic.cwd, request))
  symbolic.git('add', '--', request)
  symbolic.git('commit', '-qm', 'synthetic symlink')
  assert.equal(canSkipStateOnlyBuild(symbolic.options(symbolic.git('rev-parse', 'HEAD'))), false)
  const executable = fixture()
  const base = executable.commit(request)
  executable.git('update-index', '--chmod=+x', '--', request)
  executable.git('commit', '-qm', 'synthetic mode')
  assert.equal(canSkipStateOnlyBuild({ ...executable.options(executable.git('rev-parse', 'HEAD')), previousSha: base }), false)
})

test('vercel.json invokes CLI with correct 0=skip and 1=build exit semantics', () => {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
  assert.equal(config.ignoreCommand, 'node scripts/vercel-ignore-state-only.mjs')
  const f = fixture(), current = f.commit(request)
  const invoke = previous => spawnSync(process.execPath, [script], { cwd: f.cwd, env: { ...env, VERCEL: '1', VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_REF: 'main', VERCEL_GIT_COMMIT_SHA: current, VERCEL_GIT_PREVIOUS_SHA: previous }, encoding: 'utf8' })
  assert.equal(invoke(f.previousSha).status, 0)
  assert.equal(invoke('').status, 1)
})
