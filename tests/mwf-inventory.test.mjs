import test from 'node:test'
import assert from 'node:assert/strict'
import {extractEditorialMetadata,metadataEntry,createInventory,verifyInventory,inventoryHash,comparisonSet,reviewCandidate,verifyCandidateReceipt} from '../scripts/lib/mwf-inventory.mjs'
import {issueTopicAdoption} from '../src/lib/tieredPublication.mjs'
import {prepareMetadataInventory} from '../scripts/mwf-inventory-metadata.mjs'
const secret='synthetic-only',path='content/posts/2026-09-14-old.md'
const raw=Buffer.from('---\ntitle: "Old"\nexcerpt: "Public summary"\ncategory: "その他"\nprivate_request: "DO_NOT_EXPORT"\n---\nDO_NOT_PARSE_BODY')
const head={url:'https://aisoukai-media.vercel.app/blog/2026-09-14-old',title:'Old',description:'Public summary'}
function input(){const blob=inventoryHash(raw),preservation={schema:1,reconciled:false,entries:[{path,blob}]},reconciliation={schema:1,reconciled:false,canonicalRevision:'a'.repeat(40),entries:[{path,blob,canonicalBlob:blob}],unidentifiedTopics:[path],usedTopicIds:[]};return{preservation,reconciliation,preservationBytes:Buffer.from(JSON.stringify(preservation)),reconciliationBytes:Buffer.from(JSON.stringify(reconciliation)),entries:[metadataEntry({path,raw,source:'canonical',quarantine:true,head})],secret}}
test('only allowlisted scalar metadata is extracted; private fields/body never enter result',()=>{assert.deepEqual(extractEditorialMetadata(raw),{title:'Old',excerpt:'Public summary',category:'その他'});assert.equal(JSON.stringify(input().entries).includes('DO_NOT'),false);for(const prefix of ['private_request: "','very_long_private_request_key_over_32: "','private_request: ['])assert.equal(extractEditorialMetadata(Buffer.from(`---\n${prefix}\ntitle: private\nexcerpt: private\ncategory: private\n"\n---`)),null)})
test('complete separate schema2 evidence retains unresolved quarantine and rejects unsigned use/missing originals',()=>{const i=input(),signed=createInventory(i);assert.deepEqual(verifyInventory(signed,secret).quarantine,[path]);assert.equal(verifyInventory(createInventory({...i,prepareOnly:true}),secret),null);assert.throws(()=>createInventory({...i,entries:[]}),/incomplete/);assert.equal(metadataEntry({path,raw,source:'canonical',quarantine:true,head:{...head,title:'Wrong'}}).metadata,null)})
test('prepare-only binds actual public head fields to fixed revision without signing or approving',async()=>{const i=input();let calls=0;const result=await prepareMetadataInventory({...i,readLocal:async()=>raw,github:async(p,revision)=>{assert.equal(revision,'a'.repeat(40));return p==='content/posts'?[{path,type:'file'}]:raw},readHead:async()=>{calls++;return head}});assert.equal(result.unsigned,true);assert.equal(calls,1);assert.equal(result.payload.entries.length,1)})
test('independent candidate evidence covers quarantine/local records and invalidates after topic or comparison changes',async()=>{const topic={id:'new',title:'Different',status:'approved'},adoption=issueTopicAdoption(topic,secret);const set=comparisonSet([...input().entries,metadataEntry({path:'content/posts/2026-09-14-local.md',raw:Buffer.from(raw.toString().replace('Old','Local')),source:'local'})]);let calls=0;const request=async(_url,options)=>{calls++;const body=JSON.parse(options.body);assert.equal(body.model,'gpt-6-luna');assert.equal(body.reasoning_effort,'low');assert.equal(body.response_format.type,'json_object');assert.equal(JSON.stringify(body).includes('DO_NOT'),false);assert.equal(JSON.parse(body.messages[1].content).comparisons.length,2);return{ok:true,json:async()=>({id:'independent-1',choices:[{finish_reason:'stop',message:{content:'{"decision":"clear"}'}}]})}};const result=await reviewCandidate({topic,set,adoption,request,secret});assert.equal(result.status,'clear');assert.equal(calls,1);assert.equal(verifyCandidateReceipt(result.receipt,topic,set,secret),true);assert.equal(verifyCandidateReceipt(result.receipt,{...topic,title:'Changed'},set,secret),false);assert.equal(verifyCandidateReceipt(result.receipt,topic,comparisonSet([]),secret),false)})
test('missing adoption, incomplete comparison or related/ambiguous decisions never clear',async()=>{const topic={id:'new',title:'Different',status:'approved'},set=comparisonSet(input().entries),adoption=issueTopicAdoption(topic,secret);let calls=0;const request=async()=>{calls++;return{ok:true,json:async()=>({id:'independent',choices:[{finish_reason:'stop',message:{content:'{"decision":"related"}'}}]})}};assert.equal((await reviewCandidate({topic,set,request,secret})).status,'hold');assert.equal(calls,0);assert.equal((await reviewCandidate({topic,set:comparisonSet([{metadata:null}]),adoption,request,secret})).reason,'comparison_metadata_incomplete');assert.equal((await reviewCandidate({topic,set,adoption,request,secret})).reason,'related')})

