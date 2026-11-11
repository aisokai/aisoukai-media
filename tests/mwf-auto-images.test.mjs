import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,readFileSync,writeFileSync,existsSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createAutoImages,validateGeneratedPng,revokeImageRejection,AUTO_IMAGE_USAGE_EVIDENCE,MAX_IMAGE_REJECTION_REVOCATIONS} from '../scripts/lib/mwf-auto-images.mjs'
import {topicContentVersion} from '../src/lib/tieredPublication.mjs'
const topic={id:'synthetic-topic',title:'歯ブラシの保管方法',category:'予防歯科',status:'approved'}
function fixture({unknown=false,reviewPass=true,patchUnknown=false,distinct=false,reviewMode='json'}={}){
 const root=mkdtempSync(join(tmpdir(),'auto-image-test-')),bytes=Buffer.alloc(40);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);bytes.write('IHDR',12);bytes.writeUInt32BE(1536,16);bytes.writeUInt32BE(1024,20)
 let head='a'.repeat(40),generated=0,reviewed=0,deployed=false,updates=0,tree=[],library={images:[]};const blobs=new Map()
 const github=(method,path,body)=>{
  if(path==='git/ref/heads/main')return{object:{sha:head}}
  if(path.startsWith('contents/data/image-library.json?'))return{encoding:'base64',content:Buffer.from(JSON.stringify(library)).toString('base64')}
  if(path.startsWith('contents/public/images/library/generated/'))return{encoding:'base64',content:bytes.toString('base64')}
  if(method==='GET'&&path.startsWith('git/commits/'))return{tree:{sha:'c'.repeat(40)}}
  if(path==='git/blobs'){const sha=String(blobs.size+1).padStart(40,'0');blobs.set(sha,body);return{sha}}
  if(path==='git/trees'){tree=body.tree;return{sha:'d'.repeat(40)}}
  if(path==='git/commits')return{sha:'b'.repeat(40)}
  if(path==='git/refs/heads/main'){assert.equal(body.force,false);updates++;head=body.sha;library=JSON.parse(blobs.get(tree.find(t=>t.path==='data/image-library.json').sha).content);if(patchUnknown)throw Error('lost PATCH');return{object:{sha:head}}}
  throw Error('unexpected github')
 }
 const request=async(url,options)=>{
  const input=JSON.parse(options.body)
  if(url==='https://api.openai.com/v1/images/generations'){generated++;assert.equal(input.n,1);assert.equal(input.size,'1536x1024');assert.equal(input.quality,'medium');if(unknown)throw Error('uncertain');if(distinct)bytes[30]=generated;return{ok:true,headers:new Headers({'x-request-id':'req_synthetic'}),json:async()=>({data:[{b64_json:bytes.toString('base64')}]})}}
  assert.equal(url,'https://api.openai.com/v1/chat/completions');reviewed++;assert.match(input.messages[1].content[1].image_url.url,/^data:image\/png;base64,/)
  if(reviewMode==='http')return{ok:false,status:500,json:async()=>({error:{message:'DO_NOT_RECORD'}})}
  return{ok:true,status:200,json:async()=>({id:'chatcmpl-synthetic',choices:[{finish_reason:reviewMode==='length'?'length':'stop',message:{content:reviewMode==='malformed'?'DO_NOT_RECORD':JSON.stringify({suitable:reviewPass,medicalAccuracy:true,notMisleading:true,noIdentifiablePeople:true})}}]})}
 }
 const ensure=createAutoImages({root,github,request,enabled:true,publicRequest:async url=>{assert.match(url,/^https:\/\/aisoukai-media.vercel.app\/images\/library\/generated\/[a-f0-9]{64}.png$/);return{ok:deployed,headers:new Headers({'content-type':'image/png'}),arrayBuffer:async()=>Buffer.from(bytes)}}})
 const journalPath=join(root,'generated-images',`image-${topicContentVersion(topic)}.json`)
 return{ensure,bytes,root,journalPath,journal:()=>JSON.parse(readFileSync(journalPath,'utf8')),setReviewPass:value=>{reviewPass=value},deploy:()=>{deployed=true},generated:()=>generated,reviewed:()=>reviewed,updates:()=>updates,library:()=>library,laterCommit:()=>{head='f'.repeat(40)}}
}
test('one image per adopted topic version is reviewed, persisted, and waits for deployed bytes before ready',async()=>{
 const f=fixture();assert.equal((await f.ensure(topic)).reason,'adoption_required');assert.equal(f.generated(),0)
 assert.equal((await f.ensure(topic,{adoptionVerified:true})).reason,'image_deployment_pending')
 assert.equal(f.generated(),1);assert.equal(f.reviewed(),1);assert.equal(f.updates(),1)
 assert.equal((await f.ensure(topic,{adoptionVerified:true})).reason,'image_deployment_pending');assert.equal(f.generated(),1)
 f.deploy();const ready=await f.ensure(topic,{adoptionVerified:true});assert.equal(ready.status,'ready');assert.equal(ready.image.image_selection_status,'assigned_pending_review')
 const asset=f.library().images[0];assert.equal(asset.generation_provenance.usage_evidence,AUTO_IMAGE_USAGE_EVIDENCE);assert.equal(asset.generation_provenance.request_id,'req_synthetic');assert.equal(asset.license_status,'approved');assert.equal(asset.auto_approved,undefined);assert.equal(asset.id,`generated-${asset.content_sha256}`);assert.equal(asset.sha256,asset.content_sha256);assert.equal(asset.category,'preventive');assert.equal(asset.width,1536);assert.equal(asset.height,1024);assert.equal(asset.usage_status,'active');for(const key of ['title','format','source_filename','created_at','updated_at'])assert.ok(asset[key])
})
test('unknown generation and failed vision never repeat paid calls or attach an image',async()=>{
 const f=fixture({unknown:true});for(let i=0;i<2;i++)assert.equal((await f.ensure(topic,{adoptionVerified:true})).status,'pending');assert.equal(f.generated(),1);assert.equal(f.updates(),0)
 const rejected=fixture({reviewPass:false});for(let i=0;i<2;i++)assert.equal((await rejected.ensure(topic,{adoptionVerified:true})).status,'pending');assert.equal(rejected.generated(),1);assert.equal(rejected.reviewed(),1);assert.equal(rejected.updates(),0)
})
test('ambiguous image commit recovers by exact remote SHA without regeneration or second PATCH',async()=>{
 const f=fixture({patchUnknown:true});await f.ensure(topic,{adoptionVerified:true});f.laterCommit();f.deploy();assert.equal((await f.ensure(topic,{adoptionVerified:true})).status,'ready');assert.equal(f.generated(),1);assert.equal(f.updates(),1)
})
test('disabled gate and protected topic never call image API; non-PNG/oversized input rejects',async()=>{
 const run=createAutoImages({root:'/synthetic',enabled:false});assert.equal((await run(topic,{adoptionVerified:true})).reason,'automatic_image_disabled')
 const f=fixture();assert.equal((await f.ensure({...topic,contains_patient_data:true},{adoptionVerified:true})).reason,'adoption_required');assert.equal(f.generated(),0)
 for(const input of ['not png','abcd','a'.repeat(8*1024*1024)])assert.throws(()=>validateGeneratedPng(input))
})

