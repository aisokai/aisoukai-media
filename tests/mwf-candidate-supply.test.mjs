import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {issueTopicAdoption} from '../src/lib/tieredPublication.mjs'
import {TOPIC_CSV_COLUMNS} from '../src/lib/selectedTopicAdoptions.mjs'
import {createCandidateSupply,validateSuggestions} from '../scripts/lib/mwf-candidate-supply.mjs'
const suggestion=title=>({title,category:'予防歯科',targetKeyword:'予防',searchIntent:'一般的なケアを知りたい',recommendedReason:'一般向けの健康情報',medicalRisk:'low'})
function setup({unknown=false,notifyUnknown=false,race=false,patchUnknown=false,reserved=[],receiptFailure=false,comparisonTitles=['既存採用']}={}){
 const root=mkdtempSync(join(tmpdir(),'candidate-supply-test-')),files=new Map(),calls=[],blobs=new Map();let head='a'.repeat(40),tree=[],paid=0,notices=0
 const old={month:'2026-10',candidateCount:2,targetPostCount:12,cadence:'MWF',topics:[{id:'2026-10-topic-001',title:'既存採用',status:'selected',reviewerNote:'preserve'},{id:'2026-10-topic-002',title:'既存却下',status:'rejected'}]}
 files.set('data/monthly-topic-candidates/2026-10.json',JSON.stringify(old))
 files.set('data/monthly-topic-candidates/2026-11.json',JSON.stringify({month:'2026-11',topics:['朝のケア習慣','旅行時の携帯用品','歯科受診の準備物'].map((title,i)=>({id:`2026-11-topic-00${i+1}`,title,status:'pending'}))}))
 files.set('data/article-topics.sample.csv','id,title,status\nold,既存採用,approved\n')
 const github=(method,path,body)=>{
  calls.push({method,path,body})
  if(path==='git/ref/heads/main')return{object:{sha:head}}
  if(receiptFailure&&path.startsWith('contents/data/topic-adoptions/'))throw Error('synthetic unavailable');
  if(method==='GET'&&path.startsWith('contents/')){assert.match(path,new RegExp(`ref=${head}$`));const p=path.slice(9).split('?')[0];if(p==='data/monthly-topic-candidates')return[...files.keys()].filter(f=>f.startsWith(p+'/')).map(path=>({type:'file',path}));if(!files.has(p))throw Object.assign(Error('missing'),{code:'NOT_FOUND'});return{encoding:'base64',content:Buffer.from(files.get(p)).toString('base64')}}
  if(path.startsWith('git/commits/')&&method==='GET')return{tree:{sha:'c'.repeat(40)}}
  if(path==='git/blobs'){const sha=String(blobs.size+1).padStart(40,'0');blobs.set(sha,body.content);return{sha}}
  if(path==='git/trees'){tree=body.tree;return{sha:'d'.repeat(40)}}
  if(path==='git/commits'){assert.deepEqual(body.parents,[head]);if(race){head='f'.repeat(40);race=false;}return{sha:'b'.repeat(40)}}
  if(path==='git/refs/heads/main'){assert.equal(body.force,false);head=body.sha;for(const item of tree)files.set(item.path,blobs.get(item.sha));if(patchUnknown)throw Error('lost response');return{object:{sha:head}}}
  throw Error(`unexpected ${method} ${path}`)
 }
 const run=createCandidateSupply({root,github,enabled:true,now:()=>new Date('2026-10-07T01:00:00Z'),reservedTopicIds:()=>reserved,comparisons:async ref=>{assert.equal(ref,head);return{entries:comparisonTitles.map(title=>({metadata:{title}}))}},request:async(url,options)=>{paid++;assert.equal(url,'https://api.openai.com/v1/chat/completions');assert.doesNotMatch(options.body,/preserve/);if(unknown)throw Error('uncertain');return{ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify({topics:['歯ブラシの保管方法','寝る前の飲み物選び','歯間ブラシのサイズ選び'].map(suggestion)})}}]})}},notify:async value=>{notices++;assert.match(value.url,/month=2026-10&status=pending$/);assert.ok(JSON.parse(files.get('data/monthly-topic-candidates/2026-10.json')).topics.length>2);return{status:notifyUnknown?'unknown':'sent'}}})
 return{run,files,old,calls,paid:()=>paid,notices:()=>notices,laterCommit:()=>{head='e'.repeat(40)}}
}
test('fresh pending supply preserves every prior selection/rejection and notifies after verified commit once',async()=>{
 const f=setup(),result=await f.run();assert.equal(result.status,'notified');assert.equal(result.count,3)
 const saved=JSON.parse(f.files.get('data/monthly-topic-candidates/2026-10.json'))
 assert.deepEqual(saved.topics.slice(0,2),f.old.topics);assert.ok(saved.topics.slice(2).every(t=>t.status==='pending'));assert.equal(saved.topics[2].id,'2026-10-topic-003')
 assert.equal(f.calls.some(c=>c.path.includes('topic-adoptions')),false)
 assert.equal((await f.run()).status,'stock-ready');assert.equal(f.paid(),1);assert.equal(f.notices(),1)
})
test('ambiguous paid request and ambiguous notification are never automatically repeated',async()=>{
 const f=setup({unknown:true});assert.equal((await f.run()).status,'unknown');assert.equal((await f.run()).status,'unknown');assert.equal(f.paid(),1);assert.equal(f.notices(),0)
 const sent=setup({notifyUnknown:true});assert.equal((await sent.run()).status,'notification-unknown');assert.equal((await sent.run()).status,'notification-unknown');assert.equal(sent.paid(),1);assert.equal(sent.notices(),1)
})
test('remote divergence never overwrites while a lost PATCH response is reconciled read-only',async()=>{
 const f=setup({race:true});assert.equal((await f.run()).status,'attention');assert.deepEqual(JSON.parse(f.files.get('data/monthly-topic-candidates/2026-10.json')),f.old);assert.equal(f.notices(),0);assert.equal(f.calls.some(c=>c.method==='PATCH'),false)
 const recovered=setup({patchUnknown:true});assert.equal((await recovered.run()).status,'attention');assert.equal((await recovered.run()).status,'notified');assert.equal(recovered.paid(),1);assert.equal(recovered.calls.filter(c=>c.method==='PATCH').length,1)
})
test('strict suggestion validation rejects unsafe/extra fields and filters overlap without padding',()=>{
 const title='歯科定期検診の頻度と通う目安',history=[{metadata:{title:'歯科定期検診は何ヶ月ごとが目安？受診間隔の考え方'}}]
 assert.deepEqual(validateSuggestions({topics:[suggestion(title)]},history),[])
 for(const topics of [[{...suggestion('Synthetic'),status:'selected'}],[suggestion('患者ID 123')],[suggestion('https://example.com')],Array.from({length:7},()=>suggestion('Synthetic'))])assert.throws(()=>validateSuggestions({topics},[]))
})

