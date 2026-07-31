import { useState, type FormEvent } from 'react'
import { useNavigate, useLocation, Navigate } from 'react-router-dom'
import { Mail, Lock, ArrowRight, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { meta } from '../lib/itinerary'
import Avatar from '../components/Avatar'

export default function Login() {
  const {
    isLocalMode,
    members,
    signInWithPassword,
    signUpWithPassword,
    isFamilyEmail,
    signInAsSeat,
    member,
  } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Already signed in? Bounce home.
  if (member) {
    return <Navigate to={from} replace />
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    setBusy(true)

    // 1. Try to sign in as an existing account.
    const signIn = await signInWithPassword(email, password)
    if (!signIn.error) {
      navigate(from, { replace: true })
      return
    }

    // 2. Sign-in failed — only offer to create an account for family emails.
    const family = await isFamilyEmail(email)
    if (!family) {
      setBusy(false)
      setError("That email isn't on the family list. Ask Paul to add you.")
      return
    }

    // 3. First-time family member → create the account with this password.
    const signUp = await signUpWithPassword(email, password)
    setBusy(false)
    if (signUp.needsConfirm) {
      setError('Almost there — Paul needs to turn off email confirmation in Supabase, then try again.')
      return
    }
    if (signUp.error) {
      setError(
        /already registered/i.test(signUp.error)
          ? 'Wrong password for this account. Try again.'
          : signUp.error,
      )
      return
    }
    navigate(from, { replace: true })
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
          <p className="mt-1 text-[13px] uppercase tracking-wide text-white/70">8 — 29 August 2026</p>
        </div>

        <div className="mt-8">
          {isLocalMode ? (
            <SeatPicker members={members} onPick={pickSeat} />
          ) : (
            <div className="rounded-card bg-white p-5 shadow-card">
              <form onSubmit={handleSubmit}>
                <label className="text-[13px] font-semibold text-navy">Sign in</label>
                <p className="mb-3 mt-1 text-[13px] text-navy/55">
                  Enter your email and a password. The first time you sign in, that sets your
                  password.
                </p>

                <div
                  className="flex items-center gap-2 rounded-xl px-3"
                  style={{ border: '1px solid rgba(14,58,72,0.18)' }}
                >
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

                <div
                  className="mt-2 flex items-center gap-2 rounded-xl px-3"
                  style={{ border: '1px solid rgba(14,58,72,0.18)' }}
                >
                  <Lock size={18} className="text-navy/50" />
                  <input
                    type={showPw ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password (min 6 characters)"
                    autoComplete="current-password"
                    className="flex-1 bg-transparent py-3 text-[15px] outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="text-navy/45"
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                  >
                    {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>

                <button type="submit" disabled={busy} className="btn-coral mt-3 w-full disabled:opacity-60">
                  {busy ? 'Signing in…' : 'Sign in'} <ArrowRight size={18} />
                </button>
              </form>

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
        Preview mode — pick your seat. (Once the family accounts are set up, you'll sign in with your
        email and password.)
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
