import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const SHA = /^[a-f0-9]{40}$/
const LIVE_STATE = /^data\/mwf\/(?:requests|claims)\/[a-f0-9]{64}\.json$/

// Vercel: exit 0 cancels this build; exit 1 continues it.
// PREVIOUS_SHA is the last successful deployment for this project/branch,
// NOT HEAD^. Comparing the complete trees retains all undeployed changes.
// https://vercel.com/docs/project-configuration/vercel-json#ignorecommand
// https://vercel.com/docs/environment-variables/system-environment-variables#vercel_git_previous_sha
// Requests/claims are read live from GitHub by mwfServerRuntime. Article,
// adoption, inventory, policy and code changes still require a deployment;
// deployed article bytes remain part of the production receipt check.
export function canSkipStateOnlyBuild({ cwd, previousSha, currentSha, vercel, environment, branch, git = 'git' }) {
  if (vercel !== '1' || environment !== 'production' || branch !== 'main') return false
  if (!SHA.test(previousSha ?? '') || !SHA.test(currentSha ?? '') || previousSha === currentSha) return false
  const run = args => {
    const result = spawnSync(git, ['-c', 'core.fsmonitor=false', ...args], {
      cwd, encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024,
      // No inherited credentials, Git configuration overrides, hooks or lazy fetch.
      env: { PATH: process.env.PATH, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0' },
    })
    if (result.error || result.status !== 0) throw new Error('git_metadata_unavailable')
    return result.stdout
  }
  try {
    if (run(['rev-parse', '--verify', 'HEAD']).trim() !== currentSha) return false
    run(['cat-file', '-e', `${previousSha}^{commit}`])
    run(['cat-file', '-e', `${currentSha}^{commit}`])
    // Diverged/rollback histories build even when their net state looks harmless.
    run(['merge-base', '--is-ancestor', previousSha, currentSha])
    const raw = run(['diff', '--raw', '-z', '--no-abbrev', '--no-renames', '--no-ext-diff', '--no-textconv', previousSha, currentSha, '--'])
    if (!raw || !raw.endsWith('\0')) return false
    const fields = raw.slice(0, -1).split('\0')
    if (fields.length % 2) return false
    for (let i = 0; i < fields.length; i += 2) {
      // Only ordinary file additions/modifications. Deletions, mode changes,
      // symlinks, renames and unknown statuses conservatively build.
      const change = /^:(000000|100644) 100644 [a-f0-9]{40} [a-f0-9]{40} ([AM])$/.exec(fields[i])
      if (!change || (change[2] === 'A') !== (change[1] === '000000') || !LIVE_STATE.test(fields[i + 1])) return false
    }
    return true
  } catch {
    // Missing/shallow history or any command error: never suppress a build.
    // No fetching or file-content reads are performed by this gate.
    return false
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const skip = canSkipStateOnlyBuild({
    cwd: process.cwd(), previousSha: process.env.VERCEL_GIT_PREVIOUS_SHA,
    currentSha: process.env.VERCEL_GIT_COMMIT_SHA, vercel: process.env.VERCEL,
    environment: process.env.VERCEL_ENV, branch: process.env.VERCEL_GIT_COMMIT_REF,
  })
  console.log(skip ? 'Skip: only live MWF request/claim state changed.' : 'Build: deployment changes or insufficient state-only evidence.')
  process.exitCode = skip ? 0 : 1
}
