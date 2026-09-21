import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { openDeliveryStore, runDelivery, deliveryId, deliveryStatus } from '../scripts/lib/mwf-delivery.mjs'
import { runMwfCli } from '../scripts/ops-mwf.mjs'
import { getDmpArticleState } from '../src/lib/dmpArticleState.mjs'
const raw = '---\ntitle: synthetic\ndate: 2026-09-14\ncategory: その他\ntags: []\nauthor: Synthetic\nimage: ""\nexcerpt: Synthetic excerpt\ndraft: true\nreviewed: false\nauto_approved: false\n---\nSynthetic article.\n'
const slot = '2026-09-14T08:30:00+09:00'
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'mwf-acceptance-'))
  const store = openDeliveryStore(root)
  const calls = { generate: 0, sync: 0, notify: 0 }
  const adapters = {
    generate: async () => { calls.generate++; return { status: 'generated', raw } },
    sync: async i => { calls.sync++; return { status: 'synced', blob: i.blob, commit: 'a'.repeat(40) } },
    reflect: async i => ({ authenticated: true, source: 'production-admin', path: i.path, contentVersion: i.contentVersion, blob: i.blob, reviewable: true, published: false }),
    notify: async () => { calls.notify++; return { status: 'sent' } },
  }
  const run = (extra = {}) => runDelivery({ store: openDeliveryStore(root), slot, topicId: 'synthetic-topic', adapters, ...extra })
  return { root, store, calls, adapters, run }
}
test('real CLI persists all stages; repeat/restart does not regenerate or resend; unreviewed stays unpublished', async () => {
  const f = fixture(); let status
  const args = ['--state-root',f.root,'--slot',slot,'--topic','synthetic-topic']
  assert.equal(await runMwfCli(args,{ adapters:f.adapters,output:v=>status=v }),0)
  assert.equal(status.items[0].state,'notified')
  await f.run(); assert.deepEqual(f.calls,{generate:1,sync:1,notify:1})
  assert.equal(getDmpArticleState({data:{draft:true,reviewed:false,auto_approved:false},content:'Synthetic'}).publishable,false)
  assert.equal(await runMwfCli(['--state-root',f.root],{output:()=>{}}),2)
})
test('sync failure resumes saved artifact; sync-only never invokes pending generation', async () => {
  const f=fixture(); const sync=f.adapters.sync
  f.adapters.sync=async()=>({status:'pending'}); await f.run()
  assert.equal(f.store.read()[0].state,'sync-failed')
  const release=f.store.acquire()
  f.store.save({id:deliveryId('2026-09-16T08:30:00+09:00','another'),slot:'2026-09-16T08:30:00+09:00',topicId:'another',state:'selected',stage:'generation'})
  release(); f.adapters.sync=sync
  await f.run({retryOnly:true}); assert.equal(f.calls.generate,1); assert.equal(f.calls.notify,1)
})
test('reflection rejects HTTP success, local fallback and wrong version before notification',async()=>{
  for(const patch of [{authenticated:false},{source:'local'},{contentVersion:'b'.repeat(64)},{published:true}]) {
    const f=fixture(),reflect=f.adapters.reflect; f.adapters.reflect=async i=>({...await reflect(i),...patch})
    await f.run(); assert.equal(f.store.read()[0].state,'pending-reflection'); assert.equal(f.calls.notify,0)
    f.adapters.reflect=reflect; await f.run({retryOnly:true}); assert.equal(f.calls.generate,1); assert.equal(f.calls.notify,1)
  }
})
test('definite notification failure retries; timeout/unknown never automatically resends',async()=>{
  for(const outcome of ['not-sent','unknown','throw']) {
    const f=fixture(); f.adapters.notify=async()=>{f.calls.notify++;if(outcome==='throw')throw Error('timeout');return {status:outcome}}
    await f.run(); assert.equal(f.store.read()[0].state,outcome==='not-sent'?'notification-failed':'notification-unknown')
    f.adapters.notify=async()=>{f.calls.notify++;return{status:'sent'}}; await f.run({retryOnly:true})
    assert.equal(f.calls.notify,outcome==='not-sent'?2:1)
  }
})
test('persisted generating/sending crash checkpoints hold unknown; stocked crash recovers without generation',async()=>{
  for(const state of ['generating','sending']) {
    const f=fixture(), release=f.store.acquire()
    f.store.save({id:deliveryId(slot,'synthetic-topic'),slot,topicId:'synthetic-topic',state,stage:state==='sending'?'notification':'generation'})
    release();await f.run();assert.equal(f.store.read()[0].state,state==='sending'?'notification-unknown':'generation-unknown');assert.equal(f.calls.generate,0)
  }
  const f=fixture(),release=f.store.acquire(),id=deliveryId(slot,'synthetic-topic')
  f.store.save({id,slot,topicId:'synthetic-topic',state:'generating',stage:'generation'});f.store.artifact(id,raw);release()
  await f.run();assert.equal(f.calls.generate,0);assert.equal(f.calls.notify,1)
})
test('concurrent live holder excludes another run; OS releases lock after abrupt process exit',async()=>{
  const f=fixture(),release=f.store.acquire();await assert.rejects(f.run(),/already_running/);release()
  const url=new URL('../scripts/lib/mwf-delivery.mjs',import.meta.url).href
  const child=spawn(process.execPath,['--input-type=module','-e',`import {openDeliveryStore} from ${JSON.stringify(url)}; openDeliveryStore(${JSON.stringify(f.root)}).acquire(); console.log('locked'); setInterval(()=>{},1000)`],{env:{PATH:'/usr/bin:/bin'},stdio:['ignore','pipe','pipe']})
  await new Promise((res,rej)=>{child.stdout.once('data',res);child.once('error',rej);child.once('exit',()=>rej(Error('child exited early')))})
  await assert.rejects(f.run(),/already_running/)
  const exited=new Promise(res=>child.once('exit',res));child.kill('SIGTERM');await exited
  assert.equal((await f.run()).ok,true)
})
test('one article conflict does not stop later queue item',async()=>{
  const f=fixture();f.adapters.sync=async()=>({status:'conflict'});await f.run()
  f.adapters.sync=async i=>({status:'synced',blob:i.blob,commit:'a'.repeat(40)})
  await f.run({slot:'2026-09-16T08:30:00+09:00',topicId:'second'})
  assert.deepEqual(f.store.read().map(i=>i.state),['conflict','notified'])
})
test('status has real next time and invalid dates fail',()=>{
  const f=fixture();assert.equal(deliveryStatus(f.store,new Date('2026-09-14T00:00:00Z')).nextScheduledAt,'2026-09-15T23:30:00.000Z')
  assert.throws(()=>deliveryId('2026-02-30T08:30:00+09:00','topic'))
})

