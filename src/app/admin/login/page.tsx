import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { isAdminAuthenticated } from '@/lib/adminAuth'
import { NOINDEX_METADATA } from '@/lib/seo'
import LoginForm from './LoginForm'

export const metadata: Metadata = {
  title: 'Admin Login',
  ...NOINDEX_METADATA,
}

type PageProps = {
  searchParams?: Promise<{ returnTo?: string | string[] }>
}

const ADMIN_RETURN_TO_ORIGIN = 'https://admin.invalid'
const MAX_RETURN_TO_LENGTH = 2048

function normalizeAdminReturnTo(value: string | string[] | undefined): string | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_RETURN_TO_LENGTH) return undefined
  if (value !== value.trim() || /[\\\u0000-\u001f\u007f]/.test(value)) return undefined
  if (!value.startsWith('/') || value.startsWith('//')) return undefined

  const pathPart = value.split(/[?#]/, 1)[0]
  if (pathPart.includes('%') || pathPart.split('/').some((part) => part === '.' || part === '..')) return undefined

  try {
    decodeURIComponent(value)
    const target = new URL(value, ADMIN_RETURN_TO_ORIGIN)
    if (target.origin !== ADMIN_RETURN_TO_ORIGIN || target.username || target.password) return undefined
    if (target.pathname !== '/admin' && !target.pathname.startsWith('/admin/')) return undefined
    return `${target.pathname}${target.search}${target.hash}`
  } catch {
    return undefined
  }
}

export default async function AdminLoginPage({ searchParams }: PageProps) {
  const params = await searchParams
  const returnTo = normalizeAdminReturnTo(params?.returnTo)
  if (await isAdminAuthenticated()) redirect(returnTo ?? '/admin')

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-[420px] items-center px-4">
      <LoginForm returnTo={returnTo} />
    </div>
  )
}
