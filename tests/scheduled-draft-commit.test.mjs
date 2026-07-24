import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  classifyOwnedDraftStatus,
  commitOwnedGeneratedDraft,
  recoverOwnedGeneratedDraft,
} from '../scripts/lib/scheduled-draft-commit.mjs'

const path = 'content/posts/2026-07-24-topic-0123456789abcdef.md'
const marker = { version: 1, path, slug: '2026-07-24-topic-0123456789abcdef' }

function successfulGitRunner(calls, { untrackedStatusCalls = 1 } = {}) {
  let statusCalls = 0
  return (command, args) => {
    calls.push([command, ...args])
    if (command === 'git' && args[0] === 'status') {
      statusCalls += 1
      return { ok: true, output: statusCalls <= untrackedStatusCalls ? `?? ${path}` : '' }
    }
    if (command === 'npm') return { ok: true, output: '' }
    if (command === 'git' && args[0] === 'add') return { ok: true, output: '' }
    if (command === 'git' && args[0] === 'diff') return { ok: true, output: path }
    if (command === 'git' && args[0] === 'commit') return { ok: true, output: '' }
    throw new Error(`unexpected command: ${command} ${args.join(' ')}`)
  }
}

test('owned generated draft accepts only one exact untracked post and local-commits it', () => {
  const calls = []
  const result = commitOwnedGeneratedDraft({ marker, runCommand: successfulGitRunner(calls) })

  assert.equal(result.ok, true)
  assert.equal(result.committed, true)
  assert.ok(calls.some((call) => call.join(' ') === `git add -- ${path}`))
  assert.ok(calls.some((call) => call.join(' ') === `git commit -m draft: ${marker.slug}`))
  assert.equal(calls.some((call) => call[0] === 'git' && call[1] === 'push'), false)
})

test('user dirty changes are rejected without validation, staging, commit, or external send', () => {
  const calls = []
  const result = commitOwnedGeneratedDraft({
    marker,
    runCommand: (command, args) => {
      calls.push([command, ...args])
      return { ok: true, output: ' M README.md' }
    },
  })

  assert.equal(result.ok, false)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].join(' '), 'git status --porcelain')
})

test('midway staging failure leaves an owned marker for a later safe recovery', () => {
  const root = mkdtempSync(join(tmpdir(), 'aisoukai-owned-draft-'))
  mkdirSync(join(root, 'logs'))
  writeFileSync(join(root, 'logs', 'ops-mwf-owned-draft.json'), `${JSON.stringify(marker)}\n`)
  const calls = []
  const result = recoverOwnedGeneratedDraft({
    root,
    runCommand: (command, args) => {
      calls.push([command, ...args])
      if (command === 'git' && args[0] === 'status') return { ok: true, output: `?? ${path}` }
      if (command === 'npm') return { ok: true, output: '' }
      if (command === 'git' && args[0] === 'add') return { ok: false, output: 'index lock' }
      throw new Error(`unexpected command: ${command} ${args.join(' ')}`)
    },
  })

  assert.equal(result.ok, false)
  assert.equal(result.committed, false)
  assert.equal(existsSync(join(root, 'logs', 'ops-mwf-owned-draft.json')), true)
  assert.equal(calls.some((call) => call[0] === 'git' && call[1] === 'commit'), false)
  assert.equal(calls.some((call) => call[0] === 'git' && call[1] === 'push'), false)
})

test('owned draft recovery requires a clean remote preflight before validation, staging, or commit', () => {
  const root = mkdtempSync(join(tmpdir(), 'aisoukai-owned-draft-'))
  mkdirSync(join(root, 'logs'))
  writeFileSync(join(root, 'logs', 'ops-mwf-owned-draft.json'), `${JSON.stringify(marker)}\n`)
  const calls = []
  const result = recoverOwnedGeneratedDraft({
    root,
    runCommand: (command, args) => {
      calls.push([command, ...args])
      if (command === 'git' && args[0] === 'status') return { ok: true, output: `?? ${path}` }
      throw new Error(`unexpected command: ${command} ${args.join(' ')}`)
    },
    assertGitReady: () => ({ ok: false, reason: 'origin/main の取得に失敗しました' }),
  })

  assert.equal(result.ok, false)
  assert.match(result.reason, /Git同期が安全でない/)
  assert.equal(existsSync(join(root, 'logs', 'ops-mwf-owned-draft.json')), true)
  assert.equal(calls.some((call) => call[0] === 'npm'), false)
  assert.equal(calls.some((call) => call[1] === 'add' || call[1] === 'commit' || call[1] === 'push'), false)
})

test('legacy ops provenance can be adopted only for one exact untracked generated draft', () => {
  const root = mkdtempSync(join(tmpdir(), 'aisoukai-legacy-draft-'))
  mkdirSync(join(root, 'logs'))
  writeFileSync(join(root, 'logs', 'ops-mwf.log'), `生成記事: ${path}\n`)
  const calls = []
  const result = recoverOwnedGeneratedDraft({ root, runCommand: successfulGitRunner(calls, { untrackedStatusCalls: 2 }) })

  assert.equal(result.ok, true)
  assert.equal(result.recovered, true)
  assert.equal(result.adoptedLegacyDraft, true)
  assert.equal(existsSync(join(root, 'logs', 'ops-mwf-owned-draft.json')), false)
})

test('owned draft status parser accepts neither mixed nor unsafe index states', () => {
  assert.equal(classifyOwnedDraftStatus(`?? ${path}`, path), 'untracked')
  assert.equal(classifyOwnedDraftStatus(`A  ${path}`, path), 'staged')
  assert.equal(classifyOwnedDraftStatus(`?? ${path}\n M README.md`, path), null)
  assert.equal(classifyOwnedDraftStatus(` M ${path}`, path), null)
})
