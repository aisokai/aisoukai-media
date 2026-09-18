import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {validateBackfillManifest,backfillId} from '../scripts/lib/mwf-backfill.mjs'
import {runDelivery,openDeliveryStore} from '../scripts/lib/mwf-delivery.mjs'
import {serverHash,validServerRequest,semanticRequestKey,MWF_INVENTORY_ANCHOR} from '../src/lib/mwfServerAuthority.mjs'
const item={topicId:'MONTHLY-202609TOPIC008',plannedDate:'2026-09-18',topicVersion:'a'.repeat(64)},slot='2026-09-18T08:30:00+09:00'
const plan={schema:1,publicationMode:'draft-only',canonicalRevision:'b'.repeat(40),items:[item]}
test('closed manifest binds exact adopted topics and dates without allowing approved004, future023 or altered date',()=>{
 assert.equal(validateBackfillManifest(plan,new Date('2026-09-19')),plan)
 for(const altered of [{...plan,items:[item,item]},{...plan,publicationMode:'publish'},{...plan,items:[{...item,topicId:'MONTHLY-202609TOPIC004'}]},{...plan,items:[{...item,topicId:'MONTHLY-202609TOPIC023'}]},{...plan,items:[{...item,plannedDate:'2026-09-17'}]}])assert.throws(()=>validateBackfillManifest(altered,new Date('2026-09-19')))
 assert.throws(()=>validateBackfillManifest(plan,new Date('2026-09-17')))
})
test('backfill request has distinct prepare namespace and closed immutable draft-only article identity',()=>{
 const request={schema:3,publicationMode:'draft-only',operation:'prepare',slot,topicId:item.topicId,topicVersion:item.topicVersion,artifactPath:null,artifactBlob:null,inventoryHash:MWF_INVENTORY_ANCHOR}
 assert.equal(validServerRequest(request),true)
 const normal=Object.fromEntries(Object.entries(request).filter(([key])=>key!=='publicationMode'));normal.schema=1
 assert.notEqual(semanticRequestKey(request),semanticRequestKey(normal))
 const review={...request,operation:'review',artifactBlob:'c'.repeat(64),artifactPath:`content/posts/${item.plannedDate}-mwf-${backfillId(slot,item.topicId)}.md`}
 assert.equal(validServerRequest(review),true);assert.equal(validServerRequest({...review,publicationMode:'publish'}),false)
 assert.notEqual(backfillId(slot,item.topicId),serverHash(`${slot}\0${item.topicId}`))
})
test('backfill shares calendar day with normal item, preserves approved item, persists actual generation time, and resumes once',async()=>{
 const store=openDeliveryStore(mkdtempSync(join(tmpdir(),'backfill-synthetic-'))),old={id:'d'.repeat(64),slot,topicId:'MONTHLY-202609TOPIC004',state:'notified',certified:true}
 store.save(old);let generated=0,reviewed=0,notified=0
 const adapters={serverAuthority:true,generate:async()=>{generated++;return{status:'generated',raw:'---\ntitle: Synthetic\ndraft: true\nreviewed: false\nauto_approved: false\n---\nSynthetic body'}},review:async()=>{reviewed++;throw Error('must not review')},sync:async value=>({status:'synced',blob:value.blob,commit:'a'.repeat(40)}),reflect:async value=>({authenticated:true,source:'production-admin',path:value.path,originBlob:value.blob,blob:value.blob,contentVersion:value.contentVersion,reviewable:true,published:false}),notify:async()=>{notified++;return{status:'sent'}}}
 const options={store,slot,onlyTopic:item.topicId,backfill:item,adapters,select:async()=>({topicId:item.topicId,topic:{serverTopicVersion:item.topicVersion}})}
 assert.equal((await runDelivery(options)).ok,true);assert.equal((await runDelivery(options)).ok,true)
 const created=store.read().find(i=>i.topicId===item.topicId);assert.equal(created.plannedDate,item.plannedDate);assert.ok(Number.isFinite(Date.parse(created.generatedAt)));assert.equal(created.id,backfillId(slot,item.topicId));assert.equal(generated,1);assert.equal(reviewed,0);assert.equal(notified,1);assert.equal(store.read().find(i=>i.id===old.id).state,'notified')
})
test('unknown prior normal generation cannot be reassigned to a backfill date',async()=>{
 const store=openDeliveryStore(mkdtempSync(join(tmpdir(),'backfill-conflict-')));store.save({id:'a'.repeat(64),slot:'2026-09-16T08:30:00+09:00',topicId:item.topicId,state:'generation-unknown'})
 const result=await runDelivery({store,slot,onlyTopic:item.topicId,backfill:item,adapters:{},select:async()=>{throw Error('must not select')}})
 assert.equal(result.intakeError,'backfill_existing_topic_conflict');assert.equal(store.read().length,1)
})
