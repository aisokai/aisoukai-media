#!/usr/bin/env node
import {readFileSync} from 'node:fs'
import {validateRestoreManifest} from './lib/mwf-restoration.mjs'
import {MWF_INVENTORY_ANCHOR} from '../src/lib/mwfServerAuthority.mjs'
import {validateBackfillManifest} from './lib/mwf-backfill.mjs'
// Deployment remains disabled until authenticated runtime capabilities are bound.
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertActiveHost } from './lib/active-host-guard.mjs'
import { createProductionRuntime } from './lib/mwf-production.mjs'
import { openDeliveryStore, deliveryStatus, runDelivery } from './lib/mwf-delivery.mjs'
import { revokeImageRejection } from './lib/mwf-auto-images.mjs'

export async function runMwfCli(args, { adapters, productionOptions, wait, monotonicNow, output = value => console.log(JSON.stringify(value)) } = {}) {
  const options = {}
  for (let i = 0; i < args.length; i++) {
    if (['--state-root','--slot','--topic','--recover-topic','--backfill','--restore','--revoke-image-rejection'].includes(args[i])) {
      if (!args[i+1] || args[i+1].startsWith('--')) throw new Error('missing_argument')
      options[args[i++].slice(2)] = args[i]
    } else if (['--status','--retry-only','--production','--check-runtime','--prepare-topics-only'].includes(args[i])) options[args[i].slice(2)] = true
    else throw new Error('unsupported_argument')
  }
  if(options['revoke-image-rejection']!==undefined){
    // Explicit Human operator action. Local journal only: no delivery, generation, supply, notification, sync or network.
    if(!options.production||Object.keys(options).some(key=>!['production','revoke-image-rejection'].includes(key)))throw Error('revoke_image_rejection_options_invalid')
    const topicId=options['revoke-image-rejection'],base={status:'image-rejection-revocation',topicId}
    if(!/^[A-Za-z0-9_-]{1,100}$/.test(topicId))throw new Error('invalid_recovery_topic')
    const runtime=createProductionRuntime(productionOptions),store=openDeliveryStore(runtime.root)
    let release
    try{release=store.acquire()}catch{output({...base,ok:false,reason:'already_running'});return 1}
    try{
      const matches=store.read().filter(item=>item.topicId===topicId),item=matches[0]
      if(matches.length!==1||item.state!=='generation-failed'||!['image_rejected','image_visual_review_failed'].includes(item.generationReason)||!item.topic||typeof item.topic!=='object'||item.topic.id!==topicId){output({...base,ok:false,reason:'delivery_item_not_image_rejected'});return 1}
      const {status,...result}=revokeImageRejection({root:runtime.root,topic:item.topic,now:productionOptions?.now})
      output({...base,ok:status==='revoked',...result});return status==='revoked'?0:1
    }finally{release()}
  }
  if(options['prepare-topics-only']&&(!options.production||Object.keys(options).some(key=>!['production','prepare-topics-only'].includes(key))))throw Error('prepare_topics_options_invalid')
  if((options['recover-topic']||options['check-runtime'])&&!options.production)throw new Error('production_required')
  if(options['recover-topic']&&!/^[A-Za-z0-9_-]{1,100}$/.test(options['recover-topic']))throw new Error('invalid_recovery_topic')
  if(options['check-runtime']&&(options.status||options['recover-topic']||options['retry-only']))throw new Error('check_runtime_only')
  if(options.restore){
    if(!options.production||Object.keys(options).some(key=>!['production','restore'].includes(key)))throw Error('restore_options_invalid')
    const plan=validateRestoreManifest(JSON.parse(readFileSync(options.restore,'utf8')),MWF_INVENTORY_ANCHOR),runtime=createProductionRuntime(productionOptions),store=openDeliveryStore(runtime.root),results=[]
    for(const item of plan.items)results.push(await runtime.restore(store,item))
    const ok=results.every(result=>result.state==='notified');output({status:'restore',publicationMode:'draft-only',ok,items:results.map(({path,blob,state})=>({path,blob,state}))});return ok?0:1
  }
  if(options.backfill){
    if(!options.production||Object.keys(options).some(key=>!['production','backfill'].includes(key)))throw Error('backfill_options_invalid')
    const plan=validateBackfillManifest(JSON.parse(readFileSync(options.backfill,'utf8')),productionOptions?.now?.()??new Date()),results=[]
    for(const item of plan.items){
      const backfill={...item,canonicalRevision:plan.canonicalRevision},runtime=createProductionRuntime({...productionOptions,recoveryTopic:item.topicId,backfill}),store=openDeliveryStore(runtime.root)
      const result=await runDelivery({store,slot:runtime.slot,onlyTopic:item.topicId,backfill,adapters:runtime.adapters,select:runtime.select})
      results.push({topicId:item.topicId,plannedDate:item.plannedDate,...result})
    }
    const ok=results.every(result=>result.ok);output({status:'backfill',publicationMode:'draft-only',ok,results});return ok?0:1
  }
  let runtime
  if (options.production) {
    if (options.slot || options.topic || options['state-root']) throw new Error('production_identity_is_configured_only')
    runtime = createProductionRuntime({...productionOptions,recoveryTopic:options['recover-topic']})
    options['state-root'] = runtime.root
    adapters = runtime.adapters
    options.slot = runtime.slot
    if (!runtime.slot) options['retry-only'] = true
  }
  if(options['check-runtime']){const result=await runtime.checkRuntime();output(result);return result.status==='ready'?0:1}
  if (!options['state-root']) { output({ status: 'stopped', reason: 'explicit_state_root_and_runtime_capabilities_required' }); return 2 }
  const store = openDeliveryStore(options['state-root'])
  if(options['prepare-topics-only']){const release=store.acquire();try{const result=await runtime.prepareTopics();output({status:'topic-preparation',candidateSupply:result});return ['notified','stock-ready'].includes(result.status)?0:1}finally{release()}}
  if (options.status) { output(deliveryStatus(store,new Date(),options['recover-topic'])); return 0 }
  if (!adapters) { output({ status: 'stopped', reason: 'runtime_not_bound' }); return 2 }
  const result = await runDelivery({ store, slot: options.slot, topicId: options.topic, retryOnly: options['retry-only'], adapters, select: runtime?.select, verificationSecret:runtime?.verificationSecret,onlyTopic:options['recover-topic'], continuation:Boolean(runtime), wait, monotonicNow })
  let candidateSupply
  if(runtime&&options.slot&&!options['retry-only']&&!options['recover-topic']){const release=store.acquire();try{candidateSupply=await runtime.prepareTopics()}catch{candidateSupply={status:'attention'}}finally{release()}}
  output({ ...result,...(candidateSupply?{candidateSupply}:{}), ...(runtime ? { runnerVersion: runtime.version } : {}) })
  return result.ok ? 0 : 1
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assertActiveHost()
  try { process.exitCode = await runMwfCli(process.argv.slice(2)) }
  catch { console.error(JSON.stringify({ status: 'attention', reason: 'delivery_failed_check_local_status' })); process.exitCode = 1 }
}
