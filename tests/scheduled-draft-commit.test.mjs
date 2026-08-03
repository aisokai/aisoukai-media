import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  classifyOwnedDraftStatus,
  recoverOwnedGeneratedDraft,
  rememberGeneratedDraft,
} from '../scripts/lib/scheduled-draft-commit.mjs'

const path = 'content/posts/2026-07-24-topic-0123456789abcdef.md'
const slug = '2026-07-24-topic-0123456789abcdef'
const safeDraft = `---
title: Safe draft
reviewed: false
draft: true
auto_approved: false
medical_risk: high
---
Draft body
`

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function markerV2(content = safeDraft) {
  return { version: 2, path, slug, contentSha256: sha256(content) }
}

function makeRoot({ content = safeDraft, marker = null, createPost = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'aisoukai-owned-draft-'))
  mkdirSync(join(root, 'logs'), { recursive: true })
  mkdirSync(join(root, 'content', 'posts'), { recursive: true })
  if (createPost) writeFileSync(join(root, path), content)
  if (marker) {
    writeFileSync(join(root, 'logs', 'ops-mwf-owned-draft.json'), `${JSON.stringify(marker)}\n`)
  }
  return root
}

function successfulCommitRunner(calls, {
  staged = false,
  afterStatus = '',
  currentBlob = 'owned-blob',
  stagedBlob = 'owned-blob',
  committedBlob = 'owned-blob',
  preCommitHead = 'pre-commit-head',
  newHead = 'new-commit-head',
  parentHead = 'pre-commit-head',
  changedPaths = path,
} = {}) {
  let statusCalls = 0
  let plainHeadCalls = 0
  return (command, args) => {
    calls.push([command, ...args])
    if (command === 'git' && args[0] === 'status') {
      statusCalls += 1
      return {
        ok: true,
        output: statusCalls === 1
          ? `${staged ? 'A ' : '??'} ${path}\n?? logs/ops-mwf-owned-draft.json`
          : afterStatus,
      }
    }
    if (command === 'npm') return { ok: true, output: '' }
    if (command === 'git' && args[0] === 'add') return { ok: true, output: '' }
    if (command === 'git' && args[0] === 'diff') return { ok: true, output: path }
    if (command === 'git' && args[0] === 'hash-object') return { ok: true, output: currentBlob }
    if (command === 'git' && args[0] === 'rev-parse' && args[1] === `:${path}`) {
      return { ok: true, output: stagedBlob }
    }
    if (command === 'git' && args[0] === 'rev-parse' && args[1] === 'HEAD') {
      plainHeadCalls += 1
      return { ok: true, output: plainHeadCalls === 1 ? preCommitHead : newHead }
    }
    if (command === 'git' && args[0] === 'rev-parse' && args[1] === `${newHead}^`) {
      return { ok: true, output: parentHead }
    }
    if (command === 'git' && args[0] === 'rev-parse' && args[1] === `${newHead}:${path}`) {
      return { ok: true, output: committedBlob }
    }
    if (command === 'git' && args[0] === 'diff-tree') return { ok: true, output: changedPaths }
    if (command === 'git' && args[0] === 'commit') return { ok: true, output: '' }
    throw new Error(`unexpected command: ${command} ${args.join(' ')}`)
  }
}

function trackedCleanRunner(calls, { status = '', blob = '0123456789abcdef' } = {}) {
  return (command, args) => {
    calls.push([command, ...args])
    if (command === 'git' && args[0] === 'status') return { ok: true, output: status }
    if (command === 'git' && args[0] === 'ls-files') return { ok: true, output: path }
    if (command === 'git' && args[0] === 'diff' && args[1] === '--quiet') return { ok: true, output: '' }
    if (command === 'git' && args[0] === 'hash-object') return { ok: true, output: blob }
    if (command === 'git' && args[0] === 'rev-parse') return { ok: true, output: blob }
    throw new Error(`unexpected command: ${command} ${args.join(' ')}`)
  }
}

