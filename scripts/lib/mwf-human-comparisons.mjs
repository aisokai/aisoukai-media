import {inventoryHash,metadataEntry} from './mwf-inventory.mjs'
const HASH=/^[a-f0-9]{64}$/
const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item)
const PATH=/^content\/posts\/\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md$/
// The Mac creates metadata candidates only. Only the server authenticates receipts
// and reads exact approved bytes; the prepared comparison hash binds both sides.
export async function approvedComparisonUpdates({entries,files,listReceipts,readReceipt,verifyReceipt,readBytes}){
 const changed=files.filter(file=>!entries.some(e=>e.path===file.path&&e.gitBlob===file.sha))
 if(!changed.length)return[]
 for(const file of changed)if(file.type!=='file'||!PATH.test(file.path)||!entries.some(e=>e.path===file.path&&e.source==='canonical'&&!e.quarantine&&e.metadata))throw Error('comparison_metadata_unavailable')
 const listing=await listReceipts()
 if(!Array.isArray(listing)||listing.length>500)throw Error('approval_listing_invalid')
 const proofs=[]
 for(const file of listing){
  if(file.type!=='file'||!/^data\/mwf\/human-approvals\/[a-f0-9]{64}\.json$/.test(file.path))throw Error('approval_path_invalid')
  const envelope=await readReceipt(file.path),proof=verifyReceipt?verifyReceipt(envelope):envelope?.payload
  if(!proof||proof.humanAction!=='authenticated_admin_approve'||!PATH.test(proof.path)||!HASH.test(proof.rawVersion)||!HASH.test(proof.contentVersion)||file.path!==`data/mwf/human-approvals/${proof.rawVersion}.json`||typeof proof.reviewedBy!=='string'||!proof.reviewedBy||!Number.isFinite(Date.parse(proof.reviewedAt)))throw Error('approval_evidence_invalid')
  proofs.push(proof)
 }
 const updates=[]
 for(const file of changed){
  const matches=proofs.filter(p=>p.path===file.path).sort((a,b)=>Date.parse(b.reviewedAt)-Date.parse(a.reviewedAt))
  const proof=matches[0]
  if(!proof||matches.some(p=>p.rawVersion!==proof.rawVersion&&Date.parse(p.reviewedAt)===Date.parse(proof.reviewedAt)))throw Error('approval_current_unproven')
  const known=entries.filter(e=>e.path===file.path&&e.source==='canonical'&&!e.quarantine&&e.metadata)
  // Reuse only unambiguous known public metadata; no header-change inference.
  if(known.some(e=>canonical(e.metadata)!==canonical(known[0].metadata)))throw Error('approval_metadata_ambiguous')
  const expected={path:file.path,source:'canonical',blob:proof.rawVersion,gitBlob:file.sha,quarantine:false,metadata:known[0].metadata}
  if(readBytes){
   if(!verifyReceipt)throw Error('approval_verifier_required')
   const raw=await readBytes(file.path)
   if(inventoryHash(raw)!==proof.rawVersion)throw Error('approved_bytes_changed')
   const actual=metadataEntry({path:file.path,raw,source:'canonical',head:undefined})
   if(canonical(actual)!==canonical(expected))throw Error('approved_metadata_changed')
  }
  updates.push(expected)
 }
 return updates
}
