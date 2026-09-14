#!/usr/bin/env node
import {readFileSync,openSync,closeSync,fstatSync,constants,writeFileSync,lstatSync,realpathSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
import {resolve,join,basename} from 'node:path'
import {fileURLToPath} from 'node:url'
import {inventoryHash,inventoryPath,metadataEntry,createInventory} from './lib/mwf-inventory.mjs'
const OUTPUT='/Users/caelus/Library/Application Support/AisoukaiMWF/input'
export function readOpaqueRegular(path){const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{const s=fstatSync(fd);if(!s.isFile()||s.nlink!==1||s.size>5e6)throw Error('unsafe_artifact');return readFileSync(fd)}finally{closeSync(fd)}}
const decode=s=>s.replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&')
export async function readPublicEditorialHead(url,fetchImpl=fetch){
 if(!/^https:\/\/aisoukai-media\.vercel\.app\/blog\/[A-Za-z0-9_-]+$/.test(url))return null
 const response=await fetchImpl(url,{redirect:'error',signal:AbortSignal.timeout(30000)});if(response.status!==200||response.url!==url||response.redirected||!/^text\/html(?:;|$)/i.test(response.headers.get('content-type')??''))return null
 const reader=response.body.getReader();let bytes=Buffer.alloc(0)
 try{while(bytes.length<256*1024){const {value,done}=await reader.read();if(done)break;bytes=Buffer.concat([bytes,Buffer.from(value)]);if(bytes.indexOf(Buffer.from('</head>'))>=0)break}}finally{await reader.cancel()}
 const end=bytes.indexOf(Buffer.from('</head>'));if(end<0)return null
 const head=bytes.subarray(0,end).toString('utf8'),values={}
 for(const tag of head.matchAll(/<meta\s+[^>]*>/gi)){const attrs={};for(const a of tag[0].matchAll(/([a-z:-]+)\s*=\s*(["'])(.*?)\2/gi))if(['property','name','content'].includes(a[1].toLowerCase()))attrs[a[1].toLowerCase()]=a[3];const name=attrs.property??attrs.name;if(['og:title','og:description'].includes(name)){if(values[name])return null;values[name]=decode(attrs.content??'')}}
 return values['og:title']&&values['og:description']?{url,title:values['og:title'],description:values['og:description']}:null
}
export async function prepareMetadataInventory({preservationBytes,reconciliationBytes,readLocal,github,readHead,secret,prepareOnly=true}){
 const preservation=JSON.parse(preservationBytes),reconciliation=JSON.parse(reconciliationBytes)
 const revision=reconciliation.canonicalRevision;if(!/^[a-f0-9]{40}$/.test(revision??''))throw Error('fixed_revision_required')
 const listing=await github('content/posts',revision);if(!Array.isArray(listing)||listing.length>=1000)throw Error('incomplete_canonical_listing')
 const entries=[],quarantine=new Set(reconciliation.unidentifiedTopics??[])
 for(const file of listing){if(file.type!=='file'||!inventoryPath(file.path))throw Error('unsupported_canonical_entry');const raw=Buffer.from(await github(file.path,revision)),isQuarantine=quarantine.has(file.path);const head=isQuarantine?await readHead(`https://aisoukai-media.vercel.app/blog/${file.path.slice(14,-3)}`):null;entries.push(metadataEntry({path:file.path,raw,source:'canonical',quarantine:isQuarantine,head}))}
 for(const item of preservation.entries){if(!inventoryPath(item.path))throw Error('invalid_preservation_path');const raw=Buffer.from(await readLocal(item.path));if(inventoryHash(raw)!==item.blob)throw Error('preservation_changed');if(!entries.some(e=>e.path===item.path&&e.blob===item.blob))entries.push(metadataEntry({path:item.path,raw,source:'local',quarantine:quarantine.has(item.path)}))}
 return createInventory({preservation,reconciliation,preservationBytes,reconciliationBytes,entries,secret,prepareOnly})
}
export async function runMetadataCli(args,{env=process.env,spawnImpl=spawnSync,fetchImpl=fetch}={}){
 const prepareOnly=args.includes('--prepare-only');args=args.filter(a=>a!=='--prepare-only')
 if(args.length!==6||args[0]!=='--preservation-inventory'||args[2]!=='--reconciliation'||args[4]!=='--preservation-dir')throw Error('explicit_inputs_required')
 const directory=resolve(args[5]);for(const p of [directory,OUTPUT])if(lstatSync(p).isSymbolicLink()||!lstatSync(p).isDirectory()||realpathSync(p)!==p)throw Error('unsafe_directory')
 if(resolve(args[1],'..')!==directory||resolve(args[3],'..')!==OUTPUT)throw Error('input_outside_scope')
 if(!prepareOnly&&!env.ADMIN_REVIEW_COOKIE_SECRET)throw Error('signing_configuration_missing')
 const github=async(path,revision)=>{if(path!=='content/posts'&&!inventoryPath(path)||!/^[a-f0-9]{40}$/.test(revision))throw Error('invalid_canonical_path');const result=spawnImpl('/opt/homebrew/bin/gh',['api','--hostname','github.com','--method','GET',`repos/aisokai/aisoukai-media/contents/${path}?ref=${revision}`],{encoding:'utf8',timeout:30000,maxBuffer:16*1024*1024,stdio:['ignore','pipe','pipe']});if(result.status!==0||result.error)throw Error('canonical_read_failed');const value=JSON.parse(result.stdout);if(path==='content/posts')return value;if(value.encoding!=='base64'||typeof value.content!=='string')throw Error('canonical_blob_invalid');return Buffer.from(value.content,'base64')}
 const inventory=await prepareMetadataInventory({preservationBytes:readOpaqueRegular(resolve(args[1])),reconciliationBytes:readOpaqueRegular(resolve(args[3])),readLocal:path=>readOpaqueRegular(join(directory,basename(path))),github,readHead:url=>readPublicEditorialHead(url,fetchImpl),secret:prepareOnly?undefined:env.ADMIN_REVIEW_COOKIE_SECRET,prepareOnly})
 const raw=JSON.stringify(inventory,null,2)+'\n',path=join(OUTPUT,`editorial-metadata-${inventoryHash(raw)}.json`);writeFileSync(path,raw,{flag:'wx',mode:0o600});const payload=inventory.payload
 return{path,unsigned:prepareOnly,entries:payload.entries.length,quarantine:payload.quarantine.length,metadataMissing:payload.entries.filter(e=>!e.metadata).length}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))runMetadataCli(process.argv.slice(2)).then(v=>console.log(JSON.stringify(v))).catch(()=>{console.error('metadata_inventory_not_activated');process.exitCode=1})
