import test from 'node:test'
import assert from 'node:assert/strict'
import {approvedComparisonUpdates} from '../scripts/lib/mwf-human-comparisons.mjs'
import {metadataEntry,inventoryHash,comparisonSet} from '../scripts/lib/mwf-inventory.mjs'
import {signBlogEvidence,verifyBlogEvidence} from '../src/lib/tieredPublication.mjs'
import {validateUnknownPublishedEvidence} from '../scripts/lib/mwf-unknown-published.mjs'
import {getReviewedContentFingerprint} from '../src/lib/reviewContentFingerprint.mjs'
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

const unknownPath='content/posts/2026-11-07-synthetic-notice.md'
function unknownFixture(){
 const raw=Buffer.from('---\ntitle: Synthetic notice\nexcerpt: Synthetic notice excerpt\ncategory: その他\ndraft: false\nreviewed: true\nreviewed_by: Synthetic teacher\nreviewed_at: 2026-11-07\n---\nNOTICE_BODY')
 const entry=metadataEntry({path:unknownPath,raw,source:'canonical'})
 return {raw,file:{path:unknownPath,sha:entry.gitBlob,type:'file'},metadata:entry.metadata}
}
test('unknown published path: Mac proposal and server acceptance give identical comparison entry',async()=>{
 const f=unknownFixture()
 const mac=await approvedComparisonUpdates({entries:[],files:[f.file],listReceipts:async()=>[],readReceipt:async()=>null,comparisonOnly:true,readUnknownMetadata:async()=>f.metadata})
 const server=await approvedComparisonUpdates({entries:[],files:[f.file],listReceipts:async()=>[],readReceipt:async()=>null,readBytes:async()=>f.raw,verifyReceipt:()=>({}),comparisonOnly:true,verifyUnknownPublished:async()=>f.metadata})
 assert.deepEqual(server,mac);assert.equal(server[0].comparisonOnly,true);assert.equal(server[0].unknownPath,true);assert.notEqual(server[0].blob,inventoryHash(f.raw))
 assert.equal(comparisonSet(server).hash,comparisonSet(mac).hash)
})
test('unknown path fails closed without a server verifier or Mac metadata',async()=>{
 const f=unknownFixture()
 await assert.rejects(approvedComparisonUpdates({entries:[],files:[f.file],listReceipts:async()=>[],readReceipt:async()=>null,readBytes:async()=>f.raw,verifyReceipt:()=>({}),comparisonOnly:true}),/comparison_metadata_unavailable/)
 await assert.rejects(approvedComparisonUpdates({entries:[],files:[f.file],listReceipts:async()=>[],readReceipt:async()=>null,readBytes:async()=>f.raw,comparisonOnly:true,verifyUnknownPublished:async()=>f.metadata}),/approval_verifier_required/)
 await assert.rejects(approvedComparisonUpdates({entries:[],files:[f.file],listReceipts:async()=>[],readReceipt:async()=>null,comparisonOnly:true}),/comparison_metadata_unavailable/)
 await assert.rejects(approvedComparisonUpdates({entries:[],files:[f.file],listReceipts:async()=>[],readReceipt:async()=>null,comparisonOnly:true,readUnknownMetadata:async()=>null}),/comparison_metadata_unavailable/)
 // Non-comparisonOnly callers keep the historical unknown-path gate.
 await assert.rejects(approvedComparisonUpdates({entries:[],files:[f.file],listReceipts:async()=>[],readReceipt:async()=>null,readUnknownMetadata:async()=>f.metadata}),/comparison_metadata_unavailable/)
})
test('unknown path is rejected when server evidence verification fails',async()=>{
 const f=unknownFixture()
 await assert.rejects(approvedComparisonUpdates({entries:[],files:[f.file],listReceipts:async()=>[],readReceipt:async()=>null,readBytes:async()=>f.raw,verifyReceipt:()=>({}),comparisonOnly:true,verifyUnknownPublished:async()=>{throw Error('unknown_published_unproven')}}),/unknown_published_unproven/)
})
test('forged receipt still rejects before unknown-path verification runs',async()=>{
 const f=unknownFixture(),g=fixture();g.receipt.signature='f'.repeat(64)
 let verified=0
 await assert.rejects(approvedComparisonUpdates({entries:[],files:[f.file],listReceipts:g.options.listReceipts,readReceipt:g.options.readReceipt,verifyReceipt:g.options.verifyReceipt,readBytes:async()=>f.raw,comparisonOnly:true,verifyUnknownPublished:async()=>{verified++;return f.metadata}}),/approval_evidence_invalid/)
 assert.equal(verified,0)
})

