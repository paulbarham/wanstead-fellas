import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function LoginPage() {
  const { signIn, session } = useAuth()
  const navigate = useNavigate()

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

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: '#0a0a0a' }}>
      <div className="w-full" style={{ maxWidth: 430 }}>
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
            style={{ background: '#0D6B52' }}>
            <span className="font-display text-3xl text-white">WF</span>
          </div>
          <h1 className="font-display text-4xl text-white tracking-wide">WANSTEAD FELLAS</h1>
          <p className="text-sm mt-1" style={{ color: '#888' }}>Thursday Night Football</p>
        </div>

        <div className="rounded-2xl p-6" style={{ background: '#141414', border: '1px solid #2e2e2e' }}>
          <h2 className="text-lg font-semibold text-white mb-5">Sign In</h2>

          {error && (
            <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: '#2a0a0a', color: '#ff6b6b', border: '1px solid #5a1a1a' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#888' }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl text-white text-sm outline-none transition-colors"
                style={{ background: '#1e1e1e', border: '1px solid #2e2e2e' }}
                placeholder="you@email.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#888' }}>Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl text-white text-sm outline-none"
                style={{ background: '#1e1e1e', border: '1px solid #2e2e2e' }}
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
        </div>

        <p className="text-center text-sm mt-4" style={{ color: '#888' }}>
          No account?{' '}
          <Link to="/register" className="font-medium" style={{ color: '#0D6B52' }}>
            Create one
          </Link>
        </p>
      </div>
    </div>
  )
}
