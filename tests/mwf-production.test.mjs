import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {createProductionRuntime,createGithubServerTransport} from '../scripts/lib/mwf-production.mjs'
import {runMwfCli} from '../scripts/ops-mwf.mjs'
import {openDeliveryStore} from '../scripts/lib/mwf-delivery.mjs'
import {inventoryHash,comparisonSet} from '../scripts/lib/mwf-inventory.mjs'
function fixture(){
 const root=mkdtempSync(join(tmpdir(),'mwf-mac-server-')),inventoryRaw=JSON.stringify({unsigned:true,payload:{schema:2,entries:[],quarantine:[],usedTopicIds:[]}}),calls=[],git=[],topic={id:'topic',title:'Synthetic',category:'その他',status:'approved'}
 const env={MWF_STATE_ROOT:root,MWF_TOPICS_PATH:'/synthetic/topics.csv',MWF_INVENTORY_PATH:'/synthetic/inventory.json',MWF_RUNNER_VERSION:'a'.repeat(40),OPENAI_API_KEY:'synthetic-generator-key',TELEGRAM_BOT_TOKEN:'synthetic-bot',TELEGRAM_CHAT_ID:'synthetic-teacher'}
 let raw,adopted=true,serverReady=true,published=false
 const options={env,inventoryAnchor:inventoryHash(inventoryRaw),readText:()=>inventoryRaw,now:()=>new Date('2026-09-13T23:30:00Z'),serverClient:{prepare:async({topicVersion})=>({status:serverReady?'ready':'hold',reason:'topic_adoption_unproven',topicVersion,comparisonHash:comparisonSet([]).hash}),reflect:async item=>({status:'draft-review-required',reason:'server_reviewer_configuration_missing',authenticated:true,source:'production-admin',path:item.path,originBlob:item.blob,blob:published?'e'.repeat(64):item.blob,contentVersion:published?'f'.repeat(64):item.contentVersion,reviewable:true,published})},
 spawnImpl:(command,args,options)=>{
  if(command==='/opt/homebrew/bin/gh'){
   assert.equal(args[0],'api');assert.equal(args[2],'github.com');assert.equal(args[4],'GET');assert.deepEqual(Object.keys(options.env).sort(),['GH_NO_UPDATE_NOTIFIER','GH_PROMPT_DISABLED','HOME','PATH'])
   const endpoint=args[5];let value
   if(endpoint.includes('topic-adoptions')){if(!adopted)return{status:1,stderr:'HTTP 404'};value={encoding:'base64',content:'e30='}}
   else if(endpoint.includes('article-topics'))value={encoding:'base64',content:Buffer.from('id,title,category,status\ntopic,Synthetic,その他,approved\n').toString('base64')}
   else if(endpoint.includes('/git/ref/'))value={object:{sha:'a'.repeat(40)}}
   else if(endpoint.includes('/content/posts?')||endpoint.includes('/data/mwf/claims?'))value=[]
   else value={encoding:'base64',content:Buffer.from(JSON.stringify({images:[]})).toString('base64')}
   return{status:0,stdout:JSON.stringify(value)}
  }
  git.push({args,options});const op=args[0];if(op==='status')return{status:0,stdout:''};if(op==='show')return{status:1,stdout:''};if(op==='hash-object'){raw=options.input;return{status:0,stdout:'b'.repeat(40)}};const path=openDeliveryStore(root).read()[0]?.path;return{status:0,stdout:op==='rev-parse'?'a'.repeat(40):op==='write-tree'?'c'.repeat(40):op==='commit-tree'?'d'.repeat(40):op==='diff-tree'?path:op==='ls-remote'?`${'d'.repeat(40)} refs/heads/main\n`:''}
 },fetchImpl:async(url,options)=>{calls.push({url,options});if(url.includes('openai.com')){const input=JSON.parse(options.body);return{ok:true,json:async()=>({id:'actual-generator',choices:[{finish_reason:'stop',message:{content:input.messages[0].role==='system'?'{"decision":"clear"}':'## Synthetic\nPublic editorial.'}}]})}}return{ok:true,json:async()=>({ok:true,result:{message_id:1}})}}}
 return{root,options,calls,git,getRaw:()=>raw,setAdopted:v=>adopted=v,setReady:v=>serverReady=v,setPublished:v=>published=v,topic}
}
test('Mac without admin/GitHub secret generates only unreviewed draft, syncs using native helper and notifies exact server pending reflection',async()=>{const f=fixture();let result;assert.equal(await runMwfCli(['--production'],{productionOptions:f.options,output:v=>result=v}),0);assert.match(f.getRaw(),/draft: true/);assert.match(f.getRaw(),/reviewed: false/);assert.doesNotMatch(f.getRaw(),/tiered_review_proof/);assert.equal(f.calls.filter(c=>c.url.includes('openai')).length,2);assert.equal(f.git.find(c=>c.args[0]==='push').options.env.GIT_CONFIG_VALUE_0,'!/opt/homebrew/bin/gh auth git-credential');assert.equal(result.items[0].state,'notified');await runMwfCli(['--production'],{productionOptions:f.options,output:()=>{}});assert.equal(f.calls.filter(c=>c.url.includes('openai')).length,2)})
test('missing adoption holds without mailbox writes/provider calls; stale server ready prevents generation',async()=>{const f=fixture();f.setAdopted(false);let result;assert.equal(await runMwfCli(['--production'],{productionOptions:f.options,output:v=>result=v}),1);assert.equal(result.candidateHolds[0].reason,'topic_adoption_unproven');assert.equal(f.calls.length,0);assert.equal(f.git.some(c=>c.args[0]==='push'),false);f.setAdopted(true);f.setReady(false);await runMwfCli(['--production'],{productionOptions:f.options,output:v=>result=v});assert.equal(f.calls.length,0)})
test('server-verified published bytes can differ from original draft but must bind its origin hash',async()=>{const f=fixture();f.setPublished(true);assert.equal(await runMwfCli(['--production'],{productionOptions:f.options,output:()=>{}}),0);const item=openDeliveryStore(f.root).read()[0];assert.equal(item.deliveredBlob,'e'.repeat(64));assert.equal(item.serverPublished,true);assert.match(f.calls.at(-1).options.body,/公開反映/)})
test('saved sync retry continues with broken new intake and no regeneration',async()=>{const f=fixture(),spawn=f.options.spawnImpl;f.options.spawnImpl=(c,a,o)=>a[0]==='push'?{status:1,stdout:''}:spawn(c,a,o);await runMwfCli(['--production'],{productionOptions:f.options,output:()=>{}});assert.equal(openDeliveryStore(f.root).read()[0].state,'sync-failed');f.options.spawnImpl=spawn;f.options.readText=()=>{throw Error('broken inventory')};delete f.options.env.OPENAI_API_KEY;await runMwfCli(['--production'],{productionOptions:f.options,output:()=>{}});assert.equal(openDeliveryStore(f.root).read()[0].state,'notified');assert.equal(f.calls.filter(c=>c.url.includes('openai')).length,2)})
test('protected candidate is rejected before any generation transport',async()=>{const f=fixture(),runtime=createProductionRuntime(f.options);const result=await runtime.adapters.generate({slot:runtime.slot,topic:{...f.topic,sensitive_data:'true'},idempotencyKey:'synthetic'});assert.equal(result.status,'not-generated');assert.equal(f.calls.length,0)})


