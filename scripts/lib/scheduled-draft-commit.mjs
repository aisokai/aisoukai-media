import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const SAFE_POST_PATH = /^content\/posts\/\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md$/
const LEDGER_VERSION = 3
const LEDGER_FILE = 'ops-mwf-owned-draft.json'
const LEDGER_REPO_PATH = `logs/${LEDGER_FILE}`

function fail(reason, extra = {}) {
  return { ok: false, committed: false, pendingSync: true, reason, ...extra }
}

function isSafeGeneratedPostPath(path) {
  return SAFE_POST_PATH.test(String(path ?? ''))
}

function ledgerPath(root) {
  return join(root, 'logs', LEDGER_FILE)
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

function gitBlobSha1(buffer) {
  return createHash('sha1')
    .update(`blob ${buffer.length}\0`)
    .update(buffer)
    .digest('hex')
}

function parseUnapprovedDraft(raw) {
  const frontmatter = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1]
  if (!frontmatter) return false
  const required = new Map()
  for (const line of frontmatter.split(/\r?\n/)) {
    const relevant = line.match(/^(reviewed|draft|auto_approved):/)
    if (!relevant) continue
    const field = line.match(/^(reviewed|draft|auto_approved):\s*(true|false)\s*$/)
    if (!field || field[1] !== relevant[1] || required.has(field[1])) return false
    required.set(field[1], field[2] === 'true')
  }
  return required.get('reviewed') === false
    && required.get('draft') === true
    && required.get('auto_approved') === false
}

function normalizePathAndSlug(value) {
  const path = String(value?.path ?? '')
  const slug = String(value?.slug ?? '')
  if (!isSafeGeneratedPostPath(path)) return null
  if (slug !== path.slice('content/posts/'.length, -'.md'.length)) return null
  return { path, slug }
}

function normalizeLedgerEntry(value) {
  const identity = normalizePathAndSlug(value)
  if (!identity) return null
  const contentSha256 = String(value?.contentSha256 ?? '').toLowerCase()
  const gitBlob = String(value?.gitBlob ?? '').toLowerCase()
  const provenance = String(value?.provenance ?? '')
  if (!/^[a-f0-9]{64}$/.test(contentSha256) || !/^[a-f0-9]{40}$/.test(gitBlob)) return null
  if (!['generated', 'legacy-v2', 'legacy-v1'].includes(provenance)) return null
  return { ...identity, contentSha256, gitBlob, provenance }
}

function identityFromFile(root, value, { expectedSha256 = null, provenance = 'generated' } = {}) {
  const identity = normalizePathAndSlug(value)
  if (!identity || !existsSync(join(root, identity.path))) return null
  try {
    const content = readFileSync(join(root, identity.path))
    if (!parseUnapprovedDraft(content.toString('utf8'))) return null
    const contentSha256 = sha256(content)
    if (expectedSha256 && contentSha256 !== expectedSha256) return null
    return { ...identity, contentSha256, gitBlob: gitBlobSha1(content), provenance }
  } catch {
    return null
  }
}

function normalizeLedger(root, value) {
  let entries
  let migrated = false
  if (value?.version === LEDGER_VERSION && Array.isArray(value.entries)) {
    entries = value.entries.map(normalizeLedgerEntry)
  } else if (value?.version === 2) {
    const expectedSha256 = String(value?.contentSha256 ?? '').toLowerCase()
    if (!/^[a-f0-9]{64}$/.test(expectedSha256)) return null
    entries = [identityFromFile(root, value, { expectedSha256, provenance: 'legacy-v2' })]
    migrated = true
  } else if (value?.version === undefined || value?.version === 1) {
    entries = [identityFromFile(root, value, { provenance: 'legacy-v1' })]
    migrated = true
  } else {
    return null
  }
  if (entries.some((entry) => !entry)) return null
  const paths = new Set()
  for (const entry of entries) {
    if (paths.has(entry.path)) return null
    paths.add(entry.path)
  }
  return { ledger: { version: LEDGER_VERSION, entries }, migrated }
}

function normalizeLedgerIo(overrides = {}) {
  return {
    writeFileSync: overrides.writeFileSync ?? writeFileSync,
    renameSync: overrides.renameSync ?? renameSync,
    unlinkSync: overrides.unlinkSync ?? unlinkSync,
  }
}

