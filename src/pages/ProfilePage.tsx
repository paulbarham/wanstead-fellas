import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { cropAndResizeImage } from '../lib/imageUtils'
import PlayerCard from '../components/PlayerCard'
import PlayerAvatar from '../components/PlayerAvatar'
import MyFinances from '../components/MyFinances'
import type { Profile } from '../types'
import { CLUBS } from '../lib/clubs'

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

interface DobProps {
  day: string; month: string; year: string
  setDay: (v: string) => void; setMonth: (v: string) => void; setYear: (v: string) => void
}

function DobInputs({ day, month, year, setDay, setMonth, setYear }: DobProps) {
  return (
    <div className="flex gap-2">
      <div className="flex flex-col gap-1" style={{ width: 68 }}>
        <input
          type="text" inputMode="numeric" pattern="[0-9]*"
          value={day} onChange={e => setDay(e.target.value.replace(/\D/g, '').slice(0, 2))}
          placeholder="DD"
          className="w-full py-3 rounded-xl text-[var(--color-text)] text-sm outline-none text-center font-medium"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        />
        <span className="text-center text-[10px]" style={{ color: '#444' }}>Day</span>
      </div>
      <div className="flex flex-col gap-1 flex-1">
        <select
          value={month} onChange={e => setMonth(e.target.value)}
          className="w-full py-3 px-3 rounded-xl text-sm outline-none"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: month ? 'var(--color-text)' : '#9CA897' }}
        >
          <option value="">Month</option>
          {MONTHS.map((m, i) => <option key={m} value={String(i + 1)}>{m}</option>)}
        </select>
        <span className="text-center text-[10px]" style={{ color: '#444' }}>Month</span>
      </div>
      <div className="flex flex-col gap-1" style={{ width: 76 }}>
        <input
          type="text" inputMode="numeric" pattern="[0-9]*"
          value={year} onChange={e => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
          placeholder="YYYY"
          className="w-full py-3 rounded-xl text-[var(--color-text)] text-sm outline-none text-center font-medium"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        />
        <span className="text-center text-[10px]" style={{ color: '#444' }}>Year</span>
      </div>
    </div>
  )
}

