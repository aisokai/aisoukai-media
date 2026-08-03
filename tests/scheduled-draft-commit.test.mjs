import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  classifyOwnedDraftStatus,
  readOwnedGeneratedDraftLedger,
  recoverOwnedGeneratedDraft,
  rememberGeneratedDraft,
} from '../scripts/lib/scheduled-draft-commit.mjs'
import {
  buildScheduledFailureNotification,
  buildScheduledStockNotification,
  classifyScheduledDraftOutcome,
} from '../scripts/lib/scheduled-draft-notification.mjs'

const path1 = 'content/posts/2026-08-03-topic-0123456789abcdef.md'
const path2 = 'content/posts/2026-08-04-topic-fedcba9876543210.md'
const slug1 = path1.slice('content/posts/'.length, -3)
const slug2 = path2.slice('content/posts/'.length, -3)
const safeDraft = (title) => `---
title: ${title}
reviewed: false
draft: true
auto_approved: false
medical_risk: high
---
Draft body for ${title}
`

function hashes(content) {
  const buffer = Buffer.from(content)
  return {
    contentSha256: createHash('sha256').update(buffer).digest('hex'),
    gitBlob: createHash('sha1').update(`blob ${buffer.length}\0`).update(buffer).digest('hex'),
  }
}

function entry(path, content) {
  return {
    path,
    slug: path.slice('content/posts/'.length, -3),
    ...hashes(content),
    provenance: 'generated',
  }
}

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), 'aisoukai-ledger-'))
  mkdirSync(join(root, 'logs'), { recursive: true })
  mkdirSync(join(root, 'content', 'posts'), { recursive: true })
  return root
}

function writePost(root, path, content) {
  writeFileSync(join(root, path), content)
}

function ledgerFile(root) {
  return join(root, 'logs', 'ops-mwf-owned-draft.json')
}

function commitRunner(calls, entries, {
  initialStatus,
  afterStatus = '',
  trackedBlobOverrides = {},
  stagedBlobOverrides = {},
  committedBlobOverrides = {},
  changedPaths = null,
  parentHead = null,
} = {}) {
  let statusCalls = 0
  let headCalls = 0
  const preHead = 'a'.repeat(40)
  const newHead = 'b'.repeat(40)
  return (command, args) => {
    calls.push([command, ...args])
    if (command === 'git' && args[0] === 'status') {
      statusCalls += 1
      return { ok: true, output: statusCalls === 1 ? initialStatus : afterStatus }
    }
    if (command === 'git' && args[0] === 'ls-files') {
      const path = args.at(-1)
      return { ok: true, output: path }
    }
    if (command === 'git' && args[0] === 'diff' && args[1] === '--quiet') return { ok: true, output: '' }
    if (command === 'npm') return { ok: true, output: '' }
    if (command === 'git' && args[0] === 'add') return { ok: true, output: '' }
    if (command === 'git' && args[0] === 'diff' && args[1] === '--cached') {
      return { ok: true, output: entries.filter((item) => initialStatus.includes(item.path)).map((item) => item.path).join('\n') }
    }
    if (command === 'git' && args[0] === 'rev-parse' && String(args[1]).startsWith(':')) {
      const path = String(args[1]).slice(1)
      const item = entries.find((candidate) => candidate.path === path)
      return { ok: true, output: stagedBlobOverrides[path] ?? item.gitBlob }
    }
    if (command === 'git' && args[0] === 'rev-parse' && args[1] === 'HEAD') {
      headCalls += 1
      return { ok: true, output: headCalls === 1 ? preHead : newHead }
    }
    if (command === 'git' && args[0] === 'rev-parse' && args[1] === `${newHead}^`) {
      return { ok: true, output: parentHead ?? preHead }
    }
    if (command === 'git' && args[0] === 'rev-parse' && String(args[1]).startsWith('HEAD:')) {
      const path = String(args[1]).slice('HEAD:'.length)
      const item = entries.find((candidate) => candidate.path === path)
      return { ok: true, output: trackedBlobOverrides[path] ?? item.gitBlob }
    }
    if (command === 'git' && args[0] === 'rev-parse' && String(args[1]).startsWith(`${newHead}:`)) {
      const path = String(args[1]).slice(newHead.length + 1)
      const item = entries.find((candidate) => candidate.path === path)
      return { ok: true, output: committedBlobOverrides[path] ?? item.gitBlob }
    }
    if (command === 'git' && args[0] === 'commit') return { ok: true, output: '' }
    if (command === 'git' && args[0] === 'diff-tree') {
      return {
        ok: true,
        output: changedPaths ?? entries.filter((item) => initialStatus.includes(item.path)).map((item) => item.path).join('\n'),
      }
    }
    throw new Error(`unexpected command: ${command} ${args.join(' ')}`)
  }
}

