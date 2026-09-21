import test from 'node:test'
import assert from 'node:assert/strict'
import {approvedComparisonUpdates} from '../scripts/lib/mwf-human-comparisons.mjs'
import {metadataEntry,inventoryHash,comparisonSet} from '../scripts/lib/mwf-inventory.mjs'
import {signBlogEvidence,verifyBlogEvidence} from '../src/lib/tieredPublication.mjs'
const secret='synthetic-only',path='content/posts/2026-09-18-synthetic.md'
function fixture(){
 const old=Buffer.from('---\ntitle: Synthetic\nexcerpt: Synthetic excerpt\ncategory: その他\nreviewed: false\n---\nBODY_SENTINEL'),raw=Buffer.from(old.toString().replace('reviewed: false','reviewed: true')),entry=metadataEntry({path,raw:old,source:'canonical'}),current=metadataEntry({path,raw,source:'canonical'}),receiptPath=`data/mwf/human-approvals/${inventoryHash(raw)}.json`
 const receipt=signBlogEvidence('human-approved-baseline',{path,rawVersion:inventoryHash(raw),contentVersion:'a'.repeat(64),humanAction:'authenticated_admin_approve',reviewedBy:'Synthetic teacher',reviewedAt:'2026-09-19T01:00:00Z'},secret)
 let reads=0
 const options={entries:[entry],files:[{path,sha:current.gitBlob,type:'file'}],listReceipts:async()=>[{path:receiptPath,type:'file'}],readReceipt:async()=>receipt,verifyReceipt:value=>verifyBlogEvidence(value,'human-approved-baseline',secret),readBytes:async()=>{reads++;return raw}}
 return{options,raw,receipt,reads:()=>reads}
}
test('approved exact bytes give server/Mac identical comparison hash; Mac never reads body',async()=>{
 const f=fixture(),original=Buffer.prototype.toString;let decoded=0
 Buffer.prototype.toString=function(encoding,...args){if((encoding===undefined||/^utf-?8$/i.test(encoding))&&this.includes(Buffer.from('BODY_SENTINEL')))decoded++;return original.call(this,encoding,...args)}
 try{
 const server=await approvedComparisonUpdates(f.options),mac=await approvedComparisonUpdates({...f.options,verifyReceipt:undefined,readBytes:undefined})
 assert.equal(f.reads(),1);assert.equal(decoded,0);assert.equal(comparisonSet([...f.options.entries,...server]).hash,comparisonSet([...f.options.entries,...mac]).hash)
 }finally{Buffer.prototype.toString=original}
})
test('forged receipt or unknown path rejects before any article fetch',async()=>{
 const f=fixture();f.receipt.signature='f'.repeat(64);await assert.rejects(approvedComparisonUpdates(f.options));assert.equal(f.reads(),0)
 const g=fixture();g.options.files[0].path='content/posts/2026-09-18-unknown.md';await assert.rejects(approvedComparisonUpdates(g.options));assert.equal(g.reads(),0)
 const h=fixture();h.options.listReceipts=async()=>[];await assert.rejects(approvedComparisonUpdates(h.options));assert.equal(h.reads(),0)
})
test('changed approved bytes or public headers fail closed; no mutation of known metadata',async()=>{
 const f=fixture();f.options.readBytes=async()=>Buffer.from('changed');await assert.rejects(approvedComparisonUpdates(f.options),/approved_bytes_changed/)
 const g=fixture(),raw=Buffer.from(g.raw.toString().replace('title: Synthetic','title: Different')),before=JSON.stringify(g.options.entries)
 const proof={...g.receipt.payload,rawVersion:inventoryHash(raw)};g.options.readReceipt=async()=>signBlogEvidence('human-approved-baseline',proof,secret);g.options.listReceipts=async()=>[{type:'file',path:`data/mwf/human-approvals/${proof.rawVersion}.json`}];g.options.readBytes=async()=>raw;g.options.files[0].sha=metadataEntry({path,raw,source:'canonical'}).gitBlob
 await assert.rejects(approvedComparisonUpdates(g.options),/approved_metadata_changed/);assert.equal(JSON.stringify(g.options.entries),before)
})

