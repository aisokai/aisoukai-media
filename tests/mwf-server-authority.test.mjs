import test from 'node:test'
import assert from 'node:assert/strict'
import {createServerAuthority,serverRequestId,semanticRequestKey,serverHash,MWF_INVENTORY_ANCHOR,createMwfHttpHandlers,isClosedMwfDraftBytes,authenticateMwfGithubCaller} from '../src/lib/mwfServerAuthority.mjs'
import {signBlogEvidence,verifyBlogEvidence} from '../src/lib/tieredPublication.mjs'
const key='synthetic-server-only',slot='2026-09-14T08:30:00+09:00'
function fixture(operation='review'){
 const request={schema:1,operation,slot,topicId:'topic',topicVersion:'a'.repeat(64),artifactPath:operation==='review'?`content/posts/2026-09-14-mwf-${serverHash(`${slot}\0topic`)}.md`:null,artifactBlob:operation==='review'?'b'.repeat(64):null,inventoryHash:MWF_INVENTORY_ANCHOR},id=serverRequestId(request),files=new Map([[`data/mwf/requests/${id}.json`,request]]);let head=0,paid=0,valid=true,hash='c'.repeat(64),available=true
 const options={readHead:async()=>String(head),readJson:async path=>{if(!files.has(path))throw Object.assign(Error('missing'),{code:'NOT_FOUND'});return files.get(path)},commit:async(changes,expected)=>{if(expected!==String(head))throw Error('CAS');for(const f of changes)files.set(f.path,JSON.parse(f.content));head++;return{sha:String(head)}},validate:async()=>({ok:valid,comparisonHash:hash}),review:async()=>{paid++;return{result:{status:'server-reviewed'},files:[]}},reflect:async()=>({originBlob:request.artifactBlob,blob:request.artifactBlob,contentVersion:'d'.repeat(64),authenticated:true,reviewable:true,published:false}),seal:value=>signBlogEvidence('mwf-server-claim',value,key),unseal:value=>verifyBlogEvidence(value,'mwf-server-claim',key),reviewerAvailable:()=>available}
 return{request,id,files,options,paid:()=>paid,setValid:v=>valid=v,setHash:v=>hash=v,setAvailable:v=>available=v}
}
test('anonymous fabricated IDs cannot trigger work; canonical claim has one owner and one charge across concurrent starts',async()=>{const f=fixture(),a=createServerAuthority(f.options),b=createServerAuthority(f.options);await a.wake('f'.repeat(64));assert.equal(f.paid(),0);await Promise.all([a.wake(f.id),b.wake(f.id)]);assert.equal(f.paid(),1);await a.wake(f.id);assert.equal(f.paid(),1);const claim=verifyBlogEvidence(f.files.get(`data/mwf/claims/${semanticRequestKey(f.request)}.json`),'mwf-server-claim',key);assert.ok(claim.owner);assert.equal(claim.status,'done')})
test('a later slot may prepare the same ungenerated topic without a paid review',async()=>{const f=fixture('prepare'),authority=createServerAuthority(f.options);await authority.wake(f.id);const replay={...f.request,slot:'2026-09-16T08:30:00+09:00'},id=serverRequestId(replay);f.files.set(`data/mwf/requests/${id}.json`,replay);assert.equal((await authority.wake(id)).status,'ready');assert.equal(f.paid(),0)})
test('prepare revalidates current adoption and comparison version before returning reusable ready',async()=>{const f=fixture('prepare'),authority=createServerAuthority(f.options);assert.equal((await authority.wake(f.id)).status,'ready');f.setValid(false);assert.equal((await authority.status(f.id)).reason,'prepare_evidence_stale')})
test('missing server AI retains reviewable draft result with no provider call',async()=>{const f=fixture();f.setAvailable(false);const result=await createServerAuthority(f.options).wake(f.id);assert.equal(result.status,'draft-review-required');assert.equal(result.reason,'server_reviewer_configuration_missing');assert.equal(result.originBlob,f.request.artifactBlob);assert.equal(f.paid(),0)})
test('provider crash remains claimed unknown, and changed comparison evidence prevents result publication',async()=>{const f=fixture();f.options.review=async()=>{throw Error('timeout')};const authority=createServerAuthority(f.options);assert.equal((await authority.wake(f.id)).status,'unknown');assert.equal((await authority.wake(f.id)).status,'unknown');const g=fixture();g.options.review=async()=>{g.setHash('e'.repeat(64));return{result:{status:'server-reviewed'},files:[]}};assert.equal((await createServerAuthority(g.options).wake(g.id)).reason,'input_changed')})
test('HTTP boundary rejects cross-site/nonJSON/extra decisions before authority factory',async()=>{let calls=0;const handlers=createMwfHttpHandlers(()=>{calls++;return{wake:async()=>({status:'ready'})}},async()=>true);for(const headers of [{'Content-Type':'text/plain'},{'Content-Type':'application/json',Origin:'https://evil.invalid'},{'Content-Type':'application/json','Sec-Fetch-Site':'cross-site'}])assert.equal((await handlers.POST(new Request('https://aisoukai-media.vercel.app/api/mwf',{method:'POST',headers,body:JSON.stringify({requestId:'a'.repeat(64)})}))).status,403);assert.equal(calls,0)})
test('closed new draft envelope rejects historical private-request field before body decode',()=>{const raw=Buffer.from('---\ngeneration_run_id: openai:synthetic\nsource_topic_id: topic\nsource_topic_version: hash\ndraft: true\nreviewed: false\nauto_approved: false\nsource_request_text: PRIVATE_SENTINEL\n---\nPRIVATE_BODY');assert.equal(isClosedMwfDraftBytes(raw),false)})

