type CoreResult = {
  ok: boolean
  data?: unknown
  errors?: unknown[]
}

function unavailable(): CoreResult {
  return {
    ok: false,
    errors: [{
      code: 'core_unavailable',
      message: 'canonical core transport is required; this dry-run facade has no persistence authority',
    }],
  }
}

/**
 * Media 側の Action facade が canonical transport へ渡す local-only core。
 * canonical core が未接続のため、全操作を fail-closed にする。
 */
export const dmpActionCore = {
  listActions(): CoreResult {
    return unavailable()
  },

  getAction(): CoreResult {
    return unavailable()
  },

  createAction(): CoreResult {
    return unavailable()
  },

  validateAction(): CoreResult {
    return unavailable()
  },

  transitionAction(): CoreResult {
    return unavailable()
  },

  getActionSummary(): CoreResult {
    return unavailable()
  },
}
