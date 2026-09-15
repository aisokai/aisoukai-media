import test from 'node:test'
import assert from 'node:assert/strict'
import matter from 'gray-matter'
import {createServerAuthority,serverRequestId,serverHash,MWF_INVENTORY_ANCHOR,validServerRequest} from '../src/lib/mwfServerAuthority.mjs'
import {issueHumanBaselineReceipt,validateMinorArtifacts,serializeMinorProposal,parseMinorProposal} from '../src/lib/mwfMinorAuthority.mjs'
import {applyTeacherApproval} from '../src/lib/dmpArticleState.mjs'
import {signBlogEvidence,verifyBlogEvidence} from '../src/lib/tieredPublication.mjs'
import {createTieredReviewer} from '../scripts/lib/mwf-tiered-review.mjs'
import {comparisonSet} from '../scripts/lib/mwf-inventory.mjs'
import {runMinorEdit} from '../scripts/mwf-minor-edit.mjs'
const secret='synthetic-only-minor-test',path='content/posts/2026-09-14-synthetic.md'
function fixture(){
 const content='## Synthetic\nA typoo.\n',data={title:'Synthetic',date:'2026-09-14',category:'その他',tags:[],author:'Synthetic',excerpt:'Synthetic',image:'/images/synthetic.png',image_alt:'Synthetic image',draft:true,reviewed:false,auto_approved:false,publication_status:'draft',medical_risk:'low'}
 const baseline=matter.stringify(content,applyTeacherApproval({data,content,reviewedBy:'Synthetic reviewer',reviewedAt:'2026-09-14'})),approval=issueHumanBaselineReceipt(baseline,path,secret)
 const proposalRaw=serializeMinorProposal({artifactPath:path,baselineBlob:serverHash(baseline),content:'## Synthetic\nA typo.\n'}),artifactBlob=serverHash(proposalRaw)
 const request={schema:2,operation:'minor-review',artifactPath:path,baselineBlob:serverHash(baseline),artifactBlob,proposalPath:`data/mwf/proposals/${artifactBlob}.json`,inventoryHash:MWF_INVENTORY_ANCHOR}
 const id=serverRequestId(request),files=new Map([[path,baseline],[request.proposalPath,proposalRaw],[`data/mwf/requests/${id}.json`,JSON.stringify(request)]])
 let paid=0,head=0,tier='minor',changed=false,baselineEvidence=approval
 const reviewer=createTieredReviewer({secret,githubFile:async()=>JSON.stringify({images:[{path:data.image,license_status:'verified',license_source:'Synthetic ownership',license_note:'Synthetic verified'}]}),getComparisons:async()=>comparisonSet([]),request:async(url,options)=>{
  if(url.includes('/images/'))return{ok:true,headers:new Headers({'content-type':'image/png'}),arrayBuffer:async()=>Buffer.from('synthetic image')}
  paid++
  const beforeAfter=JSON.parse(JSON.parse(options.body).messages[1].content[0].text)
  assert.equal(beforeAfter.baseline,baseline);assert.equal(beforeAfter.article.content,'## Synthetic\nA typo.\n')
  if(changed)files.set(path,baseline+'changed')
  return{ok:true,json:async()=>({id:'synthetic-independent-review',choices:[{finish_reason:'stop',message:{content:JSON.stringify({tier,decision:'pass',medicalMeaningChanged:false,changeKind:'typo-format-link',checks:{content:true,image:true,duplication:true,medical:true,validation:true}})}}]})}
 }})
 const authority=createServerAuthority({readHead:async()=>String(head),readJson:async p=>{if(!files.has(p))throw Object.assign(Error('missing'),{code:'NOT_FOUND'});return JSON.parse(files.get(p))},commit:async(changes,expected)=>{assert.equal(expected,String(head));for(const f of changes)files.set(f.path,f.content);head++},seal:v=>signBlogEvidence('mwf-server-claim',v,secret),unseal:v=>verifyBlogEvidence(v,'mwf-server-claim',secret),reviewerAvailable:()=>true,
  validate:async()=>({...validateMinorArtifacts({request,baselineBytes:Buffer.from(files.get(path)),proposalBytes:Buffer.from(files.get(request.proposalPath)),approval:baselineEvidence,secret,today:'2026-09-14'}),set:comparisonSet([]),comparisonHash:comparisonSet([]).hash}),
  review:async(_r,v)=>{const result=await reviewer({raw:v.proposalRaw,path,baselineRaw:v.baselineRaw,baselineApproval:v.baselineApproval});return result.status==='certified'?{result:{status:'server-reviewed',artifactBlob:serverHash(result.raw)},files:[{path,content:result.raw}]}:{result:{status:'minor-review-required',reason:result.reason},files:[]}},
  reflect:async(_r,result)=>result.status==='server-reviewed'&&serverHash(files.get(path))===result.artifactBlob?{published:true,authenticated:true}:{}
 })
 return{request,id,authority,files,baseline,proposalRaw,approval,paid:()=>paid,setTier:v=>tier=v,race:()=>changed=true,setApproval:v=>baselineEvidence=v}
}
test('minor uses authenticated exact Human baseline, reviews actual diff once, retains separate proposal',async()=>{
 const f=fixture();assert.equal(validServerRequest(f.request),true)
 assert.equal((await f.authority.wake(f.id)).published,true)
 const next=matter(f.files.get(path));assert.equal(next.data.publication_tier,'minor');assert.equal(next.data.reviewed,false);assert.equal(next.data.tiered_review_proof.payload.baseline.signature,f.approval.signature)
 assert.equal(f.files.get(f.request.proposalPath),f.proposalRaw)
 await f.authority.wake(f.id);assert.equal(f.paid(),1)
})
test('forged/unsigned prior approval holds without provider call or original mutation',async()=>{
 for(const approval of [null,{reviewed:true},{...fixture().approval,signature:'0'.repeat(64)}]){
  const f=fixture();f.setApproval(approval);assert.equal((await f.authority.wake(f.id)).status,'hold');assert.equal(f.paid(),0);assert.equal(f.files.get(path),f.baseline)
 }
})
test('important or unknown correction stays a proposal and never replaces original',async()=>{
 for(const tier of ['important','unknown']){const f=fixture();f.setTier(tier);assert.equal((await f.authority.wake(f.id)).status,'minor-review-required');assert.equal(f.files.get(path),f.baseline);assert.equal(f.files.get(f.request.proposalPath),f.proposalRaw)}
})
test('baseline race after independent review prevents overwrite at final CAS',async()=>{
 const f=fixture();f.race();assert.equal((await f.authority.wake(f.id)).reason,'input_changed');assert.equal(f.files.get(path),f.baseline+'changed');assert.equal(f.paid(),1)
})
test('noncanonical proposal serialization cannot create another paid review identity',()=>{
 const f=fixture(),value=JSON.parse(f.proposalRaw)
 assert.ok(parseMinorProposal(f.proposalRaw));assert.equal(parseMinorProposal(JSON.stringify(value,null,2)),null)
 assert.equal(parseMinorProposal(JSON.stringify({...value,extra:true})),null)
})
test('bad hashes/provenance reject before raw bytes are decoded',()=>{
 const f=fixture(),opaque={toString(){throw Error('must_not_decode')}}
 assert.equal(validateMinorArtifacts({request:f.request,baselineBytes:opaque,proposalBytes:opaque,approval:null,secret}).ok,false)
 assert.equal(validateMinorArtifacts({request:f.request,baselineBytes:Buffer.from(f.baseline+'changed'),proposalBytes:Buffer.from(f.proposalRaw),approval:f.approval,secret}).ok,false)
})
test('minor CLI normalizes proposal and cannot report unsupported/pending as successful',async()=>{
 const f=fixture();let captured,output
 for(const status of ['pending','minor-review-required','server-reviewed']){
  const result={status,requestId:f.id,authenticated:true,published:status==='server-reviewed'}
  const exit=await runMinorEdit(['--proposal','/synthetic/proposal.json'],{readProposal:()=>JSON.stringify(JSON.parse(f.proposalRaw),null,2),createRuntime:()=>({minor:async v=>{captured=v;return result}}),output:v=>output=v})
  assert.equal(exit,status==='server-reviewed'?0:1);assert.equal(captured.proposalRaw,f.proposalRaw);assert.equal(output.status,status)
 }
 let called=false
 await assert.rejects(runMinorEdit(['--proposal','relative.json'],{readProposal:()=>{called=true}}),/argument_required/);assert.equal(called,false)
})
