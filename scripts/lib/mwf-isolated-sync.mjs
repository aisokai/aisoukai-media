// Git plumbing in a dedicated bare repository: never stages or checks out the dev tree.
// run is a preconfigured Git capability supplied at deployment, not a shell command.
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { parseCsv } from '../csv-parser.mjs'
import matter from 'gray-matter'
import { validatePostArtifact } from './post-artifact-validation.mjs'
import { getDmpArticleState } from '../../src/lib/dmpArticleState.mjs'
import { verifyBlogEvidence, assessTieredPublication } from '../../src/lib/tieredPublication.mjs'
import { validateDraft } from './mwf-delivery.mjs'

export function createIsolatedSync({ spool, run, attempts = 3, verificationSecret }) {
  if (typeof run !== 'function' || !Number.isInteger(attempts) || attempts < 1 || attempts > 5) throw new Error('invalid_sync_capability')
  const root = resolve(spool)
  return async function sync(item) {
    if (!/^[a-f0-9]{64}$/.test(item.id ?? '') || (!item.expectedBaseBlob && !item.path?.endsWith(`-mwf-${item.id}.md`)) || !/^content\/posts\/\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md$/.test(item.path) || validateDraft(item.raw,verificationSecret).blob !== item.blob) return { status: 'conflict' }
    const validation = validatePostArtifact(item.path.split('/').at(-1), item.raw, { imageExists: () => true })
    if (validation.errors.length) return { status: 'conflict' }
    const image = matter(item.raw).data.image
    // Every attempt gets a fresh object database/index, with no shared dev refs.
    for (let attempt = 0; attempt < attempts; attempt++) {
      const dir = join(root, randomUUID())
      mkdirSync(dir, { recursive: true })
      const git = async (args, input) => run({ directory: dir, args, input })
      const requireOk = async (args, input) => {
        const result = await git(args, input)
        if (!result?.ok) throw new Error('git_step_failed')
        return String(result.output ?? '').trim()
      }
      try {
        await requireOk(['init', '--bare', '.'])
        // The capability maps the fixed alias to the authorized repository.
        await requireOk(['fetch', '--no-tags', 'delivery-origin', 'refs/heads/main'])
        const parent = await requireOk(['rev-parse', 'FETCH_HEAD'])
        if (image && (!/^\/images\/[A-Za-z0-9_./-]+$/.test(image) || image.includes('..') || !(await git(['cat-file', '-e', `${parent}:public${image}`])).ok)) return { status: 'conflict' }
        const certified=matter(item.raw)
        if(certified.data.tiered_review_proof){
          const proof=verifyBlogEvidence(certified.data.tiered_review_proof,'independent-article-review',verificationSecret)
          if(!proof || await requireOk(['rev-parse',`${parent}:public${image}`])!==proof.imageGitBlob)return {status:'conflict'}
          const library=JSON.parse(await requireOk(['show',`${parent}:data/image-library.json`]))
          const topic=proof.tier==='normal'?parseCsv(await requireOk(['show',`${parent}:data/article-topics.sample.csv`])).find(t=>t.id===certified.data.source_topic_id):undefined
          if(!assessTieredPublication(certified.data,certified.content,verificationSecret,{path:item.path,imageHash:proof.imageHash,asset:library.images?.find(i=>i.path===image),topic}))return {status:'conflict'}
        }
        const existing = await git(['show', `${parent}:${item.path}`])
        if (existing.ok) {
          const currentBlob=createHash('sha256').update(existing.output).digest('hex')
          if(currentBlob===item.blob)return {status:'synced',blob:item.blob,commit:parent}
          const old=matter(existing.output), candidate=matter(item.raw)
          const proof=verifyBlogEvidence(candidate.data.tiered_review_proof,'independent-article-review',verificationSecret)
          const baseline=verifyBlogEvidence(proof?.baseline,'human-approved-baseline',verificationSecret)
          if(currentBlob!==item.expectedBaseBlob || proof?.tier!=='minor' || baseline?.contentVersion!==getDmpArticleState({data:old.data,content:old.content}).contentVersion || !getDmpArticleState({data:old.data,content:old.content}).approvedExactVersion) return {status:'conflict'}
        }
        if(item.expectedBaseBlob && !existing.ok)return {status:'conflict'}
        // Verify true absence: a transport/object-read error is not absence.
        const entries = await requireOk(['ls-tree', '-r', '--name-only', parent, '--', item.path])
        if (entries && !existing.ok) return { status: 'conflict' }
        await requireOk(['read-tree', parent])
        const object = await requireOk(['hash-object', '-w', '--stdin'], item.raw)
        await requireOk(['update-index', '--add', '--cacheinfo', `100644,${object},${item.path}`])
        const tree = await requireOk(['write-tree'])
        const changed = await requireOk(['diff-tree', '--no-commit-id', '--name-only', '-r', parent, tree])
        if (changed !== item.path) throw new Error('target_scope_mismatch')
        const commit = await requireOk(['commit-tree', tree, '-p', parent], `MWF unreviewed draft ${item.id}\n`)
        const pushed = await git(['push', 'delivery-origin', `${commit}:refs/heads/main`])
        if (!pushed.ok) continue // retry latest main; never force, merge or rebase
        const remote = await requireOk(['ls-remote', 'delivery-origin', 'refs/heads/main'])
        if (remote.split(/\s+/)[0] === commit) return { status: 'synced', blob: item.blob, commit }
        // A raced successful push is recovered by the exact artifact check next attempt.
      } catch { /* per-item bounded failure, preserve artifact for next invocation */ }
    }
    return { status: 'pending' }
  }
}