test('ready suggestions rebase append-only after a race; committed suggestions survive later Human decisions',async()=>{
 const f=setup({race:true});assert.equal((await f.run()).status,'attention');
 const path='data/monthly-topic-candidates/2026-10.json',latest=JSON.parse(f.files.get(path));latest.topics[0].reviewerNote='later human note';latest.topics.push({id:'2026-10-topic-003',title:'別の保存済みテーマ',status:'hold'});f.files.set(path,JSON.stringify(latest));
 assert.equal((await f.run()).status,'notified');const saved=JSON.parse(f.files.get(path));assert.deepEqual(saved.topics.slice(0,3),latest.topics);assert.equal(saved.topics[3].id,'2026-10-topic-004');assert.equal(f.paid(),1);
 const recovered=setup({patchUnknown:true});await recovered.run();const changed=JSON.parse(recovered.files.get(path));changed.topics[2].status='selected';changed.topics[2].reviewerNote='Teacher adopted';recovered.files.set(path,JSON.stringify(changed));recovered.laterCommit();assert.equal((await recovered.run()).status,'notified');assert.equal(recovered.paid(),1);assert.equal(recovered.calls.filter(c=>c.method==='PATCH').length,1);
})

function reserveSavedThemes(f){
 const path='data/monthly-topic-candidates/2026-10.json',file=JSON.parse(f.files.get(path)),rows=[];
 for(const topic of file.topics.slice(2)){
  topic.status='selected';const id=`MONTHLY-${topic.id.replaceAll('-','').toUpperCase()}`;
  const row={id,discovered_at:'2026-10-07',source_type:topic.sourceType,source_url:'',topic:topic.title,title_candidate:topic.title,category:topic.category,target_keyword:topic.targetKeyword,patient_intent:topic.searchIntent,priority:topic.priority,medical_risk:topic.medicalRisk,status:'approved',publish_date:topic.recommendedPublishDate,notes:'月次ネタ候補 2026-10 / MWF 月曜・水曜・金曜の週3投稿枠'};rows.push(row);
  f.files.set(`data/topic-adoptions/${id}.json`,JSON.stringify(issueTopicAdoption(row,'synthetic-secret','2026-10-07T01:00:00Z')));
 }
 f.files.set(path,JSON.stringify(file));
 const writeRows=()=>f.files.set('data/article-topics.sample.csv',TOPIC_CSV_COLUMNS.join(',')+'\n'+rows.map(row=>TOPIC_CSV_COLUMNS.map(key=>JSON.stringify(row[key]??'')).join(',')).join('\n')+'\n');writeRows();return{file,rows,writeRows};
}
test('self CSV matches reserve selected stock only for additional spending and prevent re-supply after adoption',async()=>{
 const f=setup();await f.run();const {rows}=reserveSavedThemes(f);
 const counts={paid:f.paid(),notices:f.notices(),patches:f.calls.filter(call=>call.method==='PATCH').length};
 assert.equal((await f.run()).status,'stock-ready');assert.deepEqual({paid:f.paid(),notices:f.notices(),patches:f.calls.filter(call=>call.method==='PATCH').length},counts);
 const receiptPath=`data/topic-adoptions/${rows[0].id}.json`,receipt=JSON.parse(f.files.get(receiptPath));receipt.signature='f'.repeat(64);f.files.set(receiptPath,JSON.stringify(receipt));
 // This local reservation does not claim HMAC verification or authorize creation.
 assert.equal((await f.run()).status,'stock-ready');assert.equal(f.paid(),1);assert.equal(f.calls.some(call=>call.path.includes('mwf/requests')),false);
})
test('old selected without receipts do not reserve; used topics and other-ID duplicates remain excluded',async()=>{
 for(const kind of ['missing','used','other-id','article','other-month','consumed']){
  const reserved=[],comparisonTitles=['既存採用'],f=setup({reserved,comparisonTitles});await f.run();const {rows,writeRows}=reserveSavedThemes(f);
  if(kind==='missing'){for(const row of rows)f.files.delete(`data/topic-adoptions/${row.id}.json`);rows[0].medical_risk='high';writeRows();}
  if(kind==='used')reserved.push(rows[0].id);
  if(kind==='other-id'){rows.push({...rows[0],id:'OTHER-TOPIC'});writeRows();}
  if(kind==='article')comparisonTitles.push(rows[0].title_candidate);
  if(kind==='other-month'){const path='data/monthly-topic-candidates/2026-09.json';f.files.set(path,JSON.stringify({month:'2026-09',topics:[{id:'2026-09-topic-001',title:rows[0].title_candidate,status:'rejected'}]}));}
  if(kind==='consumed'){rows[0].status='consumed';writeRows();}
  assert.notEqual((await f.run()).status,'stock-ready',kind);assert.equal(f.paid(),2,kind);
 }
})
test('receipt errors, invalid binding, mismatched semantics, and duplicate IDs stop additional paid supply',async()=>{
 for(const kind of ['malformed','wrong-version','wrong-purpose','risk','date','duplicate-csv','duplicate-candidate']){
  const f=setup();await f.run();const {file,rows,writeRows}=reserveSavedThemes(f),path=`data/topic-adoptions/${rows[0].id}.json`;
  if(kind==='malformed')f.files.set(path,'{');
  if(kind==='wrong-version'||kind==='wrong-purpose'){const receipt=JSON.parse(f.files.get(path));if(kind==='wrong-version')receipt.payload.topicVersion='0'.repeat(64);else receipt.purpose='wrong';f.files.set(path,JSON.stringify(receipt));}
  if(kind==='risk'){rows[0].medical_risk='high';writeRows();}
  if(kind==='date'){rows[0].publish_date='2026-10-09';writeRows();}
  if(kind==='duplicate-csv'){rows.push({...rows[0]});writeRows();}
  if(kind==='duplicate-candidate'){file.topics.push({...file.topics[2]});f.files.set('data/monthly-topic-candidates/2026-10.json',JSON.stringify(file));}
  assert.equal((await f.run()).status,'stock-unverified',kind);assert.equal(f.paid(),1,kind);assert.equal(f.notices(),1,kind);
 }
 const f=setup({receiptFailure:true});await f.run();reserveSavedThemes(f);assert.equal((await f.run()).status,'stock-unverified');assert.equal(f.paid(),1);
})

test('five selected reservations with one already in delivery retain four and do not buy another batch',async()=>{
 const reserved=[],f=setup({reserved});await f.run();const path='data/monthly-topic-candidates/2026-10.json',file=JSON.parse(f.files.get(path));
 file.topics.push(...['舌ブラシの保管場所','義歯ブラシのお手入れ'].map((title,index)=>({...file.topics[2],id:`2026-10-topic-00${index+6}`,title})));
 file.candidateCount=file.topics.length;f.files.set(path,JSON.stringify(file));const {rows}=reserveSavedThemes(f);reserved.push(rows[0].id);
 assert.equal(rows.length,5);assert.equal((await f.run()).status,'stock-ready');assert.equal(f.paid(),1);assert.equal(f.notices(),1);
})
