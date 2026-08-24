export const ACTION_TYPES: readonly string[]
export const ACTION_STATUSES: readonly string[]
export const CHANNELS: readonly string[]
export const ORIGIN_SURFACES: readonly string[]
export const PHASE2_BLOCKED_TYPES: ReadonlySet<string>
export const EXTERNAL_EFFECT_TYPES: ReadonlySet<string>
export const VALID_TRANSITIONS: Readonly<Record<string, readonly string[]>>

export type DmpActionTransportError = unknown
export type DmpActionTransportResult<T = unknown> = {
  ok: boolean
  data?: T
  errors?: DmpActionTransportError[]
}

export type DmpTransportAction = Record<string, unknown> & {
  id: string
  type: string
  status: string
  source_action: Record<string, unknown>
}

export type DmpActionTransportCore = {
  listActions(filters?: { status?: string; channel?: string; origin_surface?: string }): DmpActionTransportResult | Promise<DmpActionTransportResult>
  getAction(request: { id: string }): DmpActionTransportResult | Promise<DmpActionTransportResult>
  createAction(request: { input: object }): DmpActionTransportResult | Promise<DmpActionTransportResult>
  validateAction(request: { id: string; expected_snapshot_hash: string }): DmpActionTransportResult | Promise<DmpActionTransportResult>
  transitionAction(request: { id: string; to_status: string; expected_snapshot_hash: string }): DmpActionTransportResult | Promise<DmpActionTransportResult>
  getActionSummary(): DmpActionTransportResult | Promise<DmpActionTransportResult>
}

export type DmpActionTransport = {
  listActions(filters?: { status?: string; channel?: string; origin_surface?: string }): Promise<DmpActionTransportResult<DmpTransportAction[]>>
  getAction(request: { id: string }): Promise<DmpActionTransportResult<DmpTransportAction>>
  createAction(request: { input: object }): Promise<DmpActionTransportResult<DmpTransportAction>>
  validateAction(request: { id: string; expected_snapshot_hash: string }): Promise<DmpActionTransportResult<DmpTransportAction>>
  transitionAction(request: { id: string; to_status: string; expected_snapshot_hash: string }): Promise<DmpActionTransportResult<DmpTransportAction>>
  getActionSummary(): Promise<DmpActionTransportResult>
}

export function createActionTransport(options?: { core?: DmpActionTransportCore }): DmpActionTransport

export function validateActionInput(input: unknown): { valid: boolean; errors: string[] }
export function shouldBlockOnCreate(input: unknown): boolean
export function createAction(input: unknown): { ok: boolean; data?: Record<string, unknown>; errors?: string[] }
export function serializeAction(action: unknown): string
export function deserializeAction(json: string): { ok: boolean; data?: Record<string, unknown>; errors?: string[] }
