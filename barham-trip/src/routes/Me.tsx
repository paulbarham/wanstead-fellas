import { useRef, useState, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, LogOut, Mail, ShieldCheck, WifiOff } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { supabase, hasSupabase } from '../lib/supabase'
import Avatar from '../components/Avatar'

export default function Me() {
  const { member, session, isLocalMode, signOut, refreshMembers } = useAuth()
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  if (!member) return null

  async function handleAvatar(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !member) return
    if (!supabase) {
      setMsg('Photo upload needs the backend — available once accounts are set up.')
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `${member.id}/avatar.${ext}`
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type })
      if (upErr) throw upErr
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      const url = `${data.publicUrl}?v=${Date.now()}`
      const { error: updErr } = await supabase.from('members').update({ avatar_url: url }).eq('id', member.id)
      if (updErr) throw updErr
      await refreshMembers()
      setMsg('Photo updated.')
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setBusy(false)
    }
  }

  async function handleSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="space-y-5">
      <h1 className="font-display text-3xl text-navy">Account</h1>

      <div
        className="flex flex-col items-center rounded-card bg-white p-6 shadow-card"
        style={{ border: '1px solid rgba(14,58,72,0.08)' }}
      >
        <div className="relative">
          <Avatar member={member} size={96} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="absolute -bottom-1 -right-1 grid h-9 w-9 place-items-center rounded-full text-white shadow-card"
            style={{ background: 'var(--coral)' }}
            aria-label="Change photo"
          >
            <Camera size={17} />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatar}
          />
        </div>
        <h2 className="font-display mt-3 text-2xl text-navy">{member.display_name}</h2>
        <span
          className="mt-1 rounded-full px-3 py-0.5 text-[12px] font-semibold uppercase tracking-wide"
          style={{ background: 'var(--sand)', color: 'var(--coral-dark)' }}
        >
          {member.age_group}
        </span>
        {session?.user.email && (
          <div className="mt-3 flex items-center gap-1.5 text-[13px] text-navy/60">
            <Mail size={14} /> {session.user.email}
          </div>
        )}
        {msg && <p className="mt-3 text-center text-[13px] font-medium text-navy/70">{msg}</p>}
      </div>

      {/* Mode note */}
      <div
        className="flex items-start gap-2.5 rounded-card p-4"
        style={{ background: 'var(--sand-2)', border: '1px solid rgba(224,136,83,0.22)' }}
      >
        {hasSupabase ? (
          <>
            <ShieldCheck size={18} style={{ color: 'var(--teal)' }} className="mt-0.5 flex-shrink-0" />
            <p className="text-[13px] leading-snug text-navy/75">
              Signed in with the family account. Your bookings ticks are shared; packing is private to
              you.
            </p>
          </>
        ) : (
          <>
            <WifiOff size={18} style={{ color: 'var(--coral-dark)' }} className="mt-0.5 flex-shrink-0" />
            <p className="text-[13px] leading-snug text-navy/75">
              Preview mode — state is stored on this device only. Photo upload and live sharing switch
              on once the Supabase backend is connected.
            </p>
          </>
        )}
      </div>

      <button onClick={handleSignOut} className="btn-ghost w-full" style={{ color: 'var(--coral-dark)' }}>
        <LogOut size={18} />
        {isLocalMode ? 'Switch seat' : 'Sign out'}
      </button>
    </div>
  )
}
