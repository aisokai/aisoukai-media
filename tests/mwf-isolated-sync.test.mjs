import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { createIsolatedSync } from '../scripts/lib/mwf-isolated-sync.mjs'
import { validateDraft } from '../scripts/lib/mwf-delivery.mjs'
const raw='---\ntitle: Synthetic\ndate: 2026-09-14\ncategory: その他\ntags: []\nauthor: Synthetic\nimage: ""\nexcerpt: Synthetic excerpt\ndraft: true\nreviewed: false\nauto_approved: false\n---\nSynthetic\n'
const env={GIT_ALLOW_PROTOCOL:'file',PATH:'/usr/bin:/bin',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_TERMINAL_PROMPT:'0',GIT_AUTHOR_NAME:'Synthetic',GIT_AUTHOR_EMAIL:'synthetic@example.invalid',GIT_COMMITTER_NAME:'Synthetic',GIT_COMMITTER_EMAIL:'synthetic@example.invalid'}
function git(directory,args,input) {
  const r=spawnSync('/usr/bin/git',args,{cwd:directory,env,input,encoding:'utf8',timeout:10000})
  return {ok:r.status===0,output:r.stdout}
}
function fixture() {
  const root=mkdtempSync(join(tmpdir(),'mwf-git-')), remote=join(root,'remote.git');mkdirSync(remote)
  assert.equal(git(remote,['init','--bare','.']).ok,true)
  const tree=git(remote,['mktree'],'').output.trim(), commit=git(remote,['commit-tree',tree],'Synthetic initial\n').output.trim()
  git(remote,['update-ref','refs/heads/main',commit])
  const item={id:'a'.repeat(64),path:`content/posts/2026-09-14-mwf-${'a'.repeat(64)}.md`,raw,...validateDraft(raw)}
  return {root,remote,tree,item,run:({directory,args,input})=>git(directory,args.map(a=>a==='delivery-origin'?remote:a),input)}
}
test('real isolated Git adds only target despite unrelated dirty/diverged development checkout, recovery is idempotent',async()=>{
  const f=fixture(),dev=join(f.root,'dev');mkdirSync(dev);writeFileSync(join(dev,'dirty'),'preserve')
  git(dev,['init','.']);git(dev,['commit','--allow-empty','-m','unrelated development'])
  const before=git(dev,['rev-parse','HEAD']).output
  const sync=createIsolatedSync({spool:join(f.root,'spool'),run:f.run})
  const first=await sync(f.item);assert.equal(first.status,'synced')
  const second=await sync(f.item);assert.equal(second.commit,first.commit)
  assert.equal(git(dev,['rev-parse','HEAD']).output,before);assert.equal(readFileSync(join(dev,'dirty'),'utf8'),'preserve')
  assert.equal(git(f.remote,['ls-tree','-r','--name-only','main']).output.trim(),f.item.path)
})
test('main update race retries on fresh parent and never overwrites conflicting target',async()=>{
  const f=fixture();let raced=false
  const run=q=>{
    if(q.args[0]==='push'&&!raced){raced=true;const parent=git(f.remote,['rev-parse','main']).output.trim();const c=git(f.remote,['commit-tree',f.tree,'-p',parent],'Synthetic race\n').output.trim();git(f.remote,['update-ref','refs/heads/main',c])}
    return f.run(q)
  }
  const sync=createIsolatedSync({spool:join(f.root,'spool'),run});assert.equal((await sync(f.item)).status,'synced');assert.equal(raced,true)
  const otherRaw=raw+'different\n';assert.equal((await sync({...f.item,raw:otherRaw,...validateDraft(otherRaw)})).status,'conflict')
})

test('per-artifact validation rejects malformed article before any Git capability',async()=>{
  let calls=0
  const sync=createIsolatedSync({spool:join(tmpdir(),'unused-synthetic'),run:()=>{calls++;throw Error('must not run')}})
  const bad='---\ntitle: Synthetic\ndraft: true\nreviewed: false\nauto_approved: false\n---\nSynthetic\n'
  assert.equal((await sync({id:'a'.repeat(64),path:`content/posts/2026-09-14-mwf-${'a'.repeat(64)}.md`,raw:bad,...validateDraft(bad)})).status,'conflict')
  assert.equal(calls,0)
})
