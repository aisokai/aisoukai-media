import test from 'node:test'
import assert from 'node:assert/strict'
import matter from 'gray-matter'
import {serializeMwfArticle} from '../src/lib/mwfArticleSerialization.mjs'
import {extractEditorialMetadata} from '../scripts/lib/mwf-inventory.mjs'
import {isClosedMwfDraftBytes} from '../src/lib/mwfServerAuthority.mjs'
import {getDmpArticleState,applyTeacherApproval,getContentVersion} from '../src/lib/dmpArticleState.mjs'
import {getPostPublicationStatus} from '../scripts/lib/post-publication-status.mjs'
test('generated article strings never fold and round-trip quotes/newlines through metadata and closed envelope',()=>{
 const data={title:"Dentist's advice "+'synthetic '.repeat(30),excerpt:'Synthetic description with "quoted text". '.repeat(20)+'\nAnother line.',category:'other',generation_run_id:'synthetic',source_topic_id:'test',source_topic_version:'a'.repeat(64),draft:true,reviewed:false,auto_approved:false}
 const raw=serializeMwfArticle('Synthetic body\n',data)
 assert.deepEqual(matter(raw).data,data)
 assert.equal(isClosedMwfDraftBytes(Buffer.from(raw)),true)
 assert.deepEqual(extractEditorialMetadata(raw),{title:data.title,excerpt:data.excerpt,category:'other',source_topic_id:'test'})
 const certified=serializeMwfArticle('Synthetic body\n',{...data,draft:false,tiered_review_proof:{payload:{text:"Reviewer's comparison "+'long '.repeat(40)},signature:'b'.repeat(64)}})
 assert.equal(extractEditorialMetadata(certified).title,data.title)
 assert.equal(matter(certified).data.tiered_review_proof.payload.text.startsWith("Reviewer's"),true)
})
test('either future date blocks approved publication and CLI even with conflicting publish_at',()=>{
 for(const fields of [{date:'2026-12-01',publish_at:'2026-09-01'},{date:'2026-09-01',publish_at:'2026-12-01'},{date:new Date('2026-12-01T00:00:00Z'),publish_at:new Date('2026-09-01T00:00:00Z')}]){
  const content='Synthetic body',data=applyTeacherApproval({data:{title:'Synthetic',...fields},content,reviewedBy:'synthetic-reviewer',reviewedAt:'2026-09-01'})
  assert.equal(getDmpArticleState({data,content,today:'2026-09-15'}).future,true)
  assert.equal(getDmpArticleState({data,content,today:'2026-09-15'}).publishable,false)
  const cli=getPostPublicationStatus(data,{content,today:'2026-09-15'});assert.equal(cli.publishable,false);assert.equal(cli.isFuture,true)
 }
})

test('YAML Date baseline survives serialization with stable fingerprint and same-day eligibility',()=>{
 const content='Synthetic body\n',data=applyTeacherApproval({data:{title:'Synthetic',date:new Date('2026-09-15T00:00:00Z'),publish_at:new Date('2026-09-15T00:00:00Z'),custom:{date:new Date('2026-09-01T00:00:00Z')}},content,reviewedBy:'synthetic',reviewedAt:'2026-09-15'})
 const parsed=matter(serializeMwfArticle(content,data))
 assert.equal(parsed.data.date,'2026-09-15')
 assert.equal(getContentVersion(parsed.data,parsed.content),getContentVersion(data,content))
 assert.equal(getDmpArticleState({data:parsed.data,content:parsed.content,today:'2026-09-15'}).publishable,true)
})