function writeLedger(root, ledger, ledgerIo) {
  const io = normalizeLedgerIo(ledgerIo)
  const logs = join(root, 'logs')
  const destination = ledgerPath(root)
  const temporary = `${destination}.${process.pid}.tmp`
  try {
    mkdirSync(logs, { recursive: true })
    io.writeFileSync(temporary, `${JSON.stringify(ledger)}\n`, { encoding: 'utf8', mode: 0o600 })
    io.renameSync(temporary, destination)
    return { ok: true }
  } catch (error) {
    try {
      if (existsSync(temporary)) io.unlinkSync(temporary)
    } catch {}
    return { ok: false, reason: `provenance ledgerの書き込みに失敗しました: ${error.message}` }
  }
}

function removeOrWriteLedger(root, entries, ledgerIo) {
  const io = normalizeLedgerIo(ledgerIo)
  if (entries.length > 0) {
    return writeLedger(root, { version: LEDGER_VERSION, entries }, io)
  } else if (existsSync(ledgerPath(root))) {
    try {
      io.unlinkSync(ledgerPath(root))
    } catch (error) {
      return { ok: false, reason: `provenance ledgerの解消に失敗しました: ${error.message}` }
    }
  }
  return { ok: true }
}

function readLedgerState(root) {
  const path = ledgerPath(root)
  if (!existsSync(path)) return { exists: false, ledger: null, migrated: false }
  try {
    const normalized = normalizeLedger(root, JSON.parse(readFileSync(path, 'utf8')))
    return normalized ? { exists: true, ...normalized } : { exists: true, ledger: null, migrated: false }
  } catch {
    return { exists: true, ledger: null, migrated: false }
  }
}

export function readOwnedGeneratedDraftLedger(root) {
  return readLedgerState(root).ledger
}

// Compatibility for diagnostic callers. New code must use the full ledger.
export function readOwnedGeneratedDraftMarker(root) {
  return readOwnedGeneratedDraftLedger(root)?.entries?.[0] ?? null
}

function parseStatus(statusOutput) {
  return String(statusOutput ?? '').split(/\r?\n/).filter(Boolean).map((line) => ({
    code: line.slice(0, 2),
    path: line.slice(3),
    line,
  }))
}

export function classifyOwnedDraftStatus(statusOutput, ownedPaths) {
  const paths = new Set(Array.isArray(ownedPaths) ? ownedPaths : [ownedPaths])
  const items = parseStatus(statusOutput).filter((item) => item.path !== LEDGER_REPO_PATH)
  const foreign = items.filter((item) => !paths.has(item.path))
  if (foreign.length > 0) return null
  const states = new Map()
  for (const item of items) {
    if (states.has(item.path)) return null
    if (item.code === '??') states.set(item.path, 'untracked')
    else if (item.code === 'A ') states.set(item.path, 'staged')
    else return null
  }
  if (!Array.isArray(ownedPaths)) return states.get(ownedPaths) ?? 'clean'
  return Object.fromEntries([...paths].map((path) => [path, states.get(path) ?? 'clean']))
}

function verifyEntryFile(root, entry) {
  const path = join(root, entry.path)
  if (!existsSync(path)) return fail(`管理対象draftが見つかりません: ${entry.path}`)
  try {
    const content = readFileSync(path)
    if (sha256(content) !== entry.contentSha256) {
      return fail(`管理対象draftのcontent hashが一致しません: ${entry.path}`)
    }
    if (gitBlobSha1(content) !== entry.gitBlob) {
      return fail(`管理対象draftのblobが一致しません: ${entry.path}`)
    }
    if (!parseUnapprovedDraft(content.toString('utf8'))) {
      return fail(`管理対象draftが未承認draft条件を満たしません: ${entry.path}`)
    }
    return { ok: true }
  } catch {
    return fail(`管理対象draftを安全に検証できません: ${entry.path}`)
  }
}

function verifyTrackedCleanBlob({ entry, runCommand }) {
  const tracked = runCommand('git', ['ls-files', '--error-unmatch', '--', entry.path])
  if (!tracked.ok || tracked.output.trim() !== entry.path) return fail(`管理対象draftを追跡確認できません: ${entry.path}`)
  const clean = runCommand('git', ['diff', '--quiet', 'HEAD', '--', entry.path])
  if (!clean.ok) return fail(`管理対象draftがHEADと一致しません: ${entry.path}`)
  const headBlob = runCommand('git', ['rev-parse', `HEAD:${entry.path}`])
  if (!headBlob.ok || headBlob.output.trim() !== entry.gitBlob) {
    return fail(`管理対象draftのHEAD blobが一致しません: ${entry.path}`)
  }
  return { ok: true }
}

function samePaths(actualOutput, expectedPaths) {
  const actual = String(actualOutput ?? '').split(/\r?\n/).filter(Boolean).sort()
  return JSON.stringify(actual) === JSON.stringify([...expectedPaths].sort())
}

