#!/usr/bin/env node
// Explicit local migration inventory. Never rewrites/deletes originals or syncs them.
import { readFileSync, readdirSync, mkdirSync, writeFileSync, existsSync, lstatSync, realpathSync, openSync, closeSync, fstatSync, constants } from 'node:fs'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import matter from 'gray-matter'
const digest=raw=>createHash('sha256').update(raw).digest('hex')
export function preserveDraftInventory({source,destination}) {
  source=resolve(source);destination=resolve(destination)
  if(lstatSync(source).isSymbolicLink() || !lstatSync(source).isDirectory())throw Error('unsafe_source_directory')
  if(existsSync(destination)&&lstatSync(destination).isSymbolicLink())throw Error('unsafe_destination_directory')
  source=realpathSync(source)
  if (destination===source || destination.startsWith(source+'/')) throw Error('separate_preservation_directory_required')
  mkdirSync(destination,{recursive:true,mode:0o700})
  destination=realpathSync(destination)
  if(destination===source||destination.startsWith(source+'/')||source.startsWith(destination+'/'))throw Error('separate_preservation_directory_required')
  function readRegular(path) {
    const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW)
    try { const st=fstatSync(fd);if(!st.isFile()||st.nlink!==1)throw Error('unsafe_artifact');return readFileSync(fd) } finally {closeSync(fd)}
  }
  const entries=[],usedTopicIds=new Set()
  for(const name of readdirSync(source).filter(n=>/^\d{4}-\d{2}-\d{2}-.+\.md$/.test(n)).sort()) {
    const raw=readRegular(join(source,name)),{data}=matter(raw.toString('utf8'))
    const topic=String(data.source_topic_id??'').trim()
    if(topic)usedTopicIds.add(topic)
    const target=join(destination,name),blob=digest(raw)
    if(existsSync(target)) {if(digest(readRegular(target))!==blob)throw Error('preservation_conflict')}
    else writeFileSync(target,raw,{flag:'wx',mode:0o600})
    entries.push({path:`content/posts/${name}`,blob,topicId:topic||null,unreviewed:data.reviewed!==true&&data.auto_approved!==true,archived:data.archived===true})
  }
  const inventory={schema:1,reconciled:false,usedTopicIds:[...usedTopicIds].sort(),entries,unidentifiedTopics:entries.filter(e=>!e.topicId).map(e=>e.path)}
  // Each inventory is retained; operator reconciles backlog and unresolved topic IDs
  // before creating a separate reviewed inventory with reconciled:true.
  const path=join(destination,`inventory-${digest(JSON.stringify(inventory))}.json`)
  if(!existsSync(path))writeFileSync(path,JSON.stringify(inventory,null,2)+'\n',{flag:'wx',mode:0o600})
  return {path,count:entries.length,unreviewed:entries.filter(e=>e.unreviewed).length,unidentifiedTopics:inventory.unidentifiedTopics.length,reconciled:false}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const args=process.argv.slice(2)
    if(args.length!==4||args[0]!=='--source'||args[2]!=='--destination')throw Error('explicit_paths_required')
    console.log(JSON.stringify(preserveDraftInventory({source:args[1],destination:args[3]})))
  }catch{console.error('preservation_failed_no_originals_changed');process.exitCode=1}
}
