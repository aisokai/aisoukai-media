import test from 'node:test'
import assert from 'node:assert/strict'
import {metadataTopicOverlap} from '../scripts/lib/mwf-topic-overlap.mjs'
const check=(title,existing,extra={})=>metadataTopicOverlap({id:'new',title,category:'その他'},[{metadata:{title:existing,...extra}}]).reason

test('normalized exact titles and recorded source IDs prove metadata duplication',()=>{
 assert.equal(check('ＡＢＣ？！','a b c'),'duplicate_metadata')
 assert.equal(check('New subject','Old subject',{source_topic_id:'new'}),'duplicate_metadata')
 for(const title of ['インプラントのメンテナンスはどれくらい必要？','急な歯の痛みで予約するときに伝えるとよいこと'])assert.equal(check(title,title),'duplicate_metadata')
})
test('bounded lexical triage flags the known changed titles without claiming a duplicate',()=>{
 assert.equal(check('歯科定期検診の頻度と通う目安','歯科定期検診は何ヶ月ごとが目安？受診間隔の考え方'),'metadata_related')
 assert.equal(check('親知らずは抜くべき？相談の目安と判断材料','親知らずは抜くべき？相談の目安とレントゲンで見るポイント'),'metadata_related')
})
test('shared categories, broad subjects and generic medical phrases alone are insufficient',()=>{
 for(const [title,old] of [
  ['予防歯科で定期検診を受けるメリットと検診の内容','歯科定期検診の頻度と通う目安'],
  ['歯科定期検診で確認すること｜むし歯・歯ぐき・噛み合わせのチェック','歯科定期検診の頻度と通う目安'],
  ['定期検診でレントゲンを撮るのはなぜ？見つけやすいトラブル','歯科定期検診の頻度と通う目安'],
  ['歯科定期検診に持参するもの','歯科定期検診の頻度と通う目安'],
  ['親知らずの抜歯後の食事','親知らずは抜くべき？相談の目安と判断材料'],
  ['歯ぐきが腫れた場合の受診の目安','歯がしみた場合の受診の目安'],
  ['デンタルフロスを使う順番','歯ブラシの保管方法'],
 ])assert.equal(check(title,old,{category:'その他'}),null)
})
test('missing or protected metadata fails closed and no raw content is returned',()=>{
 assert.deepEqual(metadataTopicOverlap({id:'new',title:'Synthetic'},[{metadata:null}]),{reason:'comparison_metadata_incomplete'})
 assert.deepEqual(metadataTopicOverlap({id:'new',title:'Synthetic'},[{metadata:{title:'Synthetic',contains_patient_data:true}}]),{reason:'comparison_metadata_incomplete'})
 assert.deepEqual(metadataTopicOverlap({title:'Synthetic',contains_private_message:true},[]),{reason:'protected_topic'})
 assert.deepEqual(metadataTopicOverlap({id:'new',title:'Synthetic'},[]),{reason:null})
})
