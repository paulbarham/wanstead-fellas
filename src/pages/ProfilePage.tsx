import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { cropAndResizeImage } from '../lib/imageUtils'
import TopTrumpCard from '../components/TopTrumpCard'
import PlayerAvatar from '../components/PlayerAvatar'
import MyFinances from '../components/MyFinances'

const AGE_GROUPS = ['Under 20', '20–29', '30–39', '40–49', '50+']

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function parseDob(dob: string | null | undefined) {
  if (!dob) return { day: '', month: '', year: '' }
  const [y, m, d] = dob.split('-')
  return {
    day: d ? String(parseInt(d)) : '',
    month: m ? String(parseInt(m)) : '',
    year: y ?? '',
  }
}

function composeDob(day: string, month: string, year: string): string | null {
  if (!day || !month || !year || year.length !== 4) return null
  const y = parseInt(year), m = parseInt(month), d = parseInt(day)
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export default function ProfilePage() {
  const { profile, user, refreshProfile, signOut } = useAuth()
  const navigate = useNavigate()

  const [name, setName] = useState(profile?.name ?? '')
  const [surname, setSurname] = useState(profile?.surname ?? '')
  const [ageGroup, setAgeGroup] = useState(profile?.age_group ?? '20–29')
  const parsed = parseDob(profile?.dob)
  const [dobDay, setDobDay] = useState(parsed.day)
  const [dobMonth, setDobMonth] = useState(parsed.month)
  const [dobYear, setDobYear] = useState(parsed.year)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveDone, setSaveDone] = useState(false)

  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const [resetSent, setResetSent] = useState(false)
  const [resetError, setResetError] = useState('')

  if (!profile) return null

  const previewProfile = { ...profile, name, surname, age_group: ageGroup }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaveError('')
    const { error } = await supabase
      .from('profiles')
      .update({ name, surname, age_group: ageGroup, dob: composeDob(dobDay, dobMonth, dobYear) })
      .eq('id', profile!.id)
    setSaving(false)
    if (error) {
      setSaveError(error.message)
    } else {
      await refreshProfile()
      setSaveDone(true)
      setTimeout(() => setSaveDone(false), 2500)
    }
  }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      const blob = await cropAndResizeImage(file)
      const path = `avatars/${profile!.id}/profile.jpg`
      const { error } = await supabase.storage
        .from('avatars')
        .upload(path, blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '0' })
      if (!error) {
        const { data } = supabase.storage.from('avatars').getPublicUrl(path)
        const photoUrl = `${data.publicUrl}?t=${Date.now()}`
        await supabase.from('profiles').update({ photo_url: photoUrl }).eq('id', profile!.id)
        await refreshProfile()
      }
    } finally {
      setUploading(false)
    }
  }

  async function handleRemovePhoto() {
    await supabase.storage.from('avatars').remove([`avatars/${profile!.id}/profile.jpg`])
    await supabase.from('profiles').update({ photo_url: null }).eq('id', profile!.id)
    await refreshProfile()
  }

  async function handlePasswordReset() {
    setResetError('')
    const email = user?.email
    if (!email) return
    const { error } = await supabase.auth.resetPasswordForEmail(email)
    if (error) {
      setResetError(error.message)
    } else {
      setResetSent(true)
    }
  }

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="px-4 py-5 pb-10">
      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 mb-5 text-sm font-medium"
        style={{ color: '#888' }}
      >
        ← Back
      </button>

      <p className="text-xs font-medium uppercase tracking-widest mb-1" style={{ color: '#0D6B52' }}>
        My Profile
      </p>
      <h1 className="font-display text-3xl text-white tracking-wide mb-6">PROFILE</h1>

      {/* Top Trump card preview */}
      <div className="mb-8">
        <TopTrumpCard profile={previewProfile} />
      </div>

      {/* Edit form */}
      <form onSubmit={handleSave} className="space-y-4 mb-8">

        {/* Photo */}
        <div className="flex items-center gap-4 p-4 rounded-2xl" style={{ background: '#141414', border: '1px solid #2e2e2e' }}>
          <PlayerAvatar profile={profile} size={56} />
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold disabled:opacity-50"
              style={{ background: '#0D6B52', color: 'white' }}
            >
              {uploading ? 'Uploading...' : profile.photo_url ? 'Change Photo' : 'Add Photo'}
            </button>
            {profile.photo_url && (
              <button
                type="button"
                onClick={handleRemovePhoto}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold"
                style={{ background: '#1a0808', color: '#ff6b6b', border: '1px solid #5a1a1a' }}
              >
                Remove Photo
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
        </div>

        {/* Name */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: '#888' }}>First Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl text-white text-sm outline-none"
              style={{ background: '#1e1e1e', border: '1px solid #2e2e2e' }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: '#888' }}>Surname</label>
            <input
              type="text"
              value={surname}
              onChange={e => setSurname(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl text-white text-sm outline-none"
              style={{ background: '#1e1e1e', border: '1px solid #2e2e2e' }}
            />
          </div>
        </div>

        {/* Age group */}
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: '#888' }}>Age Group</label>
          <select
            value={ageGroup}
            onChange={e => setAgeGroup(e.target.value)}
            className="w-full px-4 py-3 rounded-xl text-white text-sm outline-none"
            style={{ background: '#1e1e1e', border: '1px solid #2e2e2e' }}
          >
            {AGE_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>

        {/* Date of birth */}
        <div>
          <label className="block text-xs font-medium mb-2" style={{ color: '#888' }}>
            Date of Birth <span style={{ color: '#555' }}>(optional)</span>
          </label>
          <div className="flex gap-2">
            {/* Day */}
            <div className="flex flex-col gap-1" style={{ width: 68 }}>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={dobDay}
                onChange={e => setDobDay(e.target.value.replace(/\D/g, '').slice(0, 2))}
                placeholder="DD"
                className="w-full py-3 rounded-xl text-white text-sm outline-none text-center font-medium"
                style={{ background: '#1e1e1e', border: '1px solid #2e2e2e' }}
              />
              <span className="text-center text-[10px]" style={{ color: '#444' }}>Day</span>
            </div>
            {/* Month */}
            <div className="flex flex-col gap-1 flex-1">
              <select
                value={dobMonth}
                onChange={e => setDobMonth(e.target.value)}
                className="w-full py-3 px-3 rounded-xl text-sm outline-none"
                style={{
                  background: '#1e1e1e',
                  border: '1px solid #2e2e2e',
                  color: dobMonth ? 'white' : '#555',
                }}
              >
                <option value="">Month</option>
                {MONTHS.map((m, i) => (
                  <option key={m} value={String(i + 1)}>{m}</option>
                ))}
              </select>
              <span className="text-center text-[10px]" style={{ color: '#444' }}>Month</span>
            </div>
            {/* Year */}
            <div className="flex flex-col gap-1" style={{ width: 76 }}>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={dobYear}
                onChange={e => setDobYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="YYYY"
                className="w-full py-3 rounded-xl text-white text-sm outline-none text-center font-medium"
                style={{ background: '#1e1e1e', border: '1px solid #2e2e2e' }}
              />
              <span className="text-center text-[10px]" style={{ color: '#444' }}>Year</span>
            </div>
          </div>
        </div>

        {saveError && (
          <div className="p-3 rounded-lg text-sm" style={{ background: '#2a0a0a', color: '#ff6b6b', border: '1px solid #5a1a1a' }}>
            {saveError}
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="w-full py-3 rounded-xl font-semibold text-sm disabled:opacity-50 transition-colors"
          style={{ background: saveDone ? '#0a3a2a' : '#0D6B52', color: 'white' }}
        >
          {saving ? 'Saving...' : saveDone ? '✓ Saved' : 'Save Changes'}
        </button>
      </form>

      {/* My Finances */}
      <div className="mb-8">
        <MyFinances profile={profile} />
      </div>

      {/* Password reset */}
      <div className="p-4 rounded-2xl mb-4" style={{ background: '#141414', border: '1px solid #2e2e2e' }}>
        <p className="text-sm font-semibold text-white mb-1">Password</p>
        <p className="text-xs mb-3" style={{ color: '#555' }}>
          Send a reset link to {user?.email}
        </p>
        {resetSent ? (
          <p className="text-sm font-medium" style={{ color: '#4ade80' }}>
            ✓ Reset link sent to your email.
          </p>
        ) : (
          <>
            {resetError && (
              <p className="text-xs mb-2" style={{ color: '#ff6b6b' }}>{resetError}</p>
            )}
            <button
              onClick={handlePasswordReset}
              className="px-4 py-2 rounded-xl text-sm font-semibold"
              style={{ background: '#1e1e1e', color: '#aaa', border: '1px solid #2e2e2e' }}
            >
              Send password reset email
            </button>
          </>
        )}
      </div>

      {/* Sign out */}
      <button
        onClick={handleSignOut}
        className="w-full py-3 rounded-xl font-semibold text-sm"
        style={{ background: '#1a0808', color: '#ff6b6b', border: '1px solid #5a1a1a' }}
      >
        Sign Out
      </button>
    </div>
  )
}
