import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../hooks/useAuth'

/** Gate for protected routes. Waits for auth to resolve, then redirects. */
export default function RequireAuth({ children }: { children: ReactNode }) {
  const { ready, member } = useAuth()
  const location = useLocation()

  if (!ready) {
    return (
      <div className="grid min-h-full place-items-center">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-navy/20"
          style={{ borderTopColor: 'var(--coral)' }}
        />
      </div>
    )
  }

  if (!member) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <>{children}</>
}
