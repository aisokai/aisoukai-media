import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readDeployedPostFile } from '../src/lib/deployedPostFile.mjs'

test('exact deployed bytes, missing files and invalid paths remain fail closed', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aisoukai-deployed-post-synthetic-'))
  const original = process.cwd()
  await mkdir(join(root, 'content/posts'), { recursive: true })
  const bytes = Buffer.from('synthetic\r\n日本語\n')
  await writeFile(join(root, 'content/posts/2026-09-19-synthetic.md'), bytes)
  process.chdir(root)
  try {
    assert.deepEqual(await readDeployedPostFile('content/posts/2026-09-19-synthetic.md'), bytes)
    await assert.rejects(readDeployedPostFile('content/posts/2026-09-19-absent.md'), { code: 'ENOENT' })
    for (const path of ['../outside', '/content/posts/2026-09-19-synthetic.md', 'content/posts/../2026-09-19-synthetic.md', 'content/posts/nested/2026-09-19-synthetic.md', 'content/posts/2026-09-19-synthetic.md\n', 'data/example.json', null]) {
      await assert.rejects(readDeployedPostFile(path), /invalid_deployed_post_path/)
    }
  } finally {
    process.chdir(original)
  }
})