test('broken topic intake cannot starve already saved deliveries',async()=>{
  const f=fixture(),sync=f.adapters.sync
  f.adapters.sync=async()=>({status:'pending'});await f.run()
  f.adapters.sync=sync
  const result=await f.run({select:()=>{throw Error('duplicate_topic_ids')}})
  assert.equal(result.intakeError,'topic-intake-failed')
  assert.equal(f.store.read()[0].state,'notified');assert.equal(f.calls.generate,1)
})

test('intake alerts persist across restart, hold ambiguous sends, and preserve failed intake status',async()=>{
 for(const outcome of ['sent','not-sent','unknown','throw']){
  const root=mkdtempSync(join(tmpdir(),'mwf-intake-test-')),slot='2026-09-21T08:30:00+09:00';let calls=0
  const adapters={notifyIntake:async()=>{calls++;if(outcome==='throw')throw Error('unknown');return{status:outcome}}}
  for(let i=0;i<2;i++){
   const result=await runDelivery({store:openDeliveryStore(root),slot,adapters,select:async()=>({holdOnly:true,holds:[{reason:'canonical_evidence_unavailable'}]})})
   assert.equal(result.ok,false);assert.equal(result.items.length,0);assert.equal(result.lastSuccessAt,null);assert.equal(result.intakeNotification,outcome==='throw'?'unknown':outcome)
  }
  assert.equal(calls,1)
 }
 const root=mkdtempSync(join(tmpdir(),'mwf-intake-crash-')),store=openDeliveryStore(root),slot='2026-09-21T08:30:00+09:00',release=store.acquire();store.intakeNotice(slot,'sending');release()
 const result=await runDelivery({store:openDeliveryStore(root),slot,adapters:{notifyIntake:async()=>{throw Error('must_not_send')}},select:async()=>({holdOnly:true})})
 assert.equal(result.intakeNotification,'unknown');assert.equal(result.ok,false)
})
