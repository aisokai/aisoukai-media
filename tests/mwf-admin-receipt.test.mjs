import test from 'node:test'
import assert from 'node:assert/strict'
import { createMwfReceiptHandler } from '../src/lib/mwfAdminReceipt.mjs'
import { validateDraft } from '../scripts/lib/mwf-delivery.mjs'
const raw='---\ntitle: Synthetic\ndate: 2026-09-14\ncategory: その他\ntags: []\nauthor: Synthetic\nimage: ""\nexcerpt: Synthetic excerpt\ndraft: true\nreviewed: false\nauto_approved: false\n---\nSynthetic\n'
const path=`content/posts/2026-09-14-mwf-${'a'.repeat(64)}.md`, version=validateDraft(raw).contentVersion
const request=new Request(`https://aisoukai-media.vercel.app/admin/pending-review/mwf-receipt?path=${path}&contentVersion=${version}`)
test('real receipt handler authenticates first, rejects local fallback and stale body, returns exact metadata only',async()=>{
  let auth=true, source='github',body=raw,reads=0
  const handler=createMwfReceiptHandler({authenticate:async()=>{if(!auth)throw Error()},readAdminSource:async()=>{reads++;return{source,posts:[{slug:path.slice(14,-3),contentVersion:version}]}},readFile:async()=>({content:body,sha:'b'.repeat(40)})})
  auth=false;assert.equal((await handler(request)).status,401);assert.equal(reads,0)
  auth=true;source='local';assert.equal((await handler(request)).status,409)
  source='github';body=raw+'different';assert.equal((await handler(request)).status,409)
  body=raw;const response=await handler(request);assert.equal(response.status,200)
  const receipt=await response.json();assert.equal(receipt.contentVersion,version);assert.equal(receipt.blob,validateDraft(raw).blob);assert.equal(receipt.published,false);assert.equal('content' in receipt,false)
})

test('production receipt client pins origin and rejects redirect/login/mismatched URL',async()=>{
  const {createAdminReceiptReader}=await import('../scripts/lib/mwf-capabilities.mjs')
  for(const failure of ['redirect','login','url']) {
    const reader=createAdminReceiptReader({authenticatedFetch:async url=>({ok:true,redirected:failure==='redirect',url:failure==='url'?'https://example.invalid/':url,headers:new Headers({'content-type':failure==='login'?'text/html':'application/json'}),json:async()=>({bad:true})})})
    assert.equal(await reader({path,contentVersion:version}),null)
  }
  let requestUrl
  const reader=createAdminReceiptReader({authenticatedFetch:async url=>{requestUrl=url;return{ok:true,redirected:false,url,headers:new Headers({'content-type':'application/json'}),json:async()=>({verified:true})}}})
  assert.deepEqual(await reader({path,contentVersion:version}),{verified:true})
  assert.equal(new URL(requestUrl).origin,'https://aisoukai-media.vercel.app')
  assert.equal(new URL(requestUrl).pathname,'/admin/pending-review/mwf-receipt')
})