test('version 3 ledger retains multiple pending drafts and is path/hash idempotent', () => {
  const root = makeRoot()
  writePost(root, path1, safeDraft('one'))
  writePost(root, path2, safeDraft('two'))
  const first = rememberGeneratedDraft({ root, scheduledResult: { path: path1, slug: slug1 } })
  const second = rememberGeneratedDraft({ root, scheduledResult: { path: path2, slug: slug2 } })
  const again = rememberGeneratedDraft({ root, scheduledResult: { path: path1, slug: slug1 } })

  assert.equal(first.stocked, true)
  assert.equal(second.ledger.entries.length, 2)
  assert.equal(again.idempotent, true)
  assert.equal(readOwnedGeneratedDraftLedger(root).entries.length, 2)
  assert.deepEqual(JSON.parse(readFileSync(ledgerFile(root), 'utf8')), {
    version: 3,
    entries: [entry(path1, safeDraft('one')), entry(path2, safeDraft('two'))],
  })
})

test('initial durable ledger write or rename failure never throws and classifies as a plain stock failure', () => {
  const writers = [
    { writeFileSync: () => { throw new Error('injected write failure') } },
    { renameSync: () => { throw new Error('injected rename failure') } },
  ]
  for (const ledgerIo of writers) {
    const root = makeRoot()
    writePost(root, path1, safeDraft('one'))
    const result = rememberGeneratedDraft({
      root,
      scheduledResult: { path: path1, slug: slug1 },
      ledgerIo,
    })
    assert.equal(result.ok, false)
    assert.equal(result.stocked, false)
    assert.match(result.reason, /ledgerの書き込みに失敗/)
    const outcome = classifyScheduledDraftOutcome({
      childStatus: 0,
      scheduledResult: { ok: true, generated: true },
      stockResult: result,
    })
    assert.equal(outcome.kind, 'incident')
    assert.equal(outcome.exitCode, 1)
    assert.equal(buildScheduledFailureNotification(), '記事ストックを更新できませんでした。次回再試行します。')
  }
})

test('non-directory logs root returns structured initial stock failure without throwing', () => {
  const root = mkdtempSync(join(tmpdir(), 'aisoukai-invalid-logs-'))
  mkdirSync(join(root, 'content', 'posts'), { recursive: true })
  writeFileSync(join(root, 'logs'), 'not a directory')
  writePost(root, path1, safeDraft('one'))
  const result = rememberGeneratedDraft({ root, scheduledResult: { path: path1, slug: slug1 } })
  assert.equal(result.ok, false)
  assert.equal(result.stocked, false)
  assert.match(result.reason, /ledgerの書き込みに失敗/)
})