function retainUnresolvedAfterPartialVerification(root, entries, resolvedPaths, ledgerIo) {
  const unresolved = entries.filter((entry) => !resolvedPaths.has(entry.path))
  const persisted = removeOrWriteLedger(root, unresolved, ledgerIo)
  return { unresolvedCount: unresolved.length, persisted }
}

export function recoverOwnedGeneratedDraft({
  root,
  runCommand,
  assertGitReady = () => ({ ok: false, reason: 'remote preflight未指定' }),
  ledgerIo,
}) {
  const state = readLedgerState(root)
  if (!state.ledger) {
    if (state.exists) return fail('provenance ledgerが不正または読み取れないため同期を保留しました')
    return { ok: true, committed: false, recovered: false, reason: '同期対象の管理済みdraftはありません' }
  }
  if (state.migrated) {
    const migration = writeLedger(root, state.ledger, ledgerIo)
    if (!migration.ok) return fail(migration.reason, { stocked: true })
  }
  const entries = state.ledger.entries
  if (entries.length === 0) {
    const cleanup = removeOrWriteLedger(root, [], ledgerIo)
    if (!cleanup.ok) return fail(cleanup.reason, { stocked: true })
    return { ok: true, committed: false, recovered: false, reason: '同期対象の管理済みdraftはありません' }
  }

  for (const entry of entries) {
    const verified = verifyEntryFile(root, entry)
    if (!verified.ok) return verified
  }

  const readiness = assertGitReady(state.ledger)
  if (!readiness?.ok) {
    return fail(`ローカル同期を保留しました: ${readiness?.reason ?? '確認不能'}`)
  }

  const status = runCommand('git', ['status', '--porcelain'])
  if (!status.ok) return fail('ローカル状態を確認できないため同期を保留しました')
  const states = classifyOwnedDraftStatus(status.output, entries.map((entry) => entry.path))
  if (!states) return fail('管理対象外の変更または不明な状態があるため同期を保留しました')

  const resolvedPaths = new Set()
  const pendingEntries = []
  for (const entry of entries) {
    if (states[entry.path] === 'clean') {
      const tracked = verifyTrackedCleanBlob({ entry, runCommand })
      if (!tracked.ok) {
        const retained = retainUnresolvedAfterPartialVerification(root, entries, resolvedPaths, ledgerIo)
        return {
          ...tracked,
          reason: retained.persisted.ok ? tracked.reason : `${tracked.reason}; ${retained.persisted.reason}`,
          retainedEntries: retained.unresolvedCount,
          resolvedEntries: resolvedPaths.size,
        }
      }
      resolvedPaths.add(entry.path)
    } else {
      if (entry.provenance === 'legacy-v1') {
        const retained = retainUnresolvedAfterPartialVerification(root, entries, resolvedPaths, ledgerIo)
        return fail('legacy v1 marker由来の未反映draftは内容provenanceが不足するためHuman同期待ちにします', {
          reason: retained.persisted.ok
            ? 'legacy v1 marker由来の未反映draftは内容provenanceが不足するためHuman同期待ちにします'
            : `legacy v1 marker由来の未反映draftは内容provenanceが不足します; ${retained.persisted.reason}`,
          retainedEntries: retained.unresolvedCount,
          resolvedEntries: resolvedPaths.size,
        })
      }
      pendingEntries.push(entry)
    }
  }

  if (pendingEntries.length === 0) {
    const cleanup = removeOrWriteLedger(root, [], ledgerIo)
    if (!cleanup.ok) return fail(cleanup.reason, { committed: true, stocked: true })
    return {
      ok: true,
      committed: true,
      alreadyCommitted: true,
      recovered: true,
      resolvedEntries: resolvedPaths.size,
      reason: '管理対象draftは管理画面へ反映済みです。',
    }
  }

  const validate = runCommand('npm', ['run', 'validate:posts'])
  if (!validate.ok) return fail(`記事検証に失敗したため同期を保留しました: ${validate.output.slice(0, 300)}`)

  const untrackedPaths = pendingEntries
    .filter((entry) => states[entry.path] === 'untracked')
    .map((entry) => entry.path)
  if (untrackedPaths.length > 0) {
    const add = runCommand('git', ['add', '--', ...untrackedPaths])
    if (!add.ok) return fail(`生成draftのstageに失敗したため同期を保留しました: ${add.output.slice(0, 300)}`)
  }

  const pendingPaths = pendingEntries.map((entry) => entry.path)
  const staged = runCommand('git', ['diff', '--cached', '--name-only'])
  if (!staged.ok || !samePaths(staged.output, pendingPaths)) {
    return fail('stage対象が管理対象draftだけではないため同期を保留しました')
  }
  for (const entry of pendingEntries) {
    const stagedBlob = runCommand('git', ['rev-parse', `:${entry.path}`])
    if (!stagedBlob.ok || stagedBlob.output.trim() !== entry.gitBlob) {
      return fail(`stage済みdraftのblobが一致しないため同期を保留しました: ${entry.path}`)
    }
  }

  const preCommitHead = runCommand('git', ['rev-parse', 'HEAD'])
  if (!preCommitHead.ok || !preCommitHead.output.trim()) return fail('同期前HEADを確認できません')
  const commit = runCommand('git', ['commit', '-m', `drafts: stock ${pendingEntries.length} scheduled article${pendingEntries.length === 1 ? '' : 's'}`])
  if (!commit.ok) return fail(`生成draftのlocal commitに失敗したため同期を保留しました: ${commit.output.slice(0, 300)}`)

  const newHead = runCommand('git', ['rev-parse', 'HEAD'])
  if (!newHead.ok || !newHead.output.trim() || newHead.output.trim() === preCommitHead.output.trim()) {
    return fail('同期後HEADを確認できないためledgerを保持しました', { committed: true })
  }
  const commitHead = newHead.output.trim()
  const parent = runCommand('git', ['rev-parse', `${commitHead}^`])
  if (!parent.ok || parent.output.trim() !== preCommitHead.output.trim()) {
    return fail('同期後HEADのparentが一致しないためledgerを保持しました', { committed: true })
  }
  const changed = runCommand('git', ['diff-tree', '--no-commit-id', '--name-only', '-r', commitHead])
  if (!changed.ok || !samePaths(changed.output, pendingPaths)) {
    return fail('local commitに管理対象draft以外が含まれるためledgerを保持しました', { committed: true })
  }
  for (const entry of pendingEntries) {
    const committedBlob = runCommand('git', ['rev-parse', `${commitHead}:${entry.path}`])
    if (!committedBlob.ok || committedBlob.output.trim() !== entry.gitBlob) {
      return fail(`commit済みdraftのblobが一致しないためledgerを保持しました: ${entry.path}`, { committed: true })
    }
  }
  const after = runCommand('git', ['status', '--porcelain'])
  if (!after.ok || String(after.output ?? '').split(/\r?\n/).filter(Boolean)
    .some((line) => line.slice(3) !== LEDGER_REPO_PATH)) {
    return fail('draftはlocal commit済みですが、同期後に別の変更を検出したためledgerを保持しました', { committed: true })
  }

  const cleanup = removeOrWriteLedger(root, [], ledgerIo)
  if (!cleanup.ok) return fail(cleanup.reason, { committed: true, stocked: true })
  return {
    ok: true,
    committed: true,
    recovered: true,
    resolvedEntries: entries.length,
    reason: '新しい記事を管理画面へ反映しました。',
  }
}

