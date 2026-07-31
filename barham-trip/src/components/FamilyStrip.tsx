import { Check, X, Users } from 'lucide-react'
import type { TripDay, RsvpChoice } from '../lib/itinerary'
import { recommendedOption, alternativeOptions, choiceLabel } from '../lib/itinerary'
import { useDayRsvp } from '../hooks/useDayRsvp'
import { useAuth } from '../hooks/useAuth'
import Avatar from './Avatar'

interface Props {
  day: TripDay
}

const choiceColor: Record<RsvpChoice, string> = {
  recommended: 'var(--coral)',
  alt1: 'var(--teal)',
  alt2: 'var(--teal)',
  skip: 'rgba(14,58,72,0.35)',
}

/** Avatars + live "I'm in / I'll skip / pick an alternative" for a day. */
export default function FamilyStrip({ day }: Props) {
  const { members, member, currentEmail } = useAuth()
  const { choices, myChoice, setChoice, setChoiceFor } = useDayRsvp(day.n)

  const rec = recommendedOption(day)
  const alts = alternativeOptions(day)

  // Options offered as RSVP choices, mapped to slots.
  const options: { key: RsvpChoice; label: string }[] = [
    { key: 'recommended', label: rec ? "I'm in" : 'Recommended' },
    ...alts.map((a, i) => ({
      key: (i === 0 ? 'alt1' : 'alt2') as RsvpChoice,
      label: a.title,
    })),
    { key: 'skip', label: "I'll skip" },
  ]

  // People with no device who I look after (e.g. Paul manages Tobias & Niyah).
  const managed = currentEmail
    ? members.filter(
        (m) => m.manager_email && m.manager_email.toLowerCase() === currentEmail.toLowerCase(),
      )
    : []

  return (
    <section
      className="rounded-card p-4 shadow-card"
      style={{ background: '#fff', border: '1px solid rgba(14,58,72,0.1)', backgroundClip: 'padding-box' }}
    >
      <div className="flex items-center gap-2">
        <Users size={18} style={{ color: 'var(--coral-dark)' }} />
        <h3 className="font-display text-lg text-navy">Who's in?</h3>
      </div>

      {/* My controls */}
      {member ? (
        <ChoiceRow options={options} current={myChoice} onChoose={setChoice} />
      ) : (
        <p className="mt-2 text-[13px] text-navy/60">Sign in to add your choice.</p>
      )}

      {/* Controls for anyone I manage */}
      {managed.map((m) => (
        <div key={m.id} className="mt-4 border-t pt-3" style={{ borderColor: 'rgba(14,58,72,0.08)' }}>
          <div className="flex items-center gap-2">
            <Avatar member={m} size={24} />
            <span className="text-[13px] font-semibold text-navy">
              {m.display_name}
              <span className="ml-1 font-normal text-navy/45">· you manage this</span>
            </span>
          </div>
          <ChoiceRow
            options={options}
            current={choices[m.id]}
            onChoose={(c) => setChoiceFor(m.id, c)}
          />
        </div>
      ))}

      {/* Everyone's live choices */}
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-3 border-t pt-3" style={{ borderColor: 'rgba(14,58,72,0.08)' }}>
        {members.map((m) => {
          const c = choices[m.id]
          return (
            <div key={m.id} className="flex items-center gap-2">
              <div className="relative">
                <Avatar member={m} size={36} />
                {c && (
                  <span
                    className="absolute -bottom-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-full ring-2 ring-white"
                    style={{ background: choiceColor[c] }}
                  >
                    {c === 'skip' ? (
                      <X size={9} color="#fff" strokeWidth={3} />
                    ) : (
                      <Check size={9} color="#fff" strokeWidth={3} />
                    )}
                  </span>
                )}
              </div>
              <div className="leading-tight">
                <div className="text-[13px] font-semibold text-navy">{m.display_name}</div>
                <div className="text-[11px] text-navy/55">
                  {c ? choiceLabel(day, c) : 'No answer yet'}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function ChoiceRow({
  options,
  current,
  onChoose,
}: {
  options: { key: RsvpChoice; label: string }[]
  current: RsvpChoice | undefined
  onChoose: (c: RsvpChoice) => void
}) {
  return (
    <div className="mt-2.5 flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = current === opt.key
        const isSkip = opt.key === 'skip'
        return (
          <button
            key={opt.key}
            onClick={() => onChoose(opt.key)}
            className="inline-flex items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition active:opacity-70"
            style={{
              minHeight: 44,
              background: active
                ? isSkip
                  ? 'rgba(14,58,72,0.08)'
                  : choiceColor[opt.key]
                : 'var(--sand-2)',
              color: active && !isSkip ? '#fff' : 'var(--navy)',
              border: active ? '1px solid transparent' : '1px solid rgba(14,58,72,0.14)',
            }}
          >
            {opt.key === 'skip' ? <X size={14} /> : active ? <Check size={14} /> : null}
            <span className="max-w-[160px] truncate">{opt.label}</span>
          </button>
        )
      })}
    </div>
  )
}
