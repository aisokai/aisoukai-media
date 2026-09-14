// Concrete production capabilities; constructing them is explicit. No module-scope env reads.
import { createHmac, createHash } from 'node:crypto'
import { readFileSync,openSync,closeSync,writeSync,fsyncSync,constants } from 'node:fs'
import { spawnSync } from 'node:child_process'
import {homedir} from 'node:os'
import { fileURLToPath } from 'node:url'
import { resolve, join } from 'node:path'
import matter from 'gray-matter'
import { parseCsv } from '../csv-parser.mjs'
import { buildArticlePrompt } from '../prompts/dental-article-prompt.mjs'
import { createIsolatedSync } from './mwf-isolated-sync.mjs'
import { createAdminReceiptReader } from './mwf-capabilities.mjs'
import { validatePostArtifact } from './post-artifact-validation.mjs'

import {comparisonSet,verifyInventory,metadataEntry,inventoryHash,reviewCandidate,verifyCandidateReceipt,candidateCacheKey} from './mwf-inventory.mjs'
import {readOpaqueRegular} from '../mwf-inventory-metadata.mjs'
import {basename} from 'node:path'
import { topicContentVersion,verifyBlogEvidence,signBlogEvidence } from '../../src/lib/tieredPublication.mjs'
import { createTieredReviewer, isProtectedEditorialInput } from './mwf-tiered-review.mjs'

