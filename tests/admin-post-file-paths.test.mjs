import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
function fixture(remote=false){
 const calls=[],exports={}
 const modules={'gray-matter':{},'next/cache':{},'@/lib/adminAuth':{},'@/lib/reviewContentFingerprint.mjs':{},'@/lib/githubContents':{commitGitHubFiles:async(...args)=>{calls.push(['github',...args]);return{sha:'a'.repeat(40)}}},'node:path':path,'node:fs':{mkdirSync:(...args)=>calls.push(['mkdir',...args]),writeFileSync:(...args)=>calls.push(['write',...args]),unlinkSync:()=>assert.fail('no deletion in fixture')}}
 const source=readFileSync(new URL('../src/app/admin/posts/actions.ts',import.meta.url),'utf8')+'\nexport { writeFiles }'
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText
 new Function('require','exports','process',compiled)(name=>modules[name],exports,{cwd:()=>'/synthetic',env:remote?{GITHUB_REVIEW_TOKEN:'synthetic'}:{}})
 return{calls,write:exports.writeFiles}
}
test('local admin post and both log writes keep bounded directories',async()=>{
 const f=fixture();await f.write('synthetic',[{path:'content/posts/synthetic.md',content:'Synthetic'},{path:'logs/admin-post-history.md',content:'Synthetic log'},{path:'logs/review-history.md',content:'Synthetic review'}])
 assert.deepEqual(f.calls.filter(c=>c[0]==='mkdir').map(c=>c[1]),['/synthetic/content/posts','/synthetic/logs','/synthetic/logs'])
 assert.deepEqual(f.calls.filter(c=>c[0]==='write').map(c=>c[1]),['/synthetic/content/posts/synthetic.md','/synthetic/logs/admin-post-history.md','/synthetic/logs/review-history.md'])
 await assert.rejects(f.write('bad',[{path:'data/forbidden.json',content:'Synthetic'}]),/許可されていない/)
})
test('configured GitHub path leaves local filesystem untouched',async()=>{
 const f=fixture(true),files=[{path:'content/posts/synthetic.md',content:'Synthetic'}]
 assert.match(await f.write('synthetic',files),/GitHub commit/);assert.deepEqual(f.calls,[['github','synthetic',files]])
})

test('article-topic local CSV keeps the same fixed data destination',async()=>{
 const calls=[],exports={},modules={fs:{writeFileSync:(...args)=>calls.push(args),mkdirSync:()=>{}},path,'next/cache':{},'@/lib/adminAuth':{},'@/lib/articleTopics':{ARTICLE_TOPICS_RELATIVE_PATH:'data/article-topics.sample.csv'},'@/lib/articleTopicsGithub':{},'@/lib/tieredPublication.mjs':{},'@/lib/githubContents':{}}
 const source=readFileSync(new URL('../src/app/admin/article-topics/actions.ts',import.meta.url),'utf8')+'\nexport { saveCsv }'
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText
 new Function('require','exports','process',compiled)(name=>modules[name],exports,{cwd:()=>'/synthetic',env:{}})
 await exports.saveCsv('synthetic csv','MONTHLY-202610TOPIC026','local',null)
 assert.deepEqual(calls,[['/synthetic/data/article-topics.sample.csv','synthetic csv','utf8']])
})
