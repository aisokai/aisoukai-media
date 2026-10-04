import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {selectFreshTopics,validateCandidateMonth} from '../scripts/lib/monthly-topic-generation.mjs'
import {generateMonthlyCandidates,TOPIC_BANK} from '../scripts/generate-monthly-topic-candidates.mjs'
const freshRoot=()=>mkdtempSync(join(tmpdir(),'monthly-synthetic-'))
const bank=title=>['その他',title,'key','intent','low']
test('normalized history across all statuses and articles excludes exact titles without filler',()=>{
 const result=selectFreshTopics([bank('ＡＢＣ？！'),bank('Article'),bank('Fresh'),bank('Ｆｒｅｓｈ'),bank('患者ID 123')],{historyTitles:['a b c'],articleTitles:['ARTICLE!'],limit:5})
 assert.deepEqual(result.topics.map(t=>t[1]),['Fresh']);assert.equal(result.shortage,4)
})
test('generation validates month and preserves existing human selections byte-for-byte',()=>{
 for(const month of ['2026-00','2026-13','0000-01','2026-1','../2026-01'])assert.throws(()=>validateCandidateMonth(month))
 validateCandidateMonth('2026-12')
 const root=freshRoot(),dir=join(root,'data/monthly-topic-candidates');mkdirSync(dir,{recursive:true})
 const existing='{"month":"2026-11","topics":[{"status":"selected"},{"status":"rejected"}]}\n'
 writeFileSync(join(dir,'2026-11.json'),existing)
 assert.throws(()=>generateMonthlyCandidates({root,month:'2026-11',yes:true,log:()=>{}}),/上書き/)
 assert.equal(readFileSync(join(dir,'2026-11.json'),'utf8'),existing)
})
test('prior month stock exhaustion reports shortage and saves no output; future history is not prior history',()=>{
 const root=freshRoot(),dir=join(root,'data/monthly-topic-candidates');mkdirSync(dir,{recursive:true})
 const previous={month:'2026-10',topics:TOPIC_BANK.map((entry,i)=>({title:entry[1],status:['selected','rejected','hold','pending'][i%4]}))}
 writeFileSync(join(dir,'2026-10.json'),JSON.stringify(previous));const before=readFileSync(join(dir,'2026-10.json'))
 const messages=[];const result=generateMonthlyCandidates({root,month:'2026-11',yes:true,log:v=>messages.push(v)})
 assert.deepEqual(result,{saved:false,shortage:24,candidateCount:0});assert.match(messages.join('\n'),/24件不足/)
 assert.equal(existsSync(join(dir,'2026-11.json')),false);assert.deepEqual(readFileSync(join(dir,'2026-10.json')),before)
 const earlier=generateMonthlyCandidates({root,month:'2026-09',yes:true,log:()=>{}})
 assert.equal(earlier.saved,true)
 const output=JSON.parse(readFileSync(join(dir,'2026-09.json'),'utf8'));assert.equal(output.topics.length,24);assert.ok(output.topics.every(t=>t.status==='pending'))
})
test('article comparison extracts public frontmatter only and never propagates opaque fields or body',()=>{
 const root=freshRoot(),posts=join(root,'content/posts');mkdirSync(posts,{recursive:true})
 writeFileSync(join(posts,'synthetic.md'),`---\ntitle: ${JSON.stringify(TOPIC_BANK[0][1])}\nexcerpt: Synthetic\ncategory: その他\nprivate_field: OPAQUE_SENTINEL\n---\nBODY_SENTINEL\n`)
 const logs=[];const result=generateMonthlyCandidates({root,month:'2026-11',yes:true,log:v=>logs.push(v)})
 assert.equal(result.shortage,1);assert.equal(result.saved,false);assert.doesNotMatch(logs.join('\n'),/OPAQUE_SENTINEL|BODY_SENTINEL/)
 assert.equal(existsSync(join(root,'data/monthly-topic-candidates/2026-11.json')),false)
})
test('malformed or protected history fails closed without output',()=>{
 for(const topic of [{title:'Synthetic',contains_patient_data:true},{title:null}]){
  const root=freshRoot(),dir=join(root,'data/monthly-topic-candidates');mkdirSync(dir,{recursive:true});writeFileSync(join(dir,'2026-10.json'),JSON.stringify({month:'2026-10',topics:[topic]}))
  assert.throws(()=>generateMonthlyCandidates({root,month:'2026-11',yes:true,log:()=>{}}),/candidate_history_unavailable/)
  assert.equal(existsSync(join(dir,'2026-11.json')),false)
 }
})
