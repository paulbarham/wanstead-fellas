import { POD_ENTRIES, CLUB_PODS, type PodEntry } from '../lib/pods'
import CeefaxHeader from '../components/CeefaxHeader'
import { useAuth } from '../hooks/useAuth'
import { getClub } from '../lib/clubs'

export default function PodsPage() {
  const { profile } = useAuth()
  const club = getClub(profile?.favourite_club)
  const clubPods = profile?.favourite_club ? CLUB_PODS[profile.favourite_club] : undefined

  return (
    <div className="px-5 py-5">
      <CeefaxHeader pageId="P701 · FEED" title="PODS" meta="FOOTBALL · POD & NEWS FEED" />

      {profile?.favourite_club && (
        <ClubSection clubName={club?.display_name ?? null} clubPods={clubPods} />
      )}

      {profile?.favourite_club && (
        <SectionLabel>▶ The Curated List</SectionLabel>
      )}

      <div className="space-y-3">
        {POD_ENTRIES.map(entry => <PodCard key={entry.id} entry={entry} />)}
      </div>

      <p className="text-xs mt-6 text-center" style={{ color: 'var(--color-text-muted)' }}>
        More pods & news links coming. Got one to add? Drop it to an admin.
      </p>
    </div>
  )
}

function ClubSection({ clubName, clubPods }: { clubName: string | null; clubPods: PodEntry[] | undefined }) {
  return (
    <>
      <SectionLabel>
        ▶ Your Club{clubName ? ` · ${clubName.toUpperCase()}` : ''}
      </SectionLabel>
      {clubPods && clubPods.length > 0 ? (
        <div className="space-y-3">
          {clubPods.map(entry => <PodCard key={entry.id} entry={entry} />)}
        </div>
      ) : (
        <div
          className="rounded-2xl p-4 text-sm"
          style={{
            background: 'var(--color-surface)',
            border: '1px dashed var(--color-border)',
            color: 'var(--color-text-muted)',
            lineHeight: 1.5,
          }}
        >
          No fan pod curated for your club yet. Drop a suggestion to an admin and we'll add it.
        </div>
      )}
    </>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-xs mt-1 mb-3"
      style={{
        fontFamily: 'var(--font-mono)',
        color: 'var(--tt-cyan)',
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
      }}
    >
      {children}
    </p>
  )
}

function PodCard({ entry }: { entry: PodEntry }) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
    >
      <div className="flex items-start gap-3 p-4">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
          style={{ background: entry.accent + '22', border: `1px solid ${entry.accent}55` }}
          aria-hidden="true"
        >
          {entry.icon}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-display text-[var(--color-text)] tracking-wide" style={{ fontSize: '18px', lineHeight: 1.1 }}>
            {entry.title}
          </h2>
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
            {entry.host}
          </p>
        </div>
      </div>
      <p className="text-sm px-4 pb-3" style={{ color: 'var(--color-text)', lineHeight: 1.5 }}>
        {entry.blurb}
      </p>
      <div className="flex gap-2 px-4 pb-4">
        {entry.links.map(link => (
          <a
            key={link.url}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 text-center py-2 rounded-lg text-xs font-semibold"
            style={{
              background: 'var(--color-primary)',
              color: 'var(--color-surface)',
              textDecoration: 'none',
            }}
          >
            Listen on {link.label}
          </a>
        ))}
      </div>
    </div>
  )
}
