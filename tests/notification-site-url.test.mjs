import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveNotificationSiteUrl } from '../scripts/lib/site-url.mjs'

test('notification URLs never use example.com or localhost', () => {
  assert.equal(
    resolveNotificationSiteUrl({ NEXT_PUBLIC_SITE_URL: 'https://example.com' }),
    'https://aisoukai-media.vercel.app',
  )
  assert.equal(
    resolveNotificationSiteUrl({ NEXT_PUBLIC_SITE_URL: 'http://localhost:3000' }),
    'https://aisoukai-media.vercel.app',
  )
})

test('notification URLs normalize valid site URLs', () => {
  assert.equal(
    resolveNotificationSiteUrl({ NEXT_PUBLIC_SITE_URL: 'https://clinic.example.jp/' }),
    'https://clinic.example.jp',
  )
  assert.equal(
    resolveNotificationSiteUrl({ VERCEL_URL: 'aisoukai-media.vercel.app' }),
    'https://aisoukai-media.vercel.app',
  )
})

