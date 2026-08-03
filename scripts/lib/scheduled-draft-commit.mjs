import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const SAFE_POST_PATH = /^content\/posts\/\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md$/
const MARKER_FILE = 'ops-mwf-owned-draft.json'
const MARKER_REPO_PATH = `logs/${MARKER_FILE}`

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
  if (marker?.version === 2) {
    const contentSha256 = String(marker?.contentSha256 ?? '').toLowerCase()
    if (!/^[a-f0-9]{64}$/.test(contentSha256)) return null
    return { version: 2, path, slug, contentSha256 }
  }
  if (marker?.version === undefined || marker?.version === 1) {
    return { version: 1, path, slug }
  }
  return null
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

export function readOwnedGeneratedDraftMarker(root) {
  return readMarker(root)
}

function contentSha256(root, path) {
  return createHash('sha256').update(readFileSync(join(root, path))).digest('hex')
}

function hasMatchingContentHash(root, marker) {
  if (marker.version !== 2) return false
  if (!existsSync(join(root, marker.path))) return false
  try {
    return contentSha256(root, marker.path) === marker.contentSha256
  } catch {
    return false
  }
}

function isFailClosedLegacyDraft(root, marker) {
  if (marker.version !== 1 || !existsSync(join(root, marker.path))) return false
  try {
    const raw = readFileSync(join(root, marker.path), 'utf8')
    const frontmatter = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1]
    if (!frontmatter) return false
    const required = new Map()
    for (const line of frontmatter.split(/\r?\n/)) {
      const relevant = line.match(/^(reviewed|draft|auto_approved):/)
      if (!relevant) continue
      const field = line.match(/^(reviewed|draft|auto_approved):\s*(true|false)\s*$/)
      if (!field || field[1] !== relevant[1]) return false
      if (required.has(field[1])) return false
      required.set(field[1], field[2] === 'true')
    }
    return required.get('reviewed') === false
      && required.get('draft') === true
      && required.get('auto_approved') === false
  } catch {
    return false
  }
}

export function classifyOwnedDraftStatus(statusOutput, path) {
  const lines = String(statusOutput ?? '').split(/\r?\n/).filter(Boolean)
  const draftLines = lines.filter((line) => line !== `?? ${MARKER_REPO_PATH}`)
  if (draftLines.length === 0 && lines.length <= 1) return 'clean'
  if (draftLines.length !== 1 || lines.length > 2) return null
  if (draftLines[0] === `?? ${path}`) return 'untracked'
  if (draftLines[0] === `A  ${path}`) return 'staged'
  return null
}

function hasOnlyOwnedMarkerStatus(statusOutput) {
  const lines = String(statusOutput ?? '').split(/\r?\n/).filter(Boolean)
  return lines.length === 0 || (lines.length === 1 && lines[0] === `?? ${MARKER_REPO_PATH}`)
}

function verifyTrackedCleanBlob({ root, marker, runCommand }) {
  if (!existsSync(join(root, marker.path))) {
    return fail('管理対象draftが見つからないためGit同期を停止しました')
  }

  const tracked = runCommand('git', ['ls-files', '--error-unmatch', '--', marker.path])
  if (!tracked.ok || tracked.output.trim() !== marker.path) {
    return fail('管理対象draftが追跡済みでないためGit同期を停止しました')
  }
  const clean = runCommand('git', ['diff', '--quiet', 'HEAD', '--', marker.path])
  if (!clean.ok) {
    return fail('管理対象draftの内容がHEADと一致しないためGit同期を停止しました')
  }
  const currentBlob = runCommand('git', ['hash-object', '--', marker.path])
  const headBlob = runCommand('git', ['rev-parse', `HEAD:${marker.path}`])
  if (!currentBlob.ok || !headBlob.ok || !currentBlob.output.trim()
    || currentBlob.output.trim() !== headBlob.output.trim()) {
    return fail('管理対象draftのblobがHEADと一致しないためGit同期を停止しました')
  }
  return { ok: true }
}

function verifyStagedOwnedBlob({ root, marker, runCommand }) {
  if (!hasMatchingContentHash(root, marker)) {
    return fail('管理対象draftのcontent hashがmarkerと一致しないためGit同期を停止しました')
  }
  const currentBlob = runCommand('git', ['hash-object', '--', marker.path])
  const stagedBlob = runCommand('git', ['rev-parse', `:${marker.path}`])
  if (!currentBlob.ok || !stagedBlob.ok || !currentBlob.output.trim()
    || currentBlob.output.trim() !== stagedBlob.output.trim()) {
    return fail('stage済みdraftのblobがmarker対象内容と一致しないためGit commitを停止しました')
  }
  return { ok: true, blob: stagedBlob.output.trim() }
}

function verifyOwnedCommitResult({ owned, preCommitHead, stagedBlob, runCommand }) {
  const committed = { committed: true }
  const newHead = runCommand('git', ['rev-parse', 'HEAD'])
  if (!newHead.ok || !newHead.output.trim() || newHead.output.trim() === preCommitHead) {
    return fail('commit後のHEADを安全に確認できないためmarkerを保持しました', committed)
  }
  const commitHead = newHead.output.trim()
  const parent = runCommand('git', ['rev-parse', `${commitHead}^`])
  if (!parent.ok || parent.output.trim() !== preCommitHead) {
    return fail('commit後HEADのparentがcommit前HEADと一致しないためmarkerを保持しました', committed)
  }
  const changed = runCommand('git', ['diff-tree', '--no-commit-id', '--name-only', '-r', commitHead])
  if (!changed.ok || changed.output.trim() !== owned.path) {
    return fail('commitに管理対象draft以外のpathが含まれるためmarkerを保持しました', committed)
  }
  const committedBlob = runCommand('git', ['rev-parse', `${commitHead}:${owned.path}`])
  if (!committedBlob.ok || committedBlob.output.trim() !== stagedBlob) {
    return fail('commit済みdraftのblobが検証済みstage内容と一致しないためmarkerを保持しました', committed)
  }
  return { ok: true, committed: true }
}