export default function ProfilePage() {
  const { profile, user, refreshProfile, signOut } = useAuth()
  const navigate = useNavigate()

  // Own profile form
  const [name, setName] = useState(profile?.name ?? '')
  const [surname, setSurname] = useState(profile?.surname ?? '')
  const [ageGroup, setAgeGroup] = useState(profile?.age_group ?? '20–29')
  const [club, setClub] = useState(profile?.favourite_club ?? '')
  const parsedDob = parseDob(profile?.dob)
  const [dobDay, setDobDay] = useState(parsedDob.day)
  const [dobMonth, setDobMonth] = useState(parsedDob.month)
  const [dobYear, setDobYear] = useState(parsedDob.year)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveDone, setSaveDone] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Auth
  const [resetSent, setResetSent] = useState(false)
  const [resetError, setResetError] = useState('')

  // Linked children
  const [linkedChildren, setLinkedChildren] = useState<Profile[]>([])

  // Edit existing child modal
  const [selectedChild, setSelectedChild] = useState<Profile | null>(null)
  const [childName, setChildName] = useState('')
  const [childSurname, setChildSurname] = useState('')
  const [childAgeGroup, setChildAgeGroup] = useState('')
  const [childClub, setChildClub] = useState('')
  const [childDobDay, setChildDobDay] = useState('')
  const [childDobMonth, setChildDobMonth] = useState('')
  const [childDobYear, setChildDobYear] = useState('')
  const [childUploading, setChildUploading] = useState(false)
  const [childSaving, setChildSaving] = useState(false)
  const [childSaveDone, setChildSaveDone] = useState(false)
  const childFileRef = useRef<HTMLInputElement>(null)

  // Add child form
  const [addFormOpen, setAddFormOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newSurname, setNewSurname] = useState('')
  const [newAgeGroup, setNewAgeGroup] = useState('20–29')
  const [newDobDay, setNewDobDay] = useState('')
  const [newDobMonth, setNewDobMonth] = useState('')
  const [newDobYear, setNewDobYear] = useState('')
  const [addPhotoBlob, setAddPhotoBlob] = useState<Blob | null>(null)
  const [addPhotoPreview, setAddPhotoPreview] = useState<string | null>(null)
  const [addingChild, setAddingChild] = useState(false)
  const [addError, setAddError] = useState('')
  const addPhotoRef = useRef<HTMLInputElement>(null)

  // Fetch linked children once on mount
  useEffect(() => {
    if (!profile) return
    supabase
      .from('linked_profiles')
      .select('child_id')
      .eq('parent_id', profile.id)
      .then(async ({ data }) => {
        if (!data || data.length === 0) return
        const ids = data.map((d: { child_id: string }) => d.child_id)
        const { data: profs } = await supabase.from('profiles').select('*').in('id', ids)
        setLinkedChildren((profs as Profile[]) || [])
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  if (!profile) return null

  const previewProfile = { ...profile, name, surname, age_group: ageGroup, favourite_club: club || null }

  // ── Own profile handlers ─────────────────────────────────────────────────────

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaveError('')
    const { error } = await supabase
      .from('profiles')
      .update({ name, surname, age_group: ageGroup, dob: composeDob(dobDay, dobMonth, dobYear), favourite_club: club || null })
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
    setPhotoError(null)
    try {
      const blob = await cropAndResizeImage(file)
      // Path is relative to the "avatars" bucket. Storage RLS uses the first
      // folder segment as the owner id, so we drop the redundant "avatars/"
      // prefix that historically nested everything one level too deep.
      const path = `${profile!.id}/profile.jpg`
      const { error: uploadErr } = await supabase.storage
        .from('avatars')
        .upload(path, blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '3600' })
      if (uploadErr) throw new Error(`Photo upload failed: ${uploadErr.message}`)
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      const photoUrl = `${data.publicUrl}?t=${Date.now()}`
      const { error: profErr } = await supabase.from('profiles').update({ photo_url: photoUrl }).eq('id', profile!.id)
      if (profErr) throw new Error(`Profile update failed: ${profErr.message}`)
      await refreshProfile()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('handlePhoto failed:', e)
      setPhotoError(msg)
    } finally {
      setUploading(false)
    }
  }

  async function handleRemovePhoto() {
    setPhotoError(null)
    const { error: rmErr } = await supabase.storage.from('avatars').remove([`${profile!.id}/profile.jpg`])
    if (rmErr) {
      console.error('handleRemovePhoto storage:', rmErr)
      setPhotoError(`Couldn't remove photo: ${rmErr.message}`)
      return
    }
    const { error: profErr } = await supabase.from('profiles').update({ photo_url: null }).eq('id', profile!.id)
    if (profErr) {
      console.error('handleRemovePhoto profile:', profErr)
      setPhotoError(`Couldn't clear photo url: ${profErr.message}`)
      return
    }
    await refreshProfile()
  }

  async function handlePasswordReset() {
    setResetError('')
    const email = user?.email
    if (!email) return
    const { error } = await supabase.auth.resetPasswordForEmail(email)
    if (error) setResetError(error.message)
    else setResetSent(true)
  }

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  // ── Child edit handlers ──────────────────────────────────────────────────────

  function openChildModal(child: Profile) {
    setSelectedChild(child)
    setChildName(child.name ?? '')
    setChildSurname(child.surname ?? '')
    setChildAgeGroup(child.age_group ?? '20–29')
    setChildClub(child.favourite_club ?? '')
    const dp = parseDob(child.dob)
    setChildDobDay(dp.day)
    setChildDobMonth(dp.month)
    setChildDobYear(dp.year)
    setChildSaveDone(false)
  }

  async function handleChildPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !selectedChild) return
    setChildUploading(true)
    setPhotoError(null)
    try {
      const blob = await cropAndResizeImage(file)
      const path = `${selectedChild.id}/profile.jpg`
      const { error: uploadErr } = await supabase.storage
        .from('avatars')
        .upload(path, blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '3600' })
      if (uploadErr) throw new Error(`Photo upload failed: ${uploadErr.message}`)
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      const photoUrl = `${data.publicUrl}?t=${Date.now()}`
      const { error: profErr } = await supabase.from('profiles').update({ photo_url: photoUrl }).eq('id', selectedChild.id)
      if (profErr) throw new Error(`Profile update failed: ${profErr.message}`)
      const updated = { ...selectedChild, photo_url: photoUrl }
      setSelectedChild(updated)
      setLinkedChildren(prev => prev.map(c => c.id === selectedChild.id ? updated : c))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('handleChildPhoto failed:', e)
      setPhotoError(msg)
    } finally {
      setChildUploading(false)
    }
  }

  async function handleChildRemovePhoto() {
    if (!selectedChild) return
    setPhotoError(null)
    const { error: rmErr } = await supabase.storage.from('avatars').remove([`${selectedChild.id}/profile.jpg`])
    if (rmErr) {
      console.error('handleChildRemovePhoto storage:', rmErr)
      setPhotoError(`Couldn't remove photo: ${rmErr.message}`)
      return
    }
    const { error: profErr } = await supabase.from('profiles').update({ photo_url: null }).eq('id', selectedChild.id)
    if (profErr) {
      console.error('handleChildRemovePhoto profile:', profErr)
      setPhotoError(`Couldn't clear photo url: ${profErr.message}`)
      return
    }
    const updated = { ...selectedChild, photo_url: null }
    setSelectedChild(updated)
    setLinkedChildren(prev => prev.map(c => c.id === selectedChild!.id ? updated : c))
  }

  async function handleChildSave() {
    if (!selectedChild) return
    setChildSaving(true)
    const dob = composeDob(childDobDay, childDobMonth, childDobYear)
    await supabase.from('profiles').update({
      name: childName,
      surname: childSurname,
      age_group: childAgeGroup,
      dob,
      favourite_club: childClub || null,
    }).eq('id', selectedChild.id)
    const updated = { ...selectedChild, name: childName, surname: childSurname, age_group: childAgeGroup, dob, favourite_club: childClub || null }
    setSelectedChild(updated)
    setLinkedChildren(prev => prev.map(c => c.id === selectedChild!.id ? updated : c))
    setChildSaving(false)
    setChildSaveDone(true)
    setTimeout(() => setChildSaveDone(false), 2500)
  }

  // ── Add child handlers ───────────────────────────────────────────────────────

  async function handleAddPhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const blob = await cropAndResizeImage(file)
      if (addPhotoPreview) URL.revokeObjectURL(addPhotoPreview)
      setAddPhotoBlob(blob)
      setAddPhotoPreview(URL.createObjectURL(blob))
    } catch { /* ignore crop errors */ }
  }

  function closeAddForm() {
    setAddFormOpen(false)
    setNewName(''); setNewSurname(''); setNewAgeGroup('20–29')
    setNewDobDay(''); setNewDobMonth(''); setNewDobYear('')
    if (addPhotoPreview) URL.revokeObjectURL(addPhotoPreview)
    setAddPhotoBlob(null); setAddPhotoPreview(null)
    setAddError('')
  }

  async function handleAddChildSubmit(e: React.FormEvent) {
    e.preventDefault()
    setAddingChild(true)
    setAddError('')
    try {
      const childId = crypto.randomUUID()
      const dob = composeDob(newDobDay, newDobMonth, newDobYear)

      const { error: profileError } = await supabase.from('profiles').insert({
        id: childId,
        name: newName.trim(),
        surname: newSurname.trim(),
        age_group: newAgeGroup,
        dob,
        player_type: 'wtp',
      })
      if (profileError) { setAddError(profileError.message); return }

      const { error: linkError } = await supabase.from('linked_profiles').insert({
        parent_id: profile!.id,
        child_id: childId,
      })
      if (linkError) { setAddError(linkError.message); return }

      let photoUrl: string | null = null
      if (addPhotoBlob) {
        const path = `${childId}/profile.jpg`
        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(path, addPhotoBlob, { upsert: true, contentType: 'image/jpeg', cacheControl: '3600' })
        if (!uploadError) {
          const { data } = supabase.storage.from('avatars').getPublicUrl(path)
          photoUrl = `${data.publicUrl}?t=${Date.now()}`
          await supabase.from('profiles').update({ photo_url: photoUrl }).eq('id', childId)
        }
      }

      const newChild: Profile = {
        id: childId,
        name: newName.trim(),
        surname: newSurname.trim(),
        age_group: newAgeGroup,
        dob,
        photo_url: photoUrl,
        player_type: 'wtp',
        overall_rating: 7,
        sp: 7, sk: 7, st: 7, tk: 7, ps: 7, ag: 7, phy: 7, cp: 7, wr: 7, cunt: 5,
        badges: [],
        is_admin: false,
        created_at: new Date().toISOString(),
        card_pace: null, card_shooting: null, card_passing: null,
        card_dribbling: null, card_defence: null, card_physicality: null,
        gk_pace: null, gk_reflexes: null, gk_handling: null,
        gk_distribution: null, gk_positioning: null, gk_physicality: null,
        favourite_club: null, position: null, cunt_tier: null,
      }
      setLinkedChildren(prev => [...prev, newChild])
      closeAddForm()
    } catch {
      setAddError('Something went wrong. Please try again.')
    } finally {
      setAddingChild(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="px-4 py-5 pb-10">
      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 mb-5 text-sm font-medium"
        style={{ color: 'var(--color-text-muted)' }}
      >
        ← Back
      </button>

      <p className="text-xs font-medium uppercase tracking-widest mb-1" style={{ color: 'var(--color-primary)' }}>
        My Profile
      </p>
      <h1 className="font-display text-3xl text-[var(--color-text)] tracking-wide mb-6">PROFILE</h1>

      {/* Top Trump card preview */}
      <div className="mb-8">
        <PlayerCard profile={previewProfile} />
      </div>

      {/* Edit form */}
      <form onSubmit={handleSave} className="space-y-4 mb-8">

        {/* Photo */}
        <div className="flex items-center gap-4 p-4 rounded-2xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <PlayerAvatar profile={profile} size={56} />
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold disabled:opacity-50"
              style={{ background: 'var(--color-primary)', color: 'var(--color-text)' }}
            >
              {uploading ? 'Uploading...' : profile.photo_url ? 'Change Photo' : 'Add Photo'}
            </button>
            {profile.photo_url && (
              <button
                type="button"
                onClick={handleRemovePhoto}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold"
                style={{ background: '#1a0808', color: 'var(--color-error-text)', border: '1px solid #FECACA' }}
              >
                Remove Photo
              </button>
            )}
          </div>
          {photoError && (
            <p className="text-xs mt-2" style={{ color: 'var(--color-error-text)' }}>{photoError}</p>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
        </div>

        {/* Name */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>First Name</label>
            <input
              type="text" value={name} onChange={e => setName(e.target.value)} required
              className="w-full px-4 py-3 rounded-xl text-[var(--color-text)] text-sm outline-none"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Surname</label>
            <input
              type="text" value={surname} onChange={e => setSurname(e.target.value)} required
              className="w-full px-4 py-3 rounded-xl text-[var(--color-text)] text-sm outline-none"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
            />
          </div>
        </div>

        {/* Age group */}
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Age Group</label>
          <select
            value={ageGroup} onChange={e => setAgeGroup(e.target.value)}
            className="w-full px-4 py-3 rounded-xl text-[var(--color-text)] text-sm outline-none"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
          >
            {AGE_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>

        {/* Favourite club */}
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Who do you support?</label>
          <select
            value={club} onChange={e => setClub(e.target.value)}
            className="w-full px-4 py-3 rounded-xl text-[var(--color-text)] text-sm outline-none"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
          >
            <option value="">None</option>
            <optgroup label="Premier League">
              {CLUBS.filter(c => c.league === 'premier_league').map(c => (
                <option key={c.slug} value={c.slug}>{c.display_name}</option>
              ))}
            </optgroup>
            <optgroup label="Championship">
              {CLUBS.filter(c => c.league === 'championship').map(c => (
                <option key={c.slug} value={c.slug}>{c.display_name}</option>
              ))}
            </optgroup>
          </select>
        </div>

        {/* Date of birth */}
        <div>
          <label className="block text-xs font-medium mb-2" style={{ color: 'var(--color-text-muted)' }}>
            Date of Birth <span style={{ color: '#9CA897' }}>(optional)</span>
          </label>
          <DobInputs
            day={dobDay} month={dobMonth} year={dobYear}
            setDay={setDobDay} setMonth={setDobMonth} setYear={setDobYear}
          />
        </div>

        {saveError && (
          <div className="p-3 rounded-lg text-sm" style={{ background: 'var(--color-error-bg)', color: 'var(--color-error-text)', border: '1px solid #FECACA' }}>
            {saveError}
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="w-full py-3 rounded-xl font-semibold text-sm disabled:opacity-50 transition-colors"
          style={{ background: saveDone ? '#0a3a2a' : 'var(--color-primary)', color: 'var(--color-text)' }}
        >
          {saving ? 'Saving...' : saveDone ? '✓ Saved' : 'Save Changes'}
        </button>
      </form>

      {/* My Finances */}
      <div className="mb-8">
        <MyFinances profile={profile} />
      </div>

      {/* My Squad */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--color-primary)' }}>
            My Squad
          </p>
          <button
            onClick={() => setAddFormOpen(true)}
            className="text-xs px-3 py-1.5 rounded-xl font-semibold"
            style={{ background: 'var(--color-primary)', color: 'var(--color-text)' }}
          >
            + Add family member
          </button>
        </div>
        {linkedChildren.length > 0 ? (
          <div className="space-y-2">
            {linkedChildren.map(child => (
              <button
                key={child.id}
                onClick={() => openChildModal(child)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
              >
                <PlayerAvatar profile={child} size={40} />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-[var(--color-text)]">{child.name} {child.surname}</p>
                  <p className="text-xs" style={{ color: '#9CA897' }}>{child.age_group}</p>
                </div>
                <span style={{ color: '#444' }}>›</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm" style={{ color: '#444' }}>
            No family members added yet.
          </p>
        )}
      </div>

      {/* Feedback */}
      <div className="p-4 rounded-2xl mb-4" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        <p className="text-sm font-semibold text-[var(--color-text)] mb-1">Feedback</p>
        <p className="text-xs mb-3" style={{ color: '#9CA897' }}>
          Bug, idea, or general thoughts on the app? Let us know.
        </p>
        <button
          onClick={() => navigate('/feedback')}
          className="px-4 py-2 rounded-xl text-sm font-semibold"
          style={{ background: 'var(--color-surface)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
        >
          Send Feedback
        </button>
      </div>

      {/* Password reset */}
      <div className="p-4 rounded-2xl mb-4" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        <p className="text-sm font-semibold text-[var(--color-text)] mb-1">Password</p>
        <p className="text-xs mb-3" style={{ color: '#9CA897' }}>
          Send a reset link to {user?.email}
        </p>
        {resetSent ? (
          <p className="text-sm font-medium" style={{ color: 'var(--color-primary)' }}>✓ Reset link sent to your email.</p>
        ) : (
          <>
            {resetError && <p className="text-xs mb-2" style={{ color: 'var(--color-error-text)' }}>{resetError}</p>}
            <button
              onClick={handlePasswordReset}
              className="px-4 py-2 rounded-xl text-sm font-semibold"
              style={{ background: 'var(--color-surface)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
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
        style={{ background: '#1a0808', color: 'var(--color-error-text)', border: '1px solid #FECACA' }}
      >
        Sign Out
      </button>

      {/* ── Edit child modal ─────────────────────────────────────────────────── */}
      {selectedChild && (
        <div
          className="fixed inset-0 flex items-end justify-center z-50 px-4 pb-4"
          style={{ background: 'rgba(0,0,0,0.85)' }}
          onClick={() => setSelectedChild(null)}
        >
          <div
            className="w-full rounded-2xl p-5 overflow-y-auto"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', maxWidth: 430, maxHeight: '90vh' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--color-primary)' }}>
                Edit Family Member
              </p>
              <button onClick={() => setSelectedChild(null)} className="text-sm" style={{ color: 'var(--color-text-muted)' }}>✕</button>
            </div>

            <PlayerCard profile={{ ...selectedChild, name: childName, surname: childSurname, age_group: childAgeGroup, favourite_club: childClub || null }} />

            {/* Photo */}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => childFileRef.current?.click()}
                disabled={childUploading}
                className="flex-1 py-2.5 rounded-xl text-xs font-semibold disabled:opacity-50"
                style={{ background: 'var(--color-primary)', color: 'var(--color-text)' }}
              >
                {childUploading ? 'Uploading...' : selectedChild.photo_url ? 'Change Photo' : 'Add Photo'}
              </button>
              {selectedChild.photo_url && (
                <button
                  type="button"
                  onClick={handleChildRemovePhoto}
                  className="px-3 py-2.5 rounded-xl text-xs font-semibold"
                  style={{ background: '#1a0808', color: 'var(--color-error-text)', border: '1px solid #FECACA' }}
                >
                  Remove
                </button>
              )}
            </div>
            {photoError && (
              <p className="text-xs mt-2" style={{ color: 'var(--color-error-text)' }}>{photoError}</p>
            )}
            <input ref={childFileRef} type="file" accept="image/*" className="hidden" onChange={handleChildPhoto} />

            {/* Name */}
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>First Name</label>
                <input
                  type="text" value={childName} onChange={e => setChildName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl text-[var(--color-text)] text-sm outline-none"
                  style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Surname</label>
                <input
                  type="text" value={childSurname} onChange={e => setChildSurname(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl text-[var(--color-text)] text-sm outline-none"
                  style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                />
              </div>
            </div>

            {/* Age group */}
            <div className="mt-3">
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Age Group</label>
              <select
                value={childAgeGroup} onChange={e => setChildAgeGroup(e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-[var(--color-text)] text-sm outline-none"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
              >
                {AGE_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>

            {/* Favourite club */}
            <div className="mt-3">
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Who do they support?</label>
              <select
                value={childClub} onChange={e => setChildClub(e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-[var(--color-text)] text-sm outline-none"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
              >
                <option value="">None</option>
                <optgroup label="Premier League">
                  {CLUBS.filter(c => c.league === 'premier_league').map(c => (
                    <option key={c.slug} value={c.slug}>{c.display_name}</option>
                  ))}
                </optgroup>
                <optgroup label="Championship">
                  {CLUBS.filter(c => c.league === 'championship').map(c => (
                    <option key={c.slug} value={c.slug}>{c.display_name}</option>
                  ))}
                </optgroup>
              </select>
            </div>

            {/* DOB */}
            <div className="mt-3">
              <label className="block text-xs font-medium mb-2" style={{ color: 'var(--color-text-muted)' }}>
                Date of Birth <span style={{ color: '#9CA897' }}>(optional)</span>
              </label>
              <DobInputs
                day={childDobDay} month={childDobMonth} year={childDobYear}
                setDay={setChildDobDay} setMonth={setChildDobMonth} setYear={setChildDobYear}
              />
            </div>

            <button
              onClick={handleChildSave}
              disabled={childSaving}
              className="w-full mt-4 py-3 rounded-xl font-semibold text-sm disabled:opacity-50 transition-colors"
              style={{ background: childSaveDone ? '#0a3a2a' : 'var(--color-primary)', color: 'var(--color-text)' }}
            >
              {childSaving ? 'Saving...' : childSaveDone ? '✓ Saved' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}

      {/* ── Add child modal ──────────────────────────────────────────────────── */}
      {addFormOpen && (
        <div
          className="fixed inset-0 flex items-end justify-center z-50 px-4 pb-4"
          style={{ background: 'rgba(0,0,0,0.85)' }}
          onClick={closeAddForm}
        >
          <form
            className="w-full rounded-2xl p-5 overflow-y-auto space-y-4"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', maxWidth: 430, maxHeight: '90vh' }}
            onClick={e => e.stopPropagation()}
            onSubmit={handleAddChildSubmit}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--color-primary)' }}>
                  My Squad
                </p>
                <p className="font-semibold text-[var(--color-text)] text-base">Add Family Member</p>
              </div>
              <button type="button" onClick={closeAddForm} className="text-sm" style={{ color: 'var(--color-text-muted)' }}>✕</button>
            </div>

            {/* Photo (optional) */}
            <div className="flex items-center gap-4 p-3 rounded-xl" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
              {addPhotoPreview ? (
                <img
                  src={addPhotoPreview}
                  alt="Preview"
                  className="w-12 h-12 rounded-full object-cover flex-shrink-0"
                />
              ) : (
                <div className="w-12 h-12 rounded-full flex-shrink-0 flex items-center justify-center"
                  style={{ background: 'var(--color-border)' }}>
                  <span className="text-xl">👤</span>
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => addPhotoRef.current?.click()}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold"
                  style={{ background: 'var(--color-primary)', color: 'var(--color-text)' }}
                >
                  {addPhotoPreview ? 'Change Photo' : 'Add Photo (optional)'}
                </button>
                {addPhotoPreview && (
                  <button
                    type="button"
                    onClick={() => { URL.revokeObjectURL(addPhotoPreview!); setAddPhotoPreview(null); setAddPhotoBlob(null) }}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold"
                    style={{ background: '#1a0808', color: 'var(--color-error-text)', border: '1px solid #FECACA' }}
                  >
                    Remove
                  </button>
                )}
              </div>
              <input ref={addPhotoRef} type="file" accept="image/*" className="hidden" onChange={handleAddPhotoSelect} />
            </div>

            {/* Name */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>First Name</label>
                <input
                  type="text" value={newName} onChange={e => setNewName(e.target.value)} required
                  className="w-full px-4 py-3 rounded-xl text-[var(--color-text)] text-sm outline-none"
                  style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                  placeholder="e.g. Jamie"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Surname</label>
                <input
                  type="text" value={newSurname} onChange={e => setNewSurname(e.target.value)} required
                  className="w-full px-4 py-3 rounded-xl text-[var(--color-text)] text-sm outline-none"
                  style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                  placeholder="e.g. Smith"
                />
              </div>
            </div>

            {/* Age group */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Age Group</label>
              <select
                value={newAgeGroup} onChange={e => setNewAgeGroup(e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-[var(--color-text)] text-sm outline-none"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
              >
                {AGE_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>

            {/* DOB (optional) */}
            <div>
              <label className="block text-xs font-medium mb-2" style={{ color: 'var(--color-text-muted)' }}>
                Date of Birth <span style={{ color: '#9CA897' }}>(optional)</span>
              </label>
              <DobInputs
                day={newDobDay} month={newDobMonth} year={newDobYear}
                setDay={setNewDobDay} setMonth={setNewDobMonth} setYear={setNewDobYear}
              />
            </div>

            {addError && (
              <div className="p-3 rounded-lg text-sm" style={{ background: 'var(--color-error-bg)', color: 'var(--color-error-text)', border: '1px solid #FECACA' }}>
                {addError}
              </div>
            )}

            <button
              type="submit"
              disabled={addingChild || !newName.trim() || !newSurname.trim()}
              className="w-full py-3 rounded-xl font-semibold text-sm disabled:opacity-40"
              style={{ background: 'var(--color-primary)', color: 'var(--color-text)' }}
            >
              {addingChild ? 'Adding...' : 'Add to my squad'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