test('post-stock cleanup I/O failure stays pending, retains ledger, and uses plain pending copy', () => {
  const root = makeRoot()
  writePost(root, path1, safeDraft('one'))
  const stockResult = rememberGeneratedDraft({ root, scheduledResult: { path: path1, slug: slug1 } })
  const entries = readOwnedGeneratedDraftLedger(root).entries
  const draftSyncResult = recoverOwnedGeneratedDraft({
    root,
    assertGitReady: () => ({ ok: true }),
    ledgerIo: { unlinkSync: () => { throw new Error('injected cleanup failure') } },
    runCommand: commitRunner([], entries, { initialStatus: '' }),
  })
  assert.equal(draftSyncResult.ok, false)
  assert.equal(draftSyncResult.pendingSync, true)
  assert.equal(draftSyncResult.committed, true)
  assert.equal(existsSync(ledgerFile(root)), true)
  const outcome = classifyScheduledDraftOutcome({
    childStatus: 0,
    scheduledResult: { ok: true, generated: true },
    stockResult,
    draftSyncResult,
  })
  assert.equal(outcome.kind, 'stocked-pending-sync')
  assert.equal(outcome.exitCode, 0)
  assert.equal(
    buildScheduledStockNotification({ outcome }),
    '新しい記事を1件ストックしました。管理画面への反映待ちです。',
  )
})

test('legacy v1 and v2 markers migrate without losing the unresolved entry', () => {
  for (const legacy of [
    { version: 1, path: path1, slug: slug1 },
    { version: 2, path: path1, slug: slug1, contentSha256: hashes(safeDraft('one')).contentSha256 },
  ]) {
    const root = makeRoot()
    writePost(root, path1, safeDraft('one'))
    writePost(root, path2, safeDraft('two'))
    writeFileSync(ledgerFile(root), `${JSON.stringify(legacy)}\n`)
    const result = rememberGeneratedDraft({ root, scheduledResult: { path: path2, slug: slug2 } })
    assert.equal(result.ok, true)
    assert.equal(result.migrated, true)
    assert.deepEqual(result.ledger.entries.map((item) => item.path), [path1, path2])
    assert.equal(result.ledger.entries.every((item) => item.contentSha256 && item.gitBlob), true)
    assert.equal(result.ledger.entries[0].provenance, legacy.version === 2 ? 'legacy-v2' : 'legacy-v1')
    assert.equal(result.ledger.entries[1].provenance, 'generated')
  }
})

test('legacy migration write failure is structured and preserves the raw marker', () => {
  const root = makeRoot()
  const content = safeDraft('one')
  writePost(root, path1, content)
  const legacy = `${JSON.stringify({
    version: 2,
    path: path1,
    slug: slug1,
    contentSha256: hashes(content).contentSha256,
  })}\n`
  writeFileSync(ledgerFile(root), legacy)
  const calls = []
  const result = recoverOwnedGeneratedDraft({
    root,
    assertGitReady: () => ({ ok: true }),
    ledgerIo: { writeFileSync: () => { throw new Error('injected migration write failure') } },
    runCommand: (...args) => {
      calls.push(args)
      throw new Error('migration persistence must precede Git')
    },
  })
  assert.equal(result.ok, false)
  assert.equal(result.pendingSync, true)
  assert.match(result.reason, /ledgerの書き込みに失敗/)
  assert.equal(readFileSync(ledgerFile(root), 'utf8'), legacy)
  assert.equal(calls.length, 0)
})

test('legacy v1 untracked or staged drafts retain fail-closed provenance and never add or commit', () => {
  for (const status of [`?? ${path1}`, `A  ${path1}`]) {
    const root = makeRoot()
    writePost(root, path1, safeDraft('one'))
    writeFileSync(ledgerFile(root), `${JSON.stringify({ version: 1, path: path1, slug: slug1 })}\n`)
    const calls = []
    const result = recoverOwnedGeneratedDraft({
      root,
      assertGitReady: () => ({ ok: true }),
      runCommand: (command, args) => {
        calls.push([command, ...args])
        if (command === 'git' && args[0] === 'status') return { ok: true, output: status }
        throw new Error('legacy v1 uncommitted content must stop before Git mutation')
      },
    })

    assert.equal(result.ok, false, status)
    assert.match(result.reason, /legacy v1 marker由来/)
    assert.equal(result.pendingSync, true)
    assert.equal(calls.length, 1)
    assert.equal(calls.some((call) => call[1] === 'add' || call[1] === 'commit'), false)
    const retained = readOwnedGeneratedDraftLedger(root)
    assert.equal(retained.entries.length, 1)
    assert.equal(retained.entries[0].provenance, 'legacy-v1')
  }
})

