import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, symlinkSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash, createHmac } from 'node:crypto'
import { runMwfCli } from '../scripts/ops-mwf.mjs'
import { createProductionRuntime } from '../scripts/lib/mwf-production.mjs'
import { openDeliveryStore } from '../scripts/lib/mwf-delivery.mjs'
import { preserveDraftInventory } from '../scripts/mwf-preserve-drafts.mjs'
function fixture(){
 const root=mkdtempSync(join(tmpdir(),'mwf-production-'))
 const env={OPENAI_API_KEY:'synthetic-openai',GITHUB_REVIEW_TOKEN:'synthetic-github',ADMIN_REVIEW_COOKIE_SECRET:'synthetic-admin',TELEGRAM_BOT_TOKEN:'synthetic-bot',TELEGRAM_CHAT_ID:'synthetic-teacher',MWF_STATE_ROOT:root,MWF_TOPICS_PATH:'/synthetic/topics.csv',MWF_INVENTORY_PATH:'/synthetic/inventory.json',MWF_RUNNER_VERSION:'a'.repeat(40)}
 const calls=[],git=[];let raw
 const readText=p=>p===env.MWF_INVENTORY_PATH?JSON.stringify({schema:1,reconciled:true,usedTopicIds:['old']}):'id,title,category,publish_date\nold,Old,その他,2026-09-01\nnew,New,その他,2026-09-14\n'
 const fetchImpl=async(url,options)=>{
  calls.push({url,options})
  if(url.includes('article-topics.sample.csv'))return{ok:true,json:async()=>({encoding:'base64',content:Buffer.from(readText(env.MWF_TOPICS_PATH)).toString('base64')})}
  if(url.includes('openai.com'))return{ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:'## はじめに\nSynthetic body\n'}}]})}
  if(url.includes('vercel.app')){
   const u=new URL(url),item=openDeliveryStore(root).read()[0]
   return{ok:true,url,redirected:false,headers:new Headers({'content-type':'application/json'}),json:async()=>({authenticated:true,source:'production-admin',path:u.searchParams.get('path'),contentVersion:u.searchParams.get('contentVersion'),blob:item.blob,reviewable:true,published:false})}
  }
  return{ok:true,json:async()=>({ok:true,result:{message_id:123}})}
 }
 const spawnImpl=(command,args,options)=>{
  git.push({command,args,options})
  const op=args[0]
  if(op==='show')return{status:1,stdout:''}
  if(op==='hash-object'){raw=options.input;return{status:0,stdout:'b'.repeat(40)}}
  const path=openDeliveryStore(root).read()[0]?.path
  return{status:0,stdout:op==='rev-parse'?'a'.repeat(40):op==='write-tree'?'c'.repeat(40):op==='commit-tree'?'d'.repeat(40):op==='diff-tree'?path:op==='ls-remote'?`${'d'.repeat(40)}\trefs/heads/main\n`:''}
 }
 return{root,env,calls,git,options:{env,readText,fetchImpl,spawnImpl,now:()=>new Date('2026-09-13T23:30:00Z')},getRaw:()=>raw}
}
test('production CLI binds all concrete transports and automatic durable selection; restart makes no duplicate request',async()=>{
 const f=fixture();let result
 assert.equal(await runMwfCli(['--production'],{productionOptions:f.options,output:v=>result=v}),0)
 assert.equal(result.runnerVersion,f.env.MWF_RUNNER_VERSION);assert.equal(result.items[0].topicId,'new')
 assert.equal(f.calls.length,4);assert.equal(f.git.some(c=>c.args[0]==='push'),true)
 const ai=JSON.parse(f.calls.find(c=>c.url.includes('openai.com')).options.body);assert.equal(ai.model,'gpt-5-nano');assert.equal(ai.messages[0].content.includes('New'),true)
 assert.match(f.getRaw(),/draft: true/);assert.match(f.getRaw(),/reviewed: false/)
 assert.equal(f.calls.find(c=>c.url.includes('vercel.app')).options.headers.Cookie,`aisoukai_admin_review=admin:${+f.options.now()}.${createHmac('sha256',f.env.ADMIN_REVIEW_COOKIE_SECRET).update(`admin:${+f.options.now()}`).digest('hex')}`)
 const telegram=JSON.parse(f.calls.find(c=>c.url.includes('telegram.org')).options.body);assert.equal(telegram.chat_id,'synthetic-teacher')
 assert.equal(f.git.every(c=>!c.args.join(' ').includes('synthetic-github')),true)
 assert.equal(f.git.every(c=>c.options.env.GIT_CONFIG_GLOBAL==='/dev/null'),true)
 await runMwfCli(['--production'],{productionOptions:f.options,output:()=>{}});assert.equal(f.calls.length,4)
})
test('unknown provider response is never automatically retried; missing preservation gate blocks before transport',async()=>{
 const f=fixture();let calls=0
 const fetch=f.options.fetchImpl
 f.options.fetchImpl=async(url,options)=>{if(url.includes('openai.com')){calls++;throw Error('timeout')}return fetch(url,options)}
 await runMwfCli(['--production'],{productionOptions:f.options,output:()=>{}})
 await runMwfCli(['--production'],{productionOptions:f.options,output:()=>{}})
 assert.equal(calls,1);assert.equal(openDeliveryStore(f.root).read()[0].state,'generation-unknown')
 const runtime=createProductionRuntime({...f.options,readText:()=>JSON.stringify({schema:1,reconciled:false,usedTopicIds:[]})})
 await assert.rejects(runtime.select({items:[],slot:runtime.slot}),/historical_inventory/)
})
test('preservation copies exact originals and excludes used topics without migration or approval',()=>{
 const root=mkdtempSync(join(tmpdir(),'mwf-preserve-')),source=join(root,'source'),destination=join(root,'archive');mkdirSync(source)
 const raw='---\nsource_topic_id: old\ndraft: true\nreviewed: false\nauto_approved: false\n---\nSynthetic\n',name='2026-09-14-old.md';writeFileSync(join(source,name),raw)
 const first=preserveDraftInventory({source,destination}),second=preserveDraftInventory({source,destination})
 assert.equal(first.path,second.path);assert.equal(first.reconciled,false)
 assert.equal(readFileSync(join(source,name),'utf8'),raw);assert.equal(readFileSync(join(destination,name),'utf8'),raw)
 const inventory=JSON.parse(readFileSync(first.path,'utf8'));assert.deepEqual(inventory.usedTopicIds,['old']);assert.equal(inventory.entries[0].blob,createHash('sha256').update(raw).digest('hex'))
})

