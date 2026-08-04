import { formatDistanceToNow, parseISO } from 'date-fns'
import { Users, RefreshCw, CheckCircle2, Clock, Smartphone } from 'lucide-react'
import { useAdminAccess, type AccessRow } from '../hooks/useAdminAccess'

/** Admin-only panel: who can access the app and who has actually signed in. */
export default function AdminAccess() {
  const { rows, error, loading, reload, supported } = useAdminAccess()

  if (!supported) {
    return (
      <Card>
        <Header onReload={reload} loading={false} />
        <p className="mt-1 text-[13px] text-navy/60">
          Sign-in tracking is available on the live app (needs the backend connection).
        </p>
      </Card>
    )
  }

  const loginRows = rows?.filter((r) => r.can_login) ?? []
  const managedRows = rows?.filter((r) => !r.can_login) ?? []
  const signedIn = loginRows.filter((r) => r.has_account).length

  return (
    <Card>
      <Header onReload={reload} loading={loading} />
      {rows && (
        <p className="mt-1 text-[13px] text-navy/60">
          {signedIn} of {loginRows.length} with a login have signed in.
        </p>
      )}

      {error && <p className="mt-3 text-[13px] font-medium text-coral-dark">{error}</p>}

      {rows && (
        <div className="mt-3 space-y-2">
          {loginRows.map((r) => (
            <PersonRow key={r.email ?? r.display_name} row={r} />
          ))}
          {managedRows.length > 0 && (
            <div className="pt-2">
              <div className="mb-1.5 text-[12px] font-bold uppercase tracking-wide text-navy/40">
                No login of their own
              </div>
              {managedRows.map((r) => (
                <PersonRow key={r.display_name} row={r} />
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section
      className="rounded-card p-4 shadow-card"
      style={{
        background: 'var(--surface)',
        border: '1px solid rgba(14,58,72,0.1)',
        backgroundClip: 'padding-box',
      }}
    >
      {children}
    </section>
  )
}

function Header({ onReload, loading }: { onReload: () => void; loading: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <Users size={18} style={{ color: 'var(--coral-dark)' }} />
      <h3 className="font-display text-lg text-navy">Family access</h3>
      <button
        onClick={onReload}
        className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-navy/45"
        style={{ border: '1px solid rgba(14,58,72,0.12)' }}
        aria-label="Refresh"
      >
        <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
      </button>
    </div>
  )
}

function PersonRow({ row }: { row: AccessRow }) {
  return (
    <div
      className="flex items-start gap-2.5 rounded-xl p-3"
      style={{ background: 'var(--sand-2)', border: '1px solid rgba(14,58,72,0.08)' }}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[15px] font-semibold text-navy">{row.display_name}</span>
          {row.is_admin && (
            <span
              className="rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
              style={{ background: 'var(--coral)' }}
            >
              Admin
            </span>
          )}
        </div>
        {row.email && <div className="mt-0.5 truncate text-[12px] text-navy/55">{row.email}</div>}
      </div>
      <Status row={row} />
    </div>
  )
}

function Status({ row }: { row: AccessRow }) {
  // Managed member (no login of their own).
  if (!row.can_login) {
    return (
      <span className="flex flex-shrink-0 items-center gap-1 text-[12px] font-medium text-navy/50">
        <Smartphone size={13} />
        {row.managed_by ? `On ${row.managed_by}'s phone` : 'No login'}
      </span>
    )
  }

  // Can log in but hasn't yet.
  if (!row.has_account) {
    return (
      <span className="flex flex-shrink-0 items-center gap-1 text-[12px] font-medium" style={{ color: 'var(--coral-dark)' }}>
        <Clock size={13} /> Not signed up
      </span>
    )
  }

  // Signed in — show relative last sign-in.
  const when = row.last_sign_in_at
    ? formatDistanceToNow(parseISO(row.last_sign_in_at), { addSuffix: true })
    : 'signed up'
  return (
    <span className="flex flex-shrink-0 items-center gap-1 text-right text-[12px] font-medium" style={{ color: 'var(--teal)' }}>
      <CheckCircle2 size={13} /> {when}
    </span>
  )
}
