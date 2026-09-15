#!/usr/bin/env node
// Sends an immutable body-only correction proposal; only the server can review
// and replace a signed, exact Human-approved baseline. No local approval key.
import {resolve,isAbsolute} from 'node:path'
import {fileURLToPath} from 'node:url'
import {readOpaqueRegular} from './mwf-inventory-metadata.mjs'
import {parseMinorProposal,serializeMinorProposal} from '../src/lib/mwfMinorAuthority.mjs'
import {createProductionRuntime} from './lib/mwf-production.mjs'
export async function runMinorEdit(args=[],{readProposal=path=>readOpaqueRegular(path).toString('utf8'),createRuntime=()=>createProductionRuntime(),output=value=>console.log(JSON.stringify(value))}={}){
 if(!Array.isArray(args)||args.length!==2||args[0]!=='--proposal'||!isAbsolute(args[1]))throw Error('minor_proposal_argument_required')
 const proposal=parseMinorProposal(readProposal(args[1]),{canonical:false});if(!proposal)throw Error('minor_proposal_invalid')
 const proposalRaw=serializeMinorProposal(proposal)
 const result=await createRuntime().minor({proposalRaw})
 // Return only bounded status metadata, never proposal/article/credential text.
 const summary={status:result?.status??'unknown',requestId:result?.requestId??null,reason:result?.reason??null,published:result?.published===true}
 output(summary)
 return result?.status==='server-reviewed'&&result?.authenticated===true&&result?.published===true?0:1
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 runMinorEdit(process.argv.slice(2)).then(code=>{process.exitCode=code}).catch(()=>{console.error('minor_edit_failed');process.exitCode=1})
}
