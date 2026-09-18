import {restorePreservedDraft,syncPreservedDraft} from './mwf-restoration.mjs'
import {approvedComparisonUpdates} from './mwf-human-comparisons.mjs'
import {precheckDraftDisposition,classifyPrecheckResponse,projectPrecheckCache,PRECHECK_REQUEST_VERSION,buildPrecheckRequest,canRepairLegacyPrecheck} from './mwf-precheck.mjs'
import {serializeMwfArticle} from '../../src/lib/mwfArticleSerialization.mjs'
// Mac runtime: generation, unreviewed sync and notification only. No admin key,
// approval signing or publication privilege is loaded or exercised here.
import {readFileSync,openSync,closeSync,writeSync,fsyncSync,constants} from 'node:fs'
import {spawnSync} from 'node:child_process'
import {homedir} from 'node:os'
import {fileURLToPath} from 'node:url'
import {resolve,join,basename} from 'node:path'
import {parseCsv} from '../csv-parser.mjs'
import {buildArticlePrompt} from '../prompts/dental-article-prompt.mjs'
import {createIsolatedSync} from './mwf-isolated-sync.mjs'
import {validatePostArtifact} from './post-artifact-validation.mjs'
import {readOpaqueRegular} from '../mwf-inventory-metadata.mjs'
import {inventoryHash,comparisonSet} from './mwf-inventory.mjs'
import {topicContentVersion,isProtectedEditorialInput} from '../../src/lib/tieredPublication.mjs'
import {MWF_INVENTORY_ANCHOR} from '../../src/lib/mwfServerAuthority.mjs'
import {createServerClient} from './mwf-server-client.mjs'
const ORIGIN='https://github.com/aisokai/aisoukai-media.git'
export function currentMwfSlot(now=new Date()){const d=new Date(+now+9*3600000);return[1,3,5].includes(d.getUTCDay())&&d.getUTCHours()*60+d.getUTCMinutes()>=510?`${d.toISOString().slice(0,10)}T08:30:00+09:00`:null}
export function createGithubServerTransport({spawnImpl,native,request}){
 return async function authenticateRequest(url,options){
  if(url!=='https://aisoukai-media.vercel.app/api/mwf'&&!/^https:\/\/aisoukai-media\.vercel\.app\/api\/mwf\?requestId=[a-f0-9]{64}$/.test(url))throw Error('server_auth_destination_rejected')
  // Existing native GitHub authentication is used only inside this runtime call.
  // Never log, persist, or return the credential, including command diagnostics.
  const auth=spawnImpl('/opt/homebrew/bin/gh',['auth','token','--hostname','github.com'],{env:native,encoding:'utf8',timeout:10000,stdio:['ignore','pipe','pipe']})
  if(auth.status!==0||auth.error||!/^([A-Za-z0-9_]{20,255})\s*$/.test(auth.stdout??''))throw Error('server_auth_unavailable')
  return request(url,{...options,headers:{...options.headers,Authorization:`Bearer ${auth.stdout.trim()}`}})
 }
}
export function latestElapsedMwfSlot(now=new Date()){
 const local=new Date(+now+9*3600000);let slot=new Date(Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate(),8,30)-9*3600000)
 while(+slot>+now||![1,3,5].includes(new Date(+slot+9*3600000).getUTCDay()))slot=new Date(+slot-86400000)
 return `${new Date(+slot+9*3600000).toISOString().slice(0,10)}T08:30:00+09:00`
}
export function createProductionRuntime({recoveryTopic,backfill,env=process.env,readText=path=>readFileSync(path,'utf8'),fetchImpl=fetch,spawnImpl=spawnSync,now=()=>new Date(),inventoryAnchor=MWF_INVENTORY_ANCHOR,serverClient}={}){
 for(const key of ['MWF_STATE_ROOT','MWF_TOPICS_PATH','MWF_INVENTORY_PATH','MWF_RUNNER_VERSION'])if(!env[key]?.trim())throw Error('production_configuration_missing')
 for(const key of ['MWF_STATE_ROOT','MWF_TOPICS_PATH','MWF_INVENTORY_PATH'])if(!env[key].startsWith('/'))throw Error('absolute_runtime_paths_required')
 if(!/^[a-f0-9]{40}$/.test(env.MWF_RUNNER_VERSION))throw Error('runner_version_required')
 const runnerRoot=fileURLToPath(new URL('../../',import.meta.url)),root=resolve(env.MWF_STATE_ROOT)
 if(root===resolve(runnerRoot)||root.startsWith(resolve(runnerRoot)+'/'))throw Error('state_must_be_outside_runner')
 const native={PATH:'/opt/homebrew/bin:/usr/bin:/bin',HOME:env.HOME||homedir(),GH_PROMPT_DISABLED:'1',GH_NO_UPDATE_NOTIFIER:'1'}
 const gitEnv={...native,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_TERMINAL_PROMPT:'0',GIT_ALLOW_PROTOCOL:'https',GIT_CONFIG_COUNT:'1',GIT_CONFIG_KEY_0:'credential.https://github.com.helper',GIT_CONFIG_VALUE_0:'!/opt/homebrew/bin/gh auth git-credential',GIT_AUTHOR_NAME:'MWF Draft Runner',GIT_AUTHOR_EMAIL:'mwf@users.noreply.github.com',GIT_COMMITTER_NAME:'MWF Draft Runner',GIT_COMMITTER_EMAIL:'mwf@users.noreply.github.com'}
 const identity=spawnImpl('/usr/bin/git',['rev-parse','HEAD'],{cwd:runnerRoot,env:gitEnv,encoding:'utf8',timeout:10000}),clean=spawnImpl('/usr/bin/git',['status','--porcelain','--untracked-files=all','--','scripts','src','package.json','package-lock.json'],{cwd:runnerRoot,env:gitEnv,encoding:'utf8',timeout:10000})
 if(identity.status!==0||identity.stdout.trim()!==env.MWF_RUNNER_VERSION||clean.status!==0||clean.stdout.trim())throw Error('runner_version_mismatch')
 const request=(url,options)=>fetchImpl(url,{...options,redirect:'error',signal:AbortSignal.timeout(url.includes('openai.com')?180000:300000)})
 function github(method,path,body){
  if(!['GET','POST','PATCH'].includes(method)||!(/^(?:contents\/(?:data\/[A-Za-z0-9_./-]+|content\/posts(?:\/\d{4}-\d{2}-\d{2}-[A-Za-z0-9_-]+\.md)?)(?:\?ref=(?:main|[a-f0-9]{40}))?|git\/(?:ref\/heads\/main|refs\/heads\/main|commits(?:\/[a-f0-9]{40})?|trees|blobs))$/.test(path))||path.includes('..'))throw Error('github_scope_rejected')
  const result=spawnImpl('/opt/homebrew/bin/gh',['api','--hostname','github.com','--method',method,`repos/aisokai/aisoukai-media/${path}`,...(body?['--input','-']:[])],{env:native,input:body?JSON.stringify(body):undefined,encoding:'utf8',timeout:30000,maxBuffer:16*1024*1024,stdio:['pipe','pipe','pipe']})
  if(result.status!==0||result.error){const missing=/HTTP 404/.test(result.stderr??'');throw Object.assign(Error('github_operation_failed'),{code:missing?'NOT_FOUND':'FAILED'})}
  try{return JSON.parse(result.stdout)}catch{throw Error('github_response_invalid')}
 }
 async function csv(){const file=await github('GET',`contents/data/article-topics.sample.csv?ref=${backfill?.canonicalRevision??'main'}`);return parseCsv(Buffer.from(file.content,'base64').toString('utf8'))}
 let client
 function inventory(){const raw=readText(env.MWF_INVENTORY_PATH);if(inventoryHash(raw)!==inventoryAnchor)throw Error('historical_inventory_evidence_missing');const data=JSON.parse(raw).payload;if(data?.schema!==2||!Array.isArray(data.entries))throw Error('historical_inventory_evidence_missing');return{raw,data}}
 const authenticateRequest=createGithubServerTransport({spawnImpl,native,request})
 function server(){if(!client)client=serverClient??createServerClient({github,authenticateRequest,inventoryRaw:inventory().raw,inventoryAnchor});return client}
 async function localComparisons(){const {data}=inventory();const entries=[...data.entries];for(const entry of entries.filter(e=>e.source==='local')){const path=join(env.MWF_PRESERVATION_DIR??'/Users/caelus/Library/Application Support/AisoukaiMWF/preservation/2026-09-14',basename(entry.path));if(inventoryHash(readOpaqueRegular(path))!==entry.blob)throw Error('preserved_artifact_changed')}
  const revision=github('GET','git/ref/heads/main').object.sha,listing=github('GET',`contents/content/posts?ref=${revision}`);if(!Array.isArray(listing)||listing.length>=1000)throw Error('comparison_listing_incomplete')

  let claims=[];try{claims=github('GET',`contents/data/mwf/claims?ref=${revision}`)}catch(error){if(error.code!=='NOT_FOUND')throw error}
  if(!Array.isArray(claims)||claims.length>500)throw Error('comparison_history_invalid')
  for(const claim of claims){if(claim.type!=='file'||!/^data\/mwf\/claims\/[a-f0-9]{64}\.json$/.test(claim.path))throw Error('comparison_history_invalid');const encoded=github('GET',`contents/${claim.path}?ref=${revision}`),record=JSON.parse(Buffer.from(encoded.content,'base64').toString('utf8'));for(const old of record.payload?.comparisonEntries??[])if(!entries.some(e=>e.path===old.path&&e.blob===old.blob&&e.source===old.source))entries.push(old)}
  if(listing.some(file=>file.type!=='file'))throw Error('comparison_listing_invalid')
  entries.push(...await approvedComparisonUpdates({entries,files:listing,
   listReceipts:async()=>{try{return github('GET',`contents/data/mwf/human-approvals?ref=${revision}`)}catch(error){if(error.code==='NOT_FOUND')return[];throw error}},
   readReceipt:async path=>{const file=github('GET',`contents/${path}?ref=${revision}`);if(file.encoding!=='base64')throw Error('approval_encoding_invalid');return JSON.parse(Buffer.from(file.content,'base64').toString('utf8'))},verifyReceipt:undefined,readBytes:undefined}))
  return comparisonSet(entries.sort((a,b)=>`${a.path}:${a.blob}`.localeCompare(`${b.path}:${b.blob}`)))
 }
 function cached(key){try{return readOpaqueRegular(join(root,'mac-draft-prechecks.jsonl')).toString('utf8').split('\n').filter(Boolean).map(v=>JSON.parse(v)).filter(v=>v.key===key).at(-1)}catch(error){if(error.code==='ENOENT')return null;throw Error('draft_precheck_cache_invalid')}}
 function remember(value){const fd=openSync(join(root,'mac-draft-prechecks.jsonl'),constants.O_WRONLY|constants.O_CREAT|constants.O_APPEND|constants.O_NOFOLLOW,0o600);try{writeSync(fd,JSON.stringify(value)+'\n');fsyncSync(fd)}finally{closeSync(fd)}}
 async function precheck(topic,comparisonHash){
  if(isProtectedEditorialInput(topic))return{status:'hold',reason:'protected_topic'}
  const data=await localComparisons();if(data.hash!==comparisonHash)return{status:'hold',reason:'comparison_evidence_changed'};if(data.entries.some(e=>!e.metadata||isProtectedEditorialInput(e.metadata)))return{status:'hold',reason:'comparison_metadata_incomplete'}
  if(data.entries.some(e=>e.metadata.source_topic_id===topic.id||e.metadata.title.normalize('NFKC').toLowerCase().replace(/\s/g,'')===String(topic.title_candidate??topic.title).normalize('NFKC').toLowerCase().replace(/\s/g,'')))return{status:'hold',reason:'duplicate_metadata'}
  const legacyKey=inventoryHash(`${topicContentVersion(topic)}:${comparisonHash}`),key=inventoryHash(`${PRECHECK_REQUEST_VERSION}:${legacyKey}`)
  const current=cached(key);if(current)return{...current,requestVersion:PRECHECK_REQUEST_VERSION}
  const old=cached(legacyKey);if(old&&!canRepairLegacyPrecheck(old,legacyKey,topic,data.entries))return{...projectPrecheckCache(old),requestVersion:'legacy'}
  if(!env.OPENAI_API_KEY)return{status:'hold',reason:'generation_configuration_missing'}
  remember({key,status:'hold',reason:'precheck_unknown'})
  try{const response=await request('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(buildPrecheckRequest(topic,data.entries))});let result;try{result=await response.json()}catch{}const answer={key,requestVersion:PRECHECK_REQUEST_VERSION,...classifyPrecheckResponse(response.status,result)};remember(answer);return answer}catch{return{status:'hold',reason:'precheck_unknown'}}
 }
 const select=async({items,slot})=>{
  const evidence=inventory().data,existing=items.find(i=>recoveryTopic?i.topicId===recoveryTopic:!['backfill','restore'].includes(i.deliveryMode)&&i.slot===slot);if(existing)return{topicId:existing.topicId,topic:existing.topic}
  const rows=await csv(),ids=rows.map(r=>String(r.id??r.topic_id??''));if(new Set(ids).size!==ids.length)throw Error('duplicate_topic_ids')
  const used=new Set([...evidence.usedTopicIds,...items.map(i=>i.topicId)]),holds=[]
  for(const row of rows){if(backfill&&row.id!==backfill.topicId)continue;if(recoveryTopic&&String(row.id??row.topic_id??'')!==recoveryTopic)continue;const topic={...row,id:String(row.id??row.topic_id??'')};if(!/^[A-Za-z0-9_-]{1,100}$/.test(topic.id)||used.has(topic.id)||topic.status!=='approved')continue
   if(backfill&&(topic.publish_date!==backfill.plannedDate||topicContentVersion(topic)!==backfill.topicVersion))throw Error('backfill_topic_changed')
   try{github('GET',`contents/data/topic-adoptions/${topic.id}.json?ref=main`)}catch{holds.push({topicId:topic.id,reason:'topic_adoption_unproven'});continue}
   const version=topicContentVersion(topic),prepared=await server().prepare({slot,publicationMode:backfill?'draft-only':undefined,topicId:topic.id,topicVersion:version})
   if(prepared.status!=='ready'||prepared.topicVersion!==version){holds.push({topicId:topic.id,reason:prepared.reason??'server_prepare_pending'});continue}
   const checked=await precheck(topic,prepared.comparisonHash),disposition=precheckDraftDisposition(checked);if(disposition==='hold'){holds.push({topicId:topic.id,reason:checked.reason});continue}
   return{topicId:topic.id,topic:{...topic,serverTopicVersion:version,...(disposition==='draft_only'?{metadataReviewReason:'metadata_review_required'}:{})},holds}
  }return{holdOnly:true,holds}
 }
 async function approvedImage(){try{const file=github('GET','contents/data/image-library.json?ref=main'),library=JSON.parse(Buffer.from(file.content,'base64').toString('utf8'));const image=library.images?.find(i=>['approved','verified'].includes(i.license_status)&&i.license_source&&i.license_note&&!/TODO|要確認|assumed/i.test(i.license_note)&&i.alt&&/^\/images\/[A-Za-z0-9_./-]+$/.test(i.path)&&!i.path.includes('..')&&i.usage_status!=='inactive');return image?{image:image.path,image_alt:image.alt}:{image:''}}catch{return{image:''}}}
 const generate=async({slot,topic,idempotencyKey})=>{
  if(!topic||isProtectedEditorialInput(topic)||!env.OPENAI_API_KEY)return{status:'not-generated'}
  const prepared=await server().prepare({slot,publicationMode:backfill?'draft-only':undefined,topicId:topic.id,topicVersion:topicContentVersion(topic)});if(prepared.status!=='ready'||prepared.topicVersion!==topicContentVersion(topic)||precheckDraftDisposition(await precheck(topic,prepared.comparisonHash))==='hold')return{status:'not-generated'}
  const title=String(topic.title_candidate??topic.title??'').trim(),category=String(topic.category??'その他');if(!title)return{status:'not-generated'}
  try{const prompt=buildArticlePrompt({title,category,keyword:topic.target_keyword??topic.keyword??'',intent:topic.patient_intent??'',medicalRisk:topic.medical_risk??'medium',topic:topic.topic??title}),response=await request('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`,'Content-Type':'application/json','X-Client-Request-Id':idempotencyKey},body:JSON.stringify({model:'gpt-5-nano',max_completion_tokens:4000,reasoning_effort:'minimal',messages:[{role:'user',content:prompt}]})});if(!response.ok)return{status:[400,401,403,404,429].includes(response.status)?'not-generated':'unknown'};const result=await response.json(),body=result.choices?.[0]?.message?.content;if(!body||result.choices[0].finish_reason!=='stop')return{status:'unknown'}
   const selectedImage=await approvedImage()
   const raw=serializeMwfArticle(body+'\n',{title,date:slot.slice(0,10),category,tags:[],author:'藍想会メディア編集部',excerpt:`${title}について、受診目安と注意点を整理します。`,...selectedImage,draft:true,reviewed:false,auto_approved:false,publication_status:'draft',medical_risk:topic.medical_risk??'medium',generation_run_id:typeof result.id==='string'?`openai:${result.id}`:'',source_topic_id:topic.id,source_topic_version:topicContentVersion(topic)})
   if(validatePostArtifact(`${slot.slice(0,10)}-synthetic.md`,raw,{imageExists:()=>true}).errors.length)return{status:'unknown'};return{status:'generated',raw}
  }catch{return{status:'unknown'}}
 }
 const git=({directory,args,input})=>{const result=spawnImpl('/usr/bin/git',args.map(v=>v==='delivery-origin'?ORIGIN:v),{cwd:directory,env:gitEnv,input,encoding:'utf8',timeout:60000,maxBuffer:4*1024*1024});return{ok:result.status===0&&!result.error,output:result.stdout??''}}
 const notify=async({path,contentVersion,artifactVersion,published})=>{if(!env.TELEGRAM_BOT_TOKEN||!env.TELEGRAM_CHAT_ID)return{status:'not-sent'};try{const response=await request(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:env.TELEGRAM_CHAT_ID,text:`${published?'本番側の独立審査済み記事の公開反映を確認しました。':'未審査記事を管理画面で確認できます。'}\n${path}\n${artifactVersion?'保存原本SHA256':'内容版'}: ${artifactVersion??contentVersion}\nhttps://aisoukai-media.vercel.app/admin/pending-review`,disable_web_page_preview:true})}),result=await response.json();return{status:response.ok&&result.ok&&Number.isInteger(result.result?.message_id)?'sent':result.ok===false&&[400,401,403,404,429].includes(response.status)?'not-sent':'unknown'}}catch{return{status:'unknown'}}}
 async function checkRuntime(){
  const local={runnerVersion:env.MWF_RUNNER_VERSION,generatorAvailable:Boolean(env.OPENAI_API_KEY),notificationAvailable:Boolean(env.TELEGRAM_BOT_TOKEN&&env.TELEGRAM_CHAT_ID)}
  try{const response=await authenticateRequest('https://aisoukai-media.vercel.app/api/mwf',{method:'GET'});if(!response.ok||response.redirected||response.url!=='https://aisoukai-media.vercel.app/api/mwf')throw Error('unavailable');const result=await response.json();if(result.status!=='server-authority'||typeof result.aiReviewerAvailable!=='boolean'||!Number.isSafeInteger(result.adoptionCount)||result.adoptionCount<0||result.inventoryAnchor!==inventoryAnchor)throw Error('invalid');return{...local,status:'ready',serverReviewerAvailable:result.aiReviewerAvailable,adoptionCount:result.adoptionCount,inventoryAnchor:result.inventoryAnchor}}catch{return{...local,status:'server-unavailable'}}
 }
 const restore=async(store,item)=>{const entry=inventory().data.entries.find(e=>e.source==='local'&&e.path===item.path&&e.blob===item.blob);if(!entry||entry.quarantine)throw Error('preserved_draft_unproven');const raw=readOpaqueRegular(join(env.MWF_PRESERVATION_DIR??'/Users/caelus/Library/Application Support/AisoukaiMWF/preservation/2026-09-14',basename(item.path)));return restorePreservedDraft({store,item,entry,raw,sync:args=>syncPreservedDraft({...args,github}),reflect:item=>server().restore(item),notify})}
 return{root,restore,version:env.MWF_RUNNER_VERSION,slot:backfill?`${backfill.plannedDate}T08:30:00+09:00`:recoveryTopic?latestElapsedMwfSlot(now()):currentMwfSlot(now()),checkRuntime,select,minor:input=>server().minor(input),adapters:{serverAuthority:true,generate,sync:createIsolatedSync({spool:join(root,'git-spool'),run:git}),reflect:item=>server().reflect(item),notify}}
}
