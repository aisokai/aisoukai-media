import {inventoryHash,metadataEntry,artifactGitBlob} from './mwf-inventory.mjs'
const HASH=/^[a-f0-9]{64}$/
const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item)
const PATH=/^content\/posts\/\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md$/
// The Mac creates metadata candidates only. Only the server authenticates receipts
// and reads exact approved bytes; the prepared comparison hash binds both sides.
export async function approvedComparisonUpdates({entries,files,listReceipts,readReceipt,verifyReceipt,readBytes,readKnownBytes,readApprovedBytes,comparisonOnly=false,readUnknownMetadata,verifyUnknownPublished,readReviewHistory}){
 const changed=files.filter(file=>!entries.some(e=>e.path===file.path&&e.gitBlob===file.sha))
 if(!changed.length)return[]
 const knownPath=file=>entries.some(e=>e.path===file.path&&e.source==='canonical'&&!e.quarantine&&e.metadata)
 const hasAnyEntry=file=>entries.some(e=>e.path===file.path)
 for(const file of changed)if(file.type!=='file'||!PATH.test(file.path))throw Error('comparison_metadata_unavailable')
 // Unknown path means NO entry of any kind for that path. A path that has an
 // entry but fails knownPath (quarantined, metadata-less, local-only) keeps
 // the historical gate exactly; it must never leak into the unknown flow.
 for(const file of changed)if(!knownPath(file)&&hasAnyEntry(file))throw Error('comparison_metadata_unavailable')
 // Entry-less paths are only ever handled by the comparisonOnly flow below;
 // every other caller keeps the historical gate.
 for(const file of changed)if(!knownPath(file)&&!comparisonOnly)throw Error('comparison_metadata_unavailable')
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
  if(!knownPath(file)){
   // Unknown path: receipts above have already been authenticated before any
   // article fetch, so a forged receipt still rejects first. Acceptance is a
   // comparisonOnly projection only; it is not an approval record.
   if(readBytes){
    // Server: full unknown-published evidence verification is mandatory, and
    // the receipt verifier must be present just like the known-path flow.
    // Without either this fails closed, exactly like the old gate.
    if(!verifyReceipt)throw Error('approval_verifier_required')
    if(!verifyUnknownPublished)throw Error('comparison_metadata_unavailable')
    const metadata=await verifyUnknownPublished(file)
    if(!metadata)throw Error('unknown_published_unproven')
    updates.push({...comparisonProjection(file,metadata),unknownPath:true});continue
   }
   // Mac: propose the identical projection from public frontmatter metadata
   // only. The proposal confers no authority; the server re-derives the
   // metadata from exact bytes and validates the evidence before its
   // prepared comparison hash can match this one.
   if(!readUnknownMetadata)throw Error('comparison_metadata_unavailable')
   const metadata=await readUnknownMetadata(file.path)
   if(!metadata)throw Error('comparison_metadata_unavailable')
   updates.push({...comparisonProjection(file,metadata),unknownPath:true});continue
  }
  const matches=proofs.filter(p=>p.path===file.path).sort((a,b)=>Date.parse(b.reviewedAt)-Date.parse(a.reviewedAt))
  const proof=matches[0]
  if(matches.some(p=>p.rawVersion!==proof?.rawVersion&&Date.parse(p.reviewedAt)===Date.parse(proof?.reviewedAt)))throw Error('approval_current_unproven')
  const known=entries.filter(e=>e.path===file.path&&e.source==='canonical'&&!e.quarantine&&e.metadata)
  // Reuse only unambiguous known public metadata; no header-change inference.
  if(known.some(e=>canonical(e.metadata)!==canonical(known[0].metadata)))throw Error('approval_metadata_ambiguous')
  if(comparisonOnly){
   const expected=comparisonProjection(file,known[0].metadata)
   if(readBytes){
    if(!verifyReceipt)throw Error('approval_verifier_required')
    const raw=Buffer.from(await readBytes(file.path)),actual=metadataEntry({path:file.path,raw,source:'canonical'})
    if(actual.gitBlob!==file.sha||canonical(actual.metadata)!==canonical(known[0].metadata))throw Error('comparison_current_changed')
    if(!proof||actual.blob!==proof.rawVersion){
     let matched=false
     if(proof){
      if(!readApprovedBytes)throw Error('comparison_approved_baseline_unavailable')
      const baseline=Buffer.from(await readApprovedBytes(proof))
      if(inventoryHash(baseline)!==proof.rawVersion)throw Error('comparison_approved_baseline_changed')
      matched=isDraftImageOnlyChange(baseline,raw)
      // Human reject of the receipt-proven approved bytes: accepted only when
      // the frontmatter diff has the exact reject shape AND review history
      // holds the matching reject record. The history is read only for that
      // shape; no reader or no record keeps the gate closed. The receipt-less
      // branch below never accepts a reject.
      if(!matched){
       const reject=isHumanRejectChange(baseline,raw)
       if(reject&&readReviewHistory)matched=hasRejectRecord(await readReviewHistory(),file.path,reject)
      }
     }else{
      if(!readKnownBytes)throw Error('comparison_baseline_unavailable')
      for(const old of [...new Map(known.filter(e=>!e.comparisonOnly).map(e=>[e.blob,e])).values()].sort((a,b)=>a.blob.localeCompare(b.blob))){
       const baseline=Buffer.from(await readKnownBytes(old.gitBlob))
       if(inventoryHash(baseline)!==old.blob||artifactGitBlob(baseline)!==old.gitBlob)throw Error('comparison_baseline_changed')
       if(isDraftImageOnlyChange(baseline,raw)){matched=true;break}
      }
     }
     if(!matched)throw Error('comparison_unreviewed_change')
    }
   }
   updates.push(expected);continue
  }
  if(!proof)throw Error('approval_current_unproven')
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

// This digest identifies a metadata comparison, NEVER article bytes or approval.
// Mac proposals cannot confer authority: the server validates exact current bytes
// against authenticated history before returning the same prepared comparison hash.
export function comparisonProjection(file,metadata){
 if(!/^[a-f0-9]{40}$/.test(file.sha))throw Error('comparison_git_blob_invalid')
 return {path:file.path,source:'canonical',blob:inventoryHash(`comparison-only-v1:${file.path}:${file.sha}`),gitBlob:file.sha,quarantine:false,metadata,comparisonOnly:true}
}
const IMAGE_FIELDS=new Set(['image','image_alt','image_content_hash','image_check_status','image_selection_status','image_selection_reason'])
const REVIEW_FIELDS=new Set(['draft','reviewed','auto_approved','publication_status'])
// Work on opaque byte sections. Decode key names and three fixed booleans only;
// neither historical article bodies nor unrelated frontmatter values are decoded.
function sections(raw){
 raw=Buffer.from(raw);const values=new Map();let offset=0,key=null,start=0,first=true
 while(offset<raw.length&&offset<128*1024){
  const end=raw.indexOf(10,offset);if(end<0)return null
  const stop=end+1,line=raw.subarray(offset,end),plain=line.at(-1)===13?line.subarray(0,-1):line
  if(first){if(!plain.equals(Buffer.from('---')))return null;first=false;offset=stop;start=stop;continue}
  if(plain.equals(Buffer.from('---'))){if(key)values.set(key,raw.subarray(start,offset));return {values,body:raw.subarray(stop)}}
  if(plain.length&&plain[0]!==32&&plain[0]!==9){
   const colon=plain.indexOf(58);if(colon<1||colon>100)return null
   const kb=plain.subarray(0,colon);if(![...kb].every(c=>c>=97&&c<=122||c===95))return null
   if(key)values.set(key,raw.subarray(start,offset));key=kb.toString('ascii');if(values.has(key))return null;start=offset
  }else if(!key)return null
  offset=stop
 }
 return null
}
export function isDraftImageOnlyChange(baseline,current){
 const before=sections(baseline),after=sections(current)
 if(!before||!after||!before.body.equals(after.body))return false
 for(const [key,value] of [['draft','true'],['reviewed','false'],['auto_approved','false']]){
  const bytes=after.values.get(key);if(!bytes||!bytes.equals(Buffer.from(`${key}: ${value}\n`)))return false
 }
 // A draft may retain historical review audit fields, but cannot acquire new
 // publication proof or change any non-image/editorial/date/content field.
 const oldStatus=before.values.get('publication_status'),nextStatus=after.values.get('publication_status')
 if(!Buffer.from(oldStatus??'').equals(Buffer.from(nextStatus??''))&&(!nextStatus||!['draft','pending_review'].some(value=>[`${'publication_status'}: ${value}\n`,`${'publication_status'}: ${JSON.stringify(value)}\n`].some(line=>nextStatus.equals(Buffer.from(line))))))return false
 const unchanged=map=>[...map].filter(([key])=>!IMAGE_FIELDS.has(key)&&!REVIEW_FIELDS.has(key)).sort(([a],[b])=>a.localeCompare(b))
 const left=unchanged(before.values),right=unchanged(after.values)
 if(left.length!==right.length||left.some(([key,value],i)=>key!==right[i][0]||!value.equals(right[i][1])))return false
 return [...IMAGE_FIELDS].some(key=>!Buffer.from(before.values.get(key)??'').equals(Buffer.from(after.values.get(key)??'')))
}
const REJECT_FIELDS=new Set(['reviewed','stock_status','rejection_reason'])
// Decode ONE single-line frontmatter scalar (same rules as mwf-inventory:
// plain, "json" or 'yaml-single'). Block scalars, flows, anchors, tags,
// comments, continuation lines and undecodable bytes all return null.
function lineScalar(key,bytes){
 const prefix=Buffer.from(`${key}: `)
 if(!bytes||bytes.length<=prefix.length||bytes.length>4200||!bytes.subarray(0,prefix.length).equals(prefix)||bytes.indexOf(10)!==bytes.length-1||bytes.includes(13))return null
 const text=bytes.subarray(prefix.length,-1).toString('utf8')
 if(!Buffer.from(text).equals(bytes.subarray(prefix.length,-1)))return null
 const value=text.trim();let decoded
 try{
  if(value.startsWith('"')){decoded=JSON.parse(value);if(typeof decoded!=='string')return null}
  else if(value.startsWith("'")){if(!/^'(?:[^']|'')*'$/.test(value))return null;decoded=value.slice(1,-1).replace(/''/g,"'")}
  else{if(!value||/^[>|[\]{}&*!?%@`]/.test(value)||/\s#/.test(value))return null;decoded=value}
 }catch{return null}
 // History lines are matched after trim, so only a trimmed, single-line,
 // control-free value can ever be evidence.
 if(!decoded||decoded!==decoded.trim()||/[\u0000-\u001f\u007f\u0085\u2028\u2029]/.test(decoded))return null
 return decoded
}
// The exact frontmatter shape scripts/reject-post.mjs leaves on an approved
// article: identical body bytes, reviewed true->false, stock_status
// adopted->rejected, a new one-line rejection_reason, and every other key
// (draft, publication/review audit fields, images, ...) byte-identical.
// Only rejection_reason and reviewed_by are decoded; the body never is.
// The shape alone proves nothing: the caller must also find the Human record.
export function isHumanRejectChange(baseline,current){
 const before=sections(baseline),after=sections(current)
 if(!before||!after||!before.body.equals(after.body))return null
 for(const [key,from,to] of [['reviewed','true','false'],['stock_status','adopted','rejected']]){
  const old=before.values.get(key),next=after.values.get(key)
  if(!old||!next||!old.equals(Buffer.from(`${key}: ${from}\n`))||!next.equals(Buffer.from(`${key}: ${to}\n`)))return null
 }
 if(before.values.has('rejection_reason'))return null
 const rest=map=>[...map].filter(([key])=>!REJECT_FIELDS.has(key)).sort(([a],[b])=>a.localeCompare(b))
 const left=rest(before.values),right=rest(after.values)
 if(left.length!==right.length||left.some(([key,value],i)=>key!==right[i][0]||!value.equals(right[i][1])))return null
 const reason=lineScalar('rejection_reason',after.values.get('rejection_reason')),reviewedBy=lineScalar('reviewed_by',after.values.get('reviewed_by'))
 if(!reason||!reviewedBy)return null
 return {reviewedBy,reason}
}
// Human evidence for a reject: ONE review-history block must carry the reject
// action, this slug, the article's reviewer and the exact reason. Fields are
// never spliced across blocks (same matching as validateUnknownPublishedEvidence).
export function hasRejectRecord(historyText,path,{reviewedBy,reason}={}){
 if(typeof historyText!=='string'||typeof reviewedBy!=='string'||typeof reason!=='string'||!reviewedBy||!reason)return false
 const stem=String(path??'').split('/').at(-1).replace(/\.md$/,'')
 if(!stem)return false
 return historyText.split(/^## /m).some(block=>{
  const lines=block.split('\n').map(line=>line.trim())
  return lines.includes('action: reject')&&lines.includes(`slug: ${stem}`)&&lines.includes(`reviewed_by: ${reviewedBy}`)&&lines.includes(`reason: ${reason}`)
 })
}
