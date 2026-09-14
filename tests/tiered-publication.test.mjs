import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import matter from 'gray-matter'
import { issueTopicAdoption,topicContentVersion,certifyIndependentReview,assessTieredPublication,BLOG_POLICY_VERSION,imageLicenseVersion } from '../src/lib/tieredPublication.mjs'
import { getDmpArticleState,applyTeacherApproval } from '../src/lib/dmpArticleState.mjs'
import { createTieredReviewer } from '../scripts/lib/mwf-tiered-review.mjs'
const secret='synthetic-test-signing-only',path='content/posts/2026-09-14-synthetic.md'
const topic={id:'synthetic',title:'Synthetic',category:'その他',medical_risk:'low',status:'approved'}
const data={title:'Synthetic',date:'2026-09-14',category:'その他',tags:[],author:'Synthetic',excerpt:'Synthetic',image:'/images/synthetic.png',image_alt:'Synthetic image',draft:true,reviewed:false,auto_approved:false,publication_status:'draft',generation_run_id:'openai:generator-1',source_topic_id:topic.id,source_topic_version:topicContentVersion(topic),medical_risk:'low'}
const content='## Synthetic\nSynthetic article.\n'
const decision={tier:'normal',decision:'pass',medicalMeaningChanged:false,changeKind:'new-article',checks:{content:true,image:true,duplication:true,medical:true,validation:true}}
const imageBytes=Buffer.from('synthetic image bytes')
const asset={path:data.image,license_status:'verified',license_source:'Synthetic owner',license_note:'Synthetic confirmed ownership'}
const imageEvidence={hash:createHash('sha256').update(imageBytes).digest('hex'),gitBlob:createHash('sha1').update(Buffer.from(`blob ${imageBytes.length}\0`)).update(imageBytes).digest('hex'),licenseVersion:imageLicenseVersion(asset)}
const context={path,topic,asset,imageHash:imageEvidence.hash}
const adoption=issueTopicAdoption(topic,secret)
const certify=(extra={})=>certifyIndependentReview({data,content,reviewerId:'openai:reviewer-2',decision,adoption,path,imageEvidence,secret,...extra})
test('normal requires authenticated exact adoption and independent same-content review, not old/self asserted flags',()=>{
 const next=certify();assert.ok(next);assert.equal(getDmpArticleState({data:next,content,verificationSecret:secret,publicationContext:context,today:'2026-09-14'}).publishable,true)
 assert.equal(assessTieredPublication(next,content,'wrong-key',context),false)
 assert.equal(certify({adoption:{approved:true}}),null)
 assert.equal(certify({reviewerId:data.generation_run_id}),null)
 assert.equal(getDmpArticleState({data:{...data,draft:false,auto_approved:true},content,verificationSecret:secret,publicationContext:context}).publishable,false)
 assert.equal(certify({adoption:issueTopicAdoption({...topic,title:'different'},secret)}),null)
})
test('all material edits, scope mismatch and review issues invalidate automatic publication',()=>{
 const next=certify()
 for(const edit of [{title:'changed'},{image:'/images/other.png'},{date:'2026-09-15'},{medical_risk:'high'},{publication_tier:'minor'},{draft:true},{archived:true},{rejection_reason:'rejected'}]) assert.equal(getDmpArticleState({data:{...next,...edit},content,verificationSecret:secret,publicationContext:context,today:'2026-09-14'}).publishable,false)
 assert.equal(assessTieredPublication(next,content+'changed',secret,context),false)
 assert.equal(certify({decision:{...decision,tier:'important'}}),null)
 assert.equal(certify({decision:{...decision,checks:{...decision.checks,image:false}}}),null)
 const future=certify({data:{...data,date:'2026-10-01'}})
 assert.equal(getDmpArticleState({data:future,content,verificationSecret:secret,publicationContext:context,today:'2026-09-14'}).publishable,false)
})
test('minor requires actual exact Human baseline and separate diff reviewer; important still Human only',()=>{
 const minor={...decision,tier:'minor',changeKind:'typo-format-link'}
 assert.equal(certify({decision:minor,previousHumanVersion:'a'.repeat(64)}),null)
 const baseline={data:applyTeacherApproval({data,content,reviewedBy:'Synthetic teacher',reviewedAt:'2026-09-14'}),content}
 const next=certify({decision:minor,adoption:undefined,baseline,content:content+'\n'})
 assert.ok(next);assert.equal(assessTieredPublication(next,content+'\n',secret,context),true)
 assert.equal(certify({decision:minor,baseline:{...baseline,content:'tampered'}}),null)
 assert.equal(getDmpArticleState({data:baseline.data,content}).publishable,true)
})
test('actual independent-review adapter inspects image and comparisons, signs actual response identity only',async()=>{
 const calls=[]
 const review=createTieredReviewer({secret,githubFile:async p=>p==='data/article-topics.sample.csv'?'id,title,category,medical_risk,status\nsynthetic,Synthetic,その他,low,approved\n':p.startsWith('data/topic-adoptions/')?JSON.stringify(adoption):JSON.stringify({images:[{path:data.image,license_status:'verified',license_source:'Synthetic owner',license_note:'Synthetic confirmed ownership'}]}),githubDirectory:async()=>[],request:async(url,options)=>{
  calls.push({url,options})
  if(url.includes('vercel.app'))return{ok:true,headers:new Headers({'content-type':'image/png'}),arrayBuffer:async()=>Buffer.from('synthetic image bytes')}
  return{ok:true,json:async()=>({id:'independent-response',choices:[{finish_reason:'stop',message:{content:JSON.stringify(decision)}}]})}
 }})
 const result=await review({raw:matter.stringify(content,data),path})
 assert.equal(result.status,'certified')
 const parsed=matter(result.raw);assert.equal(assessTieredPublication(parsed.data,parsed.content,secret,context),true)
 assert.equal(parsed.data.tiered_review_proof.payload.reviewerId,'openai:independent-response')
 assert.equal(JSON.parse(calls[1].options.body).messages[1].content[1].type,'image_url')
 assert.equal(parsed.data.tiered_review_proof.policyVersion,BLOG_POLICY_VERSION)
})

