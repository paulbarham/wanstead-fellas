import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import type { Profile, Feedback, BadgeType, PlayerType } from '../types'
import PlayerAvatar from '../components/PlayerAvatar'
import PlayerTypeBadge from '../components/PlayerTypeBadge'
import { cropAndResizeImage } from '../lib/imageUtils'
import AdminFinancePanel from '../components/AdminFinancePanel'

interface LinkedProfileRow {
  id: string
  parent_id: string
  child_id: string
  parentName: string
  childName: string
}

const AGE_GROUPS = ['Under 20', '20–29', '30–39', '40–49', '50+']
const AGE_GROUP_DEFAULT = '20–29'

const STAT_KEYS: (keyof Profile)[] = ['sp', 'sk', 'st', 'tk', 'ps', 'ag', 'phy', 'cp', 'wr', 'cunt', 'overall_rating']
const STAT_LABELS: Record<string, string> = {
  sp: 'Pace', sk: 'Skill', st: 'Stamina', tk: 'Tackling',
  ps: 'Passing', ag: 'Aggression', phy: 'Physicality', cp: 'Composure',
  wr: 'Work Rate', cunt: 'Cuntiness', overall_rating: 'Overall',
}
const ALL_BADGES: BadgeType[] = ['Super Sharp Shooter', 'Legend', 'Captain']
const PLAYER_TYPE_OPTS: { type: PlayerType; label: string; color: string; bg: string }[] = [
  { type: 'subscribed',   label: 'SUB',  color: '#0D6B52', bg: '#DCFCE7' },
  { type: 'wtp_priority', label: 'WTP★', color: '#C9A227', bg: '#FEF9C3' },
  { type: 'wtp',          label: 'WTP',  color: '#647060', bg: '#F2F3EE' },
]

const BADGE_COLORS: Record<BadgeType, string> = {
  'Super Sharp Shooter': '#C0392B',
  'Legend': '#B7860B',
  'Captain': '#1A56DB',
}
const FB_CATEGORIES = ['All', 'Bug Report', 'Feature Request', 'Design Feedback', 'General']

interface FeedbackWithPlayer extends Feedback {
  playerName?: string
}

// ─── Root ────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState<'players' | 'finance' | 'feedback' | 'families'>('players')

  useEffect(() => {
    if (profile && !profile.is_admin) navigate('/', { replace: true })
  }, [profile, navigate])

  if (!profile?.is_admin) return null

  return (
    <div className="px-4 pt-4 pb-4">
      <p className="text-xs font-medium uppercase tracking-widest mb-0.5" style={{ color: '#0D6B52' }}>
        Admin
      </p>
      <h1 className="font-display text-2xl text-[#18201A] tracking-wide mb-3">DASHBOARD</h1>

      {/* Tab toggle */}
      <div className="flex gap-1 mb-4 p-1 rounded-xl" style={{ background: '#FFFFFF', border: '1px solid #E2E4DC' }}>
        {(['players', 'finance', 'families', 'feedback'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="flex-1 py-2 rounded-lg text-xs font-semibold capitalize transition-all"
            style={{
              background: tab === t ? '#0D6B52' : 'transparent',
              color: tab === t ? 'white' : '#666',
            }}
          >
            {t === 'players' ? 'Players' : t === 'finance' ? 'Finance' : t === 'families' ? 'Families' : 'Feedback'}
          </button>
        ))}
      </div>

      {tab === 'players' ? <PlayersPanel /> : tab === 'finance' ? <AdminFinancePanel /> : tab === 'families' ? <FamiliesPanel /> : <FeedbackPanel />}
    </div>
  )
}

// ─── Players panel ────────────────────────────────────────────────────────────

