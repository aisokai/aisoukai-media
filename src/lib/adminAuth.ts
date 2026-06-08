import { cookies } from 'next/headers'
import { createHmac, timingSafeEqual } from 'node:crypto'

const COOKIE_NAME = 'aisoukai_admin_review'

function getSecret() {
  return process.env.ADMIN_REVIEW_COOKIE_SECRET ?? ''
}

export function signAdminToken(value: string) {
  const secret = getSecret()
  if (!secret) throw new Error('ADMIN_REVIEW_COOKIE_SECRET is not set')
  return createHmac('sha256', secret).update(value).digest('hex')
}

export async function setAdminSession() {
  const value = `admin:${Date.now()}`
  const signature = signAdminToken(value)
  const jar = await cookies()
  jar.set(COOKIE_NAME, `${value}.${signature}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/admin',
    maxAge: 60 * 60 * 24 * 14,
  })
}

export async function isAdminAuthenticated() {
  const secret = getSecret()
  if (!secret) return false

  const jar = await cookies()
  const raw = jar.get(COOKIE_NAME)?.value
  if (!raw) return false

  const [value, signature] = raw.split('.')
  if (!value || !signature) return false

  const expected = createHmac('sha256', secret).update(value).digest('hex')
  const signatureBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)
  if (signatureBuffer.length !== expectedBuffer.length) return false

  return timingSafeEqual(signatureBuffer, expectedBuffer)
}

export async function requireAdmin() {
  if (!(await isAdminAuthenticated())) {
    throw new Error('Unauthorized admin review action')
  }
}
