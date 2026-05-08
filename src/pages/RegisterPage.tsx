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
    <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: 'var(--color-bg)' }}>
      <div className="w-full" style={{ maxWidth: 430 }}>
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
            style={{ background: 'var(--color-primary)' }}>
            <span className="font-display text-3xl text-white">WF</span>
          </div>
          <h1 className="font-display text-4xl text-[var(--color-text)] tracking-wide">WANSTEAD FELLAS</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>Thursday Night Football</p>
        </div>

        <div className="rounded-2xl p-6" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <h2 className="text-lg font-semibold text-[var(--color-text)] mb-5">Create Account</h2>

          {error && (
            <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: 'var(--color-error-bg)', color: 'var(--color-error-text)', border: '1px solid #FECACA' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>First Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => set('name', e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-xl text-[var(--color-text)] text-sm outline-none"
                  style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                  placeholder="Paul"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Surname</label>
                <input
                  type="text"
                  value={form.surname}
                  onChange={e => set('surname', e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-xl text-[var(--color-text)] text-sm outline-none"
                  style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                  placeholder="Smith"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Age Group</label>
              <select
                value={form.age_group}
                onChange={e => set('age_group', e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-[var(--color-text)] text-sm outline-none"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
              >
                {AGE_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={e => set('email', e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl text-[var(--color-text)] text-sm outline-none"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                placeholder="you@email.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Password</label>
              <input
                type="password"
                value={form.password}
                onChange={e => set('password', e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl text-[var(--color-text)] text-sm outline-none"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                placeholder="Min 6 characters"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl font-semibold text-white text-sm transition-opacity disabled:opacity-50"
              style={{ background: 'var(--color-primary)' }}
            >
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm mt-4" style={{ color: 'var(--color-text-muted)' }}>
          Already have an account?{' '}
          <Link to="/login" className="font-medium" style={{ color: 'var(--color-primary)' }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
