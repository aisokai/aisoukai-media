import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { LayoutDashboard } from 'lucide-react'
import { isAdminAuthenticated } from '@/lib/adminAuth'
import { NOINDEX_METADATA } from '@/lib/seo'
import { DmpActionPanel } from './DmpActionPanel'

export const metadata: Metadata = {
  title: 'DMP Action Queue — Admin',
  ...NOINDEX_METADATA,
}

export const dynamic = 'force-dynamic'

export default async function DmpActionsPage() {
  if (!(await isAdminAuthenticated())) redirect('/admin/login')

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">DMP Core</p>
        <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold text-gray-900">
          <LayoutDashboard className="h-6 w-6" />
          Action Queue
          <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">dry-run</span>
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
          DMP Core Action Queue の確認と dry-run Action の作成ができます。
          Phase3 では実送信・本公開は行いません。すべての操作は dry-run モードです。
        </p>
      </div>
      <DmpActionPanel />
    </main>
  )
}
