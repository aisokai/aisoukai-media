import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

// Exercise the actual CLI parser in a synthetic isolated checkout. Stub only the
// effectful runtime/store modules; production source, data and auth never execute.
const root=realpathSync(mkdtempSync(join(tmpdir(),'mwf-cli-checkout-')))
const scriptPath=join(root,'ops-mwf.mjs'),scriptUrl=pathToFileURL(scriptPath).href
writeFileSync(scriptPath,readFileSync(new URL('../scripts/ops-mwf.mjs',import.meta.url)))
mkdirSync(join(root,'lib'))
writeFileSync(join(root,'lib/mwf-production.mjs'),"export function createProductionRuntime(){throw Error('DENIED_PRODUCTION_RUNTIME')}\n")
writeFileSync(join(root,'lib/mwf-delivery.mjs'),"export function openDeliveryStore(root){return {root}}; export function deliveryStatus(){return {status:'not-run',items:[]}}; export function runDelivery(){throw Error('DENIED_DELIVERY')}\n")
const guardPath=join(root,'deny-effects.mjs')
writeFileSync(guardPath,`\nimport {registerHooks} from 'node:module'\nconst allowed=new Set(['node:path','node:url',${JSON.stringify(scriptUrl)},'./lib/mwf-production.mjs','./lib/mwf-delivery.mjs'])\nregisterHooks({resolve(specifier,context,nextResolve){if(!allowed.has(specifier))throw Error('DENIED_IMPORT:'+specifier);return nextResolve(specifier,context)}})\nglobalThis.fetch=()=>{throw Error('DENIED_FETCH')}\n`)
function run(args){return spawnSync(process.execPath,['--import',pathToFileURL(guardPath).href,...args],{cwd:root,env:{PATH:'/usr/bin:/bin'},encoding:'utf8',timeout:5000})}
for(const flags of [['--force'],['--no-generate'],['--dry-run'],['--auto-publish']])test(`unsupported legacy ${flags[0]} fails without effects`,()=>{const before=readdirSync(root).sort(),result=run([scriptPath,...flags]);assert.equal(result.status,1);assert.match(result.stderr,/delivery_failed_check_local_status/);assert.deepEqual(readdirSync(root).sort(),before)})
test('unbound runtime returns explicit stopped status, never a retired success',()=>{const result=run([scriptPath]);assert.equal(result.status,2);assert.equal(JSON.parse(result.stdout).reason,'explicit_state_root_and_runtime_capabilities_required')})
test('status reads synthetic store without invoking delivery and importing actual parser is silent',()=>{const result=run([scriptPath,'--state-root','/synthetic/state','--status']);assert.equal(result.status,0);assert.deepEqual(JSON.parse(result.stdout),{status:'not-run',items:[]});const imported=run(['--input-type=module','-e',`await import(${JSON.stringify(scriptUrl)})`]);assert.equal(imported.status,0);assert.equal(imported.stdout,'');assert.equal(imported.stderr,'')})
test('guard rejects process, filesystem and network effects',()=>{for(const specifier of ['node:fs','node:child_process','node:https']){const result=run(['--input-type=module','-e',`await import(${JSON.stringify(specifier)})`]);assert.notEqual(result.status,0);assert.match(result.stderr,/DENIED_IMPORT/)}const result=run(['--input-type=module','-e',"fetch('https://synthetic.invalid')"]);assert.notEqual(result.status,0);assert.match(result.stderr,/DENIED_FETCH/)})