test('ordinary single-line empty tags and balanced unknown flow values are safely skipped',()=>{const value=Buffer.from(raw.toString().replace('---\n','---\ntags: []\nunknown: {x: ["private", "opaque"]}\n'));assert.equal(extractEditorialMetadata(value).title,'Old');assert.equal(JSON.stringify(extractEditorialMetadata(value)).includes('opaque'),false)})

test('private sequence quoted scalar and quoted-key continuation cannot masquerade as public metadata',()=>{for(const prefix of ['private_request:\n  - "','"private:request": "']){const value=Buffer.from(`---\n${prefix}\ntitle: Synthetic private\nexcerpt: Synthetic private\ncategory: Synthetic private\n"\n---`);assert.equal(extractEditorialMetadata(value),null)}})

test('private sequence and quoted-key multiline flow mappings never expose their nested fields',()=>{for(const prefix of ['private_request:\n  - {','"private:request": {'])assert.equal(extractEditorialMetadata(Buffer.from(`---\n${prefix}\ntitle: Synthetic private,\nexcerpt: Synthetic private,\ncategory: Synthetic private\n}\n---`)),null)})

test('opaque private/body bytes are never UTF8-decoded, including all continuation regressions',()=>{
 const sentinel=Buffer.from('PRIVATE_DECODE_SENTINEL'),body=Buffer.from('BODY_DECODE_SENTINEL')
 const samples=[Buffer.from('---\ntitle: Public\nexcerpt: Public\ncategory: その他\nprivate_request: "PRIVATE_DECODE_SENTINEL"\n---\nBODY_DECODE_SENTINEL'),...['private_request: "','private_request:\n  - "','"private:request": "','private_request:\n  - {','"private:request": {'].map(prefix=>Buffer.from(`---\n${prefix}\ntitle: PRIVATE_DECODE_SENTINEL\nexcerpt: PRIVATE_DECODE_SENTINEL\ncategory: PRIVATE_DECODE_SENTINEL\n"\n}\n---\nBODY_DECODE_SENTINEL`))]
 const original=Buffer.prototype.toString;let violations=0
 Buffer.prototype.toString=function(encoding,...args){if((encoding===undefined||/^utf-?8$/i.test(encoding))&&(this.includes(sentinel)||this.includes(body)))violations++;return original.call(this,encoding,...args)}
 try{for(const value of samples){extractEditorialMetadata(value);inventoryHash(value)}assert.equal(violations,0)}finally{Buffer.prototype.toString=original}
})

