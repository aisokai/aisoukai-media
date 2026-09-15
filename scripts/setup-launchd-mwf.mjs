#!/usr/bin/env node
// Execution requires the separately validated blog runner-install stage.
// This updates only the existing calendar job; it never starts a run or deletes files.
import {createHash, randomUUID} from 'node:crypto'
import {existsSync, readFileSync, writeFileSync, mkdirSync, lstatSync, renameSync} from 'node:fs'
import {join, resolve, isAbsolute} from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawnSync} from 'node:child_process'
import {mwfRunnerPlist} from './mwf-runner-plist.mjs'
export const MWF_ROOT='/Users/caelus/Library/Application Support/AisoukaiMWF'
export const MWF_LABEL='com.mitani.aisoukai-media-ops-mwf'
const PLIST='/Users/caelus/Library/LaunchAgents/'+MWF_LABEL+'.plist'
const digest=bytes=>createHash('sha256').update(bytes).digest('hex')
export function verifyRunnerRelease({commit,manifest,manifestHash},{read=readFileSync,stat=lstatSync,git}={}) {
 if(!/^[a-f0-9]{40}$/.test(commit??'')||!isAbsolute(manifest??'')||!/^[a-f0-9]{64}$/.test(manifestHash??''))throw Error('reviewed_release_arguments_required')
 const raw=read(manifest);if(digest(raw)!==manifestHash)throw Error('manifest_hash_mismatch')
 const value=JSON.parse(raw),release=join(MWF_ROOT,'releases',commit)
 if(value.schema!==1||!Array.isArray(value.files)||!value.files.length)throw Error('invalid_release_manifest')
 const paths=value.files.map(f=>f.path)
 if(new Set(paths).size!==paths.length||JSON.stringify(paths)!==JSON.stringify([...paths].sort())||!['AGENTS.md','package.json','package-lock.json','scripts/ops-mwf.mjs','scripts/setup-launchd-mwf.mjs','scripts/mwf-runner-plist.mjs','src/lib/mwfServerRuntime.ts'].every(p=>paths.includes(p)))throw Error('incomplete_release_manifest')
 for(const file of value.files){
  if(!/^(?:AGENTS\.md|package(?:-lock)?\.json|(?:scripts|src|docs|tests|config)\/[A-Za-z0-9_./\[\]-]+|(?:next|postcss|eslint)\.config\.[a-z]+|tsconfig\.json)$/.test(file.path)||file.path.split('/').includes('..')||!/^([a-f0-9]{64})$/.test(file.sha256))throw Error('manifest_path_rejected')
  const path=join(release,file.path),s=stat(path);if(!s.isFile()||s.isSymbolicLink()||digest(read(path))!==file.sha256)throw Error('release_file_mismatch')
 }
 const head=git(release,['rev-parse','HEAD']),clean=git(release,['status','--porcelain','--untracked-files=all','--',...paths])
 if(!head.ok||head.output.trim()!==commit||!clean.ok||clean.output.trim())throw Error('release_checkout_mismatch')
 return {release,manifestHash,commit}
}
export function createRunnerInstaller({verify=verifyRunnerRelease,launchctl,readExists=existsSync,write=writeFileSync,mkdir=mkdirSync,move=renameSync,timezone=()=>Intl.DateTimeFormat().resolvedOptions().timeZone,uid=()=>process.getuid(),nonce=randomUUID,git}={}) {
 const service=()=>`gui/${uid()}`
 function state(){const result=launchctl(['list']);if(!result.ok)throw Error('job_metadata_unavailable');const line=result.output.split('\n').find(line=>line.trim().split(/\s+/).at(-1)===MWF_LABEL),parts=line?.trim().split(/\s+/);return{loaded:!!parts,running:!!parts&&parts[0]!=='-',lastExitStatus:parts&&/^-?\d+$/.test(parts[1])?Number(parts[1]):null}}
 return {
  status:state,
  install(input){
   if(timezone()!=='Asia/Tokyo')throw Error('host_timezone_must_be_Asia_Tokyo')
   const verified=verify(input,{git}),before=state();if(before.running)throw Error('existing_job_running')
   const xml=mwfRunnerPlist(verified.commit),backup=PLIST+'.preserved-'+nonce()
   mkdir(join(MWF_ROOT,'state'),{recursive:true});mkdir('/Users/caelus/Library/LaunchAgents',{recursive:true})
   if(before.loaded&&!launchctl(['bootout',service(),PLIST]).ok)throw Error('job_bootout_failed')
   const preserved=readExists(PLIST);if(preserved)move(PLIST,backup)
   try {
    write(PLIST,xml,{flag:'wx',mode:0o600})
    if(!launchctl(['bootstrap',service(),PLIST]).ok)throw Error('job_bootstrap_failed')
    if(!state().loaded)throw Error('job_registration_unverified')
   }catch(error){
    // Preserve the unsuccessful configuration too. Restore the old calendar only,
    // without RunAtLoad/kickstart. No unlink or other destructive operation.
    if(readExists(PLIST))move(PLIST,PLIST+'.failed-'+nonce())
    if(preserved)move(backup,PLIST)
    if(before.loaded&&preserved)launchctl(['bootstrap',service(),PLIST])
    throw error
   }
   return{status:'installed',commit:verified.commit,manifestHash:verified.manifestHash,calendar:'MWF_0830_Asia_Tokyo',runStarted:false}
  },
  uninstall(){const before=state();if(before.running)throw Error('existing_job_running');if(before.loaded&&!launchctl(['bootout',service(),PLIST]).ok)throw Error('job_bootout_failed');return{status:'unloaded',configurationPreserved:true,runStarted:false}}
 }
}
export function runRunnerSetup(args,{installer,output=value=>console.log(JSON.stringify(value))}={}) {
 if(args.length===1&&args[0]==='--status'){output(installer.status());return 0}
 if(args.length===1&&args[0]==='--uninstall'){output(installer.uninstall());return 0}
 if(args.length!==7||args[0]!=='--install'||args[1]!=='--commit'||args[3]!=='--manifest'||args[5]!=='--manifest-sha256')throw Error('reviewed_release_arguments_required')
 output(installer.install({commit:args[2],manifest:args[4],manifestHash:args[6]}));return 0
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const run=(command,args,cwd)=>{const result=spawnSync(command,args,{cwd,env:{PATH:'/opt/homebrew/bin:/usr/bin:/bin',HOME:'/Users/caelus'},encoding:'utf8',timeout:30000});return{ok:result.status===0&&!result.error,output:result.stdout??''}}
 try{process.exitCode=runRunnerSetup(process.argv.slice(2),{installer:createRunnerInstaller({launchctl:args=>run('/bin/launchctl',args),git:(cwd,args)=>run('/usr/bin/git',args,cwd)})})}catch{console.error('runner_setup_failed_check_release_and_job_metadata');process.exitCode=1}
}
