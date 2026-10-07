import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
import * as jsx from 'react/jsx-runtime'
import {renderToStaticMarkup} from 'react-dom/server'
function load(path,modules,processMock){
 const output={};new Function('require','exports','process',ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText)(name=>{assert.ok(name in modules,name);return modules[name]},output,processMock);return output
}
const base={id:'2026-11-topic-001',title:'Synthetic A',status:'pending',medicalRisk:'low',duplicateRisk:'low',recommendedPublishDate:'2026-11-02',priority:'low',category:'その他'}
const nodes=tree=>Array.isArray(tree)?tree.flatMap(nodes):!tree||typeof tree!=='object'?[]:[tree,...(Array.isArray(tree.props?.children)?tree.props.children:[tree.props?.children]).flatMap(nodes)]
function hooks(){const states=[];let cursor=0,pending=false,completion;return{reset:()=>{cursor=0},wait:()=>completion,react:{useState:initial=>{const i=cursor++;if(!(i in states))states[i]=initial;return[states[i],value=>{states[i]=value}]},useRef:()=>({current:null}),useEffect:()=>{},useTransition:()=>[pending,fn=>{pending=true;completion=fn().finally(()=>{pending=false})}]}}}
function cardHarness(save){
 const cardHooks=hooks(),buttonHooks=hooks();let refresh=0
 const buttons=load('src/app/admin/topic-candidates/TopicCandidateActionButtons.tsx',{'react/jsx-runtime':jsx,react:buttonHooks.react,'next/navigation':{useRouter:()=>({refresh:()=>refresh++})},'./actions':{updateTopicCandidateStatusAction:save}}).default
 const card=load('src/app/admin/topic-candidates/TopicCandidateCard.tsx',{'react/jsx-runtime':jsx,react:cardHooks.react,'next/link':{default:({children,...props})=>jsx.jsx('a',{...props,children})},'./TopicCandidateActionButtons':{default:buttons}}).default
 const render=()=>{cardHooks.reset();const tree=card({month:'2026-11',topic:base,children:jsx.jsx('h2',{children:base.title})});const element=nodes(tree).find(n=>n.type===buttons);buttonHooks.reset();return{tree,controls:element?buttons(element.props):null}}
 return{render,refresh:()=>refresh,wait:buttonHooks.wait,click:label=>{const button=nodes(render().controls).find(n=>n.type==='button'&&n.props.children===label);assert.ok(button);button.props.onClick()}}
}
test('card stays until confirmed successful save, then disappears even under all filter',async()=>{
 let resolve;const h=cardHarness(()=>new Promise(done=>{resolve=done}));h.click('却下')
 assert.equal(h.render().tree.type,'article');assert.equal(h.refresh(),0)
 resolve({ok:true,message:'saved'});await h.wait()
 assert.equal(h.render().tree.type,'p');assert.equal(h.render().tree.props.role,'status');assert.equal(h.refresh(),1)
 assert.equal(h.render().controls,null)
 const html=renderToStaticMarkup(h.render().tree);assert.match(html,/保存した候補を確認/);assert.match(html,/status=rejected/)
 // A changed filter key remounts a fresh card with the persisted server status.
 const again=cardHarness(async()=>({ok:true,message:'saved'}));assert.equal(again.render().tree.type,'article')
})
test('rejected save and unknown response leave card visible with accessible error and no refresh',async()=>{
 for(const save of [async()=>({ok:false,message:'採用上限です'}),async()=>{throw Error('RAW_RESPONSE')}]){
  const h=cardHarness(save);h.click('今月採用');await h.wait()
  assert.equal(h.render().tree.type,'article');assert.equal(h.refresh(),0)
  const alert=nodes(h.render().controls).find(n=>n.props?.role==='alert');assert.ok(alert)
  assert.doesNotMatch(alert.props.children,/RAW_RESPONSE|変更していません/)
 }
})
function pageHarness(){
 const topics=[base,{...base,id:'2026-11-topic-002',title:'Synthetic B',status:'rejected'}],file={month:'2026-11',topics,targetPostCount:12}
 const mods={'react/jsx-runtime':jsx,'next/link':{default:({children,...props})=>jsx.jsx('a',{...props,children})},'next/navigation':{redirect:()=>{throw Error('auth')}},'@/lib/adminAuth':{isAdminAuthenticated:async()=>true},'@/lib/seo':{NOINDEX_METADATA:{}},'@/lib/monthlyTopicCandidates':{getDefaultTopicCandidateMonth:()=>file.month,getMonthlyTopicCandidatesForAdmin:async()=>file,buildTopicCandidateSummary:()=>({targetPostCount:12,selectedCount:0,candidateCount:2,pendingCount:1,backupCount:0,holdCount:0,rejectedCount:1,highRiskCount:0,duplicateWarningCount:0})},'./FinalizeTopicCandidatesButton':{default:()=>null},'./TopicCandidateCard':{default:()=>null}}
 return{page:load('src/app/admin/topic-candidates/page.tsx',mods).default,Card:mods['./TopicCandidateCard'].default}
}
test('pending default survives refresh; handled filters recover cards and change their client state key',async()=>{
 const h=pageHarness(),tree=await h.page({searchParams:Promise.resolve({month:'2026-11'})})
 const pending=nodes(tree).filter(n=>n.type===h.Card);assert.equal(pending.length,1);assert.equal(pending[0].props.topic.id,base.id)
 const html=renderToStaticMarkup(tree);assert.match(html,/2026-11/);assert.match(html,/未判断の残り/);assert.match(html,/判断済みの候補は状態の絞り込み/);assert.match(html,/「今月採用」を押すと採用が確定/);assert.match(html,/追加の確定操作は不要/);assert.doesNotMatch(html,/保存しても採用の確定や記事作成は行いません/)
 const all=nodes(await h.page({searchParams:Promise.resolve({month:'2026-11',status:'all'})})).filter(n=>n.type===h.Card)
 assert.equal(all.length,2);assert.notEqual(all[0].key,pending[0].key)
 const rejected=nodes(await h.page({searchParams:Promise.resolve({status:'rejected'})})).filter(n=>n.type===h.Card)
 assert.equal(rejected.length,1);assert.equal(rejected[0].props.topic.status,'rejected')
})
test('previous-month reuse projection leaves saved titles and statuses unchanged and reads only two snapshots',async()=>{
 const current={month:'2026-11',topics:[base,{...base,id:'other',status:'selected',title:'Fresh'}]},previous={month:'2026-10',topics:[{title:'Ｓｙｎｔｈｅｔｉｃ A！',status:'rejected'}]},reads=[]
 const modules={fs:{default:{}},path:{default:{join:(...x)=>x.join('/')}},'./githubContents':{readGitHubFile:async path=>{reads.push(path);return{content:JSON.stringify(path.includes('2026-11')?current:previous)}}}}
 const lib=load('src/lib/monthlyTopicCandidates.ts',modules,{cwd:()=>'/synthetic',env:{GITHUB_REVIEW_TOKEN:'synthetic'}})
 const result=await lib.getMonthlyTopicCandidatesForAdmin('2026-11')
 assert.equal(result.topics[0].previousMonthReuse,'2026-10');assert.equal(result.topics[1].previousMonthReuse,undefined)
 assert.deepEqual(result.topics.map(t=>[t.title,t.status]),current.topics.map(t=>[t.title,t.status]));assert.equal(reads.length,2)
 for(const month of ['2026-13','2026-00','../2026-11'])assert.throws(()=>lib.validateMonth(month))
})
