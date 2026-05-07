import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

export default function LoginPage() {
  const { signIn, session } = useAuth()
  const navigate = useNavigate()
  const [view, setView] = useState<'login' | 'reset'>('login')

  // Navigate away once the session is committed to React state.
  // This is the authoritative redirect — the navigate() call in handleSubmit
  // is just an optimistic fast-path that may fire before state is flushed.
  useEffect(() => {
    if (session) navigate('/', { replace: true })
  }, [session])

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const [resetEmail, setResetEmail] = useState('')
  const [resetSending, setResetSending] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [resetError, setResetError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await signIn(email, password)
    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
      navigate('/')
    }
  }

  async function handleResetSubmit(e: React.FormEvent) {
    e.preventDefault()
    setResetSending(true)
    setResetError('')
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: window.location.origin,
    })
    setResetSending(false)
    if (error) {
      setResetError(error.message)
    } else {
      setResetSent(true)
    }
  }

  const logo = (
    <div className="text-center mb-8">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
        style={{ background: '#0D6B52' }}>
        <span className="font-display text-3xl text-white">WF</span>
      </div>
      <h1 className="font-display text-4xl text-[#18201A] tracking-wide">WANSTEAD FELLAS</h1>
      <p className="text-sm mt-1" style={{ color: '#647060' }}>Thursday Night Football</p>
    </div>
  )

  if (view === 'reset') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: '#F2F3EE' }}>
        <div className="w-full" style={{ maxWidth: 430 }}>
          {logo}
          <div className="rounded-2xl p-6" style={{ background: '#FFFFFF', border: '1px solid #E2E4DC' }}>
            <h2 className="text-lg font-semibold text-[#18201A] mb-1">Reset Password</h2>
            <p className="text-sm mb-5" style={{ color: '#647060' }}>Enter your email and we'll send a reset link.</p>

            {resetSent ? (
              <div className="text-center py-6">
                <div className="text-4xl mb-3">📬</div>
                <p className="text-[#18201A] font-semibold mb-1">Check your email for a password reset link.</p>
                <p className="text-sm mb-5" style={{ color: '#647060' }}>Didn't get it? Check your spam folder.</p>
                <button
                  onClick={() => { setView('login'); setResetSent(false); setResetEmail('') }}
                  className="text-sm font-medium"
                  style={{ color: '#0D6B52' }}
                >
                  Back to sign in
                </button>
              </div>
            ) : (
              <>
                {resetError && (
                  <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
                    {resetError}
                  </div>
                )}
                <form onSubmit={handleResetSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: '#647060' }}>Email</label>
                    <input
                      type="email"
                      value={resetEmail}
                      onChange={e => setResetEmail(e.target.value)}
                      required
                      className="w-full px-4 py-3 rounded-xl text-[#18201A] text-sm outline-none"
                      style={{ background: '#FFFFFF', border: '1px solid #E2E4DC' }}
                      placeholder="you@email.com"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={resetSending}
                    className="w-full py-3 rounded-xl font-semibold text-white text-sm disabled:opacity-50"
                    style={{ background: '#0D6B52' }}
                  >
                    {resetSending ? 'Sending...' : 'Send reset link'}
                  </button>
                </form>
                <button
                  onClick={() => setView('login')}
                  className="w-full mt-3 text-sm text-center"
                  style={{ color: '#647060' }}
                >
                  Back to sign in
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: '#F2F3EE' }}>
      <div className="w-full" style={{ maxWidth: 430 }}>
        {logo}

        <div className="rounded-2xl p-6" style={{ background: '#FFFFFF', border: '1px solid #E2E4DC' }}>
          <h2 className="text-lg font-semibold text-[#18201A] mb-5">Sign In</h2>

          {error && (
            <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#647060' }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl text-[#18201A] text-sm outline-none transition-colors"
                style={{ background: '#FFFFFF', border: '1px solid #E2E4DC' }}
                placeholder="you@email.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#647060' }}>Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl text-[#18201A] text-sm outline-none"
                style={{ background: '#FFFFFF', border: '1px solid #E2E4DC' }}
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl font-semibold text-white text-sm transition-opacity disabled:opacity-50"
              style={{ background: '#0D6B52' }}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <button
            onClick={() => setView('reset')}
            className="w-full mt-3 text-sm text-center"
            style={{ color: '#647060' }}
          >
            Forgot password?
          </button>
        </div>

        <p className="text-center text-sm mt-4" style={{ color: '#647060' }}>
          No account?{' '}
          <Link to="/register" className="font-medium" style={{ color: '#0D6B52' }}>
            Create one
          </Link>
        </p>
      </div>
    </div>
  )
}