test('legacy v2 valid hash migration remains eligible for exact owned local commit', () => {
  const root = makeRoot()
  const content = safeDraft('one')
  writePost(root, path1, content)
  writeFileSync(ledgerFile(root), `${JSON.stringify({
    version: 2,
    path: path1,
    slug: slug1,
    contentSha256: hashes(content).contentSha256,
  })}\n`)
  const migrated = readOwnedGeneratedDraftLedger(root)
  assert.equal(migrated.entries[0].provenance, 'legacy-v2')
  const calls = []
  const result = recoverOwnedGeneratedDraft({
    root,
    assertGitReady: () => ({ ok: true }),
    runCommand: commitRunner(calls, migrated.entries, { initialStatus: `?? ${path1}` }),
  })
  assert.equal(result.ok, true)
  assert.equal(result.committed, true)
  assert.equal(existsSync(ledgerFile(root)), false)
  assert.ok(calls.some((call) => call[1] === 'add'))
  assert.ok(calls.some((call) => call[1] === 'commit'))
})

test('unsafe path, collision, hash mismatch, and approved content fail closed without overwriting ledger', () => {
  const root = makeRoot()
  writePost(root, path1, safeDraft('one'))
  assert.equal(rememberGeneratedDraft({ root, scheduledResult: { path: '../escape.md', slug: 'escape' } }).ok, false)
  assert.equal(rememberGeneratedDraft({ root, scheduledResult: { path: path1, slug: slug1 } }).ok, true)
  const before = readFileSync(ledgerFile(root), 'utf8')

  writePost(root, path1, safeDraft('changed'))
  const collision = rememberGeneratedDraft({ root, scheduledResult: { path: path1, slug: slug1 } })
  assert.equal(collision.ok, false)
  assert.match(collision.reason, /同じpath/)
  assert.equal(readFileSync(ledgerFile(root), 'utf8'), before)

  const approvedRoot = makeRoot()
  writePost(approvedRoot, path1, safeDraft('one').replace('reviewed: false', 'reviewed: true'))
  assert.equal(rememberGeneratedDraft({ approvedRoot, root: approvedRoot, scheduledResult: { path: path1, slug: slug1 } }).ok, false)
})

test('malformed ledger, unsafe identity, and missing draft fail closed without Git calls or cleanup', () => {
  const cases = [
    {
      raw: '{not-json',
      createPost: true,
    },
    {
      raw: JSON.stringify({
        version: 3,
        entries: [{
          path: '../outside.md',
          slug: 'outside',
          contentSha256: 'a'.repeat(64),
          gitBlob: 'b'.repeat(40),
          provenance: 'generated',
        }],
      }),
      createPost: true,
    },
    {
      raw: JSON.stringify({ version: 3, entries: [entry(path1, safeDraft('one'))] }),
      createPost: false,
    },
  ]

  for (const { raw, createPost } of cases) {
    const root = makeRoot()
    if (createPost) writePost(root, path1, safeDraft('one'))
    writeFileSync(ledgerFile(root), `${raw}\n`)
    const calls = []
    const result = recoverOwnedGeneratedDraft({
      root,
      assertGitReady: () => ({ ok: true }),
      runCommand: (...args) => {
        calls.push(args)
        throw new Error('invalid ledger/draft must fail before Git')
      },
    })
    assert.equal(result.ok, false)
    assert.equal(calls.length, 0)
    assert.equal(existsSync(ledgerFile(root)), true)
  }
})

