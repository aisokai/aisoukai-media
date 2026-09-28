import test from 'node:test'
import assert from 'node:assert/strict'
import matter from 'gray-matter'
import {approvePostMarkdown} from '../src/lib/reviewActions.ts'
import {getContentVersion} from '../src/lib/dmpArticleState.mjs'
import {extractEditorialMetadata,metadataEntry,inventoryHash} from '../scripts/lib/mwf-inventory.mjs'
import {approvedComparisonUpdates} from '../scripts/lib/mwf-human-comparisons.mjs'
import {signBlogEvidence,verifyBlogEvidence} from '../src/lib/tieredPublication.mjs'

test('actual Human approval roundtrip keeps folded quoted warnings comparable without reading opaque text',async()=>{
 const warning='Synthetic warning: "'+Array(30).fill('synthetic long diagnostic').join(' ')+'"'
 const baseline=Buffer.from(`---\ntitle: Synthetic title\nexcerpt: Synthetic excerpt\ncategory: その他\nsource_topic_id: SYNTHETIC\ndate: "2026-09-01"\ndraft: true\nreviewed: false\nauto_approved: false\ngeneration_warnings:\n  - ${JSON.stringify(warning)}\n---\nBODY_SENTINEL\n`)
 const parsed=matter(baseline),version=getContentVersion(parsed.data,parsed.content)
 const raw=Buffer.from(approvePostMarkdown(baseline.toString(),'2026-09-01-synthetic','Synthetic reviewer',version).nextPostMarkdown)
 const approved=matter(raw)
 assert.equal(approved.data.reviewed,true)
 assert.equal(approved.content,parsed.content)
 assert.deepEqual(approved.data.generation_warnings,parsed.data.generation_warnings)
 assert.match(raw.toString(),/generation_warnings:\n  - >-/)
 assert.deepEqual(extractEditorialMetadata(raw),extractEditorialMetadata(baseline))
 const path='content/posts/2026-09-01-synthetic.md',secret='synthetic-test-only'
 const entry=metadataEntry({path,raw:baseline,source:'canonical'}),current=metadataEntry({path,raw,source:'canonical'})
 const receipt=signBlogEvidence('human-approved-baseline',{path,rawVersion:inventoryHash(raw),contentVersion:version,humanAction:'authenticated_admin_approve',reviewedBy:'Synthetic reviewer',reviewedAt:'2026-09-28'},secret)
 const options={entries:[entry],files:[{path,sha:current.gitBlob,type:'file'}],listReceipts:async()=>[{path:`data/mwf/human-approvals/${inventoryHash(raw)}.json`,type:'file'}],readReceipt:async()=>receipt,verifyReceipt:value=>verifyBlogEvidence(value,'human-approved-baseline',secret),readBytes:async()=>raw}
 const original=Buffer.prototype.toString;let decoded=0
 Buffer.prototype.toString=function(encoding,...args){if((encoding===undefined||/^utf-?8$/i.test(encoding))&&(this.includes(Buffer.from('BODY_SENTINEL'))||this.includes(Buffer.from('synthetic long diagnostic'))))decoded++;return original.call(this,encoding,...args)}
 try{assert.deepEqual(await approvedComparisonUpdates(options),await approvedComparisonUpdates({...options,verifyReceipt:undefined,readBytes:undefined}));assert.equal(decoded,0)}finally{Buffer.prototype.toString=original}
})