test('preservation rejects symlink artifacts before reading linked content',()=>{
 const root=mkdtempSync(join(tmpdir(),'mwf-preserve-symlink-')),source=join(root,'source'),destination=join(root,'archive');mkdirSync(source)
 const sentinel=join(root,'private-synthetic');writeFileSync(sentinel,'synthetic private sentinel')
 symlinkSync(sentinel,join(source,'2026-09-14-link.md'))
 assert.throws(()=>preserveDraftInventory({source,destination}))
 assert.equal(existsSync(join(destination,'2026-09-14-link.md')),false)
})

test('conflicting admin repository configuration rejects before work',()=>{
 const f=fixture();assert.throws(()=>createProductionRuntime({...f.options,env:{...f.env,GITHUB_REVIEW_BRANCH:'other'}}),/review_source_mismatch/)
})

test('missing generation credential and broken inventory do not block a saved sync retry',async()=>{
 const f=fixture(),spawn=f.options.spawnImpl
 f.options.spawnImpl=(command,args,options)=>args[0]==='push'?{status:1,stdout:''}:spawn(command,args,options)
 await runMwfCli(['--production'],{productionOptions:f.options,output:()=>{}})
 assert.equal(openDeliveryStore(f.root).read()[0].state,'sync-failed')
 f.options.spawnImpl=spawn;f.options.env={...f.env,OPENAI_API_KEY:''};f.options.readText=()=>{throw Error('broken input')}
 await runMwfCli(['--production'],{productionOptions:f.options,output:()=>{}})
 assert.equal(openDeliveryStore(f.root).read()[0].state,'notified')
 assert.equal(f.calls.filter(c=>c.url.includes('openai.com')).length,1)
})

