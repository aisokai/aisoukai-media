import {MWF_INVENTORY_ANCHOR,serverHash,serverRequestId,validServerRequest} from '../../src/lib/mwfServerAuthority.mjs'
import {topicContentVersion} from '../../src/lib/tieredPublication.mjs'
const ENDPOINT='https://aisoukai-media.vercel.app/api/mwf'
export function createServerClient({github,request,inventoryRaw,inventoryAnchor=MWF_INVENTORY_ANCHOR}){
 if(serverHash(inventoryRaw)!==inventoryAnchor)throw Error('reviewed_inventory_anchor_required')
 async function file(path,ref){try{const value=await github('GET',`contents/${path}?ref=${ref}`);if(value.encoding!=='base64')throw Error('invalid_mailbox_file');return Buffer.from(value.content,'base64').toString('utf8')}catch(error){if(error.code==='NOT_FOUND')return null;throw error}}
 async function submit(value){
  if(!validServerRequest(value,inventoryAnchor))throw Error('invalid_mailbox_request')
  const id=serverRequestId(value),path=`data/mwf/requests/${id}.json`,inventoryPath=`data/mwf/inventories/${inventoryAnchor}.json`,content=JSON.stringify(value)+'\n'
  for(let attempt=0;attempt<3;attempt++){
   const head=(await github('GET','git/ref/heads/main')).object.sha
   const existing=await file(path,head),inventory=await file(inventoryPath,head)
   if(inventory!==null&&serverHash(inventory)!==inventoryAnchor)throw Error('mailbox_inventory_conflict')
   if(existing!==null){if(existing!==content||inventory===null)throw Error('mailbox_request_conflict');return id}
   const base=await github('GET',`git/commits/${head}`),changes=[]
   for(const target of [{path,content},...(inventory===null?[{path:inventoryPath,content:inventoryRaw}]:[])]){
    const blob=await github('POST','git/blobs',{content:target.content,encoding:'utf-8'});changes.push({path:target.path,mode:'100644',type:'blob',sha:blob.sha})
   }
   const tree=await github('POST','git/trees',{base_tree:base.tree.sha,tree:changes})
   const commit=await github('POST','git/commits',{message:`MWF bounded request ${id}`,tree:tree.sha,parents:[head]})
   try{await github('PATCH','git/refs/heads/main',{sha:commit.sha,force:false});return id}catch{if(attempt===2)throw Error('mailbox_sync_pending')}
  }
 }
 async function call(id,wake=false){try{const url=wake?ENDPOINT:`${ENDPOINT}?requestId=${id}`,response=await request(url,{method:wake?'POST':'GET',...(wake?{headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:id})}:{})});if(!response.ok||response.redirected||response.url!==url||!/^application\/json(?:;|$)/i.test(response.headers.get('content-type')??''))return{status:'unavailable'};const result=await response.json();return result.requestId===id?result:{status:'unavailable'}}catch{return{status:'unknown'}}}
 async function prepare({slot,topicId,topicVersion}){const value={schema:1,operation:'prepare',slot,topicId,topicVersion,artifactPath:null,artifactBlob:null,inventoryHash:inventoryAnchor},id=await submit(value);const woken=await call(id,true);return woken.status==='hold'?woken:call(id)}
 async function reflect(item){const value={schema:1,operation:'review',slot:item.slot,topicId:item.topicId,topicVersion:item.topic?.serverTopicVersion??(item.topic?topicContentVersion(item.topic):item.sourceTopicVersion),artifactPath:item.path,artifactBlob:item.blob,inventoryHash:inventoryAnchor},id=await submit(value);await call(id,true);const result=await call(id);if(result.originBlob!==item.blob||result.path!==item.path)return{status:result.status};return result}
 return{prepare,reflect,submit,call}
}
