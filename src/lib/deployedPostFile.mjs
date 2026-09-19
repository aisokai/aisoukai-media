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
