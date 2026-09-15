import {serializeMwfArticle} from './mwfArticleSerialization.mjs'
import matter from 'gray-matter'
import {serverHash} from './mwfServerAuthority.mjs'
import {signBlogEvidence,verifyBlogEvidence,isProtectedEditorialInput} from './tieredPublication.mjs'
import {getDmpArticleState} from './dmpArticleState.mjs'
import {getReviewedContentFingerprint} from './reviewContentFingerprint.mjs'
const HASH=/^[a-f0-9]{64}$/
const PATH=/^content\/posts\/\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md$/
export const humanApprovalPath=rawHash=>`data/mwf/human-approvals/${rawHash}.json`
// Called only after the existing authenticated Human approval action succeeds.
export function issueHumanBaselineReceipt(raw,path,secret=undefined){
 const {data,content}=matter(raw),contentVersion=getReviewedContentFingerprint(data,content)
 if(!PATH.test(path)||data.reviewed!==true||!data.reviewed_by||!data.reviewed_at||data.reviewed_content_hash!==contentVersion||data.draft||data.archived||data.rejection_reason||isProtectedEditorialInput(data,content))throw Error('human_baseline_invalid')
 return signBlogEvidence('human-approved-baseline',{path,contentVersion,rawVersion:serverHash(raw),humanAction:'authenticated_admin_approve',reviewedBy:String(data.reviewed_by),reviewedAt:String(data.reviewed_at)},secret)
}
export const serializeMinorProposal=value=>JSON.stringify({schema:1,artifactPath:value.artifactPath,baselineBlob:value.baselineBlob,content:value.content})+'\n'
export function parseMinorProposal(raw,{canonical=true}={}){
 try{
  if(typeof raw!=='string'||Buffer.byteLength(raw)>500000)return null
  const value=JSON.parse(raw)
  if(!value||Object.keys(value).sort().join(',')!=='artifactPath,baselineBlob,content,schema'||value.schema!==1||!PATH.test(value.artifactPath)||!HASH.test(value.baselineBlob)||typeof value.content!=='string'||!value.content.trim()||isProtectedEditorialInput({},value.content))return null
  if(canonical&&raw!==serializeMinorProposal(value))return null
  return value
 }catch{return null}
}
export function validateMinorArtifacts({request,baselineBytes,proposalBytes,approval,secret,today}){
 try{
  const proof=verifyBlogEvidence(approval,'human-approved-baseline',secret)
  // Authenticate provenance and byte hashes BEFORE decoding either artifact.
  if(!proof||proof.humanAction!=='authenticated_admin_approve'||proof.path!==request.artifactPath||proof.rawVersion!==request.baselineBlob||serverHash(baselineBytes)!==request.baselineBlob||serverHash(proposalBytes)!==request.artifactBlob)return{ok:/** @type {const} */ (false),reason:'human_baseline_unproven'}
  const baselineRaw=baselineBytes.toString('utf8'),proposal=parseMinorProposal(proposalBytes.toString('utf8'))
  if(!proposal||proposal.artifactPath!==request.artifactPath||proposal.baselineBlob!==request.baselineBlob)return{ok:/** @type {const} */ (false),reason:'minor_proposal_invalid'}
  const {data,content}=matter(baselineRaw)
  if(data.reviewed!==true||data.draft||data.archived||data.rejection_reason||isProtectedEditorialInput(data,content)||!data.reviewed_by||!data.reviewed_at||data.reviewed_content_hash!==getReviewedContentFingerprint(data,content)||proof.contentVersion!==data.reviewed_content_hash||proof.reviewedBy!==String(data.reviewed_by)||proof.reviewedAt!==String(data.reviewed_at)||getDmpArticleState({data,content,today}).future)return{ok:/** @type {const} */ (false),reason:'human_baseline_invalid'}
  if(proposal.content===content)return{ok:/** @type {const} */ (false),reason:'minor_change_empty'}
  const next={...data,draft:true,reviewed:false,auto_approved:false,publication_status:'draft',generation_run_id:`editor:${request.artifactBlob}`}
  for(const field of ['tiered_review_proof','reviewed_content_hash','reviewed_by','reviewed_at','publication_tier','source_candidate_receipt','source_comparison_hash'])delete next[field]
  return{ok:/** @type {const} */ (true),baselineRaw,baselineApproval:approval,proposalRaw:serializeMwfArticle(proposal.content,next),publicationAllowed:true}
 }catch{return{ok:/** @type {const} */ (false),reason:'minor_evidence_unavailable'}}
}