test('opaque multiline flow warnings and nested mappings preserve only public metadata',()=>{
 for(const warning of [
  'generation_warnings: ["Synthetic warning with\n  a continued quotation", "other"]',
  'generation_warnings: [\n  {label: "Synthetic", values: ["one",\n    "two"]}\n]',
  'generation_warnings:\n  - "Synthetic warning with\n    continued quotation"',
 ]){
  const value=Buffer.from(raw.toString().replace('private_request: "DO_NOT_EXPORT"',warning))
  assert.deepEqual(extractEditorialMetadata(value),{title:'Old',excerpt:'Public summary',category:'その他'})
 }
})
test('folded/literal opaque scalars ignore quotes, flow punctuation and key-like text',()=>{
 for(const indicator of ['>-','|','|+','>2-']){
  const value=Buffer.from(`---\ngeneration_warnings:\n  - ${indicator}\n    Synthetic "unclosed quotation [ {\n    title: PRIVATE_DECODE_SENTINEL\n    sensitive_data: PRIVATE_DECODE_SENTINEL\n    closing quotation" ] }\ntitle: Public\nexcerpt: Public\ncategory: その他\n---\nBODY_DECODE_SENTINEL`)
  assert.deepEqual(extractEditorialMetadata(value),{title:'Public',excerpt:'Public',category:'その他'})
 }
})
test('opaque continuations cannot turn fake root keys into public metadata or hide real protected keys',()=>{
 for(const start of ['generation_warnings: ["Synthetic','generation_warnings: {value: "Synthetic','generation_warnings: "Synthetic']){
  for(const key of ['title','sensitive_data'])assert.equal(extractEditorialMetadata(Buffer.from(`---\ntitle: Public\nexcerpt: Public\ncategory: その他\n${start}\n${key}: opaque\n  "]}\n---`)),null)
 }
 for(const field of ['sensitive_data','contains_patient_data','contains_private_message','data_sensitivity'])assert.equal(extractEditorialMetadata(Buffer.from(`---\ngeneration_warnings: >-\n  Opaque "unbalanced\n${field}: true\ntitle: Public\nexcerpt: Public\ncategory: その他\n---`)),null)
 for(const malformed of ['generation_warnings: ["unfinished\n  still unfinished','generation_warnings: ["closed"\n  }','generation_warnings: ["closed"\n  ] extra [','generation_warnings: >--','generation_warnings: >-\n    text\n  invalid dedent'])assert.equal(extractEditorialMetadata(Buffer.from(`---\ntitle: Public\nexcerpt: Public\ncategory: その他\n${malformed}\n---`)),null)
})
test('successful opaque multiline metadata extraction does not UTF8-decode warning or body bytes',()=>{
 const sentinel=Buffer.from('PRIVATE_DECODE_SENTINEL'),body=Buffer.from('BODY_DECODE_SENTINEL'),original=Buffer.prototype.toString;let violations=0
 const fixtures=['generation_warnings: ["PRIVATE_DECODE_SENTINEL\n  continued"]','generation_warnings:\n  - >-\n    PRIVATE_DECODE_SENTINEL "\n    title: opaque\n    "']
 Buffer.prototype.toString=function(encoding,...args){if((encoding===undefined||/^utf-?8$/i.test(encoding))&&(this.includes(sentinel)||this.includes(body)))violations++;return original.call(this,encoding,...args)}
 try{for(const warning of fixtures)assert.equal(extractEditorialMetadata(Buffer.from(`---\n${warning}\ntitle: Public\nexcerpt: Public\ncategory: その他\n---\nBODY_DECODE_SENTINEL`)).title,'Public');assert.equal(violations,0)}finally{Buffer.prototype.toString=original}
})