test('approved, published, auto-approved, or hash-altered ledger drafts fail closed before Git', () => {
  const unsafeContents = [
    safeDraft('one').replace('reviewed: false', 'reviewed: true'),
    safeDraft('one').replace('draft: true', 'draft: false'),
    safeDraft('one').replace('auto_approved: false', 'auto_approved: true'),
  ]
  for (const content of unsafeContents) {
    const root = makeRoot()
    writePost(root, path1, content)
    writeFileSync(ledgerFile(root), `${JSON.stringify({ version: 3, entries: [entry(path1, content)] })}\n`)
    const calls = []
    const result = recoverOwnedGeneratedDraft({
      root,
      assertGitReady: () => ({ ok: true }),
      runCommand: (...args) => {
        calls.push(args)
        throw new Error('unsafe article state must fail before Git')
      },
    })
    assert.equal(result.ok, false)
    assert.match(result.reason, /未承認draft条件/)
    assert.equal(calls.length, 0)
    assert.equal(existsSync(ledgerFile(root)), true)
  }

  const root = makeRoot()
  writePost(root, path1, safeDraft('one'))
  const mismatched = entry(path1, safeDraft('one'))
  mismatched.contentSha256 = 'f'.repeat(64)
  writeFileSync(ledgerFile(root), `${JSON.stringify({ version: 3, entries: [mismatched] })}\n`)
  const result = recoverOwnedGeneratedDraft({
    root,
    assertGitReady: () => ({ ok: true }),
    runCommand: () => { throw new Error('hash mismatch must fail before Git') },
  })
  assert.equal(result.ok, false)
  assert.match(result.reason, /content hash/)
})

test('two pending owned drafts commit together and the ledger is removed only after exact verification', () => {
  const root = makeRoot()
  writePost(root, path1, safeDraft('one'))
  writePost(root, path2, safeDraft('two'))
  rememberGeneratedDraft({ root, scheduledResult: { path: path1, slug: slug1 } })
  rememberGeneratedDraft({ root, scheduledResult: { path: path2, slug: slug2 } })
  const entries = readOwnedGeneratedDraftLedger(root).entries
  const calls = []
  const result = recoverOwnedGeneratedDraft({
    root,
    assertGitReady: () => ({ ok: true }),
    runCommand: commitRunner(calls, entries, { initialStatus: `?? ${path1}\n?? ${path2}` }),
  })

  assert.equal(result.ok, true)
  assert.equal(result.committed, true)
  assert.equal(result.resolvedEntries, 2)
  assert.equal(existsSync(ledgerFile(root)), false)
  assert.ok(calls.some((call) => call.join(' ') === `git add -- ${path1} ${path2}`))
  assert.ok(calls.some((call) => call.join(' ') === 'git commit -m drafts: stock 2 scheduled articles'))
  assert.equal(calls.some((call) => call[0] === 'git' && call[1] === 'push'), false)
  assert.equal(calls.some((call) => ['approve', 'publish'].includes(call[1])), false)
})

test('post-commit foreign path, parent mismatch, or committed blob mismatch retains the ledger', () => {
  const cases = [
    { options: { changedPaths: `${path1}\nREADME.md` }, reason: /管理対象draft以外/ },
    { options: { parentHead: 'c'.repeat(40) }, reason: /parentが一致しない/ },
    { options: { committedBlobOverrides: { [path1]: 'f'.repeat(40) } }, reason: /commit済みdraftのblob/ },
  ]

  for (const { options, reason } of cases) {
    const root = makeRoot()
    writePost(root, path1, safeDraft('one'))
    rememberGeneratedDraft({ root, scheduledResult: { path: path1, slug: slug1 } })
    const entries = readOwnedGeneratedDraftLedger(root).entries
    const calls = []
    const result = recoverOwnedGeneratedDraft({
      root,
      assertGitReady: () => ({ ok: true }),
      runCommand: commitRunner(calls, entries, { initialStatus: `?? ${path1}`, ...options }),
    })
    assert.equal(result.ok, false)
    assert.equal(result.committed, true)
    assert.match(result.reason, reason)
    assert.equal(readOwnedGeneratedDraftLedger(root).entries.length, 1)
    assert.ok(calls.some((call) => call[1] === 'commit'))
  }
})

