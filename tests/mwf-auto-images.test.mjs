import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createAutoImages,validateGeneratedPng,AUTO_IMAGE_USAGE_EVIDENCE} from '../scripts/lib/mwf-auto-images.mjs'
const topic={id:'synthetic-topic',title:'歯ブラシの保管方法',category:'予防歯科',status:'approved'}
function fixture({unknown=false,reviewPass=true,patchUnknown=false}={}){
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
  if(url==='https://api.openai.com/v1/images/generations'){generated++;assert.equal(input.n,1);assert.equal(input.size,'1536x1024');assert.equal(input.quality,'medium');if(unknown)throw Error('uncertain');return{ok:true,headers:new Headers({'x-request-id':'req_synthetic'}),json:async()=>({data:[{b64_json:bytes.toString('base64')}]})}}
  assert.equal(url,'https://api.openai.com/v1/chat/completions');reviewed++;assert.match(input.messages[1].content[1].image_url.url,/^data:image\/png;base64,/)
  return{ok:true,json:async()=>({id:'chatcmpl-synthetic',choices:[{finish_reason:'stop',message:{content:JSON.stringify({suitable:reviewPass,medicalAccuracy:true,notMisleading:true,noIdentifiablePeople:true})}}]})}
 }
 const ensure=createAutoImages({root,github,request,enabled:true,publicRequest:async url=>{assert.match(url,/^https:\/\/aisoukai-media.vercel.app\/images\/library\/generated\/[a-f0-9]{64}.png$/);return{ok:deployed,headers:new Headers({'content-type':'image/png'}),arrayBuffer:async()=>bytes}}})
 return{ensure,bytes,deploy:()=>{deployed=true},generated:()=>generated,reviewed:()=>reviewed,updates:()=>updates,library:()=>library,laterCommit:()=>{head='f'.repeat(40)}}
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
