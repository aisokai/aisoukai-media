import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { measureFunctionTrace, measureBuiltFunctionTrace } from '../scripts/measure-function-trace.mjs'

test('deployed article trace keeps articles without tracing unrelated root assets', async () => {
  const nft = createRequire(import.meta.url).resolve('next/dist/compiled/@vercel/nft')
  const result = await measureFunctionTrace(nft)
  // Standalone NFT cannot infer the previous unknown root-relative filename.
  // Turbopack's broader inclusion must be measured by a separate Next build;
  // this test proves required-file retention, not production size savings.
  assert.deepEqual(result.before.fixtureFiles, [])
  assert.deepEqual(result.after.fixtureFiles, ['content/posts/2026-09-19-synthetic.md'])
  assert.equal(result.after.fixtureBytes, 18)
  assert.deepEqual(result.after.warnings, [])
})

import ts from 'typescript'
import fs from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import { tmpdir } from 'node:os'
function configFixture() {
 const root=fs.mkdtempSync(path.join(tmpdir(),'trace-config-synthetic-'))
 for(const directory of ['content/posts','public/images/library'])fs.mkdirSync(path.join(root,directory),{recursive:true})
 const modules={'node:fs':fs,'node:path':path,'gray-matter':matter}
 const output=ts.transpileModule(fs.readFileSync(new URL('../next.config.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,exports={}
 new Function('require','exports','process',output)(name=>modules[name],exports,{cwd:()=>root})
 return {root,config:exports.default,write:(name,value)=>fs.writeFileSync(path.join(root,name),value)}
}
test('trace excludes only unreferenced safe image paths while every article status keeps exact hash bytes',()=>{
 const f=configFixture()
 for(const name of ['draft','archived','public','unused','[unsafe]'])f.write(`public/images/library/${name}.png`,'synthetic')
 for(const [name,flags] of [['draft','draft: true'],['archived','archived: true'],['public','reviewed: true']])f.write(`content/posts/${name}.md`,`---\nimage: /images/library/${name}.png\n${flags}\n---\nBODY_MUST_NOT_BE_DECODED`)
 assert.deepEqual(f.config('phase-production-build').outputFileTracingExcludes,{'/*':['./public/images/library/unused.png']})
 assert.deepEqual(f.config('phase-development-server'),{})
})
test('unparseable/non-scalar/unsafe images and symlink entries retain all function images',()=>{
 for(const header of ['image: [a,b]','image: /images/../outside','image: "unterminated','image: null']){
  const f=configFixture();f.write('public/images/library/unused.png','synthetic');f.write('content/posts/invalid.md',`---\n${header}\n---\nSynthetic`)
  assert.deepEqual(f.config('phase-production-build'),{})
 }
 const f=configFixture();f.write('public/images/library/unused.png','synthetic');fs.symlinkSync('unused.png',path.join(f.root,'public/images/library/link.png'))
 assert.deepEqual(f.config('phase-production-build'),{})
})

test('normalized slash and dot image aliases keep the file used by runtime hashing',()=>{
 for(const image of ['/images/./library/used.png','/images//library/used.png']){
  const f=configFixture();f.write('public/images/library/used.png','synthetic');f.write('public/images/library/unused.png','synthetic');f.write('content/posts/alias.md',`---\nimage: ${image}\n---\nSynthetic`)
  assert.deepEqual(f.config('phase-production-build').outputFileTracingExcludes,{'/*':['./public/images/library/unused.png']})
 }
})

test('built trace measurement reads actual manifest paths and counts shared assets once',async()=>{
 const root=fs.mkdtempSync(path.join(tmpdir(),'trace-manifest-synthetic-'))
 fs.mkdirSync(path.join(root,'.next/server/app/api/example'),{recursive:true});fs.mkdirSync(path.join(root,'public/images'),{recursive:true})
 fs.writeFileSync(path.join(root,'function-trace-synthetic.json'),'{"synthetic":true}')
 fs.writeFileSync(path.join(root,'public/images/used.png'),Buffer.alloc(10))
 fs.writeFileSync(path.join(root,'.next/server/app/page.js.nft.json'),JSON.stringify({files:['../../../public/images/used.png']}))
 fs.writeFileSync(path.join(root,'.next/server/app/api/example/route.js.nft.json'),JSON.stringify({files:['../../../../../public/images/used.png']}))
 const result=await measureBuiltFunctionTrace(root);assert.equal(result.uniqueBytes,10);assert.equal(result.uniqueFiles,1);assert.equal(result.routes.length,2)
})
