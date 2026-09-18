import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {isPreservedUnreviewedDraft,restorePreservedDraft,syncPreservedDraft,validateRestoreManifest} from '../scripts/lib/mwf-restoration.mjs'
import {inventoryHash,metadataEntry} from '../scripts/lib/mwf-inventory.mjs'
import {openDeliveryStore} from '../scripts/lib/mwf-delivery.mjs'
const path='content/posts/2026-08-01-preserved.md',raw=Buffer.from('---\ntitle: Preserved synthetic\nexcerpt: Synthetic excerpt\ncategory: その他\ndate: 2026-08-01\npublish_at: 2026-08-01\ndraft: true\nreviewed: false\nauto_approved: false\npublication_status: draft\n---\nBODY_SENTINEL'),item={path,blob:inventoryHash(raw)},entry=metadataEntry({path,raw,source:'local'})
test('preserved Saturday draft is eligible without any body decoding; protected/reviewed/rejected changes fail',()=>{
 const original=Buffer.prototype.toString;let decoded=0
 Buffer.prototype.toString=function(encoding,...args){if((encoding===undefined||/^utf-?8$/i.test(encoding))&&this.includes(Buffer.from('BODY_SENTINEL')))decoded++;return original.call(this,encoding,...args)}
 try{assert.equal(isPreservedUnreviewedDraft(raw,path),true);assert.equal(decoded,0)}finally{Buffer.prototype.toString=original}
 for(const edit of [['draft: true','draft: false'],['reviewed: false','reviewed: true'],['publication_status: draft','publication_status: rejected'],['category: その他','sensitive_data: true\ncategory: その他'],['date: 2026-08-01','date: 2026-08-02'],['draft: true','draft: true\ndraft: true']])assert.equal(isPreservedUnreviewedDraft(Buffer.from(raw.toString().replace(...edit)),path),false)
 const value={schema:1,publicationMode:'draft-only',inventoryHash:'a'.repeat(64),items:[item]};assert.equal(validateRestoreManifest(value,'a'.repeat(64)),value);assert.throws(()=>validateRestoreManifest({...value,items:[item,item]},'a'.repeat(64)))
})
test('restore sync only creates absent original path and preserves exact opaque bytes; conflict cannot overwrite',async()=>{
 let head='a'.repeat(40),existing,calls=[]
 const github=async(method,endpoint,body)=>{calls.push({method,endpoint,body});if(endpoint==='git/ref/heads/main')return{object:{sha:head}};if(endpoint.startsWith('contents/')){if(existing)return existing;throw Object.assign(Error('missing'),{code:'NOT_FOUND'})};if(endpoint.startsWith('git/commits/'))return{tree:{sha:'b'.repeat(40)}};if(endpoint==='git/blobs'){assert.ok(Buffer.from(body.content,'base64').equals(raw));return{sha:'c'.repeat(40)}};if(endpoint==='git/trees'){assert.equal(body.tree[0].path,path);return{sha:'d'.repeat(40)}};if(endpoint==='git/commits')return{sha:'e'.repeat(40)};if(endpoint==='git/refs/heads/main'){assert.equal(body.force,false);head=body.sha;return{}};throw Error('unexpected')}
 assert.equal((await syncPreservedDraft({item,raw,github})).status,'synced')
 existing={encoding:'base64',content:Buffer.from('different').toString('base64')};calls=[];assert.equal((await syncPreservedDraft({item,raw,github})).status,'conflict');assert.ok(calls.every(c=>c.method==='GET'))
 existing={encoding:'base64',content:raw.toString('base64')};calls=[];assert.equal((await syncPreservedDraft({item,raw,github})).status,'synced');assert.ok(calls.every(c=>c.method==='GET'))
})
test('exact restore sync and opaque reflection notify once, no regeneration or semantic-version mislabel',async()=>{
 const store=openDeliveryStore(mkdtempSync(join(tmpdir(),'restore-synthetic-')));let synced=0,notified=0,reflected=false
 const options={store,item,entry,raw,sync:async()=>{synced++;return{status:'synced',blob:item.blob,commit:'a'.repeat(40)}},reflect:async()=>reflected?{authenticated:true,source:'production-restore',path,blob:item.blob,originBlob:item.blob,artifactVersion:item.blob,published:false,reviewable:true}:{},notify:async(value)=>{notified++;assert.equal(value.artifactVersion,item.blob);assert.equal(value.contentVersion,undefined);return{status:'sent'}}}
 assert.equal((await restorePreservedDraft(options)).state,'pending-reflection');assert.equal(notified,0);reflected=true
 assert.equal((await restorePreservedDraft(options)).state,'notified');assert.equal((await restorePreservedDraft(options)).state,'notified');assert.equal(synced,1);assert.equal(notified,1)
 await assert.rejects(restorePreservedDraft({...options,entry:{...entry,source:'canonical'}}))
})

test('invalid unknown header syntax is rejected before restore, including trailing flow junk',()=>{
 for(const header of ['extra: [one,,two]','extra: [one # comment]','tags:\n  - one\n - two','extra: a\u0000b','extra: a\u0001b','extra: [one] invalid','extra: "one" invalid','extra: a: b','extra: {one: two} invalid','extra: |\n  hidden','extra: ["one", "two"] trailing','extra: "\\q"'])assert.equal(isPreservedUnreviewedDraft(Buffer.from(raw.toString().replace('title: Preserved synthetic',`${header}\ntitle: Preserved synthetic`)),path),false)
 assert.equal(isPreservedUnreviewedDraft(Buffer.from(raw.toString().replace('title: Preserved synthetic','tags: [one, "two"]\ntitle: Preserved synthetic')),path),true)
})
