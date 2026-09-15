import {createHash,randomUUID} from 'node:crypto'
export const MWF_INVENTORY_ANCHOR='c76186738639dfceec7766fc1daf5975a844cd84e4b2963c318b3ab7cf1e6c49'
export const serverHash=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex')
const HASH=/^[a-f0-9]{64}$/
export function serverRequestId(value){return serverHash(value)}
export function validServerRequest(value,inventoryAnchor=MWF_INVENTORY_ANCHOR){
 if(value?.schema===2)return Object.keys(value).sort().join(',')==='artifactBlob,artifactPath,baselineBlob,inventoryHash,operation,proposalPath,schema'&&value.operation==='minor-review'&&/^content\/posts\/\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md$/.test(value.artifactPath)&&HASH.test(value.artifactBlob)&&HASH.test(value.baselineBlob)&&value.proposalPath===`data/mwf/proposals/${value.artifactBlob}.json`&&value.inventoryHash===inventoryAnchor
 if(!value||Object.keys(value).sort().join(',')!=='artifactBlob,artifactPath,inventoryHash,operation,schema,slot,topicId,topicVersion'||value.schema!==1||!['prepare','review'].includes(value.operation)||!/^\d{4}-\d{2}-\d{2}T08:30:00\+09:00$/.test(value.slot)||!/^[A-Za-z0-9_-]{1,100}$/.test(value.topicId)||!HASH.test(value.topicVersion)||value.inventoryHash!==inventoryAnchor)return false
 const d=new Date(value.slot);if(!Number.isFinite(+d)||new Date(+d+9*3600000).toISOString().slice(0,10)!==value.slot.slice(0,10)||![1,3,5].includes(new Date(+d+9*3600000).getUTCDay()))return false
 return value.operation==='prepare'?value.artifactPath===null&&value.artifactBlob===null:value.artifactPath===`content/posts/${value.slot.slice(0,10)}-mwf-${serverHash(`${value.slot}\0${value.topicId}`)}.md`&&HASH.test(value.artifactBlob)
}
export const semanticRequestKey=value=>value.operation==='minor-review'?serverHash(`minor-review:${value.artifactPath}:${value.baselineBlob}:${value.artifactBlob}`):serverHash(`${value.operation}:${value.topicId}:${value.topicVersion}${value.operation==='prepare'?`:${value.slot}`:''}`)
// Public input is ONLY a request ID. Authority comes from fixed canonical GitHub
// requests, real Human adoption and server validation, never caller decisions.
export function createServerAuthority({readHead,readJson,commit,validate,review,reflect,owner=()=>randomUUID(),now=()=>new Date(),reviewerAvailable=()=>false,seal,unseal}){
 async function load(id,ref){if(!HASH.test(id??''))throw Error('invalid_request');const value=await readJson(`data/mwf/requests/${id}.json`,ref);if(!validServerRequest(value)||serverRequestId(value)!==id)throw Error('invalid_request');return value}
 async function state(path,ref){try{const verified=unseal(await readJson(path,ref));if(!verified)throw Error('invalid_server_claim');return verified}catch(error){if(error?.code==='NOT_FOUND')return null;throw error}}
 async function status(id){try{const head=await readHead(),request=await load(id,head),claim=await state(`data/mwf/claims/${semanticRequestKey(request)}.json`,head);if(!claim||claim.requestId!==id)return{status:'pending',requestId:id};if(claim.status!=='done')return{status:'unknown',requestId:id};if(request.operation!=='prepare')return{...claim.result,requestId:id,...await reflect(request,claim.result,head)};const verified=await validate(request,head);if(!verified?.ok)return{status:'hold',reason:'prepare_evidence_stale',requestId:id};return{...claim.result,comparisonHash:verified.comparisonHash,requestId:id}}catch{return{status:'unavailable'}}}
 async function wake(id){
  try{
   const head=await readHead(),request=await load(id,head),claimPath=`data/mwf/claims/${semanticRequestKey(request)}.json`
   const old=await state(claimPath,head);if(old)return old.requestId===id?status(id):{status:'hold',reason:'semantic_request_already_claimed',requestId:id}
   const validated=await validate(request,head);if(!validated?.ok)return{status:'hold',reason:validated?.reason??'input_evidence_missing',requestId:id}
   const claimOwner=owner(),claim={schema:1,requestId:id,owner:claimOwner,status:'claimed',claimedAt:now().toISOString(),comparisonEntries:validated.set?.entries??[]}
   // Random owner makes each competing CAS a DIFFERENT tree, including same-second calls.
   await commit([{path:claimPath,content:JSON.stringify(seal(claim))+'\n'}],head)
   const claimedHead=await readHead(),actual=await state(claimPath,claimedHead)
   if(actual?.owner!==claimOwner||actual.requestId!==id)return{status:'unknown',requestId:id}
   let result,files=[]
   if(request.operation==='prepare')result={status:'ready',topicId:request.topicId,topicVersion:request.topicVersion,comparisonHash:validated.comparisonHash}
   else if(validated.publicationAllowed===false)result={status:'draft-review-required',reason:'topic_adoption_unproven',artifactBlob:request.artifactBlob}
   else if(!reviewerAvailable())result={status:'draft-review-required',reason:'server_reviewer_configuration_missing',artifactBlob:request.artifactBlob}
   else {const decision=await review(request,validated);result=decision.result;files=decision.files??[]}
   // Recheck inputs at latest canonical head before a result/publication commit.
   const latest=await readHead(),current=await state(claimPath,latest)
   if(current?.owner!==claimOwner||current.status!=='claimed')return{status:'unknown',requestId:id}
   await load(id,latest)
   if(files.some(file=>file.path!==request.artifactPath))throw Error('result_path_rejected')
   const rechecked=await validate(request,latest)
   if(!rechecked?.ok||rechecked.comparisonHash!==validated.comparisonHash||rechecked.publicationAllowed!==validated.publicationAllowed){result={status:'hold',reason:'input_changed'};files=[]}
   const done={...claim,status:'done',result}
   await commit([...files,{path:claimPath,content:JSON.stringify(seal(done))+'\n'}],latest)
   return status(id)
  }catch{return{status:'unknown',requestId:id}}
 }
 return{wake,status}
}

