#!/usr/bin/env node
// Deployment remains disabled until authenticated runtime capabilities are bound.
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createProductionRuntime } from './lib/mwf-production.mjs'
import { openDeliveryStore, deliveryStatus, runDelivery } from './lib/mwf-delivery.mjs'

export async function runMwfCli(args, { adapters, productionOptions, output = value => console.log(JSON.stringify(value)) } = {}) {
  const options = {}
  for (let i = 0; i < args.length; i++) {
    if (['--state-root','--slot','--topic','--recover-topic'].includes(args[i])) {
      if (!args[i+1] || args[i+1].startsWith('--')) throw new Error('missing_argument')
      options[args[i++].slice(2)] = args[i]
    } else if (['--status','--retry-only','--production','--check-runtime'].includes(args[i])) options[args[i].slice(2)] = true
    else throw new Error('unsupported_argument')
  }
  if((options['recover-topic']||options['check-runtime'])&&!options.production)throw new Error('production_required')
  if(options['recover-topic']&&!/^[A-Za-z0-9_-]{1,100}$/.test(options['recover-topic']))throw new Error('invalid_recovery_topic')
  if(options['check-runtime']&&(options.status||options['recover-topic']||options['retry-only']))throw new Error('check_runtime_only')
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
  if (options.status) { output(deliveryStatus(store,new Date(),options['recover-topic'])); return 0 }
  if (!adapters) { output({ status: 'stopped', reason: 'runtime_not_bound' }); return 2 }
  const result = await runDelivery({ store, slot: options.slot, topicId: options.topic, retryOnly: options['retry-only'], adapters, select: runtime?.select, verificationSecret:runtime?.verificationSecret,onlyTopic:options['recover-topic'] })
  output({ ...result, ...(runtime ? { runnerVersion: runtime.version } : {}) })
  return result.ok ? 0 : 1
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = await runMwfCli(process.argv.slice(2)) }
  catch { console.error(JSON.stringify({ status: 'attention', reason: 'delivery_failed_check_local_status' })); process.exitCode = 1 }
}
