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
  name: string
  path: string
  type: 'file' | 'dir' | string
}

export type GitHubCommitFile = {
  path: string
  content: string | null
}

function getGitHubConfig(): GitHubConfig {
  const token = process.env.GITHUB_REVIEW_TOKEN
  const repo = process.env.GITHUB_REVIEW_REPO ?? 'aisokai/aisoukai-media'
  const branch = process.env.GITHUB_REVIEW_BRANCH ?? 'main'
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
  const res = await fetch(url, { ...init, cache: 'no-store' })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`${label} failed: ${res.status} ${body}`)
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

export async function readGitHubDirectory(path: string): Promise<GitHubDirectoryEntry[]> {
  const { token, repo, branch } = getGitHubConfig()
  const json = await readJson<GitHubDirectoryEntry[]>(
    `https://api.github.com/repos/${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`,
    { headers: githubHeaders(token) },
    `GitHub read directory ${path}`,
  )

  return json
}

export async function commitGitHubFiles(message: string, files: GitHubCommitFile[], { expectedHeadSha }: { expectedHeadSha?: string } = {}) {
  const { token, repo, branch } = getGitHubConfig()
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
