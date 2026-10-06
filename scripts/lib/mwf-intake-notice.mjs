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
  reviewable:current.filter(item=>['reviewable','sending','notification-failed','notification-unknown','notified'].includes(item.state)&&item.serverPublished!==true&&item.certified!==true).length,
  pending:current.filter(item=>item.state!=='notified').length}
}
export function formatIntakeNotice({slot,reason,candidateHolds=[],heldCount=0,deferredCount=0,articleSummary={}}){
 const day=typeof slot==='string'&&/^\d{4}-\d{2}-\d{2}T08:30:00\+09:00$/.test(slot)?slot.slice(0,10):'対象日'
 const summary=articleSummary,created=count(summary.created),tracked=count(summary.tracked),uncertain=count(summary.uncertain)
 const result=summary.observed!==true?'対象日分の記事の作成状況を確認しています。':created?`対象日分の記事は${created}件作成済みです。${count(summary.pending)?'確認・反映・通知が済んでいない記事があります。':''}`:tracked||uncertain?'対象日分に処理中または結果確認中の記事があります。作成件数はまだ確定していません。':'対象日分の新規記事は作成していません。'
 const lines=[`ブログ記事の作成結果（${day}）`,result]
 const teacher=[],technical=[],duplicates=[],related=[]
 for(const hold of candidateHolds){
  const id=safeId(hold?.topicId),title=hold?.reason==='protected_topic'?'':safeTitle(hold?.title)
  const label=title?`「${title}」${id?`（${id}）`:''}`:id?`テーマ ${id}（タイトル非表示）`:'タイトル非表示のテーマ'
  if(['topic_adoption_missing','topic_adoption_unproven','topic_date_invalid'].includes(hold?.reason))teacher.push({label,id,reason:hold.reason})
  else if(hold?.reason==='duplicate_metadata')duplicates.push(label)
  else if(['metadata_related','precheck_related'].includes(hold?.reason))related.push(label)
  else technical.push({label,reason:technicalReasons.has(hold?.reason)?hold.reason:'other'})
 }
 if(teacher.length){
  lines.push('',`先生に確認をお願いしたいテーマ：${teacher.length}件`)
  for(const entry of teacher.slice(0,4)){
   lines.push(entry.label,entry.reason==='topic_date_invalid'?'公開予定の日付を確認できません。「編集」で日付を修正し「保存」してください。':'採用済みであることを確認できません。作成したいテーマなら「編集」を開き、状態を「approved」のまま「保存」してください。不要なら「hold」にして「保存」してください。')
   if(entry.id)lines.push(`${ADMIN}/article-topics?id=${encodeURIComponent(entry.id)}`)
  }
  if(teacher.length>4)lines.push(`ほか${teacher.length-4}件は採用CSVで確認できます。`,`${ADMIN}/article-topics`)
 }
 if(technical.length||(!candidateHolds.length&&!['no-due-topic','no-unused-topic'].includes(reason))||count(heldCount)>candidateHolds.length){
  lines.push('','運用側で確認が必要です。先生による採用状態の変更は不要です。')
  for(const entry of technical.slice(0,2))lines.push(`${entry.label}：${entry.reason==='topic_adoption_unavailable'?'採用情報を取得できませんでした。':'記事作成前の確認を完了できませんでした。'}`)
  if(technical.length>2)lines.push(`ほか${technical.length-2}件も運用側の確認対象です。`)
 }
 if(duplicates.length){lines.push('',`重複を避けて見送り：${duplicates.length}件（操作不要）`);lines.push(...duplicates.slice(0,2));if(duplicates.length>2)lines.push(`ほか${duplicates.length-2}件`)}
 if(related.length){lines.push('',`内容が重なる可能性があるため確認待ち：${related.length}件（重複確定ではありません）`,'運用側で既存記事との違いを確認する必要があります。採用し直す操作は不要です。');lines.push(...related.slice(0,2));if(related.length>2)lines.push(`ほか${related.length-2}件`)}
 if(count(deferredCount))lines.push('',`予定日前のため待機：${count(deferredCount)}件（操作不要。予定日以降の対象になります）`)
 if(!teacher.length&&!technical.length&&['no-due-topic','no-unused-topic'].includes(reason))lines.push('今回、作成対象になる新しいテーマはありません。')
 if(candidateHolds.length>0&&!teacher.length&&!technical.length&&duplicates.length+related.length===candidateHolds.length)lines.push('今回の候補から新規作成へ進めるテーマはありません。')
 if(count(summary.reviewable))lines.push('',`作成済みの記事を確認：${ADMIN}/pending-review`)
 // Fixed sections and item/title caps keep the complete message below Telegram's limit.
 return lines.join('\n').slice(0,3800)
}
