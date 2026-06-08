import type { Metadata } from 'next'
import { NOINDEX_METADATA } from '@/lib/seo'
import LoginForm from './LoginForm'

export const metadata: Metadata = {
  title: 'Admin Login',
  ...NOINDEX_METADATA,
}

export default function AdminLoginPage() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-[420px] items-center px-4">
      <LoginForm />
    </div>
  )
}
