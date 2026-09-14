import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseCsv } from '../../scripts/csv-parser.mjs'
import { createHmac, timingSafeEqual, createHash } from 'node:crypto'
import { getReviewedContentFingerprint } from './reviewContentFingerprint.mjs'
export const BLOG_POLICY_VERSION = 'aisoukai-media-tiered-blog-2026-09-14'
export const BLOG_POLICY_EVIDENCE = 'teacher_20260914_explicit_blog_three_levels_and_scoped_validator_execution_amendment'
const REPO = 'aisokai/aisoukai-media/main'
const HASH = /^[a-f0-9]{64}$/
const CHECKS = ['content','image','duplication','medical','validation']
const canonical = value => JSON.stringify(value, (_key, item) => item && typeof item==='object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))) : item)
function key(secret) { return secret ?? process.env.ADMIN_REVIEW_COOKIE_SECRET ?? '' }
export function signBlogEvidence(purpose, payload, secret) {
  const signingKey = key(secret)
  if (!signingKey) throw Error('blog_evidence_key_missing')
  const envelope = { schema: 1, purpose, repository: REPO, policyVersion: BLOG_POLICY_VERSION, payload }
  return { ...envelope, signature: createHmac('sha256',signingKey).update(canonical(envelope)).digest('hex') }
}
export function verifyBlogEvidence(value, purpose, secret) {
  try {
    if (!key(secret) || value?.schema!==1 || value.purpose!==purpose || value.repository!==REPO || value.policyVersion!==BLOG_POLICY_VERSION || !HASH.test(value.signature)) return null
    const { signature, ...envelope } = value
    const expected=createHmac('sha256',key(secret)).update(canonical(envelope)).digest('hex')
    return timingSafeEqual(Buffer.from(signature),Buffer.from(expected)) ? value.payload : null
  } catch { return null }
}
export function topicContentVersion(topic) {
  const aliases={ id:['id','topic_id'],title:['title_candidate','title'],category:['category'],keyword:['target_keyword','keyword'],intent:['patient_intent','search_intent'],topic:['topic'],risk:['medical_risk'],status:['status'],date:['publish_date'],notes:['notes'] }
  const normalized=Object.fromEntries(Object.entries(aliases).map(([field,names])=>[field,String(names.map(name=>topic[name]).find(v=>v!==undefined)??'').trim()]))
  return createHash('sha256').update(canonical(normalized)).digest('hex')
}
// Caller is the existing authenticated Human topic-adoption action, never a model.
export function issueTopicAdoption(topic, secret, at = new Date().toISOString()) {
  if (topic.status!=='approved' || !/^[A-Za-z0-9_-]{1,100}$/.test(topic.id??'')) throw Error('topic_not_adopted')
  return signBlogEvidence('teacher-topic-adoption',{topicId:topic.id,topicVersion:topicContentVersion(topic),editorialPolicy:BLOG_POLICY_VERSION,evidence:BLOG_POLICY_EVIDENCE,adoptedAt:at},secret)
}
export function verifyTieredCertificate(data, content, secret) {
  if (isProtectedEditorialInput(data,content) || !['low','medium'].includes(data.medical_risk) || data.publication_tier==='important' || data.publication_tier==='unknown' || data.sensitive_data===true) return false
  const proof=verifyBlogEvidence(data.tiered_review_proof,'independent-article-review',secret)
  if (!proof || proof.contentVersion!==getReviewedContentFingerprint(data,content) || !HASH.test(proof.contentVersion) || !['minor','normal'].includes(proof.tier) || data.publication_tier!==proof.tier) return false
  if (proof.generatorId!==data.generation_run_id || typeof proof.reviewerId!=='string' || !proof.reviewerId.startsWith('openai:') || proof.reviewerId===proof.generatorId || !/^(openai|editor):/.test(proof.generatorId??'')) return false
  if (!CHECKS.every(check=>proof.checks?.[check]===true) || proof.medicalMeaningChanged!==false || proof.decision!=='pass') return false
  if (proof.path!==data.publication_path || !/^[a-f0-9]{40}$/.test(proof.imageGitBlob??'') || !HASH.test(proof.imageHash??'') || !HASH.test(proof.licenseVersion??'') || data.image_content_hash!==proof.imageHash) return false
  if (proof.tier==='minor') {
    const base=verifyBlogEvidence(proof.baseline,'human-approved-baseline',secret)
    return Boolean(base && HASH.test(base.contentVersion??'') && HASH.test(base.rawVersion??'') && base.path===proof.path && proof.changeKind==='typo-format-link')
  }
  const adoption=verifyBlogEvidence(proof.adoption,'teacher-topic-adoption',secret)
  return Boolean(adoption && adoption.topicId===data.source_topic_id && adoption.topicVersion===data.source_topic_version && adoption.editorialPolicy===BLOG_POLICY_VERSION)
}
// Runtime guardian supplies actual provider identities and validated evidence.
// Provider output never supplies a signature, identity, adoption, or final hash.
export function certifyIndependentReview({data,content,reviewerId,decision,adoption,baseline,path,imageEvidence,secret}) {
  if (!['minor','normal'].includes(decision?.tier) || decision.decision!=='pass' || decision.medicalMeaningChanged!==false || !CHECKS.every(check=>decision.checks?.[check]===true)) return null
  if (!/^content\/posts\/\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md$/.test(path??'')) return null
  if (decision.tier==='minor' && (!baseline || baseline.data.reviewed!==true || !baseline.data.reviewed_by || !baseline.data.reviewed_at || baseline.data.draft || baseline.data.archived || baseline.data.rejection_reason || baseline.data.reviewed_content_hash!==getReviewedContentFingerprint(baseline.data,baseline.content) || decision.changeKind!=='typo-format-link')) return null
  if (decision.tier==='normal') {
    const adopted=verifyBlogEvidence(adoption,'teacher-topic-adoption',secret)
    if (!adopted || adopted.topicId!==data.source_topic_id || adopted.topicVersion!==data.source_topic_version) return null
  }
  if(!/^[a-f0-9]{40}$/.test(imageEvidence?.gitBlob??'') || !HASH.test(imageEvidence?.hash??'') || !HASH.test(imageEvidence?.licenseVersion??''))return null
  const next={...data,image_content_hash:imageEvidence.hash,publication_path:path,publication_tier:decision.tier,draft:false,auto_approved:true,reviewed:false,publication_status:'auto_approved'}
  const payload={path,imageHash:imageEvidence.hash,imageGitBlob:imageEvidence.gitBlob,licenseVersion:imageEvidence.licenseVersion,contentVersion:getReviewedContentFingerprint(next,content),generatorId:next.generation_run_id,reviewerId,tier:decision.tier,decision:'pass',medicalMeaningChanged:false,checks:decision.checks,...(decision.tier==='minor'?{baseline:signBlogEvidence('human-approved-baseline',{path,contentVersion:getReviewedContentFingerprint(baseline.data,baseline.content),rawVersion:createHash('sha256').update(canonical(baseline)).digest('hex')},secret),changeKind:'typo-format-link'}:{adoption})}
  next.tiered_review_proof=signBlogEvidence('independent-article-review',payload,secret)
  return verifyTieredCertificate(next,content,secret)?next:null
}

export function imageLicenseVersion(asset) {
  return createHash('sha256').update(canonical({path:asset.path,status:asset.license_status,source:asset.license_source,note:asset.license_note,usage:asset.usage_status??'active'})).digest('hex')
}
export function assessTieredPublication(data,content,secret,context) {
  if(!verifyTieredCertificate(data,content,secret))return false
  try {
    const proof=data.tiered_review_proof.payload
    if(context?.path!==proof.path)return false
    if(!/^\/images\/[A-Za-z0-9_./-]+$/.test(data.image??'')||data.image.includes('..'))return false
    const imageHash=context?.imageHash??createHash('sha256').update(readFileSync(join(process.cwd(),'public',data.image))).digest('hex')
    const asset=context?.asset??JSON.parse(readFileSync(join(process.cwd(),'data/image-library.json'),'utf8')).images?.find(i=>i.path===data.image)
    if(imageHash!==proof.imageHash||!asset||!['approved','verified'].includes(asset.license_status)||imageLicenseVersion(asset)!==proof.licenseVersion)return false
    if(proof.tier==='normal'){
      const topic=context?.topic??parseCsv(readFileSync(join(process.cwd(),'data/article-topics.sample.csv'),'utf8')).find(t=>t.id===data.source_topic_id)
      if(!topic||topic.status!=='approved'||topicContentVersion(topic)!==data.source_topic_version)return false
    }
    return true
  }catch{return false}
}

export function isProtectedEditorialInput(data, text = '') {
  if(data?.sensitive_data===true||data?.contains_patient_data===true||data?.contains_private_message===true||['patient','private','sensitive','unknown'].includes(data?.data_sensitivity))return true
  return /患者名|患者ID|生年月日|カルテ番号|個別症例|患者症例|実際の患者|private[_ -]?message|patient[_ -]?id|case report/i.test(JSON.stringify(data??{})+'\n'+text)
}
