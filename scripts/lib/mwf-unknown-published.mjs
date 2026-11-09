import {getReviewedContentFingerprint} from '../../src/lib/reviewContentFingerprint.mjs'
import {isProtectedEditorialInput} from '../../src/lib/tieredPublication.mjs'
const HASH=/^[a-f0-9]{64}$/
// Automation identities that must never be treated as a Human commit for this
// evidence path. Git author/committer fields are self-asserted, so this check
// is corroborating only; the binding evidence is the fingerprint-checked
// reviewed record plus the append-only review history (see DESIGN-NOTE.md).
const AUTOMATION_NAMES=new Set(['MWF Draft Runner'])
const AUTOMATION_EMAILS=new Set(['mwf@users.noreply.github.com'])
const fail=()=>{throw Error('unknown_published_unproven')}
// Server-only evidence check for a published article that has no canonical
// comparison entry (inventory/claims). Accepting here NEVER creates an
// approval record and never makes the article publishable; it only decides
// whether the article may be represented by a comparisonOnly projection so
// duplicate comparison can include it. All three adopted evidence points are
// required; any gap rejects with unknown_published_unproven:
//  (1) frontmatter reviewed record whose reviewed_content_hash recomputes
//      exactly (any post-review body or non-approval metadata change breaks
//      the fingerprint), on a non-draft, non-archived, non-rejected article;
//  (2) an append-only logs/review-history.md approve record for the same
//      article slug by the same reviewer;
//  (3) the commit that introduced the current git blob is attributable to a
//      non-automation (Human) author and committer.
export function validateUnknownPublishedEvidence({data,content,reviewHistoryText,path,commit}){
 if(!data||typeof data!=='object'||Array.isArray(data))fail()
 if(data.draft!==false||data.reviewed!==true||data.archived||data.rejection_reason)fail()
 if(typeof data.reviewed_by!=='string'||!data.reviewed_by.trim())fail()
 const reviewedAt=data.reviewed_at instanceof Date?data.reviewed_at.getTime():Date.parse(String(data.reviewed_at??''))
 if(!Number.isFinite(reviewedAt))fail()
 if(!HASH.test(String(data.reviewed_content_hash??'')))fail()
 if(isProtectedEditorialInput(data,content))fail()
 if(getReviewedContentFingerprint(data,content)!==data.reviewed_content_hash)fail()
 const stem=String(path??'').split('/').at(-1).replace(/\.md$/,'')
 if(!stem)fail()
 const reviewer=String(data.reviewed_by)
 const recorded=String(reviewHistoryText??'').split(/^## /m).some(block=>{
  const lines=block.split('\n').map(line=>line.trim())
  return lines.includes(`slug: ${stem}`)&&lines.includes('action: approve')&&lines.includes(`reviewed_by: ${reviewer}`)
 })
 if(!recorded)fail()
 if(!commit||!commit.authorName||!commit.authorEmail||!commit.committerName||!commit.committerEmail)fail()
 if(AUTOMATION_NAMES.has(commit.authorName)||AUTOMATION_NAMES.has(commit.committerName))fail()
 if(AUTOMATION_EMAILS.has(commit.authorEmail)||AUTOMATION_EMAILS.has(commit.committerEmail))fail()
 return true
}