export function isClosedMwfDraftBytes(raw){
 const allowed=new Set(['title','date','category','tags','author','excerpt','image','image_alt','draft','reviewed','auto_approved','publication_status','medical_risk','generation_run_id','source_topic_id','source_topic_version'])
 let offset=0,first=true;const seen=new Set()
 while(offset<raw.length&&offset<65536){const end=raw.indexOf(10,offset),stop=end<0?raw.length:end;let line=raw.subarray(offset,stop);offset=stop+1;if(line.at(-1)===13)line=line.subarray(0,-1)
  if(first){first=false;if(!line.equals(Buffer.from('---')))return false;continue}
  if(line.equals(Buffer.from('---')))return ['generation_run_id','source_topic_id','source_topic_version','draft','reviewed','auto_approved'].every(k=>seen.has(k))
  const colon=line.indexOf(58);if(colon<1||colon>32)return false;const key=line.subarray(0,colon).toString('ascii');if(!allowed.has(key)||seen.has(key))return false;seen.add(key)
 }
 return false
}

// Authenticate with the caller's existing GitHub identity, never the server's token.
// Only this fixed repository's push-capable identity may trigger or inspect work.
export async function authenticateMwfGithubCaller(request,fetchImpl=fetch){
 const authorization=request.headers.get('authorization')??''
 if(!/^Bearer [A-Za-z0-9_]{20,255}$/.test(authorization))return false
 try{
  const response=await fetchImpl('https://api.github.com/repos/aisokai/aisoukai-media',{method:'GET',headers:{Authorization:authorization,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},redirect:'error',signal:AbortSignal.timeout(10000),cache:'no-store'})
  if(!response.ok||response.redirected||response.url!=='https://api.github.com/repos/aisokai/aisoukai-media')return false
  const repository=await response.json()
  return repository.full_name==='aisokai/aisoukai-media'&&repository.permissions?.push===true
 }catch{return false}
}
export function createMwfHttpHandlers(factory,authenticate=authenticateMwfGithubCaller){
 const headers={'Cache-Control':'no-store','X-Robots-Tag':'noindex'}
 return{
  async POST(request){try{if(!await authenticate(request))return Response.json({status:'unauthorized'},{status:401,headers});const origin=request.headers.get('origin');if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')??'')||(origin&&origin!=='https://aisoukai-media.vercel.app')||request.headers.get('sec-fetch-site')==='cross-site')return Response.json({status:'invalid'},{status:403,headers});if(Number(request.headers.get('content-length')??0)>256)throw Error('invalid');const body=await request.text();if(body.length>256)throw Error('invalid');const input=JSON.parse(body);if(Object.keys(input).join(',')!=='requestId'||!HASH.test(input.requestId))throw Error('invalid');return Response.json(await factory().wake(input.requestId),{headers})}catch{return Response.json({status:'unavailable'},{status:503,headers})}},
  async GET(request){try{if(!await authenticate(request))return Response.json({status:'unauthorized'},{status:401,headers});const url=new URL(request.url),id=url.searchParams.get('requestId'),authority=factory();if(!id&&url.searchParams.size===0)return Response.json(await authority.diagnostics(),{headers});if(url.searchParams.size!==1||!HASH.test(id??''))throw Error('invalid');return Response.json(await authority.status(id),{headers})}catch{return Response.json({status:'unavailable'},{status:503,headers})}}
 }
}

export function decodeBoundArticle(raw,expectedHash,requireClosed=true){
 if(!HASH.test(expectedHash??'')||serverHash(raw)!==expectedHash||(requireClosed&&!isClosedMwfDraftBytes(raw)))return null
 return raw.toString('utf8')
}