export function rememberGeneratedDraft({ root, scheduledResult, ledgerIo }) {
  const identity = identityFromFile(root, {
    path: scheduledResult?.path,
    slug: scheduledResult?.slug,
  })
  if (!identity) return fail('生成記事を安全な未承認draftとして記録できません', { stocked: false, pendingSync: false })

  const state = readLedgerState(root)
  if (state.exists && !state.ledger) {
    return fail('既存provenance ledgerを安全に移行できません', { stocked: false, pendingSync: false })
  }
  const entries = state.ledger?.entries ?? []
  const samePath = entries.find((entry) => entry.path === identity.path)
  if (samePath) {
    if (samePath.contentSha256 !== identity.contentSha256 || samePath.gitBlob !== identity.gitBlob) {
      return fail('既存draftと同じpathに異なる内容が生成されました', { stocked: false, pendingSync: false })
    }
    const persisted = writeLedger(root, { version: LEDGER_VERSION, entries }, ledgerIo)
    if (!persisted.ok) return fail(persisted.reason, { stocked: false, pendingSync: false })
    return { ok: true, stocked: true, idempotent: true, ledger: { version: LEDGER_VERSION, entries }, entry: samePath }
  }
  const next = { version: LEDGER_VERSION, entries: [...entries, identity] }
  const persisted = writeLedger(root, next, ledgerIo)
  if (!persisted.ok) return fail(persisted.reason, { stocked: false, pendingSync: false })
  return { ok: true, stocked: true, ledger: next, entry: identity, migrated: state.migrated }
}
