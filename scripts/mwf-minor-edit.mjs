#!/usr/bin/env node
// Explicit production path for a proposed edit of an existing Human-approved post.
// Reads the baseline from fixed canonical GitHub, never trusts a local baseline.
import { createHash } from 'node:crypto'
import { readFileSync, openSync, closeSync, fstatSync, constants } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'
import { createProductionRuntime } from './lib/mwf-production.mjs'
import { openDeliveryStore, runDelivery, validateDraft } from './lib/mwf-delivery.mjs'
import { getDmpArticleState } from '../src/lib/dmpArticleState.mjs'
export async function runMinorEdit({path,proposal,productionOptions}) {
  if(!/^content\/posts\/\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md$/.test(path??''))throw Error('invalid_article_path')
  const runtime=createProductionRuntime(productionOptions)
  const baselineRaw=await runtime.githubFile(path),base=matter(baselineRaw)
  if(!getDmpArticleState({data:base.data,content:base.content}).approvedExactVersion || base.data.draft || base.data.archived || base.data.rejection_reason)throw Error('human_approved_baseline_required')
  const fd=openSync(proposal,constants.O_RDONLY|constants.O_NOFOLLOW)
  let parsed
  try {if(!fstatSync(fd).isFile()||fstatSync(fd).nlink!==1)throw Error('invalid_proposal');parsed=matter(readFileSync(fd,'utf8'))}finally{closeSync(fd)}
  const editorId=`editor:${createHash('sha256').update(parsed.content).digest('hex')}`
  const raw=matter.stringify(parsed.content,{...parsed.data,draft:true,reviewed:false,auto_approved:false,publication_status:'draft',generation_run_id:editorId})
  const metadata=validateDraft(raw),id=createHash('sha256').update(path+'\0'+metadata.blob).digest('hex')
  const store=openDeliveryStore(runtime.root),release=store.acquire()
  try {
    if(!store.read().some(item=>item.id===id)){
      store.artifact(id,raw)
      store.save({id,path,topicId:`minor-${id}`,slot:`${path.slice(14,24)}T08:30:00+09:00`,state:'saved',stage:'sync',...metadata,expectedBaseBlob:createHash('sha256').update(baselineRaw).digest('hex')})
    }
  }finally{release()}
  return runDelivery({store,adapters:runtime.adapters,retryOnly:true,verificationSecret:runtime.verificationSecret})
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const args=process.argv.slice(2);if(args.length!==5||args[0]!=='--production'||args[1]!=='--path'||args[3]!=='--proposal')throw Error('explicit_arguments_required');const result=await runMinorEdit({path:args[2],proposal:args[4]});console.log(JSON.stringify(result));process.exitCode=result.ok?0:1}catch{console.error('minor_edit_attention');process.exitCode=1}
}
