import { createHash } from 'node:crypto'
type GitHubConfig = {
  token: string
  repo: string
  branch: string
}

export type GitHubFile = {
  content: string
  sha: string
}

export type GitHubDirectoryEntry = {
  sha: string
  name: string
  path: string
  type: 'file' | 'dir' | string
}

export type GitHubCommitFile = {
  path: string
  content: string | null
}

function getGitHubConfig({ branch: branchOverride }: { branch?: string } = {}): GitHubConfig {
  const token = process.env.GITHUB_REVIEW_TOKEN
  const repo = process.env.GITHUB_REVIEW_REPO ?? 'aisokai/aisoukai-media'
  const branch = branchOverride ?? process.env.GITHUB_REVIEW_BRANCH ?? 'main'
  if (!token) throw new Error('GITHUB_REVIEW_TOKEN is not set')
  return { token, repo, branch }
}

function githubHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

function encodePath(path: string) {
  return path.split('/').map(encodeURIComponent).join('/')
}

async function readJson<T>(url: string, init: RequestInit, label: string): Promise<T> {
  const res = await fetch(url, { ...init, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(30000) })
  if (!res.ok) {
    throw Object.assign(new Error(`${label} failed: ${res.status}`), { code: res.status === 404 ? 'NOT_FOUND' : 'GITHUB_FAILED' })
  }
  return res.json() as Promise<T>
}

export async function readGitHubFile(path: string, { ref }: { ref?: string } = {}): Promise<GitHubFile> {
  const { token, repo, branch } = getGitHubConfig()
  const json = await readJson<{ content: string; sha: string }>(
    `https://api.github.com/repos/${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref ?? branch)}`,
    { headers: githubHeaders(token) },
    `GitHub read ${path}`,
  )

  return {
    content: Buffer.from(json.content, 'base64').toString('utf8'),
    sha: json.sha,
  }
}

export async function readGitHubBranchHead(): Promise<string> {
  const { token, repo, branch } = getGitHubConfig()
  const ref = await readJson<{ object: { sha: string } }>(
    `https://api.github.com/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`,
    { headers: githubHeaders(token) },
    'GitHub read branch ref',
  )
  return ref.object.sha
}

export async function readGitHubDirectory(path: string, { ref }: { ref?: string } = {}): Promise<GitHubDirectoryEntry[]> {
  const { token, repo, branch } = getGitHubConfig()
  const json = await readJson<GitHubDirectoryEntry[]>(
    `https://api.github.com/repos/${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref ?? branch)}`,
    { headers: githubHeaders(token) },
    `GitHub read directory ${path}`,
  )

  return json
}

export async function commitGitHubFiles(message: string, files: GitHubCommitFile[], { expectedHeadSha, branch: branchOverride }: { expectedHeadSha?: string; branch?: string } = {}) {
  const { token, repo, branch } = getGitHubConfig({ branch: branchOverride })
  const headers = githubHeaders(token)
  const baseUrl = `https://api.github.com/repos/${repo}`

  const ref = await readJson<{ object: { sha: string } }>(
    `${baseUrl}/git/ref/heads/${encodeURIComponent(branch)}`,
    { headers },
    'GitHub read branch ref',
  )
  if (expectedHeadSha && ref.object.sha !== expectedHeadSha) {
    throw new Error('GitHub branch changed while this review was open. Reload and review the current content again.')
  }

  const baseCommit = await readJson<{ tree: { sha: string } }>(
    `${baseUrl}/git/commits/${ref.object.sha}`,
    { headers },
    'GitHub read base commit',
  )

  const treeItems = await Promise.all(
    files.map(async (file) => {
      if (file.content === null) {
        return {
          path: file.path,
          mode: '100644',
          type: 'blob',
          sha: null,
        }
      }

      const blob = await readJson<{ sha: string }>(
        `${baseUrl}/git/blobs`,
        {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: file.content,
            encoding: 'utf-8',
          }),
        },
        `GitHub create blob ${file.path}`,
      )

      return {
        path: file.path,
        mode: '100644',
        type: 'blob',
        sha: blob.sha,
      }
    }),
  )

  const tree = await readJson<{ sha: string }>(
    `${baseUrl}/git/trees`,
    {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base_tree: baseCommit.tree.sha,
        tree: treeItems,
      }),
    },
    'GitHub create tree',
  )

  const commit = await readJson<{ sha: string }>(
    `${baseUrl}/git/commits`,
    {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        tree: tree.sha,
        parents: [ref.object.sha],
      }),
    },
    'GitHub create commit',
  )

  await readJson<unknown>(
    `${baseUrl}/git/refs/heads/${encodeURIComponent(branch)}`,
    {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sha: commit.sha, force: false }),
    },
    'GitHub update branch ref',
  )

  return commit
}

export async function readGitHubBytes(path: string, { ref }: { ref?: string } = {}) {
  const { token, repo, branch } = getGitHubConfig()
  const json = await readJson<{ content: string; sha: string; encoding: string }>(
    `https://api.github.com/repos/${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref ?? branch)}`,
    { headers: githubHeaders(token) }, 'GitHub read artifact bytes')
  if (json.encoding !== 'base64') throw new Error('GitHub artifact encoding unsupported')
  return { bytes: Buffer.from(json.content, 'base64'), sha: json.sha }
}

// Opaque historical bytes identified by authenticated inventory/claim metadata.
// No article decoding and no unbounded repository path or arbitrary destination.
export async function readGitHubBlobBytes(sha: string): Promise<Buffer> {
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('invalid_git_blob')
  const { token, repo } = getGitHubConfig()
  const json = await readJson<{ content: string; sha: string; encoding: string }>(
    `https://api.github.com/repos/${repo}/git/blobs/${sha}`,
    { headers: githubHeaders(token) }, 'GitHub read comparison baseline')
  if (json.encoding !== 'base64' || json.sha !== sha) throw new Error('invalid_git_blob_response')
  return Buffer.from(json.content, 'base64')
}

// Search only this known article's bounded history at the pinned branch head.
// A signed Human receipt, not commit metadata, authenticates the returned bytes.
export async function readGitHubApprovedBaselineBytes(path: string, rawVersion: string, ref: string): Promise<Buffer> {
  if (!/^content\/posts\/\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md$/.test(path) || !/^[a-f0-9]{64}$/.test(rawVersion) || !/^[a-f0-9]{40}$/.test(ref)) throw new Error('invalid_approved_baseline_request')
  const { token, repo } = getGitHubConfig()
  const history = await readJson<{ sha: string }[]>(
    `https://api.github.com/repos/${repo}/commits?path=${encodeURIComponent(path)}&sha=${ref}&per_page=20`,
    { headers: githubHeaders(token) }, 'GitHub read bounded article history')
  if (!Array.isArray(history) || history.length > 20 || history.some(item => !/^[a-f0-9]{40}$/.test(item.sha))) throw new Error('invalid_approved_baseline_history')
  for (const item of history) {
    const { bytes } = await readGitHubBytes(path, { ref: item.sha })
    if (createHash('sha256').update(bytes).digest('hex') === rawVersion) return bytes
  }
  throw new Error('approved_baseline_not_found')
}
