import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,readFileSync,existsSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {runMwfCli} from '../scripts/ops-mwf.mjs'
import {openDeliveryStore,deliveryId} from '../scripts/lib/mwf-delivery.mjs'
import {durableState} from '../scripts/lib/mwf-candidate-supply.mjs'
import {AUTO_IMAGE_OPERATION_VERSION,MAX_IMAGE_REJECTION_REVOCATIONS} from '../scripts/lib/mwf-auto-images.mjs'
import {topicContentVersion} from '../src/lib/tieredPublication.mjs'
const slot='2026-11-09T08:30:00+09:00',base={id:'synthetic-topic',title:'歯ブラシの保管方法',category:'予防歯科',status:'approved'},version=topicContentVersion(base)
// Synthetic state only. Any network or non-identity process use fails the test.
function fixture({item={},image={status:'rejected'}}={}){
 const root=mkdtempSync(join(tmpdir(),'mwf-image-revocation-')),spawned=[],store=openDeliveryStore(root),journal=durableState(join(root,'generated-images'),`image-${version}`)
 // The stored delivery topic carries serverTopicVersion, exactly as production select() persists it.
 const topic={...base,serverTopicVersion:version}
 store.save({id:deliveryId(slot,base.id),slot,topicId:base.id,topic,state:'generation-failed',stage:'generation',generationReason:'image_rejected',...item})
 if(image)journal.write({status:'rejected',topicId:base.id,topicVersion:version,operation:AUTO_IMAGE_OPERATION_VERSION,hash:'a'.repeat(64),gitBlob:'b'.repeat(40),createdAt:'2026-11-09T00:00:00.000Z',requestId:'req_synthetic',rejection:{kind:'criteria_failed',failed:['suitable'],reviewId:'chatcmpl-synthetic'},...image})
 const options={env:{MWF_STATE_ROOT:root,MWF_TOPICS_PATH:'/synthetic/topics.csv',MWF_INVENTORY_PATH:'/synthetic/inventory.json',MWF_RUNNER_VERSION:'a'.repeat(40),OPENAI_API_KEY:'synthetic-generator-key',TELEGRAM_BOT_TOKEN:'synthetic-bot',TELEGRAM_CHAT_ID:'synthetic-teacher'},now:()=>new Date('2026-11-11T00:00:00Z'),
  readText:()=>{throw Error('unexpected read')},fetchImpl:async()=>{throw Error('unexpected fetch')},serverClient:new Proxy({},{get:()=>{throw Error('unexpected server')}}),
  spawnImpl:(command,args)=>{spawned.push([command,args[0]]);if(command!=='/usr/bin/git'||!['rev-parse','status'].includes(args[0]))throw Error('unexpected spawn');return{status:0,stdout:args[0]==='rev-parse'?'a'.repeat(40):''}}}
 const run=async topicId=>{let out;const code=await runMwfCli(['--production','--revoke-image-rejection',topicId??base.id],{productionOptions:options,output:value=>{out=value}});return{code,out}}
 return{root,store,journal,spawned,run,events:()=>readFileSync(join(root,'events.jsonl'),'utf8')}
}
test('revocation option accepts only --production and a valid topic id before any runtime work',async()=>{
 const reject=(args,pattern)=>assert.rejects(runMwfCli(args,{productionOptions:{env:{},spawnImpl:()=>{throw Error('unexpected spawn')}},output:()=>{throw Error('unexpected output')}}),pattern)
 for(const args of [['--revoke-image-rejection','topic'],['--production','--revoke-image-rejection','topic','--status'],['--production','--revoke-image-rejection','topic','--retry-only'],['--production','--revoke-image-rejection','topic','--recover-topic','topic'],['--production','--revoke-image-rejection','topic','--prepare-topics-only'],['--production','--revoke-image-rejection','topic','--check-runtime'],['--state-root','/synthetic','--revoke-image-rejection','topic']])await reject(args,/revoke_image_rejection_options_invalid/)
 await reject(['--production','--revoke-image-rejection','bad id'],/invalid_recovery_topic/)
 await reject(['--production','--revoke-image-rejection'],/missing_argument/)
 await reject(['--production','--revoke-image-rejection','--status'],/missing_argument/)
})
test('revocation requires exactly one delivery item stopped at an image rejection',async()=>{
 const refused={status:'image-rejection-revocation',ok:false,topicId:base.id,reason:'delivery_item_not_image_rejected'}
 for(const item of [{state:'notified'},{generationReason:'image_deployment_pending'},{generationReason:'image_unknown'},{generationReason:null},{state:'generation-unknown'},{state:'selected',generationReason:'image_visual_review_failed'},{topic:undefined},{topic:{...base,id:'other-topic'}}]){
  const f=fixture({item}),events=f.events(),before=f.journal.read();assert.deepEqual(await f.run(),{code:1,out:refused});assert.equal(f.events(),events);assert.deepEqual(f.journal.read(),before)
 }
 const absent=fixture();assert.deepEqual(await absent.run('unknown-topic'),{code:1,out:{...refused,topicId:'unknown-topic'}});assert.equal(absent.journal.read().status,'rejected')
 const twice=fixture();twice.store.save({id:deliveryId('2026-11-11T08:30:00+09:00',base.id),slot:'2026-11-11T08:30:00+09:00',topicId:base.id,topic:base,state:'generation-failed',stage:'generation',generationReason:'image_rejected'})
 assert.deepEqual(await twice.run(),{code:1,out:refused});assert.equal(twice.journal.read().status,'rejected')
})
test('revocation changes one image journal only, with no network, delivery event or held lock',async()=>{
 const f=fixture(),events=f.events(),result=await f.run()
 assert.deepEqual(result,{code:0,out:{status:'image-rejection-revocation',ok:true,topicId:base.id,topicVersion:version,revokedHash:'a'.repeat(64),revocationsUsed:1,revocationsRemaining:MAX_IMAGE_REJECTION_REVOCATIONS-1}})
 const state=f.journal.read();assert.equal(state.status,'regeneration-authorized');assert.equal(state.topicVersion,version)
 assert.deepEqual(state.revokedRejections,[{hash:'a'.repeat(64),gitBlob:'b'.repeat(40),createdAt:'2026-11-09T00:00:00.000Z',requestId:'req_synthetic',rejection:{kind:'criteria_failed',failed:['suitable'],reviewId:'chatcmpl-synthetic'},revokedAt:'2026-11-11T00:00:00.000Z'}])
 assert.equal(f.events(),events);assert.deepEqual(f.spawned,[['/usr/bin/git','rev-parse'],['/usr/bin/git','status']])
 for(const name of ['intake-notifications.jsonl','mac-draft-prechecks.jsonl','git-spool','candidate-supply'])assert.equal(existsSync(join(f.root,name)),false)
 f.store.acquire()()
 // A second run finds no rejected record: nothing more is authorized.
 assert.deepEqual(await f.run(),{code:1,out:{status:'image-rejection-revocation',ok:false,topicId:base.id,reason:'image_not_rejected'}});assert.deepEqual(f.journal.read(),state);assert.equal(f.events(),events);f.store.acquire()()
})
test('a first rejection not yet retried (image_visual_review_failed) is accepted; the journal stays the real guard',async()=>{
 const f=fixture({item:{generationReason:'image_visual_review_failed'}}),events=f.events(),result=await f.run()
 assert.equal(result.code,0);assert.equal(result.out.ok,true);assert.equal(result.out.revocationsUsed,1);assert.equal(f.journal.read().status,'regeneration-authorized');assert.equal(f.events(),events)
 const pending=fixture({item:{generationReason:'image_visual_review_failed'},image:{status:'deployed-pending'}});assert.deepEqual(await pending.run(),{code:1,out:{status:'image-rejection-revocation',ok:false,topicId:base.id,reason:'image_not_rejected'}});assert.equal(pending.journal.read().status,'deployed-pending')
})
test('revocation reports library refusals and never races a running runner',async()=>{
 const missing=fixture({image:null});assert.deepEqual(await missing.run(),{code:1,out:{status:'image-rejection-revocation',ok:false,topicId:base.id,reason:'image_record_missing'}});missing.store.acquire()()
 const capped=fixture({image:{revokedRejections:Array.from({length:MAX_IMAGE_REJECTION_REVOCATIONS},(_,i)=>({hash:String(i).repeat(64)}))}});assert.equal((await capped.run()).out.reason,'revocation_limit_reached');assert.equal(capped.journal.read().status,'rejected')
 const busy=fixture(),release=busy.store.acquire()
 try{assert.deepEqual(await busy.run(),{code:1,out:{status:'image-rejection-revocation',ok:false,topicId:base.id,reason:'already_running'}});assert.equal(busy.journal.read().status,'rejected')}finally{release()}
 assert.equal((await busy.run()).code,0)
})
