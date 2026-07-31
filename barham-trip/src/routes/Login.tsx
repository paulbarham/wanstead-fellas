import { useState, type FormEvent } from 'react'
import { useNavigate, useLocation, Navigate } from 'react-router-dom'
import { Mail, KeyRound, ArrowRight, Check } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { meta } from '../lib/itinerary'
import Avatar from '../components/Avatar'

export default function Login() {
  const { isLocalMode, members, signInWithMagicLink, signInWithPin, signInAsSeat, member } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  const [email, setEmail] = useState('')
  const [pin, setPin] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Already signed in? Bounce home.
  if (member) {
    return <Navigate to={from} replace />
  }

  async function handleMagicLink(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const { error } = await signInWithMagicLink(email.trim())
    setBusy(false)
    if (error) setError(error)
    else setSent(true)
  }

  async function handlePin(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const { error } = await signInWithPin(pin.trim())
    setBusy(false)
    if (error) setError(error)
    else navigate(from, { replace: true })
  }

  function pickSeat(id: string) {
    signInAsSeat(id)
    navigate(from, { replace: true })
  }

  return (
    <div
      className="min-h-full"
      style={{ backgroundImage: 'linear-gradient(160deg, #f6c9a0 0%, #e08853 42%, #0e3a48 100%)' }}
    >
      <div className="safe-top mx-auto flex min-h-full max-w-[480px] flex-col px-6 pb-10 pt-16">
        {/* Cover */}
        <div className="text-white">
          <div
            className="mb-5 grid h-16 w-16 place-items-center rounded-2xl font-display text-3xl font-bold"
            style={{ background: 'rgba(255,255,255,0.16)', border: '1px solid rgba(255,255,255,0.3)' }}
          >
            B
          </div>
          <h1 className="font-display text-4xl leading-tight">Barham Family Trip</h1>
          <p className="mt-2 text-[15px] font-medium text-white/85">
            {meta.trip} · six of us, three weeks, one plan.
          </p>
          <p className="mt-1 text-[13px] uppercase tracking-wide text-white/70">
            8 — 29 August 2026
          </p>
        </div>

        <div className="mt-8">
          {isLocalMode ? (
            <SeatPicker members={members} onPick={pickSeat} />
          ) : (
            <div className="rounded-card bg-white p-5 shadow-card">
              {sent ? (
                <div className="flex flex-col items-center py-6 text-center">
                  <div
                    className="grid h-12 w-12 place-items-center rounded-full"
                    style={{ background: 'var(--sand)' }}
                  >
                    <Check style={{ color: 'var(--coral-dark)' }} />
                  </div>
                  <h2 className="font-display mt-3 text-xl text-navy">Check your email</h2>
                  <p className="mt-1 text-[14px] text-navy/70">
                    We've sent a magic link to <span className="font-semibold">{email}</span>. Tap it
                    on this phone to sign in.
                  </p>
                  <button
                    className="mt-4 text-[13px] font-semibold"
                    style={{ color: 'var(--coral-dark)' }}
                    onClick={() => setSent(false)}
                  >
                    Use a different email
                  </button>
                </div>
              ) : (
                <>
                  {/* Magic link */}
                  <form onSubmit={handleMagicLink}>
                    <label className="text-[13px] font-semibold text-navy">Sign in with email</label>
                    <div className="mt-2 flex items-center gap-2 rounded-xl px-3" style={{ border: '1px solid rgba(14,58,72,0.18)' }}>
                      <Mail size={18} className="text-navy/50" />
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@email.com"
                        autoComplete="email"
                        className="flex-1 bg-transparent py-3 text-[15px] outline-none"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={busy}
                      className="btn-coral mt-3 w-full disabled:opacity-60"
                    >
                      Send magic link <ArrowRight size={18} />
                    </button>
                  </form>

                  {/* Divider */}
                  <div className="my-5 flex items-center gap-3">
                    <span className="h-px flex-1" style={{ background: 'rgba(14,58,72,0.12)' }} />
                    <span className="text-[12px] font-semibold uppercase tracking-wide text-navy/40">
                      or
                    </span>
                    <span className="h-px flex-1" style={{ background: 'rgba(14,58,72,0.12)' }} />
                  </div>

                  {/* Family PIN */}
                  <form onSubmit={handlePin}>
                    <label className="text-[13px] font-semibold text-navy">
                      Family PIN <span className="font-normal text-navy/50">(for the twins)</span>
                    </label>
                    <div className="mt-2 flex items-center gap-2 rounded-xl px-3" style={{ border: '1px solid rgba(14,58,72,0.18)' }}>
                      <KeyRound size={18} className="text-navy/50" />
                      <input
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={4}
                        value={pin}
                        onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                        placeholder="4-digit code"
                        className="flex-1 bg-transparent py-3 text-[15px] tracking-[0.4em] outline-none"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={busy || pin.length !== 4}
                      className="btn-navy mt-3 w-full disabled:opacity-50"
                    >
                      Enter
                    </button>
                  </form>
                </>
              )}

              {error && (
                <p className="mt-3 text-center text-[13px] font-medium" style={{ color: '#b3402a' }}>
                  {error}
                </p>
              )}
            </div>
          )}
        </div>

        <p className="mt-auto pt-8 text-center text-[12px] text-white/70">
          Install to your home screen for the full offline app.
        </p>
      </div>
    </div>
  )
}

function SeatPicker({
  members,
  onPick,
}: {
  members: ReturnType<typeof useAuth>['members']
  onPick: (id: string) => void
}) {
  return (
    <div className="rounded-card bg-white p-5 shadow-card">
      <h2 className="font-display text-xl text-navy">Who are you?</h2>
      <p className="mt-1 text-[13px] text-navy/60">
        Preview mode — pick your seat. (Once the family accounts are set up, you'll sign in with
        email or a PIN.)
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {members.map((m) => (
          <button
            key={m.id}
            onClick={() => onPick(m.id)}
            className="flex items-center gap-2 rounded-xl p-2.5 text-left active:opacity-70"
            style={{ border: '1px solid rgba(14,58,72,0.14)', minHeight: 56 }}
          >
            <Avatar member={m} size={40} />
            <span className="text-[14px] font-semibold text-navy">{m.display_name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
