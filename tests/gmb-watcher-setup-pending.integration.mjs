import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { runWatcher } from '../scripts/gmb-review-watcher.mjs'

test('source=api で gmb-location.json が無いとき setup_pending を返し throw しない', async () => {
  const result = await runWatcher({
    source: 'api',
    write: false,
    gmbLocationConfigPath: '/nonexistent/gmb-location.json',
  })
  assert.equal(result.setupPending, true)
  assert.equal(result.total, 0)
  assert.equal(result.newCount, 0)
  assert.deepEqual(result.results, [])
})

test('source=mock のときは location 設定なしでも通常動作する', async () => {
  const result = await runWatcher({
    source: 'mock',
    write: false,
    gmbLocationConfigPath: '/nonexistent/gmb-location.json',
  })
  assert.equal(result.setupPending, undefined)
  assert.ok(result.total >= 0)
})
