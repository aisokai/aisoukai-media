import { toThemeReadyResult } from './theme-ops-fallback.mjs'

// This is an intentionally pre-model boundary.  It only turns an already
// validated theme intake into immutable data a later, separately-authorized
// draft generator could consume.
export const THEME_BLOG_DRAFT_GENERATION_REQUEST_SCHEMA = 'theme-blog-draft-generation-request.v1'

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const nested of Object.values(value)) deepFreeze(nested)
  return Object.freeze(value)
}

/**
 * Build a deterministic draft-generation request from theme-ready-blog-intake.v1.
 *
 * Validation is delegated to the existing theme intake validator. It rejects
 * malformed, incomplete, unsafe, or forged lineage before this function
 * constructs any request. This module performs no I/O, model call, generation,
 * review, publication, dispatch, or UI operation.
 */
export function buildThemeBlogDraftGenerationRequest(intake) {
  const validated = toThemeReadyResult(intake)
  const request = {
    topic_id: validated.topicId,
    title: validated.title,
    target_keyword: validated.row_snapshot.topic,
    patient_intent: validated.candidate_instruction.patient_value,
    safe_angle: validated.candidate_instruction.safe_angle,
    avoid_claims: [...validated.candidate_instruction.avoid_claims],
    clinic_fit: validated.candidate_instruction.clinic_fit,
    integrity_lineage: { ...validated.integrity_lineage },
  }

  return deepFreeze({
    schema_version: THEME_BLOG_DRAFT_GENERATION_REQUEST_SCHEMA,
    mode: 'pre_model_draft_generation_request',
    status: 'draft_requested',
    generated: false,
    routed: false,
    approved: false,
    published: false,
    dispatched: false,
    request,
  })
}

export const buildDraftGenerationRequest = buildThemeBlogDraftGenerationRequest