function imageFixture(){
 const baseline=Buffer.from('---\ntitle: Synthetic\nexcerpt: Synthetic excerpt\ncategory: その他\nsource_topic_id: synthetic\ndraft: true\nreviewed: false\nauto_approved: false\nimage: ""\n---\nBODY_SENTINEL'),raw=Buffer.from(baseline.toString().replace('image: ""','image: "/images/library/test.png"\nimage_content_hash: "'+ 'a'.repeat(64)+'"\nimage_selection_status: "matched"'))
 const entry=metadataEntry({path,raw:baseline,source:'canonical'}),file={path,sha:metadataEntry({path,raw,source:'canonical'}).gitBlob,type:'file'}
 return {baseline,raw,entry,file,options:{entries:[entry],files:[file],listReceipts:async()=>[],readReceipt:async()=>null,verifyReceipt:()=>null,readBytes:async()=>raw,readKnownBytes:async()=>baseline,comparisonOnly:true}}
}
test('image edits to known unapproved drafts are comparison-only after exact opaque baseline validation',async()=>{
 const f=imageFixture(),original=Buffer.prototype.toString;let decoded=0
 Buffer.prototype.toString=function(encoding,...args){if((encoding===undefined||/^utf-?8$/i.test(encoding))&&this.includes(Buffer.from('BODY_SENTINEL')))decoded++;return original.call(this,encoding,...args)}
 try{
 const server=await approvedComparisonUpdates(f.options),mac=await approvedComparisonUpdates({...f.options,readBytes:undefined,readKnownBytes:undefined,verifyReceipt:undefined})
 assert.deepEqual(server,mac);assert.equal(server[0].comparisonOnly,true);assert.notEqual(server[0].blob,inventoryHash(f.raw));assert.equal(decoded,0)
 }finally{Buffer.prototype.toString=original}
})
test('comparison-only updates cannot hide body, topic, date, other metadata, approval or forged baseline changes',async()=>{
 for(const change of [s=>s.replace('BODY_SENTINEL','changed'),s=>s.replace('title: Synthetic','title: Changed'),s=>s.replace('source_topic_id: synthetic','source_topic_id: other'),s=>s.replace('draft: true','draft: false'),s=>s.replace('reviewed: false','reviewed: true'),s=>s.replace('auto_approved: false','auto_approved: true'),s=>s.replace('---\nBODY','date: 2026-09-22\n---\nBODY'),s=>s.replace('---\nBODY','tiered_review_proof: forged\n---\nBODY'),s=>s.replace('---\nBODY','reviewed_by: forged\n---\nBODY')]){
  const f=imageFixture(),raw=Buffer.from(change(f.raw.toString()));f.options.readBytes=async()=>raw;f.options.files[0].sha=metadataEntry({path,raw,source:'canonical'}).gitBlob
  await assert.rejects(approvedComparisonUpdates(f.options))
 }
 const f=imageFixture();f.options.readKnownBytes=async()=>Buffer.from('forged');await assert.rejects(approvedComparisonUpdates(f.options),/comparison_baseline_changed/)
 const g=imageFixture();g.options.files[0].sha='b'.repeat(40);await assert.rejects(approvedComparisonUpdates(g.options),/comparison_current_changed/)
})
test('image edit after Human approval binds exact signed approved bytes, including its audit fields',async()=>{
 const f=imageFixture(),approved=Buffer.from(f.baseline.toString().replace('draft: true','draft: false').replace('reviewed: false','reviewed: true').replace('---\nBODY','stock_status: adopted\nreviewed_by: Synthetic teacher\nreviewed_at: 2026-09-19\nreviewed_content_hash: '+ 'd'.repeat(64)+'\n---\nBODY'))
 const raw=Buffer.from(approved.toString().replace('draft: false','draft: true').replace('reviewed: true','reviewed: false').replace('image: ""','image: "/images/library/test.png"\nimage_content_hash: '+ 'a'.repeat(64))),proof={path,rawVersion:inventoryHash(approved),contentVersion:'d'.repeat(64),humanAction:'authenticated_admin_approve',reviewedBy:'Synthetic teacher',reviewedAt:'2026-09-19'}
 f.options.readBytes=async()=>raw;f.options.files[0].sha=metadataEntry({path,raw,source:'canonical'}).gitBlob;f.options.listReceipts=async()=>[{type:'file',path:`data/mwf/human-approvals/${proof.rawVersion}.json`}];f.options.readReceipt=async()=>signBlogEvidence('human-approved-baseline',proof,secret);f.options.verifyReceipt=value=>verifyBlogEvidence(value,'human-approved-baseline',secret);f.options.readApprovedBytes=async()=>approved
 assert.equal((await approvedComparisonUpdates(f.options))[0].comparisonOnly,true)
 f.options.readApprovedBytes=async()=>f.baseline
 await assert.rejects(approvedComparisonUpdates(f.options),/comparison_approved_baseline_changed/)
 f.options.readApprovedBytes=async()=>approved;const changed=Buffer.from(raw.toString().replace('Synthetic teacher','Someone else'));f.options.readBytes=async()=>changed;f.options.files[0].sha=metadataEntry({path,raw:changed,source:'canonical'}).gitBlob
 await assert.rejects(approvedComparisonUpdates(f.options),/comparison_unreviewed_change/)
})
test('exact Human approval still matches server/Mac projection and does not fetch historical bodies',async()=>{
 const f=fixture();let historicalReads=0
 const options={...f.options,comparisonOnly:true,readKnownBytes:async()=>{historicalReads++;throw Error('unexpected')}}
 assert.deepEqual(await approvedComparisonUpdates(options),await approvedComparisonUpdates({...options,readBytes:undefined,verifyReceipt:undefined}));assert.equal(historicalReads,0)
})

