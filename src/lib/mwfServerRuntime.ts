import {readFile} from 'node:fs/promises'
import {join} from 'node:path'
import matter from 'gray-matter'
import {readGitHubFile,readGitHubBytes,readGitHubDirectory,readGitHubBranchHead,commitGitHubFiles} from './githubContents'
import {createServerAuthority,MWF_INVENTORY_ANCHOR,serverHash,decodeBoundArticle} from './mwfServerAuthority.mjs'
import {verifyBlogEvidence,signBlogEvidence,topicContentVersion,isProtectedEditorialInput} from './tieredPublication.mjs'
import {getDmpArticleState} from './dmpArticleState.mjs'
import {buildPendingReviewPost} from './posts'
import {parseCsv} from '../../scripts/csv-parser.mjs'
import {comparisonSet,metadataEntry,reviewCandidate} from '../../scripts/lib/mwf-inventory.mjs'
import {readPublicEditorialHead} from '../../scripts/mwf-inventory-metadata.mjs'
import {createTieredReviewer} from '../../scripts/lib/mwf-tiered-review.mjs'

type ServerRequest={operation:string;topicId:string;topicVersion:string;artifactPath:string|null;artifactBlob:string|null;inventoryHash:string}
const cache=new Map<string, Promise<ReturnType<typeof comparisonSet>>>()
export function createMwfServerRuntime(){
 const secret=process.env.ADMIN_REVIEW_COOKIE_SECRET
 if(!secret||!process.env.GITHUB_REVIEW_TOKEN||(process.env.GITHUB_REVIEW_REPO&&process.env.GITHUB_REVIEW_REPO!=='aisokai/aisoukai-media')||(process.env.GITHUB_REVIEW_BRANCH&&process.env.GITHUB_REVIEW_BRANCH!=='main'))throw Error('server_configuration_missing')
 const json=async(path:string,ref?:string)=>JSON.parse((await readGitHubFile(path,{ref})).content)
 const text=async(path:string,ref?:string)=>(await readGitHubFile(path,{ref})).content
 async function baseInventory(){
  if(!cache.has(MWF_INVENTORY_ANCHOR))cache.set(MWF_INVENTORY_ANCHOR,(async()=>{
   const file=await readGitHubBytes(`data/mwf/inventories/${MWF_INVENTORY_ANCHOR}.json`)
   if(serverHash(file.bytes)!==MWF_INVENTORY_ANCHOR)throw Error('inventory_anchor_mismatch')
   const envelope=JSON.parse(file.bytes.toString('utf8')),payload=envelope.payload
   if(payload?.schema!==2||payload.entries?.length!==54||payload.entries.filter((e:{source:string})=>e.source==='local').length!==8||payload.quarantine?.length!==4||!/^[a-f0-9]{64}$/.test(payload.preservationHash)||!/^[a-f0-9]{64}$/.test(payload.reconciliationHash))throw Error('inventory_evidence_incomplete')
   for(const entry of payload.entries){
    if(entry.source==='canonical'){
     const original=await readGitHubBytes(entry.path,{ref:payload.canonicalRevision})
     if(serverHash(original.bytes)!==entry.blob)throw Error('inventory_original_changed')
     const head=entry.quarantine?await readPublicEditorialHead(`https://aisoukai-media.vercel.app/blog/${entry.path.slice(14,-3)}`):undefined
     const verified=metadataEntry({path:entry.path,raw:original.bytes,source:'canonical',quarantine:entry.quarantine,head})
     if(JSON.stringify(verified.metadata)!==JSON.stringify(entry.metadata)||!verified.metadata)throw Error('inventory_public_metadata_unverified')
    }else if(entry.source!=='local'||!entry.metadata||isProtectedEditorialInput(entry.metadata))throw Error('inventory_local_metadata_unverified')
   }
   // Local-only metadata is bound to the reviewed exact full inventory anchor;
   // arbitrary unsigned uploads cannot replace or omit preserved entries.
   return comparisonSet(payload.entries)
  })().catch(error=>{cache.delete(MWF_INVENTORY_ANCHOR);throw error}))
  return cache.get(MWF_INVENTORY_ANCHOR)!
 }
 async function comparisons(ref:string,exclude?:string|null){
  const baseline=await baseInventory(),entries=[...baseline.entries]
  let history:Awaited<ReturnType<typeof readGitHubDirectory>>=[];try{history=await readGitHubDirectory('data/mwf/claims',{ref})}catch(error){if((error as {code?:string}).code!=='NOT_FOUND')throw error}
  if(history.length>500)throw Error('comparison_history_limit')
  for(const file of history){if(file.type!=='file'||!/^data\/mwf\/claims\/[a-f0-9]{64}\.json$/.test(file.path))throw Error('history_path_invalid');const claim=verifyBlogEvidence(await json(file.path,ref),'mwf-server-claim',secret);if(!claim)throw Error('history_signature_invalid');for(const old of claim.comparisonEntries??[])if(!entries.some(e=>e.path===old.path&&e.blob===old.blob))entries.push(old)}
  const files=await readGitHubDirectory('content/posts',{ref})
  if(files.length>=1000)throw Error('canonical_listing_incomplete')
  for(const file of files){if(file.type!=='file')throw Error('unsupported_canonical_entry');if(file.path===exclude)continue
   const current=await readGitHubBytes(file.path,{ref});if(entries.some(e=>e.path===file.path&&e.gitBlob===current.sha))continue
   entries.push(metadataEntry({path:file.path,raw:current.bytes,source:'canonical',quarantine:baseline.entries.some((e:{path:string;quarantine:boolean})=>e.path===file.path&&e.quarantine),head:undefined}))
  }
  return comparisonSet(entries.filter(e=>e.path!==exclude).sort((a,b)=>`${a.path}:${a.blob}`.localeCompare(`${b.path}:${b.blob}`)))
 }
 async function validate(request:ServerRequest,ref:string){
  try{
   const topic=parseCsv(await text('data/article-topics.sample.csv',ref)).find((t:Record<string,string>)=>t.id===request.topicId)
   let adoption;try{adoption=await json(`data/topic-adoptions/${request.topicId}.json`,ref)}catch{/* Unknown adoption remains unproven; it never becomes publication authority. */}
   const evidence=verifyBlogEvidence(adoption,'teacher-topic-adoption',secret)
   const publicationAllowed=Boolean(topic&&topic.status==='approved'&&topicContentVersion(topic)===request.topicVersion&&!isProtectedEditorialInput(topic)&&evidence?.topicId===request.topicId&&evidence.topicVersion===request.topicVersion)
   if(request.operation==='prepare'&&!publicationAllowed)return{ok:false,reason:'topic_adoption_unproven'}
   const set=await comparisons(ref,request.artifactPath)
   if(set.entries.some((e:{metadata:unknown})=>!e.metadata||isProtectedEditorialInput(e.metadata)))return{ok:false,reason:'comparison_metadata_incomplete'}
   if(request.operation==='prepare'&&set.entries.some((e:{metadata:{source_topic_id?:string;title:string}})=>e.metadata.source_topic_id===request.topicId||e.metadata.title.normalize('NFKC').toLowerCase().replace(/\s/g,'')===String(topic?.title_candidate??topic?.title).normalize('NFKC').toLowerCase().replace(/\s/g,'')))return{ok:false,reason:'duplicate_metadata'}
   let validatedBytes:Buffer|undefined
   if(request.operation==='review'){
    const bytes=(await readGitHubBytes(request.artifactPath!,{ref})).bytes,decoded=decodeBoundArticle(bytes,request.artifactBlob);if(decoded===null)return{ok:false,reason:'draft_changed'}
    validatedBytes=bytes
    const parsed=matter(decoded);if(parsed.data.draft!==true||parsed.data.reviewed!==false||parsed.data.auto_approved!==false||isProtectedEditorialInput(parsed.data,parsed.content)||parsed.data.source_topic_id!==request.topicId||parsed.data.source_topic_version!==request.topicVersion)return{ok:false,reason:'unreviewed_draft_required'}
   }
   return{ok:true,topic,adoption,set,comparisonHash:set.hash,validatedBytes,publicationAllowed}
  }catch{return{ok:false,reason:'canonical_evidence_unavailable'}}
 }
 const provider=async(url:string,options:RequestInit&{reviewRequest?:boolean})=>{
  if(url==='https://api.openai.com/v1/chat/completions'){
   if(!process.env.OPENAI_API_KEY)throw Error('server_reviewer_configuration_missing')
   return fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.OPENAI_API_KEY}`},body:options.body,redirect:'error',signal:AbortSignal.timeout(180000)})
  }
  if(!/^https:\/\/aisoukai-media\.vercel\.app\/images\/[A-Za-z0-9_./-]+$/.test(url)||url.includes('..'))throw Error('review_url_rejected')
  return fetch(url,{method:'GET',redirect:'error',signal:AbortSignal.timeout(30000)})
 }
 const authority=createServerAuthority({readHead:readGitHubBranchHead,readJson:json,
  commit:async(files:{path:string;content:string}[],head:string)=>commitGitHubFiles('MWF server authority transition',files,{expectedHeadSha:head}),
  seal:(value:unknown)=>signBlogEvidence('mwf-server-claim',value,secret),unseal:(value:unknown)=>verifyBlogEvidence(value,'mwf-server-claim',secret),
  validate,reviewerAvailable:()=>Boolean(process.env.OPENAI_API_KEY),
  review:async(request:ServerRequest,validated:Awaited<ReturnType<typeof validate>>)=>{
   const precheck=await reviewCandidate({topic:validated.topic,set:validated.set,adoption:validated.adoption,request:provider,secret})
   if(precheck.status!=='clear')return{result:{status:'draft-review-required',reason:precheck.reason},files:[]}
   const raw=validated.validatedBytes?decodeBoundArticle(validated.validatedBytes,request.artifactBlob):null
   if(raw===null)return{result:{status:'hold',reason:'draft_changed'},files:[]}
   const parsed=matter(raw)
   const candidate=matter.stringify(parsed.content,{...parsed.data,source_candidate_receipt:precheck.receipt})
   const reviewer=createTieredReviewer({secret,request:provider,githubFile:text,getComparisons:async()=>validated.set})
   const result=await reviewer({raw:candidate,path:request.artifactPath,baselineRaw:undefined})
   return result.status==='certified'?{result:{status:'server-reviewed',artifactBlob:serverHash(result.raw)},files:[{path:request.artifactPath!,content:result.raw}]}:{result:{status:'draft-review-required',reason:result.reason},files:[]}
  },
  reflect:async(request:ServerRequest,result:{status:string;artifactBlob?:string},ref:string)=>{
   if(!['server-reviewed','draft-review-required'].includes(result.status))return{}
   const raw=(await readGitHubBytes(request.artifactPath!,{ref})).bytes
   const expected=result.status==='server-reviewed'?result.artifactBlob:request.artifactBlob
   const decoded=decodeBoundArticle(raw,expected,result.status!=='server-reviewed')
   if(decoded===null)return{reflection:'pending'}
   const parsed=matter(decoded)
   const topic=parseCsv(await text('data/article-topics.sample.csv',ref)).find((t:Record<string,string>)=>t.id===request.topicId)
   const state=getDmpArticleState({data:parsed.data,content:parsed.content,verificationSecret:secret,publicationContext:{path:request.artifactPath,topic},today:new Date(Date.now()+9*3600000).toISOString().slice(0,10)})
   if(isProtectedEditorialInput(parsed.data,parsed.content)||parsed.data.archived||parsed.data.rejection_reason)return{}
   const deployed=await readFile(join(process.cwd(),request.artifactPath!));if(serverHash(deployed)!==serverHash(raw))return{reflection:'pending'}
   if(!state.publishable){
    if(serverHash(raw)!==request.artifactBlob||parsed.data.draft!==true||parsed.data.reviewed!==false||parsed.data.auto_approved!==false)return{reflection:'pending'}
    // Render only this hash-validated new draft through the admin's own mapper.
    const post=await buildPendingReviewPost(request.artifactPath!.slice(14),decoded)
    if(!post||post.slug!==request.artifactPath!.slice(14,-3)||post.contentVersion!==state.contentVersion||post.rejectionReason)return{reflection:'pending'}
   }
   return{authenticated:true,source:'production-admin',path:request.artifactPath,originBlob:request.artifactBlob,blob:serverHash(raw),contentVersion:state.contentVersion,reviewable:true,published:state.publishable,sourceRevision:ref}
  }})
 return{...authority,async diagnostics(){let adoptionCount=0;try{adoptionCount=(await readGitHubDirectory('data/topic-adoptions')).filter(e=>e.type==='file').length}catch{}return{status:'server-authority',aiReviewerAvailable:Boolean(process.env.OPENAI_API_KEY),adoptionCount,inventoryAnchor:MWF_INVENTORY_ANCHOR}}}
}
