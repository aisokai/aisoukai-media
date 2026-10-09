import {isProtectedEditorialInput} from '../../src/lib/tieredPublication.mjs'
const ADMIN='https://aisoukai-media.vercel.app/admin'
const safeId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(value)?value:''
const count=value=>Number.isSafeInteger(value)&&value>=0?value:0
const technicalReasons=new Set(['topic_adoption_unavailable','canonical_evidence_unavailable','generation_configuration_missing','server_prepare_pending','precheck_request_rejected','precheck_unknown','precheck_rejected','precheck_related','legacy_precheck_unclassified','comparison_current_changed','comparison_evidence_changed','comparison_metadata_incomplete','comparison_metadata_unavailable','approval_current_unproven','approval_metadata_ambiguous'])
function safeTitle(value){
 if(typeof value!=='string'||isProtectedEditorialInput({},value)||/(?:https?:\/\/|www\.|\S+@\S+)/i.test(value))return ''
 return value.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g,' ').replace(/\s+/g,' ').trim().slice(0,100)
}
// Only this projection crosses from a CSV candidate to a notice. Never copy notes/body.
export function projectCandidateHold(topic,reason){
 const protectedTopic=isProtectedEditorialInput(topic)
 return{topicId:safeId(topic?.id),title:protectedTopic?'':safeTitle(topic?.title_candidate??topic?.title),reason:protectedTopic?'protected_topic':typeof reason==='string'&&/^[a-z_]{1,80}$/.test(reason)?reason:'other'}
}
export function summarizeSlotArticles(items,slot){
 const current=items.filter(item=>item.slot===slot)
 const savedStates=new Set(['saved','sync-failed','pending-reflection','reviewable','sending','notification-failed','notification-unknown','notified'])
 return{observed:true,tracked:current.length,created:current.filter(item=>Number.isFinite(Date.parse(item.generatedAt??''))||savedStates.has(item.state)).length,
  uncertain:current.filter(item=>['generating','generation-unknown','conflict'].includes(item.state)).length,
  imageWaiting:current.filter(item=>item.state==='generation-failed'&&item.generationReason==='image_deployment_pending'&&!Number.isFinite(Date.parse(item.generatedAt??''))).length,
  notificationUncertain:current.filter(item=>['sending','notification-unknown'].includes(item.state)).length,
  reviewable:current.filter(item=>['reviewable','sending','notification-failed','notification-unknown','notified'].includes(item.state)&&item.serverPublished!==true&&item.certified!==true).length,
  pending:current.filter(item=>item.state!=='notified').length}
}
export function formatIntakeNotice({slot,reason,candidateHolds=[],heldCount=0,deferredCount=0,articleSummary={}}){
 const day=typeof slot==='string'&&/^\d{4}-\d{2}-\d{2}T08:30:00\+09:00$/.test(slot)?slot.slice(0,10):'対象日'
 const summary=articleSummary,created=count(summary.created),tracked=count(summary.tracked),uncertain=count(summary.uncertain)
 const teacher=[],technical=[],duplicates=[],related=[],images=[]
 for(const hold of candidateHolds){
  const id=safeId(hold?.topicId),title=hold?.reason==='protected_topic'?'':safeTitle(hold?.title)
  const label=title?`「${title}」`:'対象のテーマ'
  if(['topic_adoption_missing','topic_adoption_unproven','topic_date_invalid'].includes(hold?.reason))teacher.push({label,id,reason:hold.reason})
  else if(/^image_[a-z_]+$/.test(hold?.reason??''))images.push({label,reason:hold.reason})
  else if(hold?.reason==='duplicate_metadata')duplicates.push(label)
  else if(['metadata_related','precheck_related'].includes(hold?.reason))related.push(label)
  else technical.push({label,reason:technicalReasons.has(hold?.reason)?hold.reason:'other'})
 }
 const imageOnlyWait=summary.observed===true&&created===0&&uncertain===0&&tracked>0&&count(summary.imageWaiting)===tracked
 const result=summary.observed!==true?'記事の作成状況を確認できていません。':created?`記事の本文は${created}件作成済みです。${uncertain?'ほかに作成結果を確認中の記事があります。':count(summary.reviewable)?'先生の確認待ちです。':count(summary.pending)?'管理画面への反映などがまだ完了していません。':''}`:imageOnlyWait?'記事は未完成です。本文はまだ作成していません。':tracked||uncertain?'記事の作成結果を確認中です。完成はまだ確認できていません。':'対象日分の新規記事は作成していません。'
 const action=count(summary.reviewable)?`先生の操作：記事の確認${teacher.length?'とテーマの確認':''}をお願いします。`:teacher.length?'先生の操作：下のテーマを確認してください。':'先生の操作：不要です。'
 const lines=[`ブログ記事（${day}）`,result,action]
 if(count(summary.notificationUncertain))lines.push('通知の送信結果は確認中です。')
 if(images.length){
  const waiting=images.filter(item=>item.reason==='image_deployment_pending'),unconfirmed=images.length-waiting.length
  if(waiting.length){lines.push('',`画像は保存済みですが、サイトへの反映をまだ確認できていません。今回は反映待ちで終了しました。次回の定期処理（月・水・金の8:30）で再確認します。${waiting.length>1?`（${waiting.length}件）`:''}`);for(const item of waiting.slice(0,2))if(item.label!=='対象のテーマ')lines.push(item.label)}
  if(unconfirmed)lines.push('',`画像の生成・確認結果が未確定のため、記事作成を保留しています（${unconfirmed}件）。運用側の確認が必要です。`)
 }
 if(count(summary.reviewable))lines.push('',`記事を確認：${ADMIN}/pending-review`)
 if(teacher.length){
  lines.push('',`確認するテーマ：${teacher.length}件`)
  for(const entry of teacher.slice(0,4)){
   lines.push(entry.label,entry.reason==='topic_date_invalid'?'公開予定の日付を確認できません。「編集」で日付を修正し「保存」してください。':'採用済みであることを確認できません。作成したいテーマなら「編集」を開き、状態を「approved」のまま「保存」してください。不要なら「hold」にして「保存」してください。')
   if(entry.id)lines.push(`${ADMIN}/article-topics?id=${encodeURIComponent(entry.id)}`)
  }
  if(teacher.length>4)lines.push(`ほか${teacher.length-4}件はテーマ一覧で確認できます。`,`${ADMIN}/article-topics`)
 }
 if(technical.length||(!candidateHolds.length&&!['no-due-topic','no-unused-topic'].includes(reason))||count(heldCount)>candidateHolds.length){
  lines.push('','運用側で確認が必要です。先生による採用状態の変更は不要です。')
  for(const entry of technical.slice(0,2))lines.push(`${entry.label}：${entry.reason==='topic_adoption_unavailable'?'採用情報を取得できませんでした。':'記事作成前の確認を完了できませんでした。'}`)
  if(technical.length>2)lines.push(`ほか${technical.length-2}件も運用側の確認対象です。`)
 }
 if(related.length)lines.push('',`内容が重なる可能性：${related.length}件（重複確定ではありません）。運用側で既存記事との違いを確認する必要があります。採用し直す操作は不要です。`)
 const normal=[]
 if(duplicates.length)normal.push(`重複を避けて見送り${duplicates.length}件`)
 if(count(deferredCount))normal.push(`予定日前のため待機${count(deferredCount)}件`)
 if(normal.length)lines.push('',`操作不要：${normal.join('／')}。`)
 if(!tracked&&!teacher.length&&!technical.length&&!images.length&&['no-due-topic','no-unused-topic'].includes(reason))lines.push('今回、作成対象になる新しいテーマはありません。')
 // Fixed links and bounded titles; no body, raw exceptions, or operational IDs.
 return lines.join('\n').slice(0,3800)
}