test('approved baseline lookup stays pinned to one exact path, bounds history, and authenticates opaque bytes',async()=>{
 const {spawnSync}=await import('node:child_process')
 const script=`
 import assert from 'node:assert/strict';
 import {createHash} from 'node:crypto';
 import {readGitHubApprovedBaselineBytes} from './src/lib/githubContents.ts';
 const path='content/posts/2026-09-18-synthetic.md',ref='a'.repeat(40),bytes=Buffer.from('SYNTHETIC_OPAQUE_BODY'),hash=createHash('sha256').update(bytes).digest('hex');
 let calls=0,oversized=false;
 globalThis.fetch=async(url,options)=>{
   calls++;assert.equal(options.headers.Authorization,'Bearer synthetic-test-only');
   assert.ok(url.startsWith('https://api.github.com/repos/aisokai/aisoukai-media/'));
   if(url.includes('/commits?')){assert.ok(url.includes('path='+encodeURIComponent(path)));assert.ok(url.includes('sha='+ref+'&per_page=20'));return{ok:true,json:async()=>Array.from({length:oversized?21:2},(_,i)=>({sha:String(i+1).repeat(40)}))}}
   assert.ok(url.includes('/contents/'+path+'?ref='));
   return{ok:true,json:async()=>({encoding:'base64',content:(url.endsWith('2'.repeat(40))?bytes:Buffer.from('OLD_OPAQUE')).toString('base64')})}
 };
 assert.deepEqual(await readGitHubApprovedBaselineBytes(path,hash,ref),bytes);assert.equal(calls,3);
 await assert.rejects(readGitHubApprovedBaselineBytes('../private',hash,ref));assert.equal(calls,3);
 oversized=true;await assert.rejects(readGitHubApprovedBaselineBytes(path,hash,ref),/invalid_approved_baseline_history/);assert.equal(calls,4);
 oversized=false;await assert.rejects(readGitHubApprovedBaselineBytes(path,'f'.repeat(64),ref),/approved_baseline_not_found/);assert.equal(calls,7);
 `
 const result=spawnSync(process.execPath,['--input-type=module','-e',script],{cwd:new URL('../',import.meta.url),env:{GITHUB_REVIEW_TOKEN:'synthetic-test-only',GITHUB_REVIEW_REPO:'aisokai/aisoukai-media',GITHUB_REVIEW_BRANCH:'main'},encoding:'utf8'})
 assert.equal(result.status,0,result.stderr)
})
