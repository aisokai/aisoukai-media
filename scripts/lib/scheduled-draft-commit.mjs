import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const SAFE_POST_PATH = /^content\/posts\/\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md$/
const MARKER_FILE = 'ops-mwf-owned-draft.json'
const OPS_LOG_FILE = 'ops-mwf.log'

function fail(reason, extra = {}) {
  return { ok: false, committed: false, reason, ...extra }
}

function isSafeGeneratedPostPath(path) {
  return SAFE_POST_PATH.test(String(path ?? ''))
}

function markerPath(root) {
  return join(root, 'logs', MARKER_FILE)
}

function normalizeMarker(marker) {
  const path = String(marker?.path ?? '')
  const slug = String(marker?.slug ?? '')
  if (!isSafeGeneratedPostPath(path) || slug !== path.slice('content/posts/'.length, -'.md'.length)) return null
  return { version: 1, path, slug }
}

function writeMarker(root, marker) {
  const logs = join(root, 'logs')
  mkdirSync(logs, { recursive: true })
  const destination = markerPath(root)
  const temporary = `${destination}.${process.pid}.tmp`
  writeFileSync(temporary, `${JSON.stringify(marker)}\n`, { encoding: 'utf8', mode: 0o600 })
  renameSync(temporary, destination)
}

function readMarker(root) {
  const path = markerPath(root)
  if (!existsSync(path)) return null
  try {
    return normalizeMarker(JSON.parse(readFileSync(path, 'utf8')))
  } catch {
    return null
  }
}

function hasLegacyOpsProvenance(root, path) {
  const logPath = join(root, 'logs', OPS_LOG_FILE)
  if (!existsSync(logPath)) return false
  try {
    return readFileSync(logPath, 'utf8').includes(`生成記事: ${path}`)
  } catch {
    return false
  }
}

export function classifyOwnedDraftStatus(statusOutput, path) {
  const lines = String(statusOutput ?? '').split(/\r?\n/).filter(Boolean)
  if (lines.length !== 1) return null
  if (lines[0] === `?? ${path}`) return 'untracked'
  if (lines[0] === `A  ${path}`) return 'staged'
  return null
}

export function commitOwnedGeneratedDraft({ marker, runCommand }) {
  const owned = normalizeMarker(marker)
  if (!owned) return fail('管理対象draftの識別情報が不正なためGit同期を停止しました')

  const status = runCommand('git', ['status', '--porcelain'])
  if (!status.ok) return fail('git status を確認できないためGit同期を停止しました')
  const state = classifyOwnedDraftStatus(status.output, owned.path)
  if (!state) return fail('管理対象draft以外の変更または不明なGit状態があるためGit同期を停止しました')

  const validate = runCommand('npm', ['run', 'validate:posts'])
  if (!validate.ok) return fail(`validate:posts に失敗したためGit同期を停止しました: ${validate.output.slice(0, 300)}`)

  if (state === 'untracked') {
    const add = runCommand('git', ['add', '--', owned.path])
    if (!add.ok) return fail(`git add に失敗したためGit同期を停止しました: ${add.output.slice(0, 300)}`)
  }

  const staged = runCommand('git', ['diff', '--cached', '--name-only'])
  if (!staged.ok || staged.output.trim() !== owned.path) {
    return fail('stage対象が管理対象draftだけでないためGit commitを停止しました')
  }

  const commit = runCommand('git', ['commit', '-m', `draft: ${owned.slug}`])
  if (!commit.ok) return fail(`git commit に失敗したため管理対象draftを回復待ちにしました: ${commit.output.slice(0, 300)}`)

  const after = runCommand('git', ['status', '--porcelain'])
  if (!after.ok || after.output.trim()) {
    return fail('draftはlocal commit済みですが、commit後に別の変更が検出されました', { committed: true })
  }
  return { ok: true, committed: true, reason: '生成下書きをローカルcommitしました。Human push待ちです。' }
}

export function recoverOwnedGeneratedDraft({ root, runCommand, assertGitReady = () => ({ ok: true }) }) {
  let marker = readMarker(root)
  let adoptedLegacyDraft = false

  if (!marker) {
    const status = runCommand('git', ['status', '--porcelain'])
    if (!status.ok) return fail('git status を確認できないため既存draftの回復を停止しました')
    const line = String(status.output ?? '').trim()
    const legacyPath = line.startsWith('?? ') ? line.slice(3) : ''
    if (!isSafeGeneratedPostPath(legacyPath) || !hasLegacyOpsProvenance(root, legacyPath)) {
      return { ok: true, committed: false, recovered: false, reason: '回復対象の管理済みdraftはありません' }
    }
    marker = { version: 1, path: legacyPath, slug: legacyPath.slice('content/posts/'.length, -'.md'.length) }
    writeMarker(root, marker)
    adoptedLegacyDraft = true
  }

  const readiness = assertGitReady(marker)
  if (!readiness?.ok) {
    return fail(`Git同期が安全でないため管理対象draftの回復を停止しました: ${readiness?.reason ?? '確認不能'}`, { adoptedLegacyDraft })
  }

  const result = commitOwnedGeneratedDraft({ marker, runCommand })
  if (result.committed) unlinkSync(markerPath(root))
  return { ...result, recovered: result.committed, adoptedLegacyDraft }
}

export function rememberGeneratedDraft({ root, scheduledResult }) {
  const marker = normalizeMarker({ path: scheduledResult?.path, slug: scheduledResult?.slug })
  if (!marker) return fail('生成記事パスが安全な形式ではないためGit同期を停止しました')
  writeMarker(root, marker)
  return { ok: true, marker }
}