test('new marker persists an exact SHA-256 identity and exact owned untracked draft commits locally', () => {
  const root = makeRoot()
  const remembered = rememberGeneratedDraft({
    root,
    scheduledResult: { generated: true, path, slug },
  })
  assert.equal(remembered.ok, true)
  assert.deepEqual(remembered.marker, markerV2())
  assert.deepEqual(
    JSON.parse(readFileSync(join(root, 'logs', 'ops-mwf-owned-draft.json'), 'utf8')),
    markerV2(),
  )

  const calls = []
  const result = recoverOwnedGeneratedDraft({
    root,
    runCommand: successfulCommitRunner(calls),
    assertGitReady: () => ({ ok: true }),
  })

  assert.equal(result.ok, true)
  assert.equal(result.committed, true)
  assert.equal(result.recovered, true)
  assert.equal(existsSync(join(root, 'logs', 'ops-mwf-owned-draft.json')), false)
  assert.ok(calls.some((call) => call.join(' ') === `git add -- ${path}`))
  assert.ok(calls.some((call) => call.join(' ') === `git commit -m draft: ${slug}`))
  assert.equal(calls.filter((call) => call.join(' ') === 'git rev-parse HEAD').length, 2)
  assert.ok(calls.some((call) => call.join(' ') === 'git rev-parse new-commit-head^'))
  assert.ok(calls.some((call) => call.join(' ') === `git diff-tree --no-commit-id --name-only -r new-commit-head`))
  assert.ok(calls.some((call) => call.join(' ') === `git rev-parse new-commit-head:${path}`))
  assert.equal(calls.some((call) => call[0] === 'git' && call[1] === 'push'), false)
})

test('tracked-clean hash marker is reconciled only after remote preflight and exact HEAD blob match', () => {
  const root = makeRoot({ marker: markerV2() })
  const calls = []
  let preflightDone = false
  const result = recoverOwnedGeneratedDraft({
    root,
    assertGitReady: () => {
      preflightDone = true
      return { ok: true }
    },
    runCommand: (command, args) => {
      assert.equal(preflightDone, true)
      return trackedCleanRunner(calls)(command, args)
    },
  })

  assert.equal(result.ok, true)
  assert.equal(result.committed, true)
  assert.equal(result.alreadyCommitted, true)
  assert.equal(result.recovered, true)
  assert.equal(existsSync(join(root, 'logs', 'ops-mwf-owned-draft.json')), false)
  assert.ok(calls.some((call) => call.join(' ') === `git diff --quiet HEAD -- ${path}`))
  assert.ok(calls.some((call) => call.join(' ') === `git rev-parse HEAD:${path}`))
  assert.equal(calls.some((call) => call[0] === 'npm' || call[1] === 'commit'), false)
})

test('tracked-clean marker hash mismatch fails closed and retains marker', () => {
  const root = makeRoot({ marker: markerV2('different content') })
  const calls = []
  const result = recoverOwnedGeneratedDraft({
    root,
    runCommand: trackedCleanRunner(calls),
    assertGitReady: () => ({ ok: true }),
  })

  assert.equal(result.ok, false)
  assert.match(result.reason, /content hash/)
  assert.equal(existsSync(join(root, 'logs', 'ops-mwf-owned-draft.json')), true)
  assert.equal(calls.some((call) => call[1] === 'commit'), false)
})

test('legacy marker reconciles once only for a tracked-clean fail-closed unapproved draft', () => {
  const legacy = { version: 1, path, slug }
  const root = makeRoot({ marker: legacy })
  const calls = []
  const result = recoverOwnedGeneratedDraft({
    root,
    runCommand: trackedCleanRunner(calls),
    assertGitReady: () => ({ ok: true }),
  })

  assert.equal(result.ok, true)
  assert.equal(result.alreadyCommitted, true)
  assert.equal(existsSync(join(root, 'logs', 'ops-mwf-owned-draft.json')), false)

  const second = recoverOwnedGeneratedDraft({
    root,
    runCommand: () => ({ ok: true, output: '' }),
  })
  assert.equal(second.ok, true)
  assert.equal(second.recovered, false)
})

