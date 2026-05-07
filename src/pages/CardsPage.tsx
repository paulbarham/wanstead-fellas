import { useEffect, useState, useRef } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import type { Profile, BadgeType } from '../types'
import { cropAndResizeImage } from '../lib/imageUtils'
import TopTrumpCard from '../components/TopTrumpCard'


const AGE_GROUPS = ['Under 20', '20–29', '30–39', '40–49', '50+']
const AGE_GROUP_DEFAULT = '20–29'

const ALL_BADGES: BadgeType[] = ['Super Sharp Shooter', 'Legend', 'Captain']
const BADGE_COLORS: Record<BadgeType, string> = {
  'Super Sharp Shooter': '#C0392B',
  'Legend': '#B7860B',
  'Captain': '#1A56DB',
}

const STAT_KEYS: (keyof Profile)[] = ['sp', 'sk', 'st', 'tk', 'ps', 'ag', 'phy', 'cp', 'wr', 'cunt', 'overall_rating']
const STAT_LABELS: Record<string, string> = {
  sp: 'Pace', sk: 'Skill', st: 'Stamina', tk: 'Tackling',
  ps: 'Passing', ag: 'Aggression', phy: 'Physicality', cp: 'Composure',
  wr: 'Work Rate', cunt: 'Cuntiness', overall_rating: 'Overall',
}