test('production normal path really generates, independently reviews, syncs certified bytes and reports deployed publication',async()=>{
 const {issueTopicAdoption}=await import('../src/lib/tieredPublication.mjs')
 const f=fixture(),topic={id:'new',title:'New',category:'その他',publish_date:'2026-09-14',status:'approved'}
 const read=f.options.readText
 f.options.readText=p=>p===f.env.MWF_TOPICS_PATH?'id,title,category,publish_date,status\nnew,New,その他,2026-09-14,approved\n':read(p)
 const spawn=f.options.spawnImpl
 f.options.spawnImpl=(command,args,options)=>{
  if(args[0]==='rev-parse'&&String(args[1]).includes(':public/')){const bytes=Buffer.from('synthetic image');return{status:0,stdout:createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex')}}
  if(args[0]==='show'&&String(args[1]).endsWith(':data/image-library.json'))return{status:0,stdout:JSON.stringify({images:[{path:'/images/synthetic.png',alt:'Synthetic',license_status:'verified',license_source:'Synthetic owner',license_note:'Synthetic verified ownership'}]})}
  if(args[0]==='show'&&String(args[1]).endsWith(':data/article-topics.sample.csv'))return{status:0,stdout:f.options.readText(f.env.MWF_TOPICS_PATH)}
  return spawn(command,args,options)
 }
 let aiCalls=0,notified
 f.options.fetchImpl=async(url,options)=>{
  if(url.includes('api.github.com')){
   if(url.includes('article-topics.sample.csv'))return{ok:true,json:async()=>({encoding:'base64',content:Buffer.from(f.options.readText(f.env.MWF_TOPICS_PATH)).toString('base64')})}
   if(url.includes('/content/posts?'))return{ok:true,json:async()=>[]}
   const value=url.includes('/topic-adoptions/')?issueTopicAdoption(topic,f.env.ADMIN_REVIEW_COOKIE_SECRET):{images:[{path:'/images/synthetic.png',alt:'Synthetic',license_status:'verified',license_source:'Synthetic owner',license_note:'Synthetic verified ownership'}]}
   return{ok:true,json:async()=>({encoding:'base64',content:Buffer.from(JSON.stringify(value)).toString('base64')})}
  }
  if(url.includes('/images/'))return{ok:true,headers:new Headers({'content-type':'image/png'}),arrayBuffer:async()=>Buffer.from('synthetic image')}
  if(url.includes('openai.com')){aiCalls++;return{ok:true,json:async()=>({id:aiCalls===1?'generator':'reviewer',choices:[{finish_reason:'stop',message:{content:aiCalls===1?'## Synthetic\nSynthetic article.':JSON.stringify({tier:'normal',decision:'pass',medicalMeaningChanged:false,changeKind:'new-article',checks:{content:true,image:true,duplication:true,medical:true,validation:true}})}}]})}}
  if(url.includes('vercel.app')){const item=openDeliveryStore(f.root).read()[0];return{ok:true,url,redirected:false,headers:new Headers({'content-type':'application/json'}),json:async()=>({authenticated:true,source:'production-admin',path:item.path,contentVersion:item.contentVersion,blob:item.blob,reviewable:true,published:true})}}
  notified=JSON.parse(options.body);return{ok:true,json:async()=>({ok:true,result:{message_id:1}})}
 }
 assert.equal(await runMwfCli(['--production'],{productionOptions:f.options,output:()=>{}}),0)
 assert.equal(aiCalls,2);assert.equal(openDeliveryStore(f.root).read()[0].certified,true);assert.match(f.getRaw(),/tiered_review_proof:/);assert.match(notified.text,/公開反映/)
 await runMwfCli(['--production'],{productionOptions:f.options,output:()=>{}});assert.equal(aiCalls,2)
})

test('minor production entry fetches actual Human baseline, independently reviews diff and CAS updates only it',async()=>{
 const {runMinorEdit}=await import('../scripts/mwf-minor-edit.mjs')
 const {applyTeacherApproval}=await import('../src/lib/dmpArticleState.mjs')
 const matter=(await import('gray-matter')).default
 const f=fixture(),path='content/posts/2026-09-14-original.md',imageBytes=Buffer.from('synthetic image')
 const originalData={title:'Original',date:'2026-09-14',category:'その他',tags:[],author:'Synthetic',excerpt:'Synthetic',image:'/images/synthetic.png',image_alt:'Synthetic',draft:true,reviewed:false,auto_approved:false,publication_status:'draft',medical_risk:'low'}
 const originalContent='## Synthetic\nOriginal article.\n'
 const baseline=matter.stringify(originalContent,applyTeacherApproval({data:originalData,content:originalContent,reviewedBy:'Synthetic teacher',reviewedAt:'2026-09-14'}))
 const proposal=join(f.root,'proposal.md');writeFileSync(proposal,matter.stringify(originalContent+'\n',originalData))
 const library={images:[{path:originalData.image,alt:'Synthetic',license_status:'verified',license_source:'Synthetic',license_note:'Confirmed synthetic ownership'}]}
 let reviews=0
 f.options.fetchImpl=async(url,options)=>{
  if(url.includes('api.github.com')){
   if(url.includes('/content/posts?'))return{ok:true,json:async()=>[{name:'2026-09-14-original.md',type:'file'}]}
   const value=url.includes('image-library')?JSON.stringify(library):baseline
   return{ok:true,json:async()=>({encoding:'base64',content:Buffer.from(value).toString('base64')})}
  }
  if(url.includes('/images/'))return{ok:true,headers:new Headers({'content-type':'image/png'}),arrayBuffer:async()=>imageBytes}
  if(url.includes('openai.com')){reviews++;assert.match(JSON.parse(options.body).messages[1].content[0].text,/Original article/);return{ok:true,json:async()=>({id:'minor-independent',choices:[{finish_reason:'stop',message:{content:JSON.stringify({tier:'minor',decision:'pass',medicalMeaningChanged:false,changeKind:'typo-format-link',checks:{content:true,image:true,duplication:true,medical:true,validation:true}})}}]})}}
  if(url.includes('vercel.app')){const item=openDeliveryStore(f.root).read()[0];return{ok:true,url,redirected:false,headers:new Headers({'content-type':'application/json'}),json:async()=>({authenticated:true,source:'production-admin',path,contentVersion:item.contentVersion,blob:item.blob,reviewable:true,published:true})}}
  return{ok:true,json:async()=>({ok:true,result:{message_id:1}})}
 }
 const spawn=f.options.spawnImpl
 f.options.spawnImpl=(command,args,options)=>{
  if(args[0]==='rev-parse'&&String(args[1]).includes(':public/'))return{status:0,stdout:createHash('sha1').update(Buffer.from(`blob ${imageBytes.length}\0`)).update(imageBytes).digest('hex')}
  if(args[0]==='show')return{status:0,stdout:String(args[1]).endsWith(':data/image-library.json')?JSON.stringify(library):baseline}
  return spawn(command,args,options)
 }
 const result=await runMinorEdit({path,proposal,productionOptions:f.options})
 assert.equal(result.ok,true);assert.equal(reviews,1);assert.equal(openDeliveryStore(f.root).read()[0].path,path)
 assert.match(f.getRaw(),/tier: minor/)
})