test('post-commit foreign status retains the ledger even though the owned commit completed', () => {
  const root = makeRoot()
  writePost(root, path1, safeDraft('one'))
  rememberGeneratedDraft({ root, scheduledResult: { path: path1, slug: slug1 } })
  const entries = readOwnedGeneratedDraftLedger(root).entries
  const result = recoverOwnedGeneratedDraft({
    root,
    assertGitReady: () => ({ ok: true }),
    runCommand: commitRunner([], entries, {
      initialStatus: `?? ${path1}`,
      afterStatus: ' M README.md',
    }),
  })
  assert.equal(result.ok, false)
  assert.equal(result.committed, true)
  assert.match(result.reason, /同期後に別の変更/)
  assert.equal(readOwnedGeneratedDraftLedger(root).entries.length, 1)
})

test('foreign tracked, untracked, or staged changes retain every entry without add or commit', () => {
  for (const foreign of [' M README.md', '?? foreign.txt', 'A  foreign.txt']) {
    const root = makeRoot()
    writePost(root, path1, safeDraft('one'))
    rememberGeneratedDraft({ root, scheduledResult: { path: path1, slug: slug1 } })
    const entries = readOwnedGeneratedDraftLedger(root).entries
    const calls = []
    const result = recoverOwnedGeneratedDraft({
      root,
      assertGitReady: () => ({ ok: true }),
      runCommand: commitRunner(calls, entries, { initialStatus: `?? ${path1}\n${foreign}` }),
    })
    assert.equal(result.ok, false, foreign)
    assert.equal(result.pendingSync, true)
    assert.equal(readOwnedGeneratedDraftLedger(root).entries.length, 1)
    assert.equal(calls.some((call) => call[1] === 'add' || call[1] === 'commit'), false)
  }
})

test('ahead, behind, diverged, fetch failure, index lock, and unknown readiness retain all entries without Git side effects', () => {
  for (const reason of ['ahead-only', 'behind', 'diverged', 'fetch failure', 'index lock', 'unknown status']) {
    const root = makeRoot()
    writePost(root, path1, safeDraft('one'))
    writePost(root, path2, safeDraft('two'))
    rememberGeneratedDraft({ root, scheduledResult: { path: path1, slug: slug1 } })
    rememberGeneratedDraft({ root, scheduledResult: { path: path2, slug: slug2 } })
    const calls = []
    const result = recoverOwnedGeneratedDraft({
      root,
      assertGitReady: () => ({ ok: false, reason }),
      runCommand: (...args) => {
        calls.push(args)
        throw new Error('unsafe readiness must precede Git mutation')
      },
    })
    assert.equal(result.ok, false)
    assert.equal(result.pendingSync, true)
    assert.equal(result.committed, false)
    assert.equal(readOwnedGeneratedDraftLedger(root).entries.length, 2)
    assert.equal(calls.length, 0)
  }
})

test('partial cleanup removes only an exactly resolved entry and retains the unresolved entry', () => {
  const root = makeRoot()
  writePost(root, path1, safeDraft('one'))
  writePost(root, path2, safeDraft('two'))
  rememberGeneratedDraft({ root, scheduledResult: { path: path1, slug: slug1 } })
  rememberGeneratedDraft({ root, scheduledResult: { path: path2, slug: slug2 } })
  const entries = readOwnedGeneratedDraftLedger(root).entries
  const result = recoverOwnedGeneratedDraft({
    root,
    assertGitReady: () => ({ ok: true }),
    runCommand: commitRunner([], entries, {
      initialStatus: '',
      trackedBlobOverrides: { [path2]: 'f'.repeat(40) },
    }),
  })
  assert.equal(result.ok, false)
  assert.equal(result.resolvedEntries, 1)
  assert.equal(result.retainedEntries, 1)
  assert.deepEqual(readOwnedGeneratedDraftLedger(root).entries.map((item) => item.path), [path2])
})

