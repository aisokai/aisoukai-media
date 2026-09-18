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
