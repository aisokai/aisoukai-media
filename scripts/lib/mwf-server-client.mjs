import {MWF_INVENTORY_ANCHOR,serverHash,serverRequestId,validServerRequest} from '../../src/lib/mwfServerAuthority.mjs'
import {parseMinorProposal} from '../../src/lib/mwfMinorAuthority.mjs'
import {topicContentVersion} from '../../src/lib/tieredPublication.mjs'
const ENDPOINT='https://aisoukai-media.vercel.app/api/mwf'
export function createServerClient({github,inventoryRaw,inventoryAnchor=MWF_INVENTORY_ANCHOR,authenticateRequest}){
 if(serverHash(inventoryRaw)!==inventoryAnchor)throw Error('reviewed_inventory_anchor_required')
 async function file(path,ref){try{const value=await github('GET',`contents/${path}?ref=${ref}`);if(value.encoding!=='base64')throw Error('invalid_mailbox_file');return Buffer.from(value.content,'base64').toString('utf8')}catch(error){if(error.code==='NOT_FOUND')return null;throw error}}
 async function submit(value,proposalRaw){
  if(!validServerRequest(value,inventoryAnchor))throw Error('invalid_mailbox_request')
  const proposal=value.operation==='minor-review'?parseMinorProposal(proposalRaw):null
  if(value.operation==='minor-review'&&(!proposal||serverHash(proposalRaw)!==value.artifactBlob||proposal.artifactPath!==value.artifactPath||proposal.baselineBlob!==value.baselineBlob))throw Error('minor_proposal_invalid')
  const id=serverRequestId(value),path=`data/mwf/requests/${id}.json`,inventoryPath=`data/mwf/inventories/${inventoryAnchor}.json`,content=JSON.stringify(value)+'\n'
  for(let attempt=0;attempt<3;attempt++){
   const head=(await github('GET','git/ref/heads/main')).object.sha
   const existing=await file(path,head),inventory=await file(inventoryPath,head)
   if(inventory!==null&&serverHash(inventory)!==inventoryAnchor)throw Error('mailbox_inventory_conflict')
   const existingProposal=proposal?await file(value.proposalPath,head):null
   if(proposal&&existingProposal!==null&&existingProposal!==proposalRaw)throw Error('minor_proposal_conflict')
   if(existing!==null){if(existing!==content||inventory===null||(proposal&&existingProposal!==proposalRaw))throw Error('mailbox_request_conflict');return id}
   const base=await github('GET',`git/commits/${head}`),changes=[]
   for(const target of [{path,content},...(proposal&&existingProposal===null?[{path:value.proposalPath,content:proposalRaw}]:[]),...(inventory===null?[{path:inventoryPath,content:inventoryRaw}]:[])]){
    const blob=await github('POST','git/blobs',{content:target.content,encoding:'utf-8'});changes.push({path:target.path,mode:'100644',type:'blob',sha:blob.sha})
   }
   const tree=await github('POST','git/trees',{base_tree:base.tree.sha,tree:changes})
   const commit=await github('POST','git/commits',{message:`MWF bounded request ${id}`,tree:tree.sha,parents:[head]})
   try{await github('PATCH','git/refs/heads/main',{sha:commit.sha,force:false});return id}catch{if(attempt===2)throw Error('mailbox_sync_pending')}
  }
 }
 async function call(id,wake=false){try{const url=wake?ENDPOINT:`${ENDPOINT}?requestId=${id}`,response=await authenticateRequest(url,{method:wake?'POST':'GET',...(wake?{headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:id})}:{})});if(!response.ok||response.redirected||response.url!==url||!/^application\/json(?:;|$)/i.test(response.headers.get('content-type')??''))return{status:'unavailable'};const result=await response.json();return result.requestId===id?result:{status:'unavailable'}}catch{return{status:'unknown'}}}
 async function prepare({slot,topicId,topicVersion,publicationMode}){const value={schema:publicationMode==='draft-only'?3:1,...(publicationMode==='draft-only'?{publicationMode}:{}),operation:'prepare',slot,topicId,topicVersion,artifactPath:null,artifactBlob:null,inventoryHash:inventoryAnchor},id=await submit(value);const woken=await call(id,true);return woken.status==='hold'?woken:call(id)}
 async function reflect(item){const value={schema:item.deliveryMode==='backfill'?3:1,...(item.deliveryMode==='backfill'?{publicationMode:'draft-only'}:{}),operation:'review',slot:item.slot,topicId:item.topicId,topicVersion:item.topic?.serverTopicVersion??(item.topic?topicContentVersion(item.topic):item.sourceTopicVersion),artifactPath:item.path,artifactBlob:item.blob,inventoryHash:inventoryAnchor},id=await submit(value);await call(id,true);const result=await call(id);if(result.originBlob!==item.blob||result.path!==item.path)return{status:result.status};return result}
 async function minor({proposalRaw}){
  const proposal=parseMinorProposal(proposalRaw);if(!proposal)throw Error('minor_proposal_invalid')
  const artifactBlob=serverHash(proposalRaw),value={schema:2,operation:'minor-review',artifactPath:proposal.artifactPath,baselineBlob:proposal.baselineBlob,artifactBlob,proposalPath:`data/mwf/proposals/${artifactBlob}.json`,inventoryHash:inventoryAnchor}
  const id=await submit(value,proposalRaw),wake=await call(id,true)
  if(wake.status==='hold')return wake
  const result=await call(id)
  if(result.status==='server-reviewed'&&(result.authenticated!==true||result.path!==proposal.artifactPath||result.originBlob!==artifactBlob||result.published!==true||result.reviewable!==true||result.source!=='production-admin'||!/^[a-f0-9]{64}$/.test(result.blob??'')||!/^[a-f0-9]{64}$/.test(result.contentVersion??'')))return{status:'pending-reflection',requestId:id}
  return result
 }
 async function restore(item){const value={schema:4,operation:'restore-reflect',artifactPath:item.path,artifactBlob:item.blob,inventoryHash:inventoryAnchor},id=await submit(value);await call(id,true);return call(id)}
 return{prepare,reflect,minor,restore,submit,call}
}