function PlayersPanel() {
  const { refreshProfile, profile: myProfile } = useAuth()
  const [players, setPlayers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<Partial<Profile>>({})
  const [editAgeGroup, setEditAgeGroup] = useState('')
  const [uploadingFor, setUploadingFor] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [typePickerId, setTypePickerId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const fileInputPlayerId = useRef<string | null>(null)

  const loadPlayers = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('*').order('name')
    setPlayers((data as Profile[]) || [])
    setLoading(false)
  }, [])

  useEffect(() => { loadPlayers() }, [loadPlayers])

  function startEdit(p: Profile) {
    if (editingId === p.id) { setEditingId(null); return }
    setEditingId(p.id)
    const vals: Record<string, number> = {}
    for (const k of STAT_KEYS) vals[k as string] = p[k] as number
    setEditValues(vals as Partial<Profile>)
    setEditAgeGroup(p.age_group ?? AGE_GROUP_DEFAULT)
  }

  async function saveEdit(id: string) {
    setSaving(true)
    await supabase.from('profiles').update({ ...editValues, age_group: editAgeGroup }).eq('id', id)
    if (id === myProfile?.id) await refreshProfile()
    await loadPlayers()
    setSaving(false)
    setEditingId(null)
  }

  async function updatePlayerType(id: string, type: PlayerType) {
    await supabase.from('profiles').update({ player_type: type }).eq('id', id)
    if (id === myProfile?.id) await refreshProfile()
    setTypePickerId(null)
    await loadPlayers()
  }

  async function toggleBadge(playerId: string, badge: BadgeType) {
    const p = players.find(p => p.id === playerId)
    if (!p) return
    const current = (p.badges ?? []) as BadgeType[]
    const next = current.includes(badge) ? current.filter(b => b !== badge) : [...current, badge]
    await supabase.from('profiles').update({ badges: next }).eq('id', playerId)
    await loadPlayers()
  }

  function triggerPhoto(playerId: string) {
    fileInputPlayerId.current = playerId
    fileInputRef.current?.click()
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    const playerId = fileInputPlayerId.current
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
      }
    } finally {
      setUploadingFor(null)
    }
  }

  async function deletePhoto(playerId: string) {
    await supabase.storage.from('avatars').remove([`avatars/${playerId}/profile.jpg`])
    await supabase.from('profiles').update({ photo_url: null }).eq('id', playerId)
    if (playerId === myProfile?.id) await refreshProfile()
    await loadPlayers()
  }

  if (loading) return <div className="text-sm py-4" style={{ color: '#647060' }}>Loading players…</div>

  return (
    <>
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />

      <div className="space-y-2">
        {players.map(p => {
          const isEditing = editingId === p.id
          const badges = (p.badges ?? []) as BadgeType[]
          return (
            <div key={p.id} className="rounded-2xl overflow-hidden"
              style={{ background: '#FFFFFF', border: `1px solid ${isEditing ? '#0D6B52' : '#E2E4DC'}` }}>

              {/* Player row */}
              <div
                onClick={() => startEdit(p)}
                className="w-full flex items-center gap-3 px-3 py-3 cursor-pointer"
              >
                <PlayerAvatar profile={p} size={40} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#18201A]">{p.name} {p.surname}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-xs" style={{ color: '#647060' }}>{p.age_group}</span>

                    {/* Player type badge / quick picker */}
                    <div onClick={e => e.stopPropagation()}>
                      {typePickerId === p.id ? (
                        <div className="flex gap-1 items-center">
                          {PLAYER_TYPE_OPTS.map(opt => (
                            <button
                              key={opt.type}
                              onClick={() => updatePlayerType(p.id, opt.type)}
                              style={{
                                fontSize: '0.55rem',
                                fontWeight: 700,
                                letterSpacing: '0.05em',
                                padding: '1px 5px',
                                borderRadius: 4,
                                background: opt.bg,
                                color: opt.color,
                                border: `1px solid ${opt.color}55`,
                                opacity: p.player_type === opt.type ? 1 : 0.45,
                              }}
                            >
                              {opt.label}
                            </button>
                          ))}
                          <button
                            onClick={() => setTypePickerId(null)}
                            style={{ fontSize: '0.6rem', color: '#9CA897', padding: '1px 3px' }}
                          >✕</button>
                        </div>
                      ) : (
                        <button onClick={() => setTypePickerId(p.id)}>
                          <PlayerTypeBadge type={p.player_type} />
                        </button>
                      )}
                    </div>

                    {badges.slice(0, 2).map(b => (
                      <span key={b} className="text-xs px-1.5 py-0.5 rounded font-medium"
                        style={{ background: BADGE_COLORS[b], color: '#18201A', fontSize: '0.55rem' }}>
                        {b}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="font-display text-xl" style={{ color: '#0D6B52' }}>{p.overall_rating}</span>
                  <span className="text-xs" style={{ color: '#9CA897' }}>{isEditing ? '▲' : '▼'}</span>
                </div>
              </div>

              {/* Edit panel */}
              {isEditing && (
                <div className="px-3 pb-3 space-y-4" style={{ borderTop: '1px solid #E2E4DC' }}>

                  {/* Photo */}
                  <div className="pt-3 flex gap-2">
                    <button
                      onClick={() => triggerPhoto(p.id)}
                      disabled={uploadingFor === p.id}
                      className="flex-1 py-2 rounded-xl text-xs font-semibold disabled:opacity-50"
                      style={{ background: '#0D6B52', color: '#18201A' }}
                    >
                      {uploadingFor === p.id ? 'Uploading…' : p.photo_url ? 'Change Photo' : 'Upload Photo'}
                    </button>
                    {p.photo_url && (
                      <button
                        onClick={() => deletePhoto(p.id)}
                        className="px-3 py-2 rounded-xl text-xs font-semibold"
                        style={{ background: '#1a0808', color: '#DC2626', border: '1px solid #FECACA' }}
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  {/* Age group */}
                  <div className="flex items-center gap-3">
                    <span className="text-xs w-20 flex-shrink-0" style={{ color: '#647060' }}>Age Group</span>
                    <select
                      value={editAgeGroup}
                      onChange={e => setEditAgeGroup(e.target.value)}
                      className="flex-1 px-3 py-1.5 rounded-lg text-[#18201A] text-xs outline-none"
                      style={{ background: '#FFFFFF', border: '1px solid #E2E4DC' }}
                    >
                      {AGE_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>

                  {/* Stat sliders */}
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
                  </div>

                  {/* Badges */}
                  <div>
                    <p className="text-xs mb-2" style={{ color: '#647060' }}>Badges</p>
                    <div className="flex flex-wrap gap-2">
                      {ALL_BADGES.map(badge => {
                        const has = badges.includes(badge)
                        return (
                          <button
                            key={badge}
                            onClick={() => toggleBadge(p.id, badge)}
                            className="text-xs px-2.5 py-1 rounded-full font-medium"
                            style={{
                              background: has ? BADGE_COLORS[badge] : '#FFFFFF',
                              color: has ? 'white' : '#666',
                              border: `1px solid ${has ? BADGE_COLORS[badge] : '#E2E4DC'}`,
                            }}
                          >
                            {badge}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Save / cancel */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveEdit(p.id)}
                      disabled={saving}
                      className="flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
                      style={{ background: '#0D6B52', color: '#18201A' }}
                    >
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-4 py-2.5 rounded-xl text-sm"
                      style={{ background: '#FFFFFF', color: '#647060', border: '1px solid #E2E4DC' }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}

// ─── Families panel ───────────────────────────────────────────────────────────

function FamiliesPanel() {
  const [links, setLinks] = useState<LinkedProfileRow[]>([])
  const [players, setPlayers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [parentId, setParentId] = useState('')
  const [childId, setChildId] = useState('')
  const [adding, setAdding] = useState(false)

  const loadData = useCallback(async () => {
    const [{ data: linkData }, { data: playerData }] = await Promise.all([
      supabase.from('linked_profiles').select('*').order('created_at'),
      supabase.from('profiles').select('id, name, surname').order('name'),
    ])
    const profs = (playerData as Profile[]) || []
    const nameMap: Record<string, string> = {}
    for (const p of profs) nameMap[p.id] = `${p.name} ${p.surname}`
    setLinks(
      ((linkData || []) as { id: string; parent_id: string; child_id: string }[]).map(l => ({
        ...l,
        parentName: nameMap[l.parent_id] ?? 'Unknown',
        childName: nameMap[l.child_id] ?? 'Unknown',
      }))
    )
    setPlayers(profs)
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  async function addLink() {
    if (!parentId || !childId || parentId === childId) return
    setAdding(true)
    await supabase.from('linked_profiles').insert({ parent_id: parentId, child_id: childId })
    setParentId('')
    setChildId('')
    await loadData()
    setAdding(false)
  }

  async function removeLink(id: string) {
    await supabase.from('linked_profiles').delete().eq('id', id)
    await loadData()
  }

  if (loading) return <div className="text-sm py-4" style={{ color: '#647060' }}>Loading…</div>

  return (
    <div className="space-y-4">
      {/* Add link */}
      <div className="p-4 rounded-2xl space-y-2" style={{ background: '#FFFFFF', border: '1px solid #E2E4DC' }}>
        <p className="text-xs uppercase tracking-widest font-semibold mb-1" style={{ color: '#9CA897' }}>
          Add Family Link
        </p>
        <select
          value={parentId}
          onChange={e => setParentId(e.target.value)}
          className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
          style={{ background: '#FFFFFF', border: '1px solid #E2E4DC', color: parentId ? '#18201A' : '#9CA897' }}
        >
          <option value="">Select parent</option>
          {players.map(p => <option key={p.id} value={p.id}>{p.name} {p.surname}</option>)}
        </select>
        <select
          value={childId}
          onChange={e => setChildId(e.target.value)}
          className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
          style={{ background: '#FFFFFF', border: '1px solid #E2E4DC', color: childId ? '#18201A' : '#9CA897' }}
        >
          <option value="">Select child</option>
          {players.map(p => <option key={p.id} value={p.id}>{p.name} {p.surname}</option>)}
        </select>
        <button
          onClick={addLink}
          disabled={adding || !parentId || !childId || parentId === childId}
          className="w-full py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40"
          style={{ background: '#0D6B52', color: '#FFFFFF' }}
        >
          {adding ? 'Adding…' : 'Add Link'}
        </button>
      </div>

      {/* Existing links */}
      <div>
        <p className="text-xs uppercase tracking-widest font-semibold mb-2" style={{ color: '#9CA897' }}>
          Family Links ({links.length})
        </p>
        {links.length === 0 ? (
          <div className="text-center py-8 px-4 rounded-2xl" style={{ background: '#F7F8F5', border: '1px solid #E2E4DC' }}>
            <p className="text-3xl mb-3">👨‍👩‍👧</p>
            <p className="text-sm font-semibold text-[#18201A] mb-1">No family links yet</p>
            <p className="text-xs" style={{ color: '#647060' }}>Use the form above to link a parent to their child's profile.</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {links.map(link => (
              <div
                key={link.id}
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
                style={{ background: '#FFFFFF', border: '1px solid #E2E4DC' }}
              >
                <span className="text-sm font-medium text-[#18201A]">{link.parentName}</span>
                <span className="text-xs" style={{ color: '#9CA897' }}>→</span>
                <span className="text-sm text-[#18201A] flex-1">{link.childName}</span>
                <button
                  onClick={() => removeLink(link.id)}
                  className="text-xs px-2.5 py-1 rounded-lg flex-shrink-0"
                  style={{ color: '#DC2626', border: '1px solid #FECACA' }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Feedback panel ───────────────────────────────────────────────────────────

const FB_SUBMIT_CATEGORIES = ['General', 'Bug Report', 'Feature Request', 'Design Feedback']
const FB_CATEGORY_HINTS: Record<string, string> = {
  'Bug Report': "Something broken? Tell us exactly what happened and on which screen.",
  'Feature Request': "Got an idea to improve the app? Describe what you'd love to see.",
  'Design Feedback': 'Something looks off or could look better? Let us know.',
  'General': 'Anything else — questions, suggestions, thoughts, complaints...',
}

function FeedbackPanel() {
  const { profile } = useAuth()
  const [showSubmitForm, setShowSubmitForm] = useState(false)
  const [items, setItems] = useState<FeedbackWithPlayer[]>([])
  const [loading, setLoading] = useState(true)
  const [filterCategory, setFilterCategory] = useState('All')
  const [filterReviewed, setFilterReviewed] = useState<'all' | 'unreviewed' | 'reviewed'>('unreviewed')

  // Submit form state
  const [fbCategory, setFbCategory] = useState('General')
  const [fbSubject, setFbSubject] = useState('')
  const [fbMessage, setFbMessage] = useState('')
  const [fbSubmitting, setFbSubmitting] = useState(false)
  const [fbError, setFbError] = useState('')

  async function loadFeedback() {
    const { data: feedbackData } = await supabase
      .from('feedback').select('*').order('created_at', { ascending: false })
    if (!feedbackData) { setLoading(false); return }

    const playerIds = [...new Set((feedbackData as Feedback[]).map(f => f.player_id))]
    const { data: profiles } = await supabase.from('profiles').select('id, name, surname').in('id', playerIds)
    const profileMap: Record<string, string> = {}
    for (const p of (profiles as Profile[]) || []) profileMap[p.id] = `${p.name} ${p.surname}`

    setItems((feedbackData as Feedback[]).map(f => ({ ...f, playerName: profileMap[f.player_id] })))
    setLoading(false)
  }

  useEffect(() => { loadFeedback() }, [])

  async function handleFbSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    setFbSubmitting(true)
    setFbError('')
    const { error } = await supabase.from('feedback').insert({
      player_id: profile.id,
      category: fbCategory,
      subject: fbSubject,
      message: fbMessage,
    })
    setFbSubmitting(false)
    if (error) {
      setFbError(error.message)
    } else {
      setFbSubject('')
      setFbMessage('')
      setFbCategory('General')
      setShowSubmitForm(false)
      await loadFeedback()
    }
  }

  async function toggleReviewed(id: string, current: boolean) {
    await supabase.from('feedback').update({ reviewed: !current }).eq('id', id)
    setItems(prev => prev.map(f => f.id === id ? { ...f, reviewed: !current } : f))
  }

  const filtered = items
    .filter(f => filterCategory === 'All' || f.category === filterCategory)
    .filter(f => filterReviewed === 'all' ? true : filterReviewed === 'reviewed' ? f.reviewed : !f.reviewed)

  const unreviewed = items.filter(f => !f.reviewed).length

  if (showSubmitForm) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-[#18201A]">Submit Feedback</p>
          <button
            onClick={() => setShowSubmitForm(false)}
            className="text-xs px-3 py-1.5 rounded-lg"
            style={{ background: '#FFFFFF', color: '#647060', border: '1px solid #E2E4DC' }}
          >
            Cancel
          </button>
        </div>

        {fbError && (
          <div className="p-3 rounded-lg text-sm" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
            {fbError}
          </div>
        )}

        <form onSubmit={handleFbSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: '#647060' }}>Category</label>
            <select
              value={fbCategory}
              onChange={e => setFbCategory(e.target.value)}
              className="w-full px-4 py-3 rounded-xl text-[#18201A] text-sm outline-none"
              style={{ background: '#FFFFFF', border: '1px solid #E2E4DC' }}
            >
              {FB_SUBMIT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <p className="mt-1.5 text-xs" style={{ color: '#9CA897' }}>{FB_CATEGORY_HINTS[fbCategory]}</p>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: '#647060' }}>Subject</label>
            <input
              type="text"
              value={fbSubject}
              onChange={e => setFbSubject(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl text-[#18201A] text-sm outline-none"
              style={{ background: '#FFFFFF', border: '1px solid #E2E4DC' }}
              placeholder="One-line summary"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: '#647060' }}>Message</label>
            <textarea
              value={fbMessage}
              onChange={e => setFbMessage(e.target.value)}
              required
              rows={5}
              className="w-full px-4 py-3 rounded-xl text-[#18201A] text-sm outline-none resize-none"
              style={{ background: '#FFFFFF', border: '1px solid #E2E4DC' }}
              placeholder="Tell us more..."
            />
          </div>
          <button
            type="submit"
            disabled={fbSubmitting}
            className="w-full py-3 rounded-xl font-semibold text-sm disabled:opacity-50"
            style={{ background: '#0D6B52', color: '#18201A' }}
          >
            {fbSubmitting ? 'Submitting...' : 'Submit Feedback'}
          </button>
        </form>
      </div>
    )
  }

  return (
    <>
      {/* Submit button */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setShowSubmitForm(true)}
          className="px-3 py-1.5 rounded-xl text-xs font-semibold"
          style={{ background: '#0D6B52', color: '#18201A' }}
        >
          + Submit Feedback
        </button>
        {unreviewed > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
            style={{ background: '#FFFFFF', color: '#0D6B52', border: '1px solid #0D6B52' }}>
            {unreviewed} new
          </span>
        )}
      </div>

      {/* Category filter */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 mb-2" style={{ scrollbarWidth: 'none' }}>
        {FB_CATEGORIES.map(c => (
          <button
            key={c}
            onClick={() => setFilterCategory(c)}
            className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium"
            style={{
              background: filterCategory === c ? '#0D6B52' : '#FFFFFF',
              color: filterCategory === c ? 'white' : '#666',
              border: `1px solid ${filterCategory === c ? '#0D6B52' : '#E2E4DC'}`,
            }}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Reviewed filter */}
      <div className="flex gap-1 mb-3">
        {(['unreviewed', 'all', 'reviewed'] as const).map(v => (
          <button
            key={v}
            onClick={() => setFilterReviewed(v)}
            className="px-2.5 py-1 rounded-full text-xs font-medium capitalize"
            style={{
              background: filterReviewed === v ? '#FFFFFF' : 'transparent',
              color: filterReviewed === v ? 'white' : '#555',
              border: `1px solid ${filterReviewed === v ? '#3e3e3e' : 'transparent'}`,
            }}
          >
            {v}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm" style={{ color: '#647060' }}>Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-sm" style={{ color: '#444' }}>
          No feedback here
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map(item => (
            <div key={item.id} className="p-3.5 rounded-2xl"
              style={{
                background: '#FFFFFF',
                border: `1px solid ${item.reviewed ? '#252525' : '#0D6B52'}`,
                opacity: item.reviewed ? 0.65 : 1,
              }}>
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className="text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0"
                      style={{ background: '#FFFFFF', color: '#647060', border: '1px solid #E2E4DC' }}>
                      {item.category}
                    </span>
                    <span className="font-semibold text-[#18201A] text-sm truncate">{item.subject}</span>
                  </div>
                  <p className="text-xs" style={{ color: '#9CA897' }}>
                    {item.playerName ?? 'Unknown'} · {format(new Date(item.created_at), 'dd MMM HH:mm')}
                  </p>
                </div>
                <button
                  onClick={() => toggleReviewed(item.id, item.reviewed)}
                  className="flex-shrink-0 text-xs px-2 py-1 rounded-lg font-medium"
                  style={{
                    background: item.reviewed ? '#FFFFFF' : '#DCFCE7',
                    color: item.reviewed ? '#9CA897' : '#0D6B52',
                    border: `1px solid ${item.reviewed ? '#E2E4DC' : '#0D6B52'}`,
                  }}
                >
                  {item.reviewed ? 'Done' : 'Mark done'}
                </button>
              </div>
              <p className="text-sm leading-relaxed" style={{ color: '#bbb' }}>{item.message}</p>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
