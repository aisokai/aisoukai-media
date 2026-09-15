import test from 'node:test'
import assert from 'node:assert/strict'
import {createServerClient} from '../scripts/lib/mwf-server-client.mjs'
import {serverHash} from '../src/lib/mwfServerAuthority.mjs'
function fixture(){const inventoryRaw='synthetic metadata only',files=new Map(),blobs=new Map(),trees=new Map(),commits=new Map(),calls=[];let head='a'.repeat(40),n=1,wakeStatus='ready';const hash=()=>String(++n).padStart(40,'0')
 const github=async(method,path,body)=>{calls.push({method,path,body});if(path==='git/ref/heads/main')return{object:{sha:head}};if(path.startsWith('contents/')){const name=path.slice(9).split('?')[0];if(!files.has(name))throw Object.assign(Error('missing'),{code:'NOT_FOUND'});return{encoding:'base64',content:Buffer.from(files.get(name)).toString('base64')}};if(path.startsWith('git/commits/'))return{tree:{sha:'base'}};if(path==='git/blobs'){const sha=hash();blobs.set(sha,body.content);return{sha}};if(path==='git/trees'){const sha=hash();trees.set(sha,body.tree);return{sha}};if(path==='git/commits'){const sha=hash();commits.set(sha,body);return{sha}};if(path==='git/refs/heads/main'){assert.equal(body.force,false);const commit=commits.get(body.sha);assert.deepEqual(commit.parents,[head]);for(const f of trees.get(commit.tree))files.set(f.path,blobs.get(f.sha));head=body.sha;return{}}throw Error('unexpected')}
 const request=async(url,options)=>{const id=options.method==='POST'?JSON.parse(options.body).requestId:new URL(url).searchParams.get('requestId');return{ok:true,url,redirected:false,headers:new Headers({'content-type':'application/json'}),json:async()=>({requestId:id,status:wakeStatus,reason:'topic_adoption_unproven',topicVersion:'b'.repeat(64)})}}
 return{inventoryRaw,files,calls,github,authenticateRequest:request,setWake:v=>wakeStatus=v}
}
test('actual mailbox construction writes only fixed inventory/request artifacts and uses bounded nonforce CAS',async()=>{const f=fixture(),client=createServerClient({...f,inventoryAnchor:serverHash(f.inventoryRaw)});const input={slot:'2026-09-14T08:30:00+09:00',topicId:'topic',topicVersion:'b'.repeat(64)};assert.equal((await client.prepare(input)).status,'ready');assert.equal(f.files.size,2);assert.ok([...f.files.keys()].every(p=>/^data\/mwf\/(inventories|requests)\/[a-f0-9]{64}\.json$/.test(p)));const writes=f.calls.filter(c=>c.method!=='GET').length;await client.prepare(input);assert.equal(f.calls.filter(c=>c.method!=='GET').length,writes)})
test('wake hold reason is preserved; redirects/login responses cannot become server ready',async()=>{const f=fixture();f.setWake('hold');const client=createServerClient({...f,inventoryAnchor:serverHash(f.inventoryRaw)}),input={slot:'2026-09-14T08:30:00+09:00',topicId:'topic',topicVersion:'b'.repeat(64)};assert.equal((await client.prepare(input)).reason,'topic_adoption_unproven');const invalid=createServerClient({...f,inventoryAnchor:serverHash(f.inventoryRaw),authenticateRequest:async url=>({ok:true,url,redirected:true,headers:new Headers({'content-type':'text/html'})})});assert.equal((await invalid.prepare(input)).status,'unavailable')})
test('wrong inventory anchor is rejected before any GitHub operation',()=>{const f=fixture();assert.throws(()=>createServerClient(f),/anchor/);assert.equal(f.calls.length,0)})

test('minor mailbox synchronizes only immutable proposal/request and never original article',async()=>{
 const {serializeMinorProposal}=await import('../src/lib/mwfMinorAuthority.mjs')
 const f=fixture(),path='content/posts/2026-09-14-synthetic.md',proposalRaw=serializeMinorProposal({artifactPath:path,baselineBlob:'a'.repeat(64),content:'## Synthetic\nA typo correction.\n'})
 const client=createServerClient({...f,inventoryAnchor:serverHash(f.inventoryRaw)})
 await client.minor({proposalRaw})
 assert.equal(f.files.size,3)
 assert.ok([...f.files.keys()].every(p=>/^data\/mwf\/(inventories|requests|proposals)\/[a-f0-9]{64}\.json$/.test(p)))
 assert.equal(f.files.has(path),false)
 const request=JSON.parse([...f.files].find(([p])=>p.startsWith('data/mwf/requests/'))[1])
 assert.equal(request.baselineBlob,'a'.repeat(64));assert.equal(request.artifactBlob,serverHash(proposalRaw));assert.equal(f.files.get(request.proposalPath),proposalRaw)
 const writes=f.calls.filter(c=>c.method!=='GET').length
 await client.minor({proposalRaw});assert.equal(f.calls.filter(c=>c.method!=='GET').length,writes)
 f.files.set(request.proposalPath,'changed')
 await assert.rejects(client.minor({proposalRaw}),/minor_proposal_conflict/)
})