test('partial cleanup write failure is structured and preserves the original ledger', () => {
  const root = makeRoot()
  writePost(root, path1, safeDraft('one'))
  writePost(root, path2, safeDraft('two'))
  rememberGeneratedDraft({ root, scheduledResult: { path: path1, slug: slug1 } })
  rememberGeneratedDraft({ root, scheduledResult: { path: path2, slug: slug2 } })
  const before = readFileSync(ledgerFile(root), 'utf8')
  const entries = readOwnedGeneratedDraftLedger(root).entries
  const result = recoverOwnedGeneratedDraft({
    root,
    assertGitReady: () => ({ ok: true }),
    ledgerIo: { writeFileSync: () => { throw new Error('injected partial cleanup failure') } },
    runCommand: commitRunner([], entries, {
      initialStatus: '',
      trackedBlobOverrides: { [path2]: 'f'.repeat(40) },
    }),
  })
  assert.equal(result.ok, false)
  assert.equal(result.pendingSync, true)
  assert.match(result.reason, /ledgerの書き込みに失敗/)
  assert.equal(readFileSync(ledgerFile(root), 'utf8'), before)
})

test('staged blob mismatch fails closed and retains the ledger', () => {
  const root = makeRoot()
  writePost(root, path1, safeDraft('one'))
  rememberGeneratedDraft({ root, scheduledResult: { path: path1, slug: slug1 } })
  const entries = readOwnedGeneratedDraftLedger(root).entries
  const calls = []
  const result = recoverOwnedGeneratedDraft({
    root,
    assertGitReady: () => ({ ok: true }),
    runCommand: commitRunner(calls, entries, {
      initialStatus: `A  ${path1}`,
      stagedBlobOverrides: { [path1]: 'f'.repeat(40) },
    }),
  })
  assert.equal(result.ok, false)
  assert.match(result.reason, /stage済みdraftのblob/)
  assert.equal(existsSync(ledgerFile(root)), true)
  assert.equal(calls.some((call) => call[1] === 'commit'), false)
})

test('all tracked-clean entries reconcile idempotently without commit', () => {
  const root = makeRoot()
  writePost(root, path1, safeDraft('one'))
  writePost(root, path2, safeDraft('two'))
  rememberGeneratedDraft({ root, scheduledResult: { path: path1, slug: slug1 } })
  rememberGeneratedDraft({ root, scheduledResult: { path: path2, slug: slug2 } })
  const entries = readOwnedGeneratedDraftLedger(root).entries
  const calls = []
  const result = recoverOwnedGeneratedDraft({
    root,
    assertGitReady: () => ({ ok: true }),
    runCommand: commitRunner(calls, entries, { initialStatus: '' }),
  })
  assert.equal(result.ok, true)
  assert.equal(result.alreadyCommitted, true)
  assert.equal(existsSync(ledgerFile(root)), false)
  assert.equal(calls.some((call) => call[1] === 'add' || call[1] === 'commit'), false)
})

test('owned status parser distinguishes all owned paths from foreign and unsafe states', () => {
  assert.equal(classifyOwnedDraftStatus('', path1), 'clean')
  assert.equal(classifyOwnedDraftStatus(`?? ${path1}`, path1), 'untracked')
  assert.equal(classifyOwnedDraftStatus(`A  ${path1}`, path1), 'staged')
  assert.deepEqual(classifyOwnedDraftStatus(`?? ${path1}\nA  ${path2}`, [path1, path2]), {
    [path1]: 'untracked',
    [path2]: 'staged',
  })
  assert.equal(classifyOwnedDraftStatus(`?? ${path1}\n M README.md`, [path1]), null)
  assert.equal(classifyOwnedDraftStatus(` M ${path1}`, [path1]), null)
})