test('legacy marker fails closed for approved or non-draft metadata and for uncommitted paths', () => {
  for (const content of [
    safeDraft.replace('reviewed: false', 'reviewed: true'),
    safeDraft.replace('draft: true', 'draft: false'),
    safeDraft.replace('auto_approved: false', 'auto_approved: true'),
  ]) {
    const root = makeRoot({ content, marker: { version: 1, path, slug } })
    const result = recoverOwnedGeneratedDraft({
      root,
      runCommand: trackedCleanRunner([]),
      assertGitReady: () => ({ ok: true }),
    })
    assert.equal(result.ok, false)
    assert.match(result.reason, /legacy marker/)
    assert.equal(existsSync(join(root, 'logs', 'ops-mwf-owned-draft.json')), true)
  }

  const root = makeRoot({ marker: { version: 1, path, slug } })
  const result = recoverOwnedGeneratedDraft({
    root,
    runCommand: (command, args) => {
      if (command === 'git' && args[0] === 'status') return { ok: true, output: `?? ${path}` }
      throw new Error('legacy untracked recovery must stop before side effects')
    },
    assertGitReady: () => ({ ok: true }),
  })
  assert.equal(result.ok, false)
  assert.match(result.reason, /legacy markerの未commit/)
})

test('exact owned staged hash-bearing draft can finish its interrupted local commit', () => {
  const root = makeRoot({ marker: markerV2() })
  const calls = []
  const result = recoverOwnedGeneratedDraft({
    root,
    runCommand: successfulCommitRunner(calls, { staged: true }),
    assertGitReady: () => ({ ok: true }),
  })

  assert.equal(result.ok, true)
  assert.equal(result.committed, true)
  assert.equal(calls.some((call) => call[1] === 'add'), false)
  assert.ok(calls.some((call) => call[1] === 'commit'))
})

test('staged owned path is retained without commit when its index blob differs from marker content', () => {
  const root = makeRoot({ marker: markerV2() })
  const calls = []
  const result = recoverOwnedGeneratedDraft({
    root,
    runCommand: successfulCommitRunner(calls, {
      staged: true,
      currentBlob: 'current-blob',
      stagedBlob: 'foreign-staged-blob',
    }),
    assertGitReady: () => ({ ok: true }),
  })

  assert.equal(result.ok, false)
  assert.match(result.reason, /stage済みdraftのblob/)
  assert.equal(calls.some((call) => call[1] === 'commit'), false)
  assert.equal(existsSync(join(root, 'logs', 'ops-mwf-owned-draft.json')), true)
})

test('post-commit verification retains marker for foreign path, owned blob, or parent mismatch', () => {
  const cases = [
    {
      options: { changedPaths: `${path}\nREADME.md` },
      reason: /管理対象draft以外のpath/,
    },
    {
      options: { committedBlob: 'hook-rewritten-blob' },
      reason: /commit済みdraftのblob/,
    },
    {
      options: { parentHead: 'concurrent-parent' },
      reason: /parentがcommit前HEADと一致しない/,
    },
  ]

  for (const { options, reason } of cases) {
    const root = makeRoot({ marker: markerV2() })
    const calls = []
    const result = recoverOwnedGeneratedDraft({
      root,
      runCommand: successfulCommitRunner(calls, options),
      assertGitReady: () => ({ ok: true }),
    })

    assert.equal(result.ok, false)
    assert.equal(result.committed, true)
    assert.match(result.reason, reason)
    assert.equal(existsSync(join(root, 'logs', 'ops-mwf-owned-draft.json')), true)
    assert.ok(calls.some((call) => call[1] === 'commit'))
  }
})

test('dirty owned path and foreign dirty, untracked, or staged paths all fail closed', () => {
  for (const status of [
    ` M ${path}`,
    ' M README.md',
    '?? content/posts/foreign.md',
    'A  content/posts/foreign.md',
    `?? ${path}\n M README.md`,
  ]) {
    const root = makeRoot({ marker: markerV2() })
    const calls = []
    const result = recoverOwnedGeneratedDraft({
      root,
      runCommand: (command, args) => {
        calls.push([command, ...args])
        if (command === 'git' && args[0] === 'status') return { ok: true, output: status }
        throw new Error('unsafe status must stop before side effects')
      },
      assertGitReady: () => ({ ok: true }),
    })
    assert.equal(result.ok, false, status)
    assert.equal(existsSync(join(root, 'logs', 'ops-mwf-owned-draft.json')), true)
    assert.equal(calls.length, 1)
  }
})

