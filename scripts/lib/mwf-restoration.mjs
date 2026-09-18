import {inventoryHash,extractEditorialMetadata} from './mwf-inventory.mjs'
const PATH=/^content\/posts\/\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md$/
export function validateRestoreManifest(value,anchor){
 if(!value||Object.keys(value).sort().join(',')!=='inventoryHash,items,publicationMode,schema'||value.schema!==1||value.publicationMode!=='draft-only'||value.inventoryHash!==anchor||!Array.isArray(value.items)||!value.items.length||value.items.length>8)throw Error('restore_manifest_invalid')
 const seen=new Set();for(const item of value.items){if(!item||Object.keys(item).sort().join(',')!=='blob,path'||!PATH.test(item.path)||!/^[a-f0-9]{64}$/.test(item.blob)||seen.has(item.path))throw Error('restore_item_invalid');seen.add(item.path)}return value
}
// Conservative byte grammar for preserved YAML headers. Unsupported syntax is
// held rather than decoding unknown scalar fields or trusting malformed YAML.
export function hasSafePreservedHeaderSyntax(raw){
 const trim=value=>{while(value.length&&[32,9,13].includes(value[0]))value=value.subarray(1);while(value.length&&[32,9,13].includes(value.at(-1)))value=value.subarray(0,-1);return value}
 const tail=value=>{value=trim(value);return !value.length||value[0]===35}
 function scalar(value){
  value=trim(value);if(!value.length)return true
  if(value[0]===34||value[0]===39){const quote=value[0];for(let i=1;i<value.length;i++){
   if(quote===34&&value[i]===92){i++;if(i>=value.length||!Buffer.from('0abtnvfre \"/N_LPuxU').includes(value[i]))return false;const length=value[i]===120?2:value[i]===117?4:value[i]===85?8:0;if(length){for(let j=0;j<length;j++){i++;if(i>=value.length||!((value[i]>=48&&value[i]<=57)||(value[i]>=65&&value[i]<=70)||(value[i]>=97&&value[i]<=102)))return false}}continue}
   if(value[i]===quote){if(quote===39&&value[i+1]===39){i++;continue}return tail(value.subarray(i+1))}
  }return false}
  if(value[0]===91){let start=1,quote=0;for(let i=1;i<value.length;i++){const c=value[i];if(quote){if(quote===34&&c===92){i++;continue}if(c===quote){if(quote===39&&value[i+1]===39){i++;continue}quote=0}continue}if(c===34||c===39){quote=c;continue}if(c===91||c===123||c===125||c===35)return false;if(c===44||c===93){if(c===44&&!trim(value.subarray(start,i)).length)return false;if(!scalar(value.subarray(start,i)))return false;start=i+1;if(c===93)return tail(value.subarray(i+1))}}return false}
  if([45,63].includes(value[0])&&(value.length===1||[32,9].includes(value[1])))return false
  if([123,125,93,38,42,33,124,62,37,64,96].includes(value[0]))return false
  for(let i=0;i<value.length;i++){if(value[i]===58&&(i+1===value.length||[32,9].includes(value[i+1])))return false;if(value[i]===35&&(i===0||[32,9].includes(value[i-1])))break}
  return true
 }
 let offset=0,first=true,listAllowed=false,listIndent=null;const keys=new Set()
 while(offset<raw.length&&offset<128*1024){let end=raw.indexOf(10,offset);if(end<0)end=raw.length;let line=raw.subarray(offset,end);offset=end+1;if(line.at(-1)===13)line=line.subarray(0,-1)
 if([...line].some(c=>(c<32&&c!==9)||c===127))return false
 if(first){first=false;if(!line.equals(Buffer.from('---')))return false;continue}if(line.equals(Buffer.from('---')))return true
 if(!trim(line).length||trim(line)[0]===35)continue
 if(line[0]===32){const value=trim(line);const width=line.findIndex(c=>c!==32);if(listIndent!==null&&listIndent!==width)return false;listIndent=width;if(!listAllowed||value[0]!==45||value[1]!==32||!scalar(value.subarray(2)))return false;continue}
 const colon=line.indexOf(58);if(colon+1<line.length&&![32,9].includes(line[colon+1]))return false;if(colon<1||colon>64||![...line.subarray(0,colon)].every(c=>c>=97&&c<=122||c>=65&&c<=90||c>=48&&c<=57||c===95))return false
 const key=line.subarray(0,colon).toString('ascii');if(!/^[A-Za-z_]/.test(key)||['true','false','null','True','False','Null','TRUE','FALSE','NULL'].includes(key))return false;if(keys.has(key))return false;keys.add(key)
 const value=trim(line.subarray(colon+1));listAllowed=!value.length;listIndent=null;if(!scalar(value))return false
 }
 return false
}
// Decode only whitelisted safety/date scalar header values, never article body.
export function isPreservedUnreviewedDraft(raw,path){
 if(!PATH.test(path)||!hasSafePreservedHeaderSyntax(raw)||!extractEditorialMetadata(raw))return false
 const allowed=new Set(['draft','reviewed','auto_approved','archived','publication_status','date','publish_at','rejection_reason']),meta={},seen=new Set();let offset=0,first=true,closed=false
 while(offset<raw.length&&offset<128*1024){let end=raw.indexOf(10,offset);if(end<0)end=raw.length;let line=raw.subarray(offset,end);offset=end+1;if(line.at(-1)===13)line=line.subarray(0,-1);if(first){first=false;if(!line.equals(Buffer.from('---')))return false;continue}if(line.equals(Buffer.from('---'))){closed=true;break}
 const colon=line.indexOf(58);if(colon<1||colon>32)continue;const kb=line.subarray(0,colon);if(![...kb].every(c=>c>=97&&c<=122||c===95))continue;const key=kb.toString('ascii');if(!allowed.has(key))continue;if(seen.has(key))return false;seen.add(key)
 if(key==='rejection_reason'){let value=line.subarray(colon+1);while(value.length&&[32,9,13].includes(value[0]))value=value.subarray(1);while(value.length&&[32,9,13].includes(value.at(-1)))value=value.subarray(0,-1);if(value.length&&!value.equals(Buffer.from("''"))&&!value.equals(Buffer.from('""')))return false;continue}
 const value=line.subarray(colon+1).toString('utf8').trim()
 if(['true','false'].includes(value))meta[key]=value==='true'
 else if(/^(['"]?)(draft|pending_review)\1$/.test(value))meta[key]=value.replace(/^['"]|['"]$/g,'')
 else if(/^(['"]?)\d{4}-\d{2}-\d{2}\1$/.test(value))meta[key]=value.replace(/^['"]|['"]$/g,'')
 else return false
 }
 const date=path.slice(14,24)
 return closed&&meta.draft===true&&meta.reviewed===false&&meta.auto_approved===false&&(meta.archived===undefined||meta.archived===false)&&['draft','pending_review'].includes(meta.publication_status)&&meta.date===date&&(meta.publish_at===undefined||meta.publish_at===date)
}
export async function syncPreservedDraft({item,raw,github}){
 if(inventoryHash(raw)!==item.blob||!isPreservedUnreviewedDraft(raw,item.path))return{status:'conflict'}
 for(let attempt=0;attempt<3;attempt++){
  const head=(await github('GET','git/ref/heads/main')).object.sha
  let existing;try{existing=await github('GET',`contents/${item.path}?ref=${head}`)}catch(error){if(error.code!=='NOT_FOUND')throw error}
  if(existing){if(existing.encoding!=='base64'||inventoryHash(Buffer.from(existing.content,'base64'))!==item.blob)return{status:'conflict'};return{status:'synced',blob:item.blob,commit:head}}
  const base=await github('GET',`git/commits/${head}`),blob=await github('POST','git/blobs',{content:raw.toString('base64'),encoding:'base64'}),tree=await github('POST','git/trees',{base_tree:base.tree.sha,tree:[{path:item.path,mode:'100644',type:'blob',sha:blob.sha}]}),commit=await github('POST','git/commits',{message:'Restore exact preserved unreviewed draft',tree:tree.sha,parents:[head]})
  try{await github('PATCH','git/refs/heads/main',{sha:commit.sha,force:false});if((await github('GET','git/ref/heads/main')).object.sha!==commit.sha)return{status:'pending'};return{status:'synced',blob:item.blob,commit:commit.sha}}catch{if(attempt===2)return{status:'pending'}}
 }
 return{status:'pending'}
}
export async function restorePreservedDraft({store,item,entry,raw,sync,reflect,notify}){
 if(!entry||entry.source!=='local'||entry.quarantine||entry.path!==item.path||entry.blob!==item.blob||inventoryHash(raw)!==item.blob||!isPreservedUnreviewedDraft(raw,item.path))throw Error('preserved_draft_unproven')
 const id=inventoryHash(`restore:v1:${item.path}:${item.blob}`),release=store.acquire()
 try{
 let record=store.read().find(i=>i.id===id)
 if(record?.state==='notified'||record?.state==='notification-unknown'||record?.state==='conflict')return record
 const save=patch=>{record={...record,...patch};store.save(record)}
 if(record?.state==='sending'){save({state:'notification-unknown'});return record}
 if(!record)save({id,deliveryMode:'restore',path:item.path,blob:item.blob,topicId:`restore-${id}`,state:'saved',stage:'sync',plannedDate:item.path.slice(14,24)})
 if(['saved','sync-failed'].includes(record.state)){const result=await sync({item,raw});if(result.status!=='synced'||result.blob!==item.blob){save({state:result.status==='conflict'?'conflict':'sync-failed'});return record};save({state:'pending-reflection',stage:'reflection',commit:result.commit})}
 const proof=await reflect(item)
 if(proof?.authenticated!==true||proof.source!=='production-restore'||proof.path!==item.path||proof.blob!==item.blob||proof.originBlob!==item.blob||proof.artifactVersion!==item.blob||proof.published!==false||proof.reviewable!==true){save({state:'pending-reflection'});return record}
 save({state:'sending',stage:'notification'})
 try{const result=await notify({path:item.path,artifactVersion:item.blob,published:false});save({state:result.status==='sent'?'notified':result.status==='not-sent'?'notification-failed':'notification-unknown',...(result.status==='sent'?{notifiedAt:new Date().toISOString()}:{})})}catch{save({state:'notification-unknown'})}
 return record
 }finally{release()}
}
