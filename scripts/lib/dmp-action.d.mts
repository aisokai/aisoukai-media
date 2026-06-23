export const ACTION_TYPES: readonly string[]
export const ACTION_STATUSES: readonly string[]
export const CHANNELS: readonly string[]
export const ORIGIN_SURFACES: readonly string[]
export const PHASE2_BLOCKED_TYPES: ReadonlySet<string>
export const EXTERNAL_EFFECT_TYPES: ReadonlySet<string>
export const VALID_TRANSITIONS: Readonly<Record<string, readonly string[]>>

export function validateActionInput(input: unknown): { valid: boolean; errors: string[] }
export function shouldBlockOnCreate(input: unknown): boolean
export function createAction(input: unknown): { ok: boolean; data?: Record<string, unknown>; errors?: string[] }
export function serializeAction(action: unknown): string
export function deserializeAction(json: string): { ok: boolean; data?: Record<string, unknown>; errors?: string[] }