const ORIGIN = 'https://github.com/aisokai/aisoukai-media.git'
const REQUIRED = ['MWF_STATE_ROOT','MWF_TOPICS_PATH','MWF_INVENTORY_PATH','MWF_RUNNER_VERSION']
export function currentMwfSlot(now = new Date()) {
  const jst = new Date(+now + 9*3600000)
  if (![1,3,5].includes(jst.getUTCDay()) || jst.getUTCHours()*60+jst.getUTCMinutes()<510) return null
  return `${jst.toISOString().slice(0,10)}T08:30:00+09:00`
}
export function createProductionRuntime({ env = process.env, fetchImpl = globalThis.fetch, spawnImpl = spawnSync, readText = path => readFileSync(path,'utf8'), now = () => new Date() } = {}) {
  if ((env.GITHUB_REVIEW_REPO && env.GITHUB_REVIEW_REPO !== 'aisokai/aisoukai-media') || (env.GITHUB_REVIEW_BRANCH && env.GITHUB_REVIEW_BRANCH !== 'main')) throw new Error('review_source_mismatch')
  for (const key of REQUIRED) if (typeof env[key] !== 'string' || !env[key].trim()) throw new Error('production_configuration_missing')
  for (const key of ['MWF_STATE_ROOT','MWF_TOPICS_PATH','MWF_INVENTORY_PATH']) if (!env[key].startsWith('/')) throw new Error('absolute_runtime_paths_required')
  if (!env.MWF_TOPICS_PATH.endsWith('.csv') || !env.MWF_INVENTORY_PATH.endsWith('.json')) throw new Error('runtime_input_format_required')
  if (!/^[a-f0-9]{40}$/.test(env.MWF_RUNNER_VERSION)) throw new Error('runner_version_required')
  const runnerRoot = fileURLToPath(new URL('../../', import.meta.url))
  const identityOptions = { cwd: runnerRoot, env: { PATH:'/usr/bin:/bin',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null' }, encoding:'utf8',timeout:10000 }
  const identity = spawnImpl('/usr/bin/git',['rev-parse','HEAD'],identityOptions)
  const clean = spawnImpl('/usr/bin/git',['status','--porcelain','--untracked-files=all','--','scripts','src','package.json','package-lock.json'],identityOptions)
  if (identity.status !== 0 || String(identity.stdout??'').trim() !== env.MWF_RUNNER_VERSION || clean.status !== 0 || String(clean.stdout??'').trim()) throw new Error('runner_version_mismatch')
  if (resolve(env.MWF_STATE_ROOT).startsWith(resolve(runnerRoot)+'/') || resolve(env.MWF_STATE_ROOT)===resolve(runnerRoot)) throw new Error('state_must_be_outside_runner')
  const root = resolve(env.MWF_STATE_ROOT)
  async function request(url, options, timeout = 60000) {
    const {reviewRequest,...transportOptions}=options
    if(reviewRequest && url!=='https://api.openai.com/v1/chat/completions') throw Error('invalid_review_transport')
    return fetchImpl(url, {...transportOptions,...(reviewRequest?{headers:{'Content-Type':'application/json',Authorization:`Bearer ${env.OPENAI_API_KEY}`}}:{}),redirect:'error',signal:AbortSignal.timeout(timeout)})
  }
  const nativeEnvironment={PATH:'/opt/homebrew/bin:/usr/bin:/bin',HOME:env.HOME||homedir(),GH_PROMPT_DISABLED:'1',GH_NO_UPDATE_NOTIFIER:'1'}
  function nativeGitHub(endpoint){const result=spawnImpl('/opt/homebrew/bin/gh',['api','--hostname','github.com','--method','GET',endpoint],{env:nativeEnvironment,encoding:'utf8',timeout:30000,maxBuffer:16*1024*1024,stdio:['ignore','pipe','pipe']});if(result.status!==0||result.error)throw Error('github_read_failed');try{return JSON.parse(result.stdout)}catch{throw Error('github_read_failed')}}
  async function githubHead(){if(!env.GITHUB_REVIEW_TOKEN?.trim())return nativeGitHub('repos/aisokai/aisoukai-media/git/ref/heads/main');const response=await request('https://api.github.com/repos/aisokai/aisoukai-media/git/ref/heads/main',{method:'GET',headers:{Authorization:`Bearer ${env.GITHUB_REVIEW_TOKEN}`}});if(!response.ok)throw Error('github_read_failed');return response.json()}
  async function githubJson(path, ref = 'main') {
    if(!/^(?:main|[a-f0-9]{40})$/.test(ref)||!(/^(?:data\/(?:article-topics\.sample\.csv|image-library\.json|topic-adoptions\/[A-Za-z0-9_-]+\.json)|content\/posts(?:\/\d{4}-\d{2}-\d{2}-[A-Za-z0-9_-]+\.md)?)$/.test(path)))throw Error('github_path_rejected')
    const endpoint=`repos/aisokai/aisoukai-media/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${ref}`
    if(!env.GITHUB_REVIEW_TOKEN?.trim())return nativeGitHub(endpoint)
    const response=await request(`https://api.github.com/${endpoint}`,{method:'GET',headers:{Authorization:`Bearer ${env.GITHUB_REVIEW_TOKEN}`,Accept:'application/vnd.github+json'}})
    if(!response.ok)throw Error('github_read_failed')
    return response.json()
  }
  async function githubBytes(path,ref) {const file=await githubJson(path,ref);if(file.encoding!=='base64'||typeof file.content!=='string')throw Error('github_file_invalid');return Buffer.from(file.content,'base64')}
  async function githubFile(path,ref) {return (await githubBytes(path,ref)).toString('utf8')}
  async function approvedImage() {
    try {
      const library=JSON.parse(await githubFile('data/image-library.json'))
      const asset=library.images?.find(image=>['approved','verified'].includes(image.license_status)&&image.license_source&&image.license_note&&!/TODO|要確認|assumed/i.test(image.license_note)&&image.alt&&/^\/images\/[A-Za-z0-9_./-]+$/.test(image.path)&&!image.path.includes('..')&&image.usage_status!=='inactive')
      return asset?{image:asset.path,image_alt:asset.alt}:{}
    } catch {return {}}
  }
  const inventoryDocument=()=>JSON.parse(readText(env.MWF_INVENTORY_PATH))
  async function currentComparisons(fixedRevision){
    const inventory=verifyInventory(inventoryDocument(),env.ADMIN_REVIEW_COOKIE_SECRET)
    if(!inventory)throw Error('historical_inventory_evidence_missing')
    const preserved=env.MWF_PRESERVATION_DIR??'/Users/caelus/Library/Application Support/AisoukaiMWF/preservation/2026-09-14'
    const entries=[...inventory.entries]
    for(const record of readRecords(join(root,'observed-editorial-metadata.jsonl'))){const entry=verifyBlogEvidence(record,'mwf-observed-editorial-metadata',env.ADMIN_REVIEW_COOKIE_SECRET);if(!entry)throw Error('observed_metadata_invalid');if(!entries.some(e=>e.path===entry.path&&e.blob===entry.blob&&e.source===entry.source))entries.push(entry)}
    for(const entry of entries.filter(e=>e.source==='local'))if(inventoryHash(readOpaqueRegular(join(preserved,basename(entry.path))))!==entry.blob)throw Error('preserved_artifact_changed')
    let revision=fixedRevision
    if(!revision)revision=(await githubHead()).object?.sha
    if(!/^[a-f0-9]{40}$/.test(revision??''))throw Error('comparison_revision_unavailable')
    const listing=await githubJson('content/posts',revision)
    if(!Array.isArray(listing)||listing.length>=1000)throw Error('comparison_listing_incomplete')
    for(const file of listing){if(file.type!=='file'||!file.path||!/^[a-f0-9]{40}$/.test(file.sha??''))throw Error('comparison_listing_invalid')
      if(entries.some(e=>e.source==='canonical'&&e.path===file.path&&e.gitBlob===file.sha))continue
      const raw=await githubBytes(file.path,revision),entry=metadataEntry({path:file.path,raw,source:'canonical',quarantine:inventory.quarantine.includes(file.path)})
      if(entry.gitBlob!==file.sha)throw Error('comparison_blob_mismatch');appendRecord(join(root,'observed-editorial-metadata.jsonl'),signBlogEvidence('mwf-observed-editorial-metadata',entry,env.ADMIN_REVIEW_COOKIE_SECRET));entries.push(entry)
    }
    entries.sort((a,b)=>`${a.path}:${a.source}:${a.blob}`.localeCompare(`${b.path}:${b.source}:${b.blob}`))
    return comparisonSet(entries)
  }
  const cachePath=join(root,'candidate-reviews.jsonl')
  function readRecords(path){try{return readOpaqueRegular(path).toString('utf8').split('\n').filter(Boolean).map(s=>JSON.parse(s))}catch(error){if(error.code==='ENOENT')return [];throw Error('candidate_cache_invalid')}}
  function appendRecord(path,record){const fd=openSync(path,constants.O_WRONLY|constants.O_CREAT|constants.O_APPEND|constants.O_NOFOLLOW,0o600);try{writeSync(fd,JSON.stringify(record)+'\n');fsyncSync(fd)}finally{closeSync(fd)}}
  function cached(key){return readRecords(cachePath).filter(r=>r.key===key).at(-1)}
  function remember(record){appendRecord(cachePath,record)}
  async function assessCandidate(topic,set){
    if(isProtectedEditorialInput(topic))return {status:'hold',reason:'protected_topic'}
    let adoption;try{adoption=JSON.parse(await githubFile(`data/topic-adoptions/${topic.id}.json`))}catch{return {status:'hold',reason:'topic_adoption_unavailable'}}
    const adopted=verifyBlogEvidence(adoption,'teacher-topic-adoption',env.ADMIN_REVIEW_COOKIE_SECRET);if(adopted?.topicId!==topic.id||adopted.topicVersion!==topicContentVersion(topic))return {status:'hold',reason:'topic_adoption_missing'}
    const key=candidateCacheKey(topic,set),old=cached(key)
    if(old)return old.status==='clear'&&verifyCandidateReceipt(old.receipt,topic,set,env.ADMIN_REVIEW_COOKIE_SECRET)?old:{status:'hold',reason:old.reason??'candidate_review_unknown'}
    remember({key,topicId:topic.id,comparisonHash:set.hash,status:'hold',reason:'candidate_review_unknown'})
    let result
    try{result=await reviewCandidate({topic,set,adoption,request,secret:env.ADMIN_REVIEW_COOKIE_SECRET})}catch{result={status:'hold',reason:'topic_adoption_unavailable'}}
    remember({key,topicId:topic.id,comparisonHash:set.hash,...result});return result
  }
  const select = async ({ items, slot }) => {
    if(!env.ADMIN_REVIEW_COOKIE_SECRET||!env.OPENAI_API_KEY)throw Error('candidate_configuration_missing')
    const inventory=verifyInventory(inventoryDocument(),env.ADMIN_REVIEW_COOKIE_SECRET)
    if(!inventory)throw Error('historical_inventory_evidence_missing')
    const existing=items.find(i=>i.slot===slot)
    if(existing)return {topicId:existing.topicId,topic:existing.topic}
    const set=await currentComparisons(),used=new Set([...inventory.usedTopicIds,...set.entries.map(e=>e.metadata?.source_topic_id).filter(Boolean),...items.map(i=>i.topicId)])
    const rows=parseCsv(await githubFile('data/article-topics.sample.csv')),ids=rows.map(r=>String(r.id??r.topic_id??'').trim())
    if(new Set(ids).size!==ids.length)throw Error('duplicate_topic_ids')
    const candidates=rows.map((r,index)=>({...r,id:ids[index]})).filter(r=>/^[A-Za-z0-9_-]{1,100}$/.test(r.id)&&!used.has(r.id)&&r.status==='approved').sort((a,b)=>String(a.publish_date??'').localeCompare(String(b.publish_date??''))||a.id.localeCompare(b.id))
    const holds=[]
    for(const topic of candidates){const result=await assessCandidate(topic,set);if(result.status==='clear')return{topicId:topic.id,topic:{...topic,candidate_receipt:result.receipt},holds};holds.push({topicId:topic.id,reason:result.reason,comparisonHash:set.hash})}
    return{holdOnly:true,holds}
  }
  const generate=async ({ idempotencyKey,slot,topic })=>{
    if (isProtectedEditorialInput(topic) || !env.OPENAI_API_KEY?.trim() || !topic) return {status:'not-generated'}
    let candidateReceipt
    try{const set=await currentComparisons(),result=await assessCandidate(topic,set);if(result.status!=='clear')return {status:'not-generated'};candidateReceipt=result.receipt}catch{return {status:'not-generated'}}
    const title=String(topic.title_candidate??topic.title??'').trim(),category=String(topic.category??'その他')
    if (!title) return {status:'not-generated'}
    const chosenImage=topic.status==='approved'?await approvedImage(topic):{}
    const prompt=buildArticlePrompt({title,category,keyword:String(topic.target_keyword??topic.keyword??''),intent:String(topic.patient_intent??topic.search_intent??''),medicalRisk:String(topic.medical_risk??'medium'),topic:String(topic.topic??title)})
    try {
      const response=await request('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${env.OPENAI_API_KEY}`,'X-Client-Request-Id':idempotencyKey},body:JSON.stringify({model:'gpt-5-nano',max_completion_tokens:4000,reasoning_effort:'minimal',messages:[{role:'user',content:prompt}]})},180000)
      if (!response.ok) return {status:[400,401,403,404,429].includes(response.status)?'not-generated':'unknown'}
      const result=await response.json(),body=result.choices?.[0]?.message?.content?.trim()
      if (!body || result.choices?.[0]?.finish_reason !== 'stop') return {status:'unknown'}
      const data={source_candidate_receipt:candidateReceipt,generation_run_id:typeof result.id==='string'?`openai:${result.id}`:'',source_topic_version:topicContentVersion(topic),title,date:slot.slice(0,10),category,tags:[],author:'藍想会メディア編集部',excerpt:`${title}について、受診目安と注意点を整理します。`,image:'',draft:true,reviewed:false,auto_approved:false,publication_status:'draft',legal_check_status:'pending',image_check_status:'pending',medical_risk:String(topic.medical_risk??'medium'),ai_generated:true,source_topic_id:topic.id,...chosenImage}
      const raw=matter.stringify(body+'\n',data)
      if (validatePostArtifact(`${slot.slice(0,10)}-synthetic.md`,raw,{imageExists:()=>true}).errors.length) return {status:'unknown'}
      return {status:'generated',raw}
    } catch { return {status:'unknown'} }
  }
  const git=({directory,args,input})=>{
    // Tokens stay in child environment, never argv/config files or returned diagnostics.
    const childEnv={...nativeEnvironment,PATH:'/usr/bin:/bin',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_TERMINAL_PROMPT:'0',GIT_ALLOW_PROTOCOL:'https',GIT_CONFIG_COUNT:'1',GIT_CONFIG_KEY_0:env.GITHUB_REVIEW_TOKEN?.trim()?'http.https://github.com/.extraheader':'credential.https://github.com.helper',GIT_CONFIG_VALUE_0:env.GITHUB_REVIEW_TOKEN?.trim()?`Authorization: Basic ${Buffer.from(`x-access-token:${env.GITHUB_REVIEW_TOKEN}`).toString('base64')}`:'!/opt/homebrew/bin/gh auth git-credential',GIT_AUTHOR_NAME:'MWF Draft Runner',GIT_AUTHOR_EMAIL:'mwf@users.noreply.github.com',GIT_COMMITTER_NAME:'MWF Draft Runner',GIT_COMMITTER_EMAIL:'mwf@users.noreply.github.com'}
    const result=spawnImpl('/usr/bin/git',args.map(arg=>arg==='delivery-origin'?ORIGIN:arg),{cwd:directory,env:childEnv,input,encoding:'utf8',timeout:60000,maxBuffer:4*1024*1024})
    return {ok:result.status===0&&!result.error,output:result.stdout??''}
  }
  const reflect=createAdminReceiptReader({authenticatedFetch:(url,options)=>{
    if (!env.ADMIN_REVIEW_COOKIE_SECRET?.trim()) return Promise.resolve({ok:false})
    const value=`admin:${+now()}`,signature=createHmac('sha256',env.ADMIN_REVIEW_COOKIE_SECRET).update(value).digest('hex')
    return request(url,{...options,headers:{Cookie:`aisoukai_admin_review=${value}.${signature}`,Accept:'application/json'}})
  }})
  const notify=async ({ path,contentVersion,published })=>{
    if (!env.TELEGRAM_BOT_TOKEN?.trim() || !env.TELEGRAM_CHAT_ID?.trim()) return {status:'not-sent'}
    try {
      const response=await request(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:env.TELEGRAM_CHAT_ID,text:`${published?'独立レビュー済みの記事の公開反映を確認しました。':'未審査記事を管理画面で確認できます。'}\n${path}\n内容版: ${contentVersion}\nhttps://aisoukai-media.vercel.app/admin/pending-review`,disable_web_page_preview:true})})
      const result=await response.json()
      if (response.ok && result.ok === true && Number.isInteger(result.result?.message_id)) return {status:'sent'}
      return {status:result.ok===false&&[400,401,403,404,429].includes(response.status)?'not-sent':'unknown'}
    } catch {return {status:'unknown'}}
  }
  const independentReviewer=createTieredReviewer({request,githubFile,getComparisons:currentComparisons,secret:env.ADMIN_REVIEW_COOKIE_SECRET})
  const review=async input=>{
    if(!input.expectedBaseBlob)return independentReviewer(input)
    try {const baselineRaw=await githubFile(input.path);if(createHash('sha256').update(baselineRaw).digest('hex')!==input.expectedBaseBlob)return {status:'draft',reason:'baseline_changed'};return independentReviewer({...input,baselineRaw})} catch{return {status:'draft',reason:'baseline_unavailable'}}
  }
  return {root,verificationSecret:env.ADMIN_REVIEW_COOKIE_SECRET,githubFile,version:env.MWF_RUNNER_VERSION,select,slot:currentMwfSlot(now()),adapters:{generate,review,sync:createIsolatedSync({spool:join(root,'git-spool'),run:git,verificationSecret:env.ADMIN_REVIEW_COOKIE_SECRET,verifyComparisons:async ({parent,data})=>(await currentComparisons(parent)).hash===data.source_comparison_hash}),reflect,notify}}
}