test('actual runtime decode guard rejects replaced review/reflection bytes without decoding private sentinel',async()=>{
 const {decodeBoundArticle}=await import('../src/lib/mwfServerAuthority.mjs'),sentinel=Buffer.from('PRIVATE_SENTINEL'),replacement=Buffer.from('---\nsource_request_text: PRIVATE_SENTINEL\n---\nPRIVATE_SENTINEL'),original=Buffer.prototype.toString;let decoded=0
 Buffer.prototype.toString=function(encoding,...args){if((encoding===undefined||/^utf-?8$/i.test(encoding))&&this.includes(sentinel))decoded++;return original.call(this,encoding,...args)}
 try{assert.equal(decodeBoundArticle(replacement,'a'.repeat(64)),null);assert.equal(decodeBoundArticle(replacement,'a'.repeat(64),false),null);assert.equal(decodeBoundArticle(replacement,serverHash(replacement)),null);assert.equal(decoded,0)}finally{Buffer.prototype.toString=original}
})


test('every HTTP operation requires caller authentication before any factory work',async()=>{
 let calls=0
 const handlers=createMwfHttpHandlers(()=>{calls++;throw Error('must_not_run')})
 for(const method of ['GET','POST']){
  const response=await handlers[method](new Request('https://aisoukai-media.vercel.app/api/mwf',{method,...(method==='POST'?{headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:'a'.repeat(64)})}:{})}))
  assert.equal(response.status,401)
 }
 assert.equal(calls,0)
})
test('caller authentication verifies supplied identity against fixed repository push permission',async()=>{
 const authorization='Bearer synthetic_existing_github_identity'
 let calls=0
 const request=new Request('https://aisoukai-media.vercel.app/api/mwf',{headers:{Authorization:authorization}})
 const response=permissions=>async(url,options)=>{calls++;assert.equal(url,'https://api.github.com/repos/aisokai/aisoukai-media');assert.equal(options.headers.Authorization,authorization);assert.equal(options.redirect,'error');return{ok:true,url,redirected:false,json:async()=>({full_name:'aisokai/aisoukai-media',permissions})}}
 assert.equal(await authenticateMwfGithubCaller(request,response({push:true})),true)
 assert.equal(await authenticateMwfGithubCaller(request,response({pull:true})),false)
 assert.equal(await authenticateMwfGithubCaller(request,async()=>({ok:false})),false)
 assert.equal(await authenticateMwfGithubCaller(request,async()=>{throw Error('unavailable')}),false)
 assert.equal(calls,2)
})
test('same-slot preparation refreshes changed comparisons but still requires current adoption',async()=>{
 const f=fixture('prepare'),authority=createServerAuthority(f.options)
 assert.equal((await authority.wake(f.id)).status,'ready')
 f.setHash('e'.repeat(64))
 assert.equal((await authority.wake(f.id)).comparisonHash,'e'.repeat(64))
 f.setValid(false)
 assert.equal((await authority.wake(f.id)).reason,'prepare_evidence_stale')
 assert.equal(f.paid(),0)
})
test('review replay across slots remains single-charge',async()=>{
 const f=fixture(),authority=createServerAuthority(f.options)
 await authority.wake(f.id)
 const slot='2026-09-16T08:30:00+09:00',replay={...f.request,slot,artifactPath:`content/posts/2026-09-16-mwf-${serverHash(`${slot}\0topic`)}.md`},id=serverRequestId(replay)
 f.files.set(`data/mwf/requests/${id}.json`,replay)
 assert.equal((await authority.wake(id)).reason,'semantic_request_already_claimed')
 assert.equal(f.paid(),1)
})

test('completed draft with missing reviewer records exact artifact metadata in signed claim',async()=>{
 const f=fixture(),entry={path:f.request.artifactPath,gitBlob:'e'.repeat(40)};let recorded=0
 f.setAvailable(false);f.options.recordArtifacts=async(request,validated,files)=>{recorded++;assert.equal(request.artifactPath,entry.path);assert.deepEqual(files,[]);return[entry]}
 await createServerAuthority(f.options).wake(f.id)
 const claim=verifyBlogEvidence(f.files.get(`data/mwf/claims/${semanticRequestKey(f.request)}.json`),'mwf-server-claim',key)
 assert.equal(recorded,1);assert.deepEqual(claim.comparisonEntries,[entry]);assert.equal(claim.result.status,'draft-review-required');assert.equal(f.paid(),0)
})