test('traversal, malformed hash, and missing owned file fail closed without cleanup', () => {
  for (const invalidMarker of [
    { version: 2, path: '../outside.md', slug: 'outside', contentSha256: 'a'.repeat(64) },
    { version: 2, path, slug, contentSha256: 'not-a-hash' },
  ]) {
    const root = makeRoot({ marker: invalidMarker })
    const calls = []
    const result = recoverOwnedGeneratedDraft({
      root,
      runCommand: (...args) => {
        calls.push(args)
        return { ok: true, output: '' }
      },
    })
    assert.equal(result.ok, false)
    assert.match(result.reason, /markerが不正/)
    assert.equal(calls.length, 0)
    assert.equal(existsSync(join(root, 'logs', 'ops-mwf-owned-draft.json')), true)
  }

  const missingRoot = makeRoot({ marker: markerV2(), createPost: false })
  const missing = recoverOwnedGeneratedDraft({
    root: missingRoot,
    runCommand: (command, args) => {
      if (command === 'git' && args[0] === 'status') return { ok: true, output: '' }
      throw new Error('missing file must stop before Git identity calls')
    },
    assertGitReady: () => ({ ok: true }),
  })
  assert.equal(missing.ok, false)
  assert.match(missing.reason, /見つからない/)
  assert.equal(existsSync(join(missingRoot, 'logs', 'ops-mwf-owned-draft.json')), true)
})

test('remote preflight failure and post-commit foreign change both retain recovery marker', () => {
  const preflightRoot = makeRoot({ marker: markerV2() })
  const preflightCalls = []
  const preflight = recoverOwnedGeneratedDraft({
    root: preflightRoot,
    runCommand: (...args) => {
      preflightCalls.push(args)
      return { ok: true, output: `?? ${path}` }
    },
    assertGitReady: () => ({ ok: false, reason: 'origin/main の取得に失敗しました' }),
  })
  assert.equal(preflight.ok, false)
  assert.match(preflight.reason, /Git同期が安全でない/)
  assert.equal(preflightCalls.length, 0)
  assert.equal(existsSync(join(preflightRoot, 'logs', 'ops-mwf-owned-draft.json')), true)

  const afterRoot = makeRoot({ marker: markerV2() })
  const after = recoverOwnedGeneratedDraft({
    root: afterRoot,
    runCommand: successfulCommitRunner([], { afterStatus: ' M README.md' }),
    assertGitReady: () => ({ ok: true }),
  })
  assert.equal(after.ok, false)
  assert.equal(after.committed, true)
  assert.equal(existsSync(join(afterRoot, 'logs', 'ops-mwf-owned-draft.json')), true)
})

test('markerless changes remain Human-only and path status parser rejects mixed states', () => {
  const root = makeRoot()
  const calls = []
  const result = recoverOwnedGeneratedDraft({
    root,
    runCommand: (command, args) => {
      calls.push([command, ...args])
      return { ok: true, output: `?? ${path}` }
    },
  })
  assert.equal(result.ok, false)
  assert.match(result.reason, /provenance markerがない/)
  assert.equal(calls.length, 1)

  assert.equal(classifyOwnedDraftStatus('', path), 'clean')
  assert.equal(classifyOwnedDraftStatus(`?? logs/ops-mwf-owned-draft.json`, path), 'clean')
  assert.equal(classifyOwnedDraftStatus(`?? ${path}`, path), 'untracked')
  assert.equal(classifyOwnedDraftStatus(`A  ${path}`, path), 'staged')
  assert.equal(classifyOwnedDraftStatus(`?? ${path}\n M README.md`, path), null)
  assert.equal(classifyOwnedDraftStatus(` M ${path}`, path), null)
})
