import {createHash} from 'node:crypto'
export const BACKFILL_TOPICS=Object.freeze({'MONTHLY-202609TOPIC015':'2026-09-04','MONTHLY-202609TOPIC016':'2026-09-07','MONTHLY-202609TOPIC017':'2026-09-09','MONTHLY-202609TOPIC019':'2026-09-14','MONTHLY-202609TOPIC020':'2026-09-16','MONTHLY-202609TOPIC008':'2026-09-18'})
export const backfillId=(slot,topicId)=>createHash('sha256').update(`backfill:v1\0${slot}\0${topicId}`).digest('hex')
export function validateBackfillManifest(value,now=new Date()){
 if(!value||Object.keys(value).sort().join(',')!=='canonicalRevision,items,publicationMode,schema'||value.schema!==1||value.publicationMode!=='draft-only'||!/^[a-f0-9]{40}$/.test(value.canonicalRevision)||!Array.isArray(value.items)||!value.items.length||value.items.length>6)throw Error('backfill_manifest_invalid')
 const seen=new Set()
 for(const item of value.items){
  if(!item||Object.keys(item).sort().join(',')!=='plannedDate,topicId,topicVersion'||BACKFILL_TOPICS[item.topicId]!==item.plannedDate||!/^[a-f0-9]{64}$/.test(item.topicVersion)||seen.has(item.topicId))throw Error('backfill_item_invalid')
  const date=new Date(`${item.plannedDate}T08:30:00+09:00`)
  if(!Number.isFinite(+date)||+date>+now||![1,3,5].includes(new Date(+date+9*3600000).getUTCDay()))throw Error('backfill_date_invalid')
  seen.add(item.topicId)
 }
 return value
}
