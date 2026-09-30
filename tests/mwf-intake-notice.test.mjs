import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
import * as jsx from 'react/jsx-runtime'
import {renderToStaticMarkup} from 'react-dom/server'
import {projectCandidateHold,summarizeSlotArticles,formatIntakeNotice} from '../scripts/lib/mwf-intake-notice.mjs'
const slot='2026-09-30T08:30:00+09:00'
const empty=summarizeSlotArticles([],slot)
const holds=[projectCandidateHold({id:'TOPIC-TEST',title:'合成テーマ'},'topic_adoption_missing'),projectCandidateHold({id:'MONTHLY-TEST',title:'合成の重複テーマ'},'duplicate_metadata')]
test('notice leads with result then exact adoption action and normal duplicate/future skips',()=>{
 const text=formatIntakeNotice({slot,reason:'candidate-holds',candidateHolds:holds,heldCount:2,deferredCount:11,articleSummary:empty})
 assert.match(text,/対象日分の新規記事は作成していません/)
 assert.match(text,/「合成テーマ」（TOPIC-TEST）/)
 assert.match(text,/状態を「approved」のまま「保存」/)
 assert.match(text,/不要なら「hold」/)
 assert.match(text,/https:\/\/aisoukai-media.vercel.app\/admin\/article-topics\?id=TOPIC-TEST/)
 assert.ok(text.indexOf('先生に確認')<text.indexOf('重複を避けて'))
 assert.match(text,/重複を避けて見送り：1件（操作不要）/)
 assert.match(text,/予定日前のため待機：11件（操作不要/)
 assert.doesNotMatch(text,/受付|停止|生成・配信完了|pending-review|topic_adoption|duplicate_metadata/)
})
test('title projection omits protected fields and formatter bounds untrusted inputs',()=>{
 const safe=projectCandidateHold({id:'safe',title:'公開用テーマ',notes:'NOTES_DO_NOT_SEND',body:'BODY_DO_NOT_SEND'},'topic_adoption_missing')
 assert.deepEqual(Object.keys(safe).sort(),['reason','title','topicId'])
 const protectedHold=projectCandidateHold({id:'protected',title:'HIDDEN_TITLE',contains_patient_data:true},'topic_adoption_missing')
 assert.equal(protectedHold.title,'');assert.equal(protectedHold.reason,'protected_topic')
 const text=formatIntakeNotice({slot,candidateHolds:[safe,protectedHold,{topicId:'https://evil.example',title:'https://evil.example',reason:'RAW_EXCEPTION'}],articleSummary:empty})
 assert.doesNotMatch(text,/NOTES_DO_NOT_SEND|BODY_DO_NOT_SEND|HIDDEN_TITLE|evil|RAW_EXCEPTION/)
 const many=Array.from({length:100},(_,i)=>({...holds[0],topicId:`T${i}`,title:'長'.repeat(300)}))
 const bounded=formatIntakeNotice({slot,candidateHolds:many,heldCount:100,articleSummary:empty})
 assert.ok(bounded.length<=3800);assert.match(bounded,/ほか96件/)
})
test('technical faults, dates, related topics and old metadata each have distinct safe handling',()=>{
 const text=formatIntakeNotice({slot,reason:'candidate-holds',candidateHolds:[{topicId:'legacy',reason:'topic_adoption_missing'},{topicId:'network',reason:'topic_adoption_unavailable'},{topicId:'calendar',reason:'topic_date_invalid'},{topicId:'related',reason:'precheck_related'}],articleSummary:empty})
 assert.match(text,/テーマ legacy（タイトル非表示）/)
 assert.match(text,/採用情報を取得できませんでした/)
 assert.match(text,/運用側で確認が必要/)
 assert.match(text,/日付を修正し「保存」/)
 assert.match(text,/重複を避けて見送り：1件/)
 assert.doesNotMatch(text,/pending-review/)
})
test('same-slot saved or uncertain work never becomes a zero-created claim; other days do not inflate today',()=>{
 for(const state of ['saved','sync-failed','pending-reflection','notified','generation-unknown','selected']){
  const summary=summarizeSlotArticles([{slot,state}],slot)
  const text=formatIntakeNotice({slot,reason:'topic-intake-failed',articleSummary:summary})
  assert.doesNotMatch(text,/新規記事は作成していません/)
 }
 const summary=summarizeSlotArticles([{slot:'2026-09-28T08:30:00+09:00',state:'notified'},{slot,state:'selected',generatedAt:'2026-09-30T00:00:00Z'}],slot)
 assert.equal(summary.created,1)
 assert.doesNotMatch(formatIntakeNotice({slot,articleSummary:{}}),/新規記事は作成していません/)
 assert.match(formatIntakeNotice({slot,articleSummary:summarizeSlotArticles([{slot,state:'notified',serverPublished:false}],slot)}),/pending-review/)
 assert.doesNotMatch(formatIntakeNotice({slot,articleSummary:summarizeSlotArticles([{slot,state:'notified',serverPublished:true}],slot)}),/pending-review/)
})
function pageFixture(authenticated=true){
 const rows=Array.from({length:82},(_,i)=>({id:`T${i}`,titleCandidate:`Synthetic title ${i}`,category:'その他',status:'approved',medicalRisk:'low',publishDate:'2026-09-01',discoveredAt:'2026-09-01'}))
 let reads=0
 const modules={'react/jsx-runtime':jsx,'next/navigation':{redirect:location=>{throw Error(`redirect:${location}`)}},'next/link':{default:({children,...props})=>jsx.jsx('a',{...props,children})},'lucide-react':{ArrowLeft:()=>null,FileSpreadsheet:()=>null},'@/lib/adminAuth':{isAdminAuthenticated:async()=>authenticated},'@/lib/articleTopics':{loadAdminArticleTopics:async()=>{reads++;return{ok:true,source:'github_main',data:{topics:rows,summary:{}}}}},'@/lib/articleTopicsGithub':{readGitHubArticleTopicsCsv(){}},'@/lib/seo':{NOINDEX_METADATA:{}},'./ArticleTopicEditControls':{default:()=>null}}
 const exports={}
 new Function('require','exports',ts.transpileModule(readFileSync('src/app/admin/article-topics/page.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText)(name=>{assert.ok(name in modules,name);return modules[name]},exports)
 return{page:exports.default,reads:()=>reads}
}
test('exact id link reaches rows beyond first 80, preserves query in filter, and can be cleared',async()=>{
 const f=pageFixture(),html=renderToStaticMarkup(await f.page({searchParams:Promise.resolve({id:'T0'})}))
 assert.match(html,/Synthetic title 0/);assert.doesNotMatch(html,/Synthetic title 1</)
 assert.match(html,/name="id" value="T0"/);assert.match(html,/href="\/admin\/article-topics"[^>]*>絞り込みを解除/)
 for(const id of ['T','https://evil.example',['T0','T1'],'']){
  const invalid=renderToStaticMarkup(await f.page({searchParams:Promise.resolve({id})}))
  assert.doesNotMatch(invalid,/Synthetic title/)
 }
})
test('unauthenticated exact topic link retains safe returnTo and never loads rows',async()=>{
 const f=pageFixture(false)
 await assert.rejects(f.page({searchParams:Promise.resolve({id:'T0'})}),{message:'redirect:/admin/login?returnTo=%2Fadmin%2Farticle-topics%3Fid%3DT0'})
 await assert.rejects(f.page({searchParams:Promise.resolve({id:'https://evil.example'})}),{message:'redirect:/admin/login'})
 assert.equal(f.reads(),0)
})
