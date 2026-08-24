// Canonical-core adapter for the DMP Action facade.
//
// This module deliberately owns no Action state.  A caller supplies the core
// implementation and the adapter only validates the transport boundary,
// preserves the original action envelope, and returns fail-closed errors.

const CORE_METHODS = Object.freeze([
  'listActions',
  'getAction',
  'createAction',
  'validateAction',
  'transitionAction',
  'getActionSummary',
])

function error(code, message) {
  return { ok: false, errors: [{ code, message }] }
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value))
}

function hasExpectedSnapshotHash(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function mapAction(sourceAction) {
  if (!sourceAction || typeof sourceAction !== 'object' || Array.isArray(sourceAction)) {
    return null
  }
  if (typeof sourceAction.type !== 'string' || !sourceAction.type) return null
  if (typeof sourceAction.status !== 'string' || !sourceAction.status) return null

  const source = deepClone(sourceAction)
  return {
    ...source,
    // Keep the canonical values at the transport boundary.  `source_action`
    // is retained in full so future core fields cannot be silently dropped.
    type: source.type,
    status: source.status,
    source_action: source,
  }
}

function mapActionData(data) {
  if (Array.isArray(data)) {
    const mapped = data.map(mapAction)
    return mapped.some((action) => action === null) ? null : mapped
  }
  return mapAction(data)
}

function isCoreResult(result) {
  return result && typeof result === 'object' && typeof result.ok === 'boolean'
}

/**
 * Create a stateless adapter over a canonical Action transport core.
 *
 * Each core method may be synchronous or asynchronous and must return
 * `{ ok: boolean, data?: unknown, errors?: unknown[] }`.  The adapter does
 * not substitute a local store when the core is unavailable.
 */
export function createActionTransport({ core } = {}) {
  const missing = CORE_METHODS.filter((method) => typeof core?.[method] !== 'function')

  async function invoke(method, args, mapData) {
    if (missing.length > 0) {
      return error('core_unavailable', `canonical core transport is unavailable (${missing.join(', ')})`)
    }

    let result
    try {
      result = await core[method](args)
    } catch {
      return error('core_unavailable', `canonical core transport failed during ${method}`)
    }

    if (!isCoreResult(result)) {
      return error('invalid_core_response', `canonical core transport returned an invalid ${method} response`)
    }
    if (!result.ok) {
      // In particular, retain a canonical CAS conflict rather than collapsing
      // it into a generic adapter error.
      return {
        ok: false,
        errors: Array.isArray(result.errors) && result.errors.length > 0
          ? deepClone(result.errors)
          : [{ code: 'core_rejected', message: `${method} was rejected by the canonical core` }],
      }
    }

    const data = mapData ? mapData(result.data) : result.data
    if (data === null) {
      return error('invalid_core_response', `canonical core transport returned invalid Action data for ${method}`)
    }
    return { ok: true, data }
  }

  return Object.freeze({
    listActions(filters = {}) {
      return invoke('listActions', filters, mapActionData)
    },
    getAction({ id } = {}) {
      if (typeof id !== 'string' || !id) return Promise.resolve(error('invalid_request', 'id is required'))
      return invoke('getAction', { id }, mapActionData)
    },
    createAction({ input } = {}) {
      if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return Promise.resolve(error('invalid_request', 'input is required'))
      }
      return invoke('createAction', { input }, mapActionData)
    },
    validateAction({ id, expected_snapshot_hash: expectedSnapshotHash } = {}) {
      if (typeof id !== 'string' || !id) return Promise.resolve(error('invalid_request', 'id is required'))
      if (!hasExpectedSnapshotHash(expectedSnapshotHash)) {
        return Promise.resolve(error('expected_snapshot_hash_required', 'expected_snapshot_hash is required'))
      }
      return invoke('validateAction', { id, expected_snapshot_hash: expectedSnapshotHash }, mapActionData)
    },
    transitionAction({ id, to_status: toStatus, expected_snapshot_hash: expectedSnapshotHash } = {}) {
      if (typeof id !== 'string' || !id) return Promise.resolve(error('invalid_request', 'id is required'))
      if (typeof toStatus !== 'string' || !toStatus) return Promise.resolve(error('invalid_request', 'to_status is required'))
      if (!hasExpectedSnapshotHash(expectedSnapshotHash)) {
        return Promise.resolve(error('expected_snapshot_hash_required', 'expected_snapshot_hash is required'))
      }
      return invoke('transitionAction', {
        id,
        to_status: toStatus,
        expected_snapshot_hash: expectedSnapshotHash,
      }, mapActionData)
    },
    getActionSummary() {
      return invoke('getActionSummary', undefined, null)
    },
  })
}
