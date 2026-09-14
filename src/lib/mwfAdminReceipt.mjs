import { createHash } from 'node:crypto'
import matter from 'gray-matter'
import { getDmpArticleState } from './dmpArticleState.mjs'
const PATH = /^content\/posts\/\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md$/
const HASH = /^[a-f0-9]{64}$/
export function createMwfReceiptHandler({ authenticate, readAdminSource, readFile, readDeployedFile }) {
  return async function receipt(request) {
    const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }
    try { await authenticate() } catch { return Response.json({status:'unauthorized'},{status:401,headers}) }
    const url = new URL(request.url)
    const path = url.searchParams.get('path'), version = url.searchParams.get('contentVersion')
    if (!PATH.test(path ?? '') || !HASH.test(version ?? '')) return Response.json({status:'invalid'},{status:400,headers})
    try {
      // Same function as the admin page; local fallback cannot prove reviewability.
      const source = await readAdminSource()
      const post = source.posts.find(p => p.slug === path.slice('content/posts/'.length,-3))
      if (source.source !== 'github') throw Error('not_ready')
      const file = await readFile(path)
      const { data, content } = matter(file.content)
      const state = getDmpArticleState({ data, content, publicationContext: { path }, today: new Date(Date.now()+9*3600000).toISOString().slice(0,10) })
      if(state.contentVersion!==version || data.archived===true || data.rejection_reason)throw Error('not_ready')
      if(state.publishable){
        // The public pages use deployed local content. GitHub alone is insufficient.
        if(typeof readDeployedFile!=='function')throw Error('not_deployed')
        const deployed=await readDeployedFile(path)
        if(createHash('sha256').update(deployed).digest('hex')!==createHash('sha256').update(file.content).digest('hex'))throw Error('not_deployed')
      }else if(!post || post.contentVersion!==version || post.rejectionReason || data.draft!==true || data.reviewed!==false || data.auto_approved!==false)throw Error('not_ready')
      return Response.json({ authenticated:true,source:'production-admin',path,contentVersion:version,
        blob:createHash('sha256').update(file.content).digest('hex'),sourceRevision:file.sha,reviewable:true,published:state.publishable },{headers})
    } catch { return Response.json({status:'pending-reflection'},{status:409,headers}) }
  }
}