// Folded `>-` title/excerpt (the form gray-matter/js-yaml writes for long strings). Synthetic data only.
const foldedDoc=(middle,tail='category: その他\n')=>Buffer.from(`---\n${middle}${tail}---\nBODY_DECODE_SENTINEL`)
test('simple folded >- title and excerpt are decoded as single-space joined lines',()=>{
 assert.deepEqual(extractEditorialMetadata(foldedDoc('title: Public\nexcerpt: >-\n  Synthetic one line\n')),{title:'Public',excerpt:'Synthetic one line',category:'その他'})
 assert.deepEqual(extractEditorialMetadata(foldedDoc('title: >-\n    架空の長い題名の前半\n    架空の題名の後半\nexcerpt: >-\n  Synthetic first\n  second: with "quote [ {\n  # third\nimage: /images/synthetic.webp\n')),{title:'架空の長い題名の前半 架空の題名の後半',excerpt:'Synthetic first second: with "quote [ { # third',category:'その他'})
 assert.equal(extractEditorialMetadata(Buffer.from('---\r\ntitle: Public\r\nexcerpt: >-\r\n  Synthetic\r\n  crlf\r\ncategory: Other\r\n---\r\n')).excerpt,'Synthetic crlf')
 const entry=metadataEntry({path:'content/posts/2026-09-14-folded.md',raw:foldedDoc('title: Public\nexcerpt: >-\n  Synthetic folded\n  summary\nsource_topic_id: synthetic-1\n'),source:'canonical'})
 assert.deepEqual(entry.metadata,{title:'Public',excerpt:'Synthetic folded summary',source_topic_id:'synthetic-1',category:'その他'})
})
test('folded continuation text never becomes a root key and real protected keys still reject',()=>{
 assert.deepEqual(extractEditorialMetadata(foldedDoc('excerpt: >-\n  Synthetic start\n  title: 偽\n  sensitive_data: true\n  category: 偽\ntitle: Public\n')),{excerpt:'Synthetic start title: 偽 sensitive_data: true category: 偽',title:'Public',category:'その他'})
 assert.equal(extractEditorialMetadata(foldedDoc('title: Public\nexcerpt: >-\n  Synthetic\nsensitive_data: true\n')),null)
 assert.equal(extractEditorialMetadata(foldedDoc('title: Public\nexcerpt: >-\n  Synthetic\n','')),null)
})
test('every non-simple block scalar form of a public key fails closed',()=>{
 const reject=(middle,label=middle)=>assert.equal(extractEditorialMetadata(foldedDoc(`title: Public\n${middle}`)),null,JSON.stringify(label))
 for(const indicator of ['>','>+','|','|-','|+','>2-','>-2','>- ','>- # note','>-x',' >-','>--'])reject(`excerpt: ${indicator}\n  Synthetic text\n`)
 reject('excerpt:  >-\n  Synthetic text\n');reject('excerpt:>-\n  Synthetic text\n')
 reject('excerpt: >-\n','no continuation');reject('excerpt: >-\n\n  Synthetic\n','leading blank');reject('excerpt: >-\n  Synthetic\n\n  more\n','inner blank');reject('excerpt: >-\n  Synthetic\n\n','trailing blank');reject('excerpt: >-\n  Synthetic\n  \n  more\n','whitespace-only line');reject('excerpt: >-\n  Synthetic\n   \n','deeper whitespace-only line')
 reject('excerpt: >-\n  Synthetic\n    deeper\n','deeper');reject('excerpt: >-\n    Synthetic\n  shallower\n','shallower');reject('excerpt: >-\n\tSynthetic\n','tab indent');reject('excerpt: >-\n  Synthetic\n\tmore\n','later tab indent');reject('excerpt: >-\n  \tSynthetic\n','tab after indent');reject('excerpt: >-\n  Synthetic\tmore\n','inner tab')
 reject('excerpt: >-\n  Synthetic \n  more\n','trailing space');reject('excerpt: >-\n  Synthetic\n  more \n','final trailing space');reject('excerpt: >-\n  Synthetic\rmore\n','bare carriage return');reject('excerpt: >-\n  Synthetic more\n','line separator')
 reject('excerpt: >-\n  Synthetic\nexcerpt: >-\n  Again\n','duplicate folded');reject('excerpt: >-\n  Synthetic\nexcerpt: Again\n','duplicate plain after folded');reject('excerpt: Again\nexcerpt: >-\n  Synthetic\n','duplicate folded after plain')
 reject(`excerpt: >-\n${`  ${'あ'.repeat(100)}\n`.repeat(40)}`,'over 4000 characters')
 assert.equal(extractEditorialMetadata(foldedDoc(`title: Public\nexcerpt: >-\n${`  ${'あ'.repeat(99)}\n`.repeat(40)}`)).excerpt.length,3999)
 for(const key of ['category','source_topic_id'])assert.equal(extractEditorialMetadata(Buffer.from(`---\ntitle: Public\nexcerpt: Public\n${key==='category'?'':'category: その他\n'}${key}: >-\n  synthetic\n---`)),null,key)
 assert.equal(extractEditorialMetadata(Buffer.concat([Buffer.from('---\ntitle: Public\nexcerpt: >-\n  Synthetic '),Buffer.from([0xe3,0x81]),Buffer.from('\ncategory: Other\n---')])),null)
 assert.equal(extractEditorialMetadata(Buffer.from('---\ntitle: Public\ncategory: Other\nexcerpt: >-\n  Synthetic unterminated')),null)
 assert.equal(extractEditorialMetadata(Buffer.from(`---\ntitle: Public\ncategory: Other\nexcerpt: >-\n  ${'a'.repeat(128*1024)}\n---`)),null)
})
test('folded decoding never disagrees with gray-matter for gray-matter-written front matter',async()=>{
 const {default:matter}=await import('gray-matter')
 const long='架空の説明文です。',values=[
  `${long.repeat(6)} ${long.repeat(6)} ${long.repeat(6)}`,
  'Synthetic English summary sentence that keeps going well past the eighty column folding width of the dumper and then some more words.',
  long.repeat(20),
  `Synthetic: colon and # hash inside ${'a long sentence with many words '.repeat(5)}end`,
  `${'word '.repeat(30)}tail`,`${'word  double  '.repeat(12)}tail`,` leading space ${'word '.repeat(30)}tail`,`${'word '.repeat(30)}trailing `,
  `${'word '.repeat(30)}\nsecond paragraph ${'word '.repeat(30)}`,`${'word '.repeat(30)}tail\n`,`"quoted" ${'word '.repeat(30)}'single'`,
  `- dash start ${'word '.repeat(30)}tail`,`> indicator start ${'word '.repeat(30)}tail`,`${'word '.repeat(30)}key: value`,`${'語 '.repeat(60)}終`,
  `${'x'.repeat(100)} ${'y'.repeat(100)}`,`${'word '.repeat(20)}  ${'word '.repeat(20)}tail`,`${'word '.repeat(30)}tab\there`,'Short plain summary','短い要約 #1: 架空',
 ]
 let seed=20261116;const rnd=n=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed%n},atoms=['word','架空','の説明',' ','  ',': ','#',' #','-','"',"'",'、','。','long'.repeat(9),'あ'.repeat(30)]
 for(let i=0;i<400;i++){let s='';for(let n=10+rnd(60);n>0;n--)s+=atoms[rnd(atoms.length)];values.push(s)}
 let folded=0,decoded=0
 for(const value of values)for(const key of ['excerpt','title']){
  const fm={title:'Synthetic title',excerpt:'Synthetic excerpt',category:'その他',draft:false,tags:['synthetic']};fm[key]=value
  const text=matter.stringify('Synthetic body\n',fm),got=extractEditorialMetadata(Buffer.from(text)),want=matter(text).data
  assert.equal(want[key],value)
  const simple=new RegExp(`^${key}: >-$`,'m').test(text);if(simple)folded++
  if(got===null)continue
  decoded++;assert.equal(got.title,want.title,JSON.stringify(text));assert.equal(got.excerpt,want.excerpt,JSON.stringify(text))
 }
 assert.ok(folded>50&&decoded>folded/2,`folded=${folded} decoded=${decoded}`)
 for(const value of values.slice(0,5)){const text=matter.stringify('Synthetic body\n',{title:'Synthetic title',excerpt:value,category:'その他'});assert.match(text,/^excerpt: >-$/m);assert.equal(extractEditorialMetadata(Buffer.from(text))?.excerpt,value)}
})
test('folded public values are decoded without UTF8-decoding private or body bytes',()=>{
 const sentinel=Buffer.from('PRIVATE_DECODE_SENTINEL'),body=Buffer.from('BODY_DECODE_SENTINEL'),original=Buffer.prototype.toString;let violations=0
 Buffer.prototype.toString=function(encoding,...args){if((encoding===undefined||/^utf-?8$/i.test(encoding))&&(this.includes(sentinel)||this.includes(body)))violations++;return original.call(this,encoding,...args)}
 try{assert.equal(extractEditorialMetadata(foldedDoc('title: Public\nprivate_request: >-\n  PRIVATE_DECODE_SENTINEL\nexcerpt: >-\n  Synthetic folded\n  summary\ngeneration_warnings:\n  - >-\n    PRIVATE_DECODE_SENTINEL\n')).excerpt,'Synthetic folded summary');assert.equal(violations,0)}finally{Buffer.prototype.toString=original}
})
