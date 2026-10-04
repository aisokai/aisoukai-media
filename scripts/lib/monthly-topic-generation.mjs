import {isProtectedEditorialInput} from '../../src/lib/tieredPublication.mjs'
export const normalizeTopicTitle=value=>String(value??'').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu,'')
export function validateCandidateMonth(month){
 if(typeof month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||month.startsWith('0000-'))throw Error('month は YYYY-MM（有効な月）で指定してください')
}
export function selectFreshTopics(bank,{historyTitles=[],articleTitles=[],limit=24}={}){
 if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('candidate_limit_invalid')
 const excluded=new Set([...historyTitles,...articleTitles].map(normalizeTopicTitle)),chosen=[]
 for(const entry of bank){
  const title=entry[1],key=normalizeTopicTitle(title)
  if(!key||isProtectedEditorialInput({title})||excluded.has(key))continue
  excluded.add(key);chosen.push(entry)
  if(chosen.length===limit)break
 }
 return{topics:chosen,shortage:Math.max(0,limit-chosen.length)}
}
