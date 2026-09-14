// Inert production adapter composition. The host supplies already-authenticated
// capabilities; this module neither loads credentials nor creates transports.
import { createIsolatedSync } from './mwf-isolated-sync.mjs'
export function createMwfCapabilities({ generateArticle, readAdminReceipt, sendTeacherReview, git, spool }) {
  for (const fn of [generateArticle, readAdminReceipt, sendTeacherReview, git]) if (typeof fn !== 'function') throw new Error('missing_delivery_capability')
  return {
    generate: request => generateArticle(request),
    sync: createIsolatedSync({ spool, run: git }),
    reflect: item => readAdminReceipt({ path: item.path, contentVersion: item.contentVersion, blob: item.blob }),
    notify: item => sendTeacherReview({ ...item, reviewUrl: 'https://aisoukai-media.vercel.app/admin/pending-review' }),
  }
}

export function createAdminReceiptReader({ authenticatedFetch }) {
  if (typeof authenticatedFetch !== 'function') throw new Error('missing_admin_transport')
  return async ({ path, contentVersion }) => {
    const url = new URL('https://aisoukai-media.vercel.app/admin/pending-review/mwf-receipt')
    url.searchParams.set('path', path); url.searchParams.set('contentVersion', contentVersion)
    const response = await authenticatedFetch(url.href, { method:'GET',redirect:'error',cache:'no-store' })
    if (!response.ok || response.redirected || response.url !== url.href || !response.headers.get('content-type')?.includes('application/json')) return null
    return response.json()
  }
}
