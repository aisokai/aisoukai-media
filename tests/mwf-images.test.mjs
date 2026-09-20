import test from 'node:test'
import assert from 'node:assert/strict'
import {selectMwfImage, imageShortageNotice} from '../scripts/lib/mwf-images.mjs'
import {serializeMwfArticle} from '../src/lib/mwfArticleSerialization.mjs'
function fixture() {
  const topic = {id: 'synthetic-topic', title: 'Synthetic topic'}
  const asset = {id: 'synthetic', path: '/images/library/general/synthetic.png', alt: 'Synthetic image',
    license_status: 'pending_review', content_sha256: 'a'.repeat(64), git_blob: 'b'.repeat(40),
    draft_use_authorization: {topic_id: topic.id, content_sha256: 'a'.repeat(64), evidence: 'synthetic_teacher_draft_permission'},
    topic_assignment: {topic_id: topic.id, title: topic.title, status: 'visually_matched', evidence: 'synthetic_visual_review'}}
  return {topic, asset, library: {images: [asset]}, tree: {truncated: false, tree: [{path: `public${asset.path}`, type: 'blob', mode: '100644', sha: asset.git_blob}]}}
}
test('only an explicit visually matched exact topic and title selects a draft image', () => {
  const f = fixture(), selected = selectMwfImage(f.library, f.topic, f.tree)
  assert.equal(selected.image, f.asset.path)
  assert.equal(selected.image_selection_status, 'assigned_pending_review')
  assert.equal(f.asset.license_status, 'pending_review')
  assert.equal(Object.hasOwn(selected, 'reviewed'), false)
})
test('an approved generic image or wrong-topic mapping never fills an unrelated article', () => {
  const f = fixture()
  f.library.images.unshift({path: '/images/library/general/generic.png', alt: 'Generic', license_status: 'approved', license_source: 'Synthetic', license_note: 'Synthetic verified'})
  assert.equal(selectMwfImage(f.library, {id: 'other', title: f.topic.title}, f.tree).image, '')
  assert.equal(selectMwfImage(f.library, {...f.topic, title: 'Changed topic meaning'}, f.tree).image, '')
})
test('missing, changed or non-regular file and truncated inventory remain unset', () => {
  for (const variant of ['missing', 'changed', 'symlink', 'truncated']) {
    const f = fixture()
    if (variant === 'missing') f.tree.tree = []
    if (variant === 'changed') f.tree.tree[0].sha = 'c'.repeat(40)
    if (variant === 'symlink') f.tree.tree[0].mode = '120000'
    if (variant === 'truncated') f.tree.truncated = true
    assert.equal(selectMwfImage(f.library, f.topic, f.tree).image, '', variant)
  }
})
test('ambiguous topic mappings fail rather than selecting first', () => {
  const f = fixture(); f.library.images.push(structuredClone(f.asset))
  assert.equal(selectMwfImage(f.library, f.topic, f.tree).image_selection_reason, 'ambiguous_topic_assignment')
})
test('same image registered under another topic or identity fails as duplicate', () => {
  for (const duplicateField of ['path', 'content_sha256', 'git_blob']) {
    const f = fixture(); f.library.images.push({[duplicateField]: f.asset[duplicateField], topic_assignment: {topic_id: 'different'}})
    assert.equal(selectMwfImage(f.library, f.topic, f.tree).image_selection_reason, 'duplicate_image_assignment')
  }
})
test('usage permission must bind exact topic and bytes, never infer from AI source', () => {
  for (const variant of ['missing', 'topic', 'hash', 'evidence']) {
    const f = fixture()
    if (variant === 'missing') delete f.asset.draft_use_authorization
    if (variant === 'topic') f.asset.draft_use_authorization.topic_id = 'other'
    if (variant === 'hash') f.asset.draft_use_authorization.content_sha256 = 'c'.repeat(64)
    if (variant === 'evidence') f.asset.draft_use_authorization.evidence = ''
    assert.equal(selectMwfImage(f.library, f.topic, f.tree).image, '')
  }
})
test('inactive, unreviewed, invalid or incomplete assignments cannot be used', () => {
  for (const patch of [{usage_status: 'inactive'}, {path: '/images/library/../secret.png'}, {alt: ''}, {git_blob: ''}]) {
    const f = fixture(); Object.assign(f.asset, patch); assert.equal(selectMwfImage(f.library, f.topic, f.tree).image, '')
  }
  const f = fixture(); f.asset.topic_assignment.status = 'suggested'
  assert.equal(selectMwfImage(f.library, f.topic, f.tree).image, '')
})
test('missing marker survives serialization and produces a body-free notification warning', () => {
  const f = fixture(), selected = selectMwfImage(f.library, {id: 'other'}, f.tree)
  const raw = serializeMwfArticle('Never include this body in the warning.', {title: 'Synthetic', ...selected})
  assert.match(raw, /image_selection_status: "missing"/)
  assert.match(imageShortageNotice(raw), /画像不足/)
  assert.doesNotMatch(imageShortageNotice(raw), /Never include/)
  assert.equal(imageShortageNotice(serializeMwfArticle('image_selection_status: "missing"', {title: 'Synthetic'})), '')
})

test('legacy registration without hashes cannot disguise duplicate bytes under another path', () => {
  const f = fixture(), legacyPath = '/images/library/pediatric/legacy-caries.png'
  f.library.images.push({id: 'legacy', path: legacyPath})
  f.tree.tree.push({path: `public${legacyPath}`, type: 'blob', mode: '100644', sha: f.asset.git_blob})
  assert.equal(selectMwfImage(f.library, f.topic, f.tree).image_selection_reason, 'duplicate_image_assignment')
  f.tree.tree[1].sha = 'd'.repeat(40)
  assert.equal(selectMwfImage(f.library, f.topic, f.tree).image, f.asset.path)
})