function evidenceFixture(){
 const content='NOTICE_BODY',data={title:'Synthetic notice',excerpt:'Synthetic notice excerpt',category:'その他',draft:false,reviewed:true,reviewed_by:'Synthetic teacher',reviewed_at:'2026-11-07'}
 data.reviewed_content_hash=getReviewedContentFingerprint(data,content)
 const reviewHistoryText='## 2026-11-07T09:00:00.000+09:00\ndatetime: 2026-11-07T09:00:00.000+09:00\naction: approve\nslug: 2026-11-07-synthetic-notice\nreviewed_by: Synthetic teacher\ndate: 2026-11-07\n'
 const commit={authorName:'Synthetic Human',authorEmail:'human@example.com',committerName:'Synthetic Human',committerEmail:'human@example.com',authorLogin:'synthetic-human'}
 return {data,content,reviewHistoryText,path:unknownPath,commit}
}
test('unknown published evidence: all three points together accept',()=>{
 assert.equal(validateUnknownPublishedEvidence(evidenceFixture()),true)
})
test('unknown published evidence: missing review-history record rejects',()=>{
 const f=evidenceFixture();f.reviewHistoryText='## 2026-11-07T09:00:00.000+09:00\naction: approve\nslug: 2026-11-06-other\nreviewed_by: Synthetic teacher\n'
 assert.throws(()=>validateUnknownPublishedEvidence(f),/unknown_published_unproven/)
 const g=evidenceFixture();g.reviewHistoryText=g.reviewHistoryText.replace('reviewed_by: Synthetic teacher','reviewed_by: Someone else')
 assert.throws(()=>validateUnknownPublishedEvidence(g),/unknown_published_unproven/)
})
test('unknown published evidence: hash mismatch and post-review body change reject',()=>{
 const f=evidenceFixture();f.data={...f.data,reviewed_content_hash:'e'.repeat(64)}
 assert.throws(()=>validateUnknownPublishedEvidence(f),/unknown_published_unproven/)
 const g=evidenceFixture();g.content='NOTICE_BODY_EDITED_AFTER_REVIEW'
 assert.throws(()=>validateUnknownPublishedEvidence(g),/unknown_published_unproven/)
})
test('unknown published evidence: unknown drafts and unreviewed articles reject',()=>{
 const f=evidenceFixture();f.data={...f.data,draft:true};f.data.reviewed_content_hash=getReviewedContentFingerprint(f.data,f.content)
 assert.throws(()=>validateUnknownPublishedEvidence(f),/unknown_published_unproven/)
 const g=evidenceFixture();g.data={...g.data,reviewed:false};g.data.reviewed_content_hash=getReviewedContentFingerprint(g.data,g.content)
 assert.throws(()=>validateUnknownPublishedEvidence(g),/unknown_published_unproven/)
})
test('unknown published evidence: automation or missing commit attribution rejects',()=>{
 const f=evidenceFixture();f.commit={...f.commit,authorName:'MWF Draft Runner',authorEmail:'mwf@users.noreply.github.com'}
 assert.throws(()=>validateUnknownPublishedEvidence(f),/unknown_published_unproven/)
 const g=evidenceFixture();g.commit=null
 assert.throws(()=>validateUnknownPublishedEvidence(g),/unknown_published_unproven/)
})

