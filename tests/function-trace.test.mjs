import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { measureFunctionTrace } from '../scripts/measure-function-trace.mjs'

test('deployed article trace keeps articles without tracing unrelated root assets', async () => {
  const nft = createRequire(import.meta.url).resolve('next/dist/compiled/@vercel/nft')
  const result = await measureFunctionTrace(nft)
  // Standalone NFT cannot infer the previous unknown root-relative filename.
  // Turbopack's broader inclusion must be measured by a separate Next build;
  // this test proves required-file retention, not production size savings.
  assert.deepEqual(result.before.fixtureFiles, [])
  assert.deepEqual(result.after.fixtureFiles, ['content/posts/2026-09-19-synthetic.md'])
  assert.equal(result.after.fixtureBytes, 18)
  assert.deepEqual(result.after.warnings, [])
})
