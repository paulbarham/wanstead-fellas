import { useEffect, useMemo, useState } from 'react'
import { X, Star, Check, CalendarPlus, Sparkles } from 'lucide-react'
import type { Leg, Idea } from '../lib/itinerary'
import { scoreDays, bestDay, complements } from '../lib/suggestDay'
import { supabase } from '../lib/supabase'
import { useLocalStore, type DayPlanItem } from '../store/local'
import { addToDay } from '../hooks/useDayPlan'
import { useAuth } from '../hooks/useAuth'

interface Props {
  idea: Idea
  leg: Leg
  /** Called after adding (or cancelling). `addedDayN` set only when something was added. */
  onClose: (addedDayN?: number) => void
}

/** Bottom-sheet flow to add an idea to the itinerary: the app suggests the best
 *  day (from what's already planned) and complementary ideas to add alongside. */
export default function AddToItinerary({ idea, leg, onClose }: Props) {
  const { member } = useAuth()
  const dayPlans = useLocalStore((s) => s.dayPlans)
  const [busy, setBusy] = useState(false)
  const [checked, setChecked] = useState<Set<string>>(new Set())

  // Pull the whole leg's plans so day suggestions reflect real, current load.
  useEffect(() => {
    if (!supabase) return
    const nums = leg.days.map((d) => d.n)
    supabase
      .from('day_plans')
      .select('id, day_n, title, note, done, added_by, created_at')
      .in('day_n', nums)
      .then(({ data }) => {
        if (!data) return
        const byDay: Record<number, DayPlanItem[]> = {}
        for (const r of data as DayPlanItem[]) (byDay[r.day_n] ??= []).push(r)
        for (const n of nums) useLocalStore.getState().mergeDayPlanItems(n, byDay[n] ?? [])
      })
  }, [leg])

  // Lock the page behind the sheet.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  const plansByDay = useMemo(() => {
    const m: Record<number, { title: string }[]> = {}
    for (const d of leg.days) m[d.n] = (dayPlans[d.n] ?? []).map((i) => ({ title: i.title }))
    return m
  }, [dayPlans, leg])

  const scores = useMemo(() => scoreDays(leg, idea, plansByDay), [leg, idea, plansByDay])
  const best = useMemo(() => bestDay(scores), [scores])

  const [selectedDayN, setSelectedDayN] = useState<number>(
    () => bestDay(scoreDays(leg, idea, {}))?.day.n ?? leg.days[0].n,
  )
  // Follow the suggested best day until the user picks one themselves.
  const [touched, setTouched] = useState(false)
  useEffect(() => {
    if (!touched && best) setSelectedDayN(best.day.n)
  }, [best, touched])

  const plannedTitles = useMemo(
    () => new Set((dayPlans[selectedDayN] ?? []).map((i) => i.title)),
    [dayPlans, selectedDayN],
  )
  const comps = useMemo(
    () => complements(leg, idea, plannedTitles),
    [leg, idea, plannedTitles],
  )

  const selectedScore = scores.find((s) => s.day.n === selectedDayN)
  const selectedDay = selectedScore?.day ?? leg.days[0]

  function toggle(title: string) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(title)) next.delete(title)
      else next.add(title)
      return next
    })
  }

  async function confirm() {
    if (!member || busy) return
    setBusy(true)
    await addToDay(selectedDayN, idea.title, idea.note ?? '', member.id)
    for (const c of comps) {
      if (checked.has(c.title)) await addToDay(selectedDayN, c.title, c.note ?? '', member.id)
    }
    setBusy(false)
    onClose(selectedDayN)
  }

  const addedCount = 1 + comps.filter((c) => checked.has(c.title)).length

  return (
    <div
      onClick={() => onClose()}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, cursor: 'pointer' }}
      className="flex items-end justify-center"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 430,
          maxHeight: '88vh',
          background: 'var(--surface)',
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          boxShadow: '0 -12px 40px rgba(0,0,0,0.45)',
          cursor: 'default',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
        className="flex flex-col overflow-hidden"
      >
        {/* Handle + header */}
        <div className="flex-shrink-0 px-4 pt-2">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full" style={{ background: 'rgba(14,58,72,0.2)' }} />
          <div className="flex items-center gap-2 pb-2">
            <CalendarPlus size={18} style={{ color: 'var(--coral-dark)' }} />
            <h3 className="font-display text-lg text-navy">Add to the trip</h3>
            <button
              onClick={() => onClose()}
              className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-navy/45"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4">
          {/* The idea */}
          <div
            className="rounded-xl p-3"
            style={{ background: 'var(--sand-2)', border: '1px solid rgba(14,58,72,0.08)' }}
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[15px] font-semibold text-navy">{idea.title}</span>
              {idea.recommended && (
                <span
                  className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
                  style={{ background: 'var(--coral)' }}
                >
                  <Star size={9} fill="currentColor" strokeWidth={0} /> Must-do
                </span>
              )}
            </div>
            {idea.note && <p className="mt-0.5 text-[13px] text-navy/65">{idea.note}</p>}
          </div>

          {/* Suggested day */}
          <div className="mt-4">
            <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-navy/45">
              <Sparkles size={13} style={{ color: 'var(--coral-dark)' }} /> Suggested day
            </div>
            {best && (
              <p className="mb-2 text-[13px] text-navy/70">
                Best fit: <span className="font-semibold text-navy">{best.day.weekday} {best.day.date}</span> — {best.reason.toLowerCase()}.
              </p>
            )}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {scores.map((s) => {
                const active = s.day.n === selectedDayN
                const isBest = best?.day.n === s.day.n
                return (
                  <button
                    key={s.day.n}
                    onClick={() => {
                      setSelectedDayN(s.day.n)
                      setTouched(true)
                    }}
                    className="rounded-xl p-2.5 text-left"
                    style={{
                      background: active ? 'var(--coral)' : 'var(--surface)',
                      border: active ? '1px solid var(--coral)' : '1px solid rgba(14,58,72,0.14)',
                      color: active ? '#fff' : 'var(--text)',
                    }}
                  >
                    <div className="flex items-center gap-1 text-[12px] font-bold uppercase tracking-wide" style={{ opacity: active ? 0.9 : 0.6 }}>
                      {s.day.weekday.slice(0, 3)} {s.day.date}
                      {isBest && !active && <Star size={10} fill="var(--coral)" strokeWidth={0} />}
                    </div>
                    <div className="mt-0.5 truncate text-[12px]" style={{ opacity: active ? 0.95 : 0.7 }}>
                      {s.day.title}
                    </div>
                    <div className="mt-0.5 text-[11px]" style={{ opacity: active ? 0.85 : 0.5 }}>
                      {s.count === 0 ? 'nothing planned' : `${s.count} planned`}
                      {s.fits ? ' · fits' : s.anchor ? ' · busy day' : ''}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Complements */}
          {comps.length > 0 && (
            <div className="mt-4">
              <div className="mb-1.5 text-[12px] font-bold uppercase tracking-wide text-navy/45">
                Goes well with
              </div>
              <ul className="space-y-2">
                {comps.map((c) => {
                  const on = checked.has(c.title)
                  return (
                    <li key={c.title}>
                      <button
                        onClick={() => toggle(c.title)}
                        className="flex w-full items-start gap-2.5 rounded-xl p-3 text-left"
                        style={{
                          background: on ? 'var(--sand)' : 'var(--sand-2)',
                          border: `1px solid ${on ? 'rgba(224,136,83,0.4)' : 'rgba(14,58,72,0.08)'}`,
                        }}
                      >
                        <span
                          className="mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-md"
                          style={{
                            background: on ? 'var(--coral)' : 'var(--surface)',
                            border: on ? 'none' : '1px solid rgba(14,58,72,0.25)',
                          }}
                        >
                          {on && <Check size={13} className="text-white" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[14px] font-semibold text-navy">{c.title}</span>
                            {c.recommended && <Star size={11} fill="var(--coral)" strokeWidth={0} />}
                          </div>
                          {c.note && <div className="mt-0.5 truncate text-[12px] text-navy/55">{c.note}</div>}
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 border-t px-4 py-3" style={{ borderColor: 'rgba(14,58,72,0.1)' }}>
          <button
            onClick={confirm}
            disabled={busy || !member}
            className="btn-coral w-full disabled:opacity-50"
            style={{ minHeight: 46 }}
          >
            {busy
              ? 'Adding…'
              : `Add ${addedCount === 1 ? 'to' : `${addedCount} to`} ${selectedDay.weekday} ${selectedDay.date}`}
          </button>
        </div>
      </div>
    </div>
  )
}
