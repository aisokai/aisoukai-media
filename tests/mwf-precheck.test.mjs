import test from 'node:test'
import assert from 'node:assert/strict'
import {classifyPrecheckResponse,projectPrecheckCache} from '../scripts/lib/mwf-precheck.mjs'
const response=decision=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify({decision})}}]})
test('clear, related and ambiguous require completed strict decision envelope',()=>{
 for(const decision of ['clear','related','ambiguous']){const result=classifyPrecheckResponse(200,response(decision));assert.equal(result.reason,`precheck_${decision}`);assert.equal(result.status,decision==='clear'?'clear':'hold')}
 for(const value of [{choices:[{finish_reason:'length',message:{content:'{"decision":"clear"}'}}]},{choices:[{finish_reason:'stop',message:{content:'{"decision":"clear","extra":true}'}}]},response('other'),null])assert.equal(classifyPrecheckResponse(200,value).reason,'precheck_unknown')
})
test('definite HTTP rejection is distinct from uncertain server response and never emits raw errors',()=>{
 for(const status of [400,401,403,404,422,429]){const result=classifyPrecheckResponse(status,{error:{code:'unsupported_value',message:'PRIVATE'}});assert.equal(result.reason,'precheck_request_rejected');assert.equal(result.httpStatus,status);assert.equal(result.errorCode,'unsupported_value');assert.doesNotMatch(JSON.stringify(result),/PRIVATE/)}
 for(const status of [500,502,503,undefined]){const result=classifyPrecheckResponse(status,{error:{code:'PRIVATE'}});assert.equal(result.reason,'precheck_unknown');assert.equal(result.errorCode,'unknown');assert.doesNotMatch(JSON.stringify(result),/PRIVATE/)}
 assert.equal(classifyPrecheckResponse(400,undefined).reason,'precheck_request_rejected')
})
test('legacy hold projection is honest and nonmutating; old clear and unknown remain unchanged',()=>{
 const old={key:'a',status:'hold',reason:'metadata_precheck'},before=JSON.stringify(old)
 assert.deepEqual(projectPrecheckCache(old),{key:'a',status:'hold',reason:'legacy_precheck_unclassified'});assert.equal(JSON.stringify(old),before)
 for(const record of [{status:'clear',reason:'metadata_precheck'},{status:'hold',reason:'precheck_unknown'}])assert.equal(projectPrecheckCache(record),record)
})

test('JSON mode structural validator fails old request and accepts explicit JSON v2 request',async()=>{
 const {legacyPrecheckRequest,buildPrecheckRequest}=await import('../scripts/lib/mwf-precheck.mjs')
 const topic={id:'synthetic',title:'Synthetic'},entries=[]
 const providerValidator=request=>request.response_format.type==='json_object'&&request.messages.some(m=>/json/i.test(m.content))?200:400
 assert.equal(providerValidator(legacyPrecheckRequest(topic,entries)),400)
 assert.equal(providerValidator(buildPrecheckRequest(topic,entries)),200)
 assert.equal(legacyPrecheckRequest(topic,entries).messages[1].content,buildPrecheckRequest(topic,entries).messages[1].content)
})
test('legacy repair requires exact key, unclassified hold and no JSON in any reconstructed message',async()=>{
 const {canRepairLegacyPrecheck}=await import('../scripts/lib/mwf-precheck.mjs')
 const record={key:'same',status:'hold',reason:'metadata_precheck'},topic={id:'synthetic',title:'Synthetic'}
 assert.equal(canRepairLegacyPrecheck(record,'same',topic,[]),true)
 assert.equal(canRepairLegacyPrecheck(record,'different',topic,[]),false)
 assert.equal(canRepairLegacyPrecheck(record,'same',{...topic,title:'JSON topic'},[]),false)
 assert.equal(canRepairLegacyPrecheck(record,'same',topic,[{path:'p',metadata:{title:'json comparison'}}]),false)
 assert.equal(canRepairLegacyPrecheck(record,'same',topic,[{}]),false)
 for(const reason of ['precheck_related','precheck_ambiguous','precheck_unknown','precheck_request_rejected'])assert.equal(canRepairLegacyPrecheck({...record,reason},'same',topic,[]),false)
 assert.equal(canRepairLegacyPrecheck({...record,status:'clear'},'same',topic,[]),false)
})
