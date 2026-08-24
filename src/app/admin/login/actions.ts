'use server'

import { createHash, timingSafeEqual } from 'node:crypto'
import { redirect } from 'next/navigation'
import { setAdminSession } from '@/lib/adminAuth'

export type LoginState = {
  ok: boolean
  message: string
}

const ADMIN_RETURN_TO_ORIGIN = 'https://admin.invalid'
const MAX_RETURN_TO_LENGTH = 2048

function normalizeAdminReturnTo(value: FormDataEntryValue | null): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_RETURN_TO_LENGTH) return null
  if (value !== value.trim() || /[\\\u0000-\u001f\u007f]/.test(value)) return null
  if (!value.startsWith('/') || value.startsWith('//')) return null

  const pathPart = value.split(/[?#]/, 1)[0]
  if (pathPart.includes('%') || pathPart.split('/').some((part) => part === '.' || part === '..')) return null

  try {
    decodeURIComponent(value)
    const target = new URL(value, ADMIN_RETURN_TO_ORIGIN)
    if (target.origin !== ADMIN_RETURN_TO_ORIGIN || target.username || target.password) return null
    if (target.pathname !== '/admin' && !target.pathname.startsWith('/admin/')) return null
    return `${target.pathname}${target.search}${target.hash}`
  } catch {
    return null
  }
}

function passwordsMatch(candidate: string, expected: string) {
  const candidateHash = createHash('sha256').update(candidate).digest()
  const expectedHash = createHash('sha256').update(expected).digest()
  return timingSafeEqual(candidateHash, expectedHash)
}

export async function loginAdmin(_: LoginState, formData: FormData): Promise<LoginState> {
  const passwordValues = formData.getAll('password')
  const password = passwordValues.length === 1 && typeof passwordValues[0] === 'string'
    ? passwordValues[0]
    : null
  const returnToValues = formData.getAll('returnTo')
  const returnTo = returnToValues.length === 1 ? normalizeAdminReturnTo(returnToValues[0]) : null
  const expected = process.env.ADMIN_REVIEW_PASSWORD

  if (!expected) {
    return { ok: false, message: 'ADMIN_REVIEW_PASSWORD が未設定です' }
  }

  const passwordMatches = passwordsMatch(password ?? '', expected)
  if (password === null || !passwordMatches) {
    return { ok: false, message: 'パスコードが違います' }
  }

  await setAdminSession()
  redirect(returnTo ?? '/admin')
}
