'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { api } from '@/lib/api'

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    let cancelled = false

    const check = async () => {
      if (pathname === '/login') {
        setChecked(true)
        return
      }

      try {
        const session = await api.auth.session()
        if (!cancelled && session.success && session.data.authenticated) {
          setChecked(true)
          return
        }
      } catch {
        // fall through to redirect
      }

      if (!cancelled) {
        router.replace('/login')
      }
    }

    setChecked(false)
    void check()

    return () => {
      cancelled = true
    }
  }, [pathname, router])

  if (!checked) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-[3px] border-gray-200 border-t-green-500 rounded-full" />
      </div>
    )
  }

  return <>{children}</>
}