test('server transport uses only existing native GitHub auth at the fixed origin and never forwards failure details',async()=>{
 const native={PATH:'/synthetic'},calls=[]
 let failed=false
 const transport=createGithubServerTransport({native,spawnImpl:(command,args,options)=>{
  calls.push('auth');assert.equal(command,'/opt/homebrew/bin/gh');assert.deepEqual(args,['auth','token','--hostname','github.com']);assert.equal(options.env,native)
  return failed?{status:1,stderr:'synthetic-private-diagnostic'}:{status:0,stdout:'synthetic_existing_github_identity\n'}
 },request:async(url,options)=>{calls.push('request');assert.equal(options.headers.Authorization,'Bearer synthetic_existing_github_identity');assert.equal(options.headers['Content-Type'],'application/json');return{ok:true}}})
 await assert.rejects(transport('https://unrelated.invalid',{}),/server_auth_destination_rejected/)
 assert.equal(calls.length,0)
 assert.equal((await transport('https://aisoukai-media.vercel.app/api/mwf',{headers:{'Content-Type':'application/json'}})).ok,true)
 failed=true
 await assert.rejects(transport('https://aisoukai-media.vercel.app/api/mwf',{}),{message:'server_auth_unavailable'})
 assert.deepEqual(calls,['auth','request','auth'])
})

test('native comparison rejects unknown historical listing without fetching article bytes or generating',async()=>{
 const f=fixture(),spawn=f.options.spawnImpl;let bodyReads=0
 f.options.spawnImpl=(command,args,options)=>{const endpoint=args[5]??'';if(endpoint.includes('/content/posts?'))return{status:0,stdout:JSON.stringify([{type:'file',path:'content/posts/2026-08-01-unknown.md',sha:'e'.repeat(40)}])};if(endpoint.includes('/content/posts/')){bodyReads++;throw Error('historical_body_read_forbidden')}return spawn(command,args,options)}
 await runMwfCli(['--production'],{productionOptions:f.options,output:()=>{}})
 assert.equal(bodyReads,0);assert.equal(f.calls.length,0)
})

