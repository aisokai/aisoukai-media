import { readDeployedPostFile } from '@/lib/deployedPostFile.mjs'
import { requireAdmin } from '@/lib/adminAuth'
import { getPendingReviewPostsForAdminWithSource } from '@/lib/posts'
import { readGitHubFile } from '@/lib/githubContents'
import { createMwfReceiptHandler } from '@/lib/mwfAdminReceipt.mjs'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// Read-only metadata; authentication and source are shared with the review page.
export const GET = createMwfReceiptHandler({
  authenticate: requireAdmin,
  readAdminSource: getPendingReviewPostsForAdminWithSource,
  readFile: readGitHubFile,
  readDeployedFile: async (path: string) => (await readDeployedPostFile(path)).toString('utf8'),
})