export default function CardsPage() {
  const { profile: myProfile, refreshProfile, user } = useAuth()
  const [players, setPlayers] = useState<Profile[]>([])
  const [selected, setSelected] = useState<Profile | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<Partial<Profile>>({})
  const [editAgeGroup, setEditAgeGroup] = useState('')
  const [uploadingFor, setUploadingFor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [pwResetSent, setPwResetSent] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const fileInputPhotoId = useRef<string | null>(null)

  const isAdmin = myProfile?.is_admin ?? false

  async function loadPlayers() {
    const { data } = await supabase.from('profiles').select('*').order('overall_rating', { ascending: false })
    setPlayers((data as Profile[]) || [])
    setLoading(false)
  }

  useEffect(() => { loadPlayers() }, [])

  function openCard(p: Profile) { setSelected(p); setEditingId(null); setPwResetSent(false) }

  function startEdit(p: Profile) {
    setEditingId(p.id)
    const vals: Record<string, number> = {}
    for (const k of STAT_KEYS) vals[k as string] = p[k] as number
    setEditValues(vals as Partial<Profile>)
    setEditAgeGroup(p.age_group ?? AGE_GROUP_DEFAULT)
  }

  async function saveEdit(id: string) {
    await supabase.from('profiles').update(editValues).eq('id', id)
    if (id === myProfile?.id) await refreshProfile()
    await loadPlayers()
    setEditingId(null)
    const updated = players.find(p => p.id === id)
    if (updated) setSelected({ ...updated, ...editValues })
  }

  async function saveAgeGroup(id: string) {
    await supabase.from('profiles').update({ age_group: editAgeGroup }).eq('id', id)
    if (id === myProfile?.id) await refreshProfile()
    await loadPlayers()
    const { data } = await supabase.from('profiles').select('*').eq('id', id).single()
    if (data) setSelected(data as Profile)
  }

  async function toggleBadge(playerId: string, badge: BadgeType) {
    const p = players.find(p => p.id === playerId)
    if (!p) return
    const current = (p.badges ?? []) as BadgeType[]
    const next = current.includes(badge) ? current.filter(b => b !== badge) : [...current, badge]
    await supabase.from('profiles').update({ badges: next }).eq('id', playerId)
    await loadPlayers()
    setSelected(prev => prev?.id === playerId ? { ...prev, badges: next } : prev)
  }

  function triggerPhotoUpload(playerId: string) {
    fileInputPhotoId.current = playerId
    fileInputRef.current?.click()
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    const playerId = fileInputPhotoId.current
    if (!file || !playerId) return
    e.target.value = ''
    setUploadingFor(playerId)
    try {
      const blob = await cropAndResizeImage(file)
      const path = `avatars/${playerId}/profile.jpg`
      const { error } = await supabase.storage.from('avatars').upload(path, blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '0' })
      if (!error) {
        const { data } = supabase.storage.from('avatars').getPublicUrl(path)
        const photoUrl = `${data.publicUrl}?t=${Date.now()}`
        await supabase.from('profiles').update({ photo_url: photoUrl }).eq('id', playerId)
        if (playerId === myProfile?.id) await refreshProfile()
        await loadPlayers()
        const { data: updated } = await supabase.from('profiles').select('*').eq('id', playerId).single()
        if (updated) setSelected(updated as Profile)
      }
    } finally { setUploadingFor(null) }
  }

  async function deletePhoto(playerId: string) {
    await supabase.storage.from('avatars').remove([`avatars/${playerId}/profile.jpg`])
    await supabase.from('profiles').update({ photo_url: null }).eq('id', playerId)
    if (playerId === myProfile?.id) await refreshProfile()
    await loadPlayers()
    setSelected(prev => prev?.id === playerId ? { ...prev, photo_url: null } : prev)
  }

  if (loading) return <div className="px-4 py-5 text-sm" style={{ color: '#647060' }}>Loading cards…</div>

  return (
    <div className="px-4 pt-4 pb-24">
      <p className="text-xs font-medium uppercase tracking-widest mb-0.5" style={{ color: '#0D6B52' }}>
        Player Cards
      </p>
      <h1 className="font-display text-2xl text-[#18201A] tracking-wide mb-4">TOP TRUMPS</h1>

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />

      {/* Card grid */}
      <div className="grid grid-cols-2 gap-2">
        {players.map(p => (
          <button key={p.id} onClick={() => openCard(p)} className="text-left" style={{ display: 'block' }}>
            <TopTrumpCard profile={p} compact />
          </button>
        ))}
      </div>

      {/* Card detail modal */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center px-3 pb-4"
          style={{ background: 'rgba(0,0,0,0.9)' }}
          onClick={() => { setSelected(null); setEditingId(null); setPwResetSent(false) }}
        >
          <div
            className="w-full overflow-y-auto"
            style={{ maxWidth: 430, maxHeight: '92vh' }}
            onClick={e => e.stopPropagation()}
          >
            <TopTrumpCard profile={selected} />

            {/* Actions beneath card */}
            <div className="mt-2 p-4 rounded-2xl space-y-3" style={{ background: '#FFFFFF', border: '1px solid #E2E4DC' }}>

              {/* Own card age group (non-admin) */}
              {selected.id === myProfile?.id && !isAdmin && (
                <div className="flex items-center gap-2">
                  <label className="text-xs flex-shrink-0" style={{ color: '#647060' }}>Age Group:</label>
                  {editingId === 'agegroup' ? (
                    <>
                      <select
                        value={editAgeGroup}
                        onChange={e => setEditAgeGroup(e.target.value)}
                        className="flex-1 px-2 py-1.5 rounded-lg text-[#18201A] text-xs outline-none"
                        style={{ background: '#FFFFFF', border: '1px solid #E2E4DC' }}
                      >
                        {AGE_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                      <button onClick={() => { saveAgeGroup(selected.id); setEditingId(null) }}
                        className="text-xs px-2.5 py-1.5 rounded-lg font-semibold"
                        style={{ background: '#0D6B52', color: '#18201A' }}>
                        Save
                      </button>
                    </>
                  ) : (
                    <button onClick={() => { setEditAgeGroup(selected.age_group ?? AGE_GROUP_DEFAULT); setEditingId('agegroup') }}
                      className="text-xs px-2.5 py-1.5 rounded-lg"
                      style={{ color: '#0D6B52', border: '1px solid #0D6B52' }}>
                      {selected.age_group} · Edit
                    </button>
                  )}
                </div>
              )}

              {/* Photo upload */}
              {(selected.id === myProfile?.id || isAdmin) && (
                <div className="flex gap-2">
                  <button
                    onClick={() => triggerPhotoUpload(selected.id)}
                    disabled={uploadingFor === selected.id}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
                    style={{ background: '#0D6B52', color: '#FFFFFF' }}
                  >
                    {uploadingFor === selected.id ? 'Uploading…' : selected.photo_url ? 'Change Photo' : 'Upload Photo'}
                  </button>
                  {selected.photo_url && (
                    <button
                      onClick={() => deletePhoto(selected.id)}
                      className="px-4 py-2.5 rounded-xl text-sm font-semibold"
                      style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              )}

              {/* Change password (own card only) */}
              {selected.id === myProfile?.id && (
                <div>
                  {pwResetSent ? (
                    <p className="text-xs text-center py-2" style={{ color: '#0D6B52' }}>
                      Check your email for a password reset link.
                    </p>
                  ) : (
                    <button
                      onClick={async () => {
                        if (!user?.email) return
                        await supabase.auth.resetPasswordForEmail(user.email, {
                          redirectTo: window.location.origin,
                        })
                        setPwResetSent(true)
                      }}
                      className="w-full py-2.5 rounded-xl text-sm font-medium"
                      style={{ background: '#FFFFFF', color: '#647060', border: '1px solid #E2E4DC' }}
                    >
                      Change password
                    </button>
                  )}
                </div>
              )}

              {/* Admin stat editing */}
              {isAdmin && (
                <>
                  {editingId === selected.id ? (
                    <div className="space-y-2.5">
                      {STAT_KEYS.map(key => (
                        <div key={key as string} className="flex items-center gap-3">
                          <span className="text-xs w-20 flex-shrink-0" style={{ color: '#647060' }}>
                            {STAT_LABELS[key as string]}
                          </span>
                          <input
                            type="range" min={1} max={10}
                            value={(editValues[key] as number) ?? 5}
                            onChange={e => setEditValues(v => ({ ...v, [key]: parseInt(e.target.value) }))}
                            className="flex-1"
                          />
                          <span className="text-xs w-4 text-right text-[#18201A]">
                            {(editValues[key] as number) ?? 5}
                          </span>
                        </div>
                      ))}
                      <button onClick={() => saveEdit(selected.id)}
                        className="w-full py-2.5 rounded-xl text-sm font-semibold"
                        style={{ background: '#0D6B52', color: '#FFFFFF' }}>
                        Save Stats
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => startEdit(selected)}
                      className="w-full py-2.5 rounded-xl text-sm font-medium"
                      style={{ background: '#FFFFFF', color: '#647060', border: '1px solid #E2E4DC' }}>
                      Edit Stats
                    </button>
                  )}

                  <div>
                    <p className="text-xs mb-2" style={{ color: '#647060' }}>Badges</p>
                    <div className="flex flex-wrap gap-2">
                      {ALL_BADGES.map(badge => {
                        const has = (selected.badges ?? []).includes(badge)
                        return (
                          <button key={badge} onClick={() => toggleBadge(selected.id, badge)}
                            className="text-xs px-2.5 py-1 rounded-full font-medium"
                            style={{
                              background: has ? BADGE_COLORS[badge] : '#FFFFFF',
                              color: has ? 'white' : '#666',
                              border: `1px solid ${has ? BADGE_COLORS[badge] : '#E2E4DC'}`,
                            }}>
                            {badge}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Age group (admin) */}
                  <div className="flex items-center gap-2">
                    <label className="text-xs flex-shrink-0" style={{ color: '#647060' }}>Age Group:</label>
                    {editingId === 'agegroup_admin' ? (
                      <>
                        <select value={editAgeGroup} onChange={e => setEditAgeGroup(e.target.value)}
                          className="flex-1 px-2 py-1.5 rounded-lg text-[#18201A] text-xs outline-none"
                          style={{ background: '#FFFFFF', border: '1px solid #E2E4DC' }}>
                          {AGE_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                        <button onClick={() => { saveAgeGroup(selected.id); setEditingId(null) }}
                          className="text-xs px-2.5 py-1.5 rounded-lg font-semibold"
                          style={{ background: '#0D6B52', color: '#18201A' }}>Save</button>
                      </>
                    ) : (
                      <button onClick={() => { setEditAgeGroup(selected.age_group ?? AGE_GROUP_DEFAULT); setEditingId('agegroup_admin') }}
                        className="text-xs px-2.5 py-1.5 rounded-lg"
                        style={{ color: '#0D6B52', border: '1px solid #0D6B52' }}>
                        {selected.age_group} · Edit
                      </button>
                    )}
                  </div>
                </>
              )}

              <button
                onClick={() => { setSelected(null); setEditingId(null); setPwResetSent(false) }}
                className="w-full py-2.5 rounded-xl text-sm"
                style={{ background: '#FFFFFF', color: '#647060', border: '1px solid #E2E4DC' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
