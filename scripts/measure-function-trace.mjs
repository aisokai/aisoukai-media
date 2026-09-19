import { mkdtemp, mkdir, writeFile, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

// Only synthetic files enter the tracing root. No application build, environment
// loading, runtime imports, real articles or existing compiled bundles are used.
export async function measureFunctionTrace(nftModulePath) {
  const loaded = await import(pathToFileURL(resolve(nftModulePath)).href)
  const nodeFileTrace = loaded.nodeFileTrace ?? loaded.default?.nodeFileTrace
  if (typeof nodeFileTrace !== 'function') throw new Error('nft_module_required')
  const root = await mkdtemp(join(tmpdir(), 'aisoukai-trace-synthetic-'))
  const helper = await readFile(new URL('../src/lib/deployedPostFile.mjs', import.meta.url), 'utf8')
  const fixture = {
    'content/posts/2026-09-19-synthetic.md': Buffer.from('synthetic article\n'),
    'public/images/synthetic.bin': Buffer.alloc(1024 * 1024, 1),
    'tmp/synthetic.bin': Buffer.alloc(256 * 1024, 2),
    'data/synthetic.json': Buffer.from('{"synthetic":true}\n'),
  }
  for (const [name, bytes] of Object.entries(fixture)) {
    await mkdir(join(root, name, '..'), { recursive: true })
    await writeFile(join(root, name), bytes)
  }
  // The before body is the removed production expression, with artifactPath
  // remaining an unknown runtime argument, just as in the server adapter.
  await writeFile(join(root, 'before.mjs'), "import {readFile} from 'node:fs/promises'; import {join} from 'node:path'; export const readDeployedPostFile = artifactPath => readFile(join(process.cwd(), artifactPath));\n")
  await writeFile(join(root, 'after.mjs'), helper)
  const results = {}
  for (const variant of ['before', 'after']) {
    const result = await nodeFileTrace([join(root, `${variant}.mjs`)], { base: root, processCwd: root })
    const files = [...result.fileList].sort()
    const fixtureFiles = files.filter(name => Object.hasOwn(fixture, name))
    results[variant] = {
      files,
      fixtureFiles,
      fixtureBytes: fixtureFiles.reduce((sum, name) => sum + fixture[name].length, 0),
      tracedBytes: (await Promise.all(files.map(async name => (await stat(join(root, name))).size))).reduce((a, b) => a + b, 0),
      warnings: [...result.warnings].map(warning => warning.message),
    }
  }
  return { root, measurement: 'synthetic_fixture_only_not_production_or_billed_storage', ...results }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error('usage: node scripts/measure-function-trace.mjs /absolute/path/to/nft/index.js')
  console.log(JSON.stringify(await measureFunctionTrace(process.argv[2]), null, 2))
}