test('deployment-only continuation cannot create an image without a saved deployment',async()=>{
 const f=fixture();assert.equal((await f.ensure(topic,{adoptionVerified:true,deploymentOnly:true})).reason,'image_resume_unproven');assert.equal(f.generated(),0)
 await f.ensure(topic,{adoptionVerified:true});for(let i=0;i<3;i++)assert.equal((await f.ensure(topic,{adoptionVerified:true,deploymentOnly:true})).reason,'image_deployment_pending')
 f.deploy();assert.equal((await f.ensure(topic,{adoptionVerified:true,deploymentOnly:true})).status,'ready');assert.equal(f.generated(),1);assert.equal(f.reviewed(),1);assert.equal(f.updates(),1)
})

const adopted={adoptionVerified:true}
test('rejection journal records the cause without model text',async()=>{
 const criteria=fixture({reviewPass:false});assert.equal((await criteria.ensure(topic,adopted)).reason,'visual_review_failed')
 assert.equal(criteria.journal().status,'rejected');assert.deepEqual(criteria.journal().rejection,{kind:'criteria_failed',failed:['suitable'],reviewId:'chatcmpl-synthetic'})
 for(const [reviewMode,rejection] of [['http',{kind:'review_request_failed',httpStatus:500}],['length',{kind:'review_incomplete'}],['malformed',{kind:'review_malformed'}]]){
  const f=fixture({reviewMode});assert.deepEqual(await f.ensure(topic,adopted),{status:'pending',reason:'visual_review_failed'});assert.deepEqual(f.journal().rejection,rejection);assert.doesNotMatch(readFileSync(f.journalPath,'utf8'),/DO_NOT_RECORD/)
  assert.equal((await f.ensure(topic,adopted)).reason,'rejected');assert.equal(f.generated(),1);assert.equal(f.reviewed(),1)
 }
})
test('operator revocation authorizes exactly one new generation and keeps the rejected history',async()=>{
 const f=fixture({reviewPass:false,distinct:true});await f.ensure(topic,adopted)
 for(let i=0;i<3;i++)assert.equal((await f.ensure(topic,adopted)).reason,'rejected');assert.equal(f.generated(),1);assert.equal(f.reviewed(),1)
 const rejected=f.journal(),png=join(f.root,'generated-images',`${rejected.hash}.png`),before=readFileSync(png)
 const result=revokeImageRejection({root:f.root,topic,now:()=>new Date('2026-11-11T00:00:00Z')})
 assert.deepEqual(result,{status:'revoked',topicId:topic.id,topicVersion:topicContentVersion(topic),revokedHash:rejected.hash,revocationsUsed:1,revocationsRemaining:MAX_IMAGE_REJECTION_REVOCATIONS-1})
 assert.deepEqual(f.journal(),{status:'regeneration-authorized',topicId:topic.id,topicVersion:rejected.topicVersion,operation:rejected.operation,revokedRejections:[{hash:rejected.hash,gitBlob:rejected.gitBlob,createdAt:rejected.createdAt,requestId:'req_synthetic',rejection:rejected.rejection,revokedAt:'2026-11-11T00:00:00.000Z'}]})
 assert.ok(readFileSync(png).equals(before));assert.equal(f.generated(),1);assert.equal(f.updates(),0)
 assert.equal(revokeImageRejection({root:f.root,topic}).reason,'image_not_rejected')
 assert.equal((await f.ensure(topic,{adoptionVerified:true,deploymentOnly:true})).reason,'image_resume_unproven');assert.equal(f.generated(),1)
 f.setReviewPass(true);assert.equal((await f.ensure(topic,adopted)).reason,'image_deployment_pending');assert.equal(f.generated(),2);assert.equal(f.reviewed(),2);assert.equal(f.updates(),1)
 assert.equal((await f.ensure(topic,adopted)).reason,'image_deployment_pending');assert.equal(f.generated(),2);assert.equal(revokeImageRejection({root:f.root,topic}).reason,'image_not_rejected')
 f.deploy();const ready=await f.ensure(topic,adopted),final=f.journal();assert.equal(ready.status,'ready');assert.equal(final.status,'ready');assert.notEqual(final.hash,rejected.hash);assert.equal(ready.image.image_content_hash,final.hash)
 assert.equal(final.revokedRejections.length,1);assert.equal(final.revokedRejections[0].hash,rejected.hash);assert.equal(final.rejection,undefined);assert.ok(readFileSync(png).equals(before))
 assert.equal(f.generated(),2);assert.equal(f.reviewed(),2);assert.equal(f.updates(),1);assert.equal(f.library().images.length,1)
})
test('revocation is refused for missing, non-rejected, mismatched and protected records',async()=>{
 const missing=fixture();assert.deepEqual(revokeImageRejection({root:missing.root,topic}),{status:'not-revoked',reason:'image_record_missing'});assert.equal(existsSync(join(missing.root,'generated-images')),false)
 const pending=fixture();await pending.ensure(topic,adopted);assert.equal(pending.journal().status,'deployed-pending');assert.equal(revokeImageRejection({root:pending.root,topic}).reason,'image_not_rejected');assert.equal(pending.journal().status,'deployed-pending')
 const unknown=fixture({unknown:true});await unknown.ensure(topic,adopted);assert.equal(revokeImageRejection({root:unknown.root,topic}).reason,'image_not_rejected');assert.equal(unknown.journal().status,'unknown');assert.equal((await unknown.ensure(topic,adopted)).reason,'unknown');assert.equal(unknown.generated(),1)
 const f=fixture({reviewPass:false});await f.ensure(topic,adopted);const raw=readFileSync(f.journalPath,'utf8')
 for(const input of [null,{...topic,id:'bad id'},{...topic,contains_patient_data:true}])assert.equal(revokeImageRejection({root:f.root,topic:input}).reason,'topic_invalid')
 assert.equal(revokeImageRejection({root:f.root,topic:{...topic,title:'別のテーマ'}}).reason,'image_record_missing')
 for(const patch of [{topicId:'other-topic'},{topicVersion:'0'.repeat(64)},{operation:'other-operation'},{hash:'not-a-hash'},{revokedRejections:'invalid'}]){writeFileSync(f.journalPath,JSON.stringify({...JSON.parse(raw),...patch}));assert.equal(revokeImageRejection({root:f.root,topic}).reason,'image_record_mismatch')}
 writeFileSync(f.journalPath,raw);assert.equal((await f.ensure(topic,adopted)).reason,'rejected');assert.equal(f.generated(),1);assert.equal(readFileSync(f.journalPath,'utf8'),raw)
})
test('revocation cap bounds paid calls per topic version',async()=>{
 const f=fixture({reviewPass:false,distinct:true}),hashes=[]
 for(let used=1;used<=MAX_IMAGE_REJECTION_REVOCATIONS;used++){
  assert.equal((await f.ensure(topic,adopted)).reason,'visual_review_failed');hashes.push(f.journal().hash);assert.equal(f.journal().revokedRejections?.length??0,used-1)
  const result=revokeImageRejection({root:f.root,topic});assert.equal(result.status,'revoked');assert.equal(result.revocationsUsed,used);assert.equal(result.revocationsRemaining,MAX_IMAGE_REJECTION_REVOCATIONS-used)
 }
 assert.equal((await f.ensure(topic,adopted)).reason,'visual_review_failed');const raw=readFileSync(f.journalPath,'utf8')
 assert.deepEqual(revokeImageRejection({root:f.root,topic}),{status:'not-revoked',reason:'revocation_limit_reached'});assert.equal(readFileSync(f.journalPath,'utf8'),raw)
 for(let i=0;i<2;i++)assert.equal((await f.ensure(topic,adopted)).reason,'rejected')
 assert.equal(f.generated(),MAX_IMAGE_REJECTION_REVOCATIONS+1);assert.equal(f.reviewed(),MAX_IMAGE_REJECTION_REVOCATIONS+1);assert.equal(f.updates(),0)
 assert.deepEqual(f.journal().revokedRejections.map(item=>item.hash),hashes);assert.equal(new Set([...hashes,f.journal().hash]).size,MAX_IMAGE_REJECTION_REVOCATIONS+1)
 for(const hash of hashes)assert.ok(existsSync(join(f.root,'generated-images',`${hash}.png`)))
})
test('regenerated bytes identical to a revoked image are rejected without another review',async()=>{
 const f=fixture({reviewPass:false});await f.ensure(topic,adopted);const first=f.journal().hash
 assert.equal(revokeImageRejection({root:f.root,topic}).status,'revoked');f.setReviewPass(true)
 assert.deepEqual(await f.ensure(topic,adopted),{status:'pending',reason:'visual_review_failed'});assert.equal(f.generated(),2);assert.equal(f.reviewed(),1);assert.equal(f.updates(),0)
 const state=f.journal();assert.equal(state.status,'rejected');assert.equal(state.hash,first);assert.deepEqual(state.rejection,{kind:'duplicate_of_revoked'});assert.equal(state.revokedRejections.length,1)
 assert.equal((await f.ensure(topic,adopted)).reason,'rejected');assert.equal(f.generated(),2);assert.equal(f.reviewed(),1)
})