test('explicit Tuesday recovery uses true elapsed Monday slot, filters one topic, default Tuesday stays retry only',async()=>{
 const f=fixture();f.options.now=()=>new Date('2026-09-15T03:00:00Z');let result
 await runMwfCli(['--production'],{productionOptions:f.options,output:v=>result=v});assert.equal(f.calls.length,0)
 await runMwfCli(['--production','--recover-topic','topic'],{productionOptions:f.options,output:v=>result=v})
 assert.equal(result.items.length,1);assert.equal(result.items[0].topicId,'topic');assert.equal(result.items[0].slot,'2026-09-14T08:30:00+09:00');assert.equal(result.items[0].state,'notified')
 f.options.now=()=>new Date('2026-09-17T03:00:00Z');await runMwfCli(['--production','--recover-topic','topic'],{productionOptions:f.options,output:v=>result=v})
 assert.equal(result.items[0].slot,'2026-09-14T08:30:00+09:00');assert.equal(f.calls.filter(c=>c.url.includes('openai')).length,2)
})
test('recovery cannot select another topic or execute unrelated queued work',async()=>{
 const f=fixture(),store=openDeliveryStore(f.root)
 store.save({id:'d'.repeat(64),slot:'2026-09-11T08:30:00+09:00',topicId:'other',state:'selected',stage:'generation'})
 let result;await runMwfCli(['--production','--recover-topic','missing'],{productionOptions:f.options,output:v=>result=v})
 assert.equal(result.items.length,0);assert.equal(result.lastSuccessAt,null);assert.equal(f.calls.length,0);assert.equal(store.read()[0].state,'selected')
})
test('occupied recovery slot fails before selection or paid work',async()=>{
 const f=fixture(),store=openDeliveryStore(f.root);store.save({id:'d'.repeat(64),slot:'2026-09-14T08:30:00+09:00',topicId:'other',state:'selected',stage:'generation'})
 let result;await runMwfCli(['--production','--recover-topic','topic'],{productionOptions:f.options,output:v=>result=v})
 assert.equal(result.intakeError,'slot_or_topic_already_reserved');assert.equal(f.calls.length,0);assert.equal(store.read().length,1)
})
test('metadata runtime check only GETs authenticated fixed diagnostics and emits allowlisted metadata',async()=>{
 const f=fixture(),spawn=f.options.spawnImpl
 f.options.spawnImpl=(command,args,options)=>args[0]==='auth'?{status:0,stdout:'synthetic_existing_github_identity\n'}:spawn(command,args,options)
 let calls=0;f.options.fetchImpl=async(url,options)=>{calls++;assert.equal(url,'https://aisoukai-media.vercel.app/api/mwf');assert.equal(options.method,'GET');return{ok:true,url,redirected:false,json:async()=>({status:'server-authority',aiReviewerAvailable:false,adoptionCount:9,inventoryAnchor:f.options.inventoryAnchor,ignored:'must not emit'})}}
 let result;assert.equal(await runMwfCli(['--production','--check-runtime'],{productionOptions:f.options,output:v=>result=v}),0)
 assert.equal(calls,1);assert.equal(result.adoptionCount,9);assert.equal(result.serverReviewerAvailable,false);assert.equal(Object.hasOwn(result,'ignored'),false);assert.equal(openDeliveryStore(f.root).read().length,0);assert.equal(f.git.some(c=>c.args[0]==='push'),false)
})

test('targeted later-day recovery resumes saved artifact and its original slot without regenerating',async()=>{
 const f=fixture(),spawn=f.options.spawnImpl
 f.options.spawnImpl=(command,args,options)=>args[0]==='push'?{status:1,stdout:''}:spawn(command,args,options)
 await runMwfCli(['--production','--recover-topic','topic'],{productionOptions:f.options,output:()=>{}})
 assert.equal(openDeliveryStore(f.root).read()[0].state,'sync-failed')
 f.options.spawnImpl=spawn;f.options.now=()=>new Date('2026-09-17T03:00:00Z');let result
 await runMwfCli(['--production','--recover-topic','topic'],{productionOptions:f.options,output:v=>result=v})
 assert.equal(result.items[0].state,'notified');assert.equal(result.items[0].slot,'2026-09-14T08:30:00+09:00');assert.equal(f.calls.filter(c=>c.url.includes('openai')).length,2)
})
