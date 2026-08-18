import test from 'node:test'
import assert from 'node:assert/strict'

import { createActionTransport } from './dmp-action-transport.mjs'

function action(overrides = {}) {
  return {
    id: 'act-1',
    type: 'content.review.approve',
    status: 'pending',
    channel: 'blog',
    nested: { unchanged: true },
    ...overrides,
  }
}

function core(overrides = {}) {
  return {
    listActions: () => ({ ok: true, data: [action()] }),
    getAction: () => ({ ok: true, data: action() }),
    createAction: () => ({ ok: true, data: action() }),
    validateAction: () => ({ ok: true, data: action({ status: 'validated' }) }),
    transitionAction: () => ({ ok: true, data: action({ status: 'waiting_human' }) }),
    getActionSummary: () => ({ ok: true, data: { total: 1, pending: 1 } }),
    ...overrides,
  }
}

test('collection and detail retain the full source action and exact type/status', async () => {
  const transport = createActionTransport({ core: core() })
  const collection = await transport.listActions({ status: 'pending' })
  const detail = await transport.getAction({ id: 'act-1' })

  assert.equal(collection.ok, true)
  assert.equal(collection.data[0].type, 'content.review.approve')
  assert.equal(collection.data[0].status, 'pending')
  assert.deepEqual(collection.data[0].source_action, action())
  assert.equal(detail.ok, true)
  assert.deepEqual(detail.data.source_action, action())
  assert.notEqual(detail.data.source_action, detail.data)
})

test('create maps the canonical result without obtaining local persistence authority', async () => {
  let received
  const transport = createActionTransport({
    core: core({
      createAction: (request) => {
        received = request
        return { ok: true, data: action() }
      },
    }),
  })
  const input = { type: 'content.review.approve' }
  const result = await transport.createAction({ input })

  assert.equal(result.ok, true)
  assert.deepEqual(received, { input })
  assert.equal(result.data.source_action.id, 'act-1')
})

test('validate and transition require and forward expected_snapshot_hash unchanged', async () => {
  const calls = []
  const transport = createActionTransport({
    core: core({
      validateAction: (request) => {
        calls.push(['validate', request])
        return { ok: true, data: action({ status: 'validated' }) }
      },
      transitionAction: (request) => {
        calls.push(['transition', request])
        return { ok: true, data: action({ status: 'waiting_human' }) }
      },
    }),
  })

  const missing = await transport.transitionAction({ id: 'act-1', to_status: 'waiting_human' })
  assert.equal(missing.ok, false)
  assert.equal(missing.errors[0].code, 'expected_snapshot_hash_required')

  assert.equal((await transport.validateAction({ id: 'act-1', expected_snapshot_hash: 'abc' })).ok, true)
  assert.equal((await transport.transitionAction({ id: 'act-1', to_status: 'waiting_human', expected_snapshot_hash: 'def' })).ok, true)
  assert.deepEqual(calls, [
    ['validate', { id: 'act-1', expected_snapshot_hash: 'abc' }],
    ['transition', { id: 'act-1', to_status: 'waiting_human', expected_snapshot_hash: 'def' }],
  ])
})

test('core failures, malformed results, and missing methods fail closed', async () => {
  const rejected = createActionTransport({ core: core({ getAction: () => ({ ok: false, errors: [{ code: 'snapshot_mismatch' }] }) }) })
  const malformed = createActionTransport({ core: core({ getAction: () => ({ data: action() }) }) })
  const unavailable = createActionTransport({ core: {} })

  assert.equal((await rejected.getAction({ id: 'act-1' })).errors[0].code, 'snapshot_mismatch')
  assert.equal((await malformed.getAction({ id: 'act-1' })).errors[0].code, 'invalid_core_response')
  assert.equal((await unavailable.getAction({ id: 'act-1' })).errors[0].code, 'core_unavailable')
})

test('summary is passed through and action mappings fail closed on missing type or status', async () => {
  const transport = createActionTransport({ core: core() })
  assert.deepEqual(await transport.getActionSummary(), { ok: true, data: { total: 1, pending: 1 } })

  const invalid = createActionTransport({ core: core({ getAction: () => ({ ok: true, data: { id: 'act-1', type: 'x' } }) }) })
  assert.equal((await invalid.getAction({ id: 'act-1' })).errors[0].code, 'invalid_core_response')
})
