// Draft-only topic assignments. Categories/tags never supply fallback images.
const SAFE_PATH = /^\/images\/library\/[A-Za-z0-9_/-]+\.(?:png|jpe?g|webp)$/
const HASH = /^[a-f0-9]{64}$/
const GIT_BLOB = /^[a-f0-9]{40}$/
export function imageShortage(reason = 'no_topic_assignment') {
  return { image: '', image_selection_status: 'missing', image_selection_reason: reason }
}
export function selectMwfImage(library, topic, tree) {
  if (!Array.isArray(library?.images) || !topic?.id) return imageShortage('invalid_image_library_or_topic')
  const title = String(topic.title_candidate ?? topic.title ?? '').trim()
  const candidates = library.images.filter(asset => asset?.topic_assignment?.topic_id === topic.id)
  if (!candidates.length) return imageShortage()
  if (candidates.length !== 1) return imageShortage('ambiguous_topic_assignment')
  const asset = candidates[0], assignment = asset.topic_assignment
  if (!title || assignment.title !== title || assignment.status !== 'visually_matched' ||
      typeof assignment.evidence !== 'string' || !assignment.evidence.trim() ||
      !SAFE_PATH.test(asset.path ?? '') || asset.path.includes('..') || !asset.alt?.trim() ||
      asset.usage_status === 'inactive' || !HASH.test(asset.content_sha256 ?? '') ||
      !GIT_BLOB.test(asset.git_blob ?? '')) return imageShortage('unverified_topic_assignment')
  // Explicit draft permission never grants article publication or stock rights.
  const licensed = ['approved', 'verified'].includes(asset.license_status) && asset.license_source &&
    asset.license_note && !/TODO|要確認|assumed/i.test(asset.license_note)
  const draftPermission = asset.draft_use_authorization?.topic_id === topic.id &&
    asset.draft_use_authorization?.content_sha256 === asset.content_sha256 &&
    typeof asset.draft_use_authorization?.evidence === 'string' && asset.draft_use_authorization.evidence.trim()
  if (!licensed && !draftPermission) return imageShortage('image_usage_unverified')
  if (library.images.some(other => other !== asset && (other?.path === asset.path ||
      other?.content_sha256 === asset.content_sha256 || other?.git_blob === asset.git_blob))) {
    return imageShortage('duplicate_image_assignment')
  }
  if (tree?.truncated !== false || !Array.isArray(tree.tree)) return imageShortage('image_inventory_unavailable')
  const files = tree.tree.filter(file => file.path === `public${asset.path}`)
  if (files.length !== 1 || files[0].type !== 'blob' || files[0].mode !== '100644' || files[0].sha !== asset.git_blob) {
    return imageShortage('image_file_missing_or_changed')
  }
  // Legacy library entries often have no hashes; compare their pinned tree
  // blobs too, so renaming the same bytes never creates another usable choice.
  const otherPaths = new Set(library.images.filter(other => other !== asset && typeof other?.path === 'string').map(other => `public${other.path}`))
  if (tree.tree.some(file => file.type === 'blob' && file.sha === asset.git_blob && otherPaths.has(file.path))) {
    return imageShortage('duplicate_image_assignment')
  }
  return { image: asset.path, image_alt: asset.alt, image_content_hash: asset.content_sha256,
    image_selection_status: 'assigned_pending_review', image_selection_reason: 'explicit_topic_assignment' }
}
// Inspect only our own one-line generated header marker, never interpolate body.
export function imageShortageNotice(raw) {
  if (typeof raw !== 'string' || !raw.startsWith('---\n')) return ''
  const end = raw.indexOf('\n---\n', 4)
  if (end < 0 || end > 128 * 1024) return ''
  return /^image_selection_status: "missing"$/m.test(raw.slice(4, end))
    ? '\n画像不足：この記事に適合を確認できた画像がありません。画像は未設定です。別タスクで生成・保存し、内容確認後に適用してください。' : ''
}