export function commitOwnedGeneratedDraft({ root = process.cwd(), marker, runCommand }) {
  const owned = normalizeMarker(marker)
  if (!owned) return fail('管理対象draftの識別情報が不正なためGit同期を停止しました')

  const status = runCommand('git', ['status', '--porcelain'])
  if (!status.ok) return fail('git status を確認できないためGit同期を停止しました')
  const state = classifyOwnedDraftStatus(status.output, owned.path)
  if (!state) return fail('管理対象draft以外の変更または不明なGit状態があるためGit同期を停止しました')

  if (state === 'clean') {
    const trackedClean = verifyTrackedCleanBlob({ root, marker: owned, runCommand })
    if (!trackedClean.ok) return trackedClean
    if (owned.version === 2 && !hasMatchingContentHash(root, owned)) {
      return fail('管理対象draftのcontent hashがmarkerと一致しないためGit同期を停止しました')
    }
    if (owned.version === 1 && !isFailClosedLegacyDraft(root, owned)) {
      return fail('legacy markerの管理対象draftが未承認の安全な下書きではないためGit同期を停止しました')
    }
    return {
      ok: true,
      committed: true,
      alreadyCommitted: true,
      reason: '管理対象draftは既にlocal commit済みです。markerを照合・解消しました。',
    }
  }

  if (owned.version !== 2) {
    return fail('legacy markerの未commit draftは自動回復せずHuman操作待ちにします')
  }
  if (!hasMatchingContentHash(root, owned)) {
    return fail('管理対象draftのcontent hashがmarkerと一致しないためGit同期を停止しました')
  }

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
  const stagedIdentity = verifyStagedOwnedBlob({ root, marker: owned, runCommand })
  if (!stagedIdentity.ok) return stagedIdentity

  const preCommitHead = runCommand('git', ['rev-parse', 'HEAD'])
  if (!preCommitHead.ok || !preCommitHead.output.trim()) {
    return fail('commit前HEADを確認できないためGit commitを停止しました')
  }

  const commit = runCommand('git', ['commit', '-m', `draft: ${owned.slug}`])
  if (!commit.ok) return fail(`git commit に失敗したため管理対象draftを回復待ちにしました: ${commit.output.slice(0, 300)}`)

  const verifiedCommit = verifyOwnedCommitResult({
    owned,
    preCommitHead: preCommitHead.output.trim(),
    stagedBlob: stagedIdentity.blob,
    runCommand,
  })
  if (!verifiedCommit.ok) return verifiedCommit

  const after = runCommand('git', ['status', '--porcelain'])
  if (!after.ok || !hasOnlyOwnedMarkerStatus(after.output)) {
    return fail('draftはlocal commit済みですが、commit後に別の変更が検出されました', { committed: true })
  }
  return { ok: true, committed: true, reason: '生成下書きをローカルcommitしました。Human push待ちです。' }
}

export function recoverOwnedGeneratedDraft({
  root,
  runCommand,
  assertGitReady = () => ({ ok: false, reason: 'remote preflight未指定' }),
}) {
  const markerExists = existsSync(markerPath(root))
  const marker = readMarker(root)

  if (!marker) {
    if (markerExists) {
      return fail('provenance markerが不正または読み取れないため既存draftの回復を停止しました')
    }
    const status = runCommand('git', ['status', '--porcelain'])
    if (!status.ok) return fail('git status を確認できないため既存draftの回復を停止しました')
    if (!String(status.output ?? '').trim()) {
      return { ok: true, committed: false, recovered: false, reason: '回復対象の管理済みdraftはありません' }
    }
    return fail('provenance markerがない未commit変更は自動回復せずHuman操作待ちにします')
  }

  const readiness = assertGitReady(marker)
  if (!readiness?.ok) {
    return fail(`Git同期が安全でないため管理対象draftの回復を停止しました: ${readiness?.reason ?? '確認不能'}`)
  }

  const result = commitOwnedGeneratedDraft({ root, marker, runCommand })
  if (result.ok && result.committed) unlinkSync(markerPath(root))
  return { ...result, recovered: result.committed }
}

export function rememberGeneratedDraft({ root, scheduledResult }) {
  const identity = normalizeMarker({
    version: 1,
    path: scheduledResult?.path,
    slug: scheduledResult?.slug,
  })
  if (!identity) return fail('生成記事パスが安全な形式ではないためGit同期を停止しました')
  if (!existsSync(join(root, identity.path))) {
    return fail('生成記事が見つからないためprovenance markerを作成できません')
  }
  let marker
  try {
    marker = {
      version: 2,
      path: identity.path,
      slug: identity.slug,
      contentSha256: contentSha256(root, identity.path),
    }
  } catch {
    return fail('生成記事のcontent hashを計算できないためGit同期を停止しました')
  }
  writeMarker(root, marker)
  return { ok: true, marker }
}