test('published receipt requires exact deployed bytes in addition to canonical source',async()=>{
 const {createMwfReceiptHandler}=await import('../src/lib/mwfAdminReceipt.mjs')
 const approved=applyTeacherApproval({data,content,reviewedBy:'Synthetic teacher',reviewedAt:'2026-09-14'})
 const raw=matter.stringify(content,approved),version=getDmpArticleState({data:approved,content}).contentVersion
 let deployed='stale'
 const handler=createMwfReceiptHandler({authenticate:async()=>{},readAdminSource:async()=>({source:'github',posts:[]}),readFile:async()=>({content:raw,sha:'a'.repeat(40)}),readDeployedFile:async()=>deployed})
 const request=new Request(`https://aisoukai-media.vercel.app/admin/pending-review/mwf-receipt?path=${path.replace('synthetic','mwf-'+'a'.repeat(64))}&contentVersion=${version}`)
 assert.equal((await handler(request)).status,409)
 deployed=raw;const response=await handler(request);assert.equal(response.status,200);assert.equal((await response.json()).published,true)
})

test('same URL image replacement, license change and topic revocation invalidate proof',()=>{
 const next=certify()
 assert.equal(assessTieredPublication(next,content,secret,{...context,imageHash:'f'.repeat(64)}),false)
 assert.equal(assessTieredPublication(next,content,secret,{...context,asset:{...asset,license_status:'unknown'}}),false)
 assert.equal(assessTieredPublication(next,content,secret,{...context,topic:{...topic,status:'hold'}}),false)
})
test('protected content cannot publish even with exact previous Human approval',()=>{
 const patient={...data,sensitive_data:true}
 const approved=applyTeacherApproval({data:patient,content,reviewedBy:'Synthetic',reviewedAt:'2026-09-14'})
 assert.equal(getDmpArticleState({data:approved,content}).publishable,false)
})
test('revoked adoption and protected input stop before provider or image transfer',async()=>{
 let requests=0
 const review=createTieredReviewer({secret,request:async()=>{requests++;throw Error('must not send')},githubDirectory:async()=>[],githubFile:async p=>p.includes('topic-adoptions')?JSON.stringify(adoption):'id,title,category,medical_risk,status\nsynthetic,Synthetic,その他,low,hold\n'})
 assert.equal((await review({raw:matter.stringify(content,data),path})).status,'draft')
 assert.equal((await review({raw:matter.stringify(content,{...data,sensitive_data:true}),path})).status,'draft')
 assert.equal(requests,0)
})

test('dedicated existing-job configuration keeps calendar only and never force/RunAtLoad',async()=>{
 const {mwfRunnerPlist}=await import('../scripts/mwf-runner-plist.mjs')
 const plist=mwfRunnerPlist('a'.repeat(40))
 assert.match(plist,/com.mitani.aisoukai-media-ops-mwf/);assert.match(plist,/--production/);assert.match(plist,/releases\/a{40}\/scripts\/ops-mwf/)
 assert.doesNotMatch(plist,/RunAtLoad|KeepAlive|--force|kickstart|TELEGRAM_BOT_TOKEN/)
 assert.equal((plist.match(/<key>Weekday<\/key>/g)??[]).length,3)
})

test('certificate cannot be copied to another actual article path or evaluated without path evidence',()=>{
 const next=certify();assert.equal(assessTieredPublication(next,content,secret,{...context,path:"content/posts/2026-09-14-copy.md"}),false);assert.equal(assessTieredPublication(next,content,secret,{...context,path:undefined}),false)
})
