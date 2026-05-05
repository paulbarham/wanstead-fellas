import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

const AGE_GROUPS = ['Under 20', '20–29', '30–39', '40–49', '50+']

export default function RegisterPage() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '', name: '', surname: '', age_group: '20–29' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    setLoading(true)
    const { error } = await signUp(form.email, form.password, form.name, form.surname, form.age_group)
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
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
            style={{ background: '#0D6B52' }}>
            <span className="font-display text-3xl text-white">WF</span>
          </div>
          <h1 className="font-display text-4xl text-white tracking-wide">WANSTEAD FELLAS</h1>
          <p className="text-sm mt-1" style={{ color: '#888' }}>Thursday Night Football</p>
        </div>

        <div className="rounded-2xl p-6" style={{ background: '#141414', border: '1px solid #2e2e2e' }}>
          <h2 className="text-lg font-semibold text-white mb-5">Create Account</h2>

          {error && (
            <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: '#2a0a0a', color: '#ff6b6b', border: '1px solid #5a1a1a' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: '#888' }}>First Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => set('name', e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-xl text-white text-sm outline-none"
                  style={{ background: '#1e1e1e', border: '1px solid #2e2e2e' }}
                  placeholder="Paul"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: '#888' }}>Surname</label>
                <input
                  type="text"
                  value={form.surname}
                  onChange={e => set('surname', e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-xl text-white text-sm outline-none"
                  style={{ background: '#1e1e1e', border: '1px solid #2e2e2e' }}
                  placeholder="Smith"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#888' }}>Age Group</label>
              <select
                value={form.age_group}
                onChange={e => set('age_group', e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-white text-sm outline-none"
                style={{ background: '#1e1e1e', border: '1px solid #2e2e2e' }}
              >
                {AGE_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#888' }}>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={e => set('email', e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl text-white text-sm outline-none"
                style={{ background: '#1e1e1e', border: '1px solid #2e2e2e' }}
                placeholder="you@email.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#888' }}>Password</label>
              <input
                type="password"
                value={form.password}
                onChange={e => set('password', e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl text-white text-sm outline-none"
                style={{ background: '#1e1e1e', border: '1px solid #2e2e2e' }}
                placeholder="Min 6 characters"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl font-semibold text-white text-sm transition-opacity disabled:opacity-50"
              style={{ background: '#0D6B52' }}
            >
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm mt-4" style={{ color: '#888' }}>
          Already have an account?{' '}
          <Link to="/login" className="font-medium" style={{ color: '#0D6B52' }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
