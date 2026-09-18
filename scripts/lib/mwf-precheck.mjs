// Provider response text never enters persisted evidence or diagnostics.
const enumValue=(value,allowed)=>allowed.includes(value)?value:'unknown'
export function classifyPrecheckResponse(httpStatus,result){
 const metadata={httpStatus:Number.isInteger(httpStatus)?httpStatus:null,errorCode:enumValue(result?.error?.code,['unsupported_value','unsupported_parameter','invalid_api_key','rate_limit_exceeded','insufficient_quota','model_not_found','invalid_request_error'])}
 if([400,401,403,404,422,429].includes(httpStatus))return{status:'hold',reason:'precheck_request_rejected',...metadata}
 if(httpStatus!==200)return{status:'hold',reason:'precheck_unknown',...metadata}
 const choice=result?.choices?.[0]
 if(choice?.finish_reason!=='stop'||typeof choice.message?.content!=='string')return{status:'hold',reason:'precheck_unknown',...metadata}
 let decision
 try{const parsed=JSON.parse(choice.message.content);if(!parsed||Object.keys(parsed).join(',')!=='decision')throw Error('invalid');decision=parsed.decision}catch{return{status:'hold',reason:'precheck_unknown',...metadata}}
 if(!['clear','related','ambiguous'].includes(decision))return{status:'hold',reason:'precheck_unknown',...metadata}
 return{status:decision==='clear'?'clear':'hold',reason:`precheck_${decision}`,...metadata}
}
export function projectPrecheckCache(record){
 if(record?.status==='hold'&&record.reason==='metadata_precheck')return{key:record.key,status:'hold',reason:'legacy_precheck_unclassified'}
 return record
}

export const PRECHECK_REQUEST_VERSION='json-context-v2'
// Frozen reconstruction of the pre-fix request; do not derive this from v2.
export function legacyPrecheckRequest(topic,entries){
 return{model:'gpt-5-nano',max_completion_tokens:2000,reasoning_effort:'minimal',response_format:{type:'json_object'},messages:[{role:'system',content:'Check candidate against all supplied public editorial metadata. Return only {"decision":"clear"|"related"|"ambiguous"}. Missing context or possible overlap means ambiguous/related. This is ONLY permission to create an unreviewed draft, never publication approval.'},{role:'user',content:JSON.stringify({topic:{id:topic.id,title:topic.title_candidate??topic.title,category:topic.category,keyword:topic.target_keyword??topic.keyword},comparisons:entries.map(e=>({path:e.path,...e.metadata}))})}]}
}
export function buildPrecheckRequest(topic,entries){
 const request=legacyPrecheckRequest(topic,entries)
 return{...request,messages:[{...request.messages[0],content:request.messages[0].content.replace('Return only ', 'Return only JSON ')},request.messages[1]]}
}
export function canRepairLegacyPrecheck(record,legacyKey,topic,entries){
 if(record?.key!==legacyKey||record.status!=='hold'||record.reason!=='metadata_precheck')return false
 try{
  if(!topic||!Array.isArray(entries)||entries.some(e=>!e.metadata))return false
  const request=legacyPrecheckRequest(topic,entries)
  return request.response_format.type==='json_object'&&request.messages.every(m=>typeof m.content==='string'&&!/json/i.test(m.content))
 }catch{return false}
}

// Draft eligibility is separate from independent publication review.
export function precheckDraftDisposition(result){
 if(result?.status==='clear')return'clear'
 if(result?.status==='hold'&&result.reason==='precheck_ambiguous'&&result.httpStatus===200&&result.requestVersion===PRECHECK_REQUEST_VERSION)return'draft_only'
 return'hold'
}
