import { getContentVersion } from '../../src/lib/dmpArticleState.mjs'

// Confirms the same version from the already-fetched admin source branch.
// It never fetches, pushes, or otherwise synchronizes that source.
export function confirmAdminReviewSourceVersion({ localData, localContent, sourceData, sourceContent } = {}) {
  const contentVersion = getContentVersion(localData, localContent)
  if (getContentVersion(sourceData, sourceContent) !== contentVersion) return null
  return { status: 'confirmed', source: 'admin-review-source', contentVersion }
}
