import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

// Keep the static directory visible to output-file tracing. Callers still verify
// these exact deployed bytes against the canonical article/receipt hash.
export async function readDeployedPostFile(artifactPath) {
  if (typeof artifactPath !== 'string' || !/^content\/posts\/\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md$/.test(artifactPath)) {
    throw new Error('invalid_deployed_post_path')
  }
  const filename = artifactPath.slice('content/posts/'.length)
  return readFile(join(process.cwd(), 'content', 'posts', filename))
}

// A freshly synced article can be absent from the still-running old deployment.
// Only absence is pending; invalid paths and all other IO failures still reject.
export async function readDeployedPostFileIfPresent(artifactPath) {
  try {
    return await readDeployedPostFile(artifactPath)
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}