test('quarantined or local-only paths keep the historical gate and never enter the unknown flow',async()=>{
 const f=unknownFixture(),changedRaw=Buffer.from(f.raw.toString().replace('NOTICE_BODY','NOTICE_BODY_V2')),changedFile={path:unknownPath,sha:metadataEntry({path:unknownPath,raw:changedRaw,source:'canonical'}).gitBlob,type:'file'}
 for(const entry of [{...metadataEntry({path:unknownPath,raw:f.raw,source:'canonical'}),quarantine:true},{...metadataEntry({path:unknownPath,raw:f.raw,source:'local'})}]){
  f.file=changedFile
  let verified=0
  await assert.rejects(approvedComparisonUpdates({entries:[entry],files:[f.file],listReceipts:async()=>[],readReceipt:async()=>null,readBytes:async()=>f.raw,verifyReceipt:()=>({}),comparisonOnly:true,verifyUnknownPublished:async()=>{verified++;return f.metadata}}),/comparison_metadata_unavailable/)
  assert.equal(verified,0)
 }
})
test('unknown published evidence: history fields spliced across blocks reject',()=>{
 const f=evidenceFixture();f.reviewHistoryText='## 2026-11-07T09:00:00.000+09:00\nslug: 2026-11-07-synthetic-notice\nreviewed_by: Synthetic teacher\n\n## 2026-11-07T10:00:00.000+09:00\naction: approve\nslug: 2026-11-06-other\nreviewed_by: Synthetic teacher\n'
 assert.throws(()=>validateUnknownPublishedEvidence(f),/unknown_published_unproven/)
})
test('unknown published evidence: committer-only automation rejects',()=>{
 const f=evidenceFixture();f.commit={...f.commit,committerName:'MWF Draft Runner',committerEmail:'mwf@users.noreply.github.com'}
 assert.throws(()=>validateUnknownPublishedEvidence(f),/unknown_published_unproven/)
 const g=evidenceFixture();g.data={...g.data,archived:true};g.data.reviewed_content_hash=getReviewedContentFingerprint(g.data,g.content)
 assert.throws(()=>validateUnknownPublishedEvidence(g),/unknown_published_unproven/)
})
test('unknown-path commit attribution stays bounded to one exact path and returns null when the blob is absent',async()=>{
 const {spawnSync}=await import('node:child_process')
 const script=`
 import assert from 'node:assert/strict';
 import {readGitHubPathCommitAttribution} from './src/lib/githubContents.ts';
 const path='content/posts/2026-11-07-synthetic-notice.md',ref='a'.repeat(40),blob='b'.repeat(40);
 let calls=0,oversized=false;
 const commit=(sha,name)=>({sha,commit:{author:{name,email:name+'@example.com'},committer:{name,email:name+'@example.com'}},author:{login:'synthetic-human'}});
 globalThis.fetch=async(url,options)=>{
   calls++;assert.equal(options.headers.Authorization,'Bearer synthetic-test-only');
   if(url.includes('/commits?')){assert.ok(url.includes('path='+encodeURIComponent(path)));assert.ok(url.includes('per_page=20'));return{ok:true,json:async()=>oversized?Array.from({length:21},(_,i)=>commit(String(i+1).repeat(40),'Human')):[commit('1'.repeat(40),'First'),commit('2'.repeat(40),'Second')]}}
   assert.ok(url.includes('/contents/'+path+'?ref='));
   return{ok:true,json:async()=>({encoding:'base64',content:Buffer.from('x').toString('base64'),sha:url.endsWith('2'.repeat(40))?blob:'c'.repeat(40)})}
 };
 const found=await readGitHubPathCommitAttribution(path,blob,ref);assert.equal(found.authorName,'Second');assert.equal(found.authorLogin,'synthetic-human');assert.equal(calls,3);
 assert.equal(await readGitHubPathCommitAttribution(path,'d'.repeat(40),ref),null);assert.equal(calls,6);
 oversized=true;await assert.rejects(readGitHubPathCommitAttribution(path,blob,ref),/invalid_unknown_published_history/);assert.equal(calls,7);
 await assert.rejects(readGitHubPathCommitAttribution('../private',blob,ref));assert.equal(calls,7);
 `
 const result=spawnSync(process.execPath,['--input-type=module','-e',script],{cwd:new URL('../',import.meta.url),env:{GITHUB_REVIEW_TOKEN:'synthetic-test-only',GITHUB_REVIEW_REPO:'aisokai/aisoukai-media',GITHUB_REVIEW_BRANCH:'main'},encoding:'utf8'})
 assert.equal(result.status,0,result.stderr)
})
