import {normalizeTopicTitle} from './monthly-topic-generation.mjs'
import {isProtectedEditorialInput} from '../../src/lib/tieredPublication.mjs'

const checkupTiming=title=>/定期検診/.test(title)&&/(?:頻度|間隔|何[かヶケ箇カ]?月|ペース|通う目安)/.test(title)
function sharedPrefix(a,b){let i=0;while(i<Math.min(a.length,b.length)&&a[i]===b[i])i++;return i}
function bigrams(value){return new Set(Array.from({length:Math.max(0,value.length-1)},(_,i)=>value.slice(i,i+2)))}
function lexicallyRelated(a,b){
 // These are triage hints, never evidence that two articles have identical content.
 if(checkupTiming(a)&&checkupTiming(b))return true
 const x=bigrams(a),y=bigrams(b),common=[...x].filter(value=>y.has(value)).length
 return sharedPrefix(a,b)>=10&&2*common/(x.size+y.size)>=0.5
}
export function metadataTopicOverlap(topic,entries){
 if(isProtectedEditorialInput(topic))return{reason:'protected_topic'}
 const title=topic?.title_candidate??topic?.title
 if(typeof title!=='string'||!normalizeTopicTitle(title)||!Array.isArray(entries)||entries.some(entry=>!entry?.metadata||typeof entry.metadata.title!=='string'||!normalizeTopicTitle(entry.metadata.title)||isProtectedEditorialInput(entry.metadata)))return{reason:'comparison_metadata_incomplete'}
 const normalized=normalizeTopicTitle(title)
 if(entries.some(({metadata})=>(typeof topic.id==='string'&&topic.id!==''&&metadata.source_topic_id===topic.id)||normalizeTopicTitle(metadata.title)===normalized))return{reason:'duplicate_metadata'}
 if(entries.some(({metadata})=>lexicallyRelated(normalized,normalizeTopicTitle(metadata.title))))return{reason:'metadata_related'}
 return{reason:null}
}
