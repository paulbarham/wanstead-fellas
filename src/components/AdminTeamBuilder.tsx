import React, { useCallback, useEffect, useState } from 'react'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import { getVotingWindow, canGenerateTeams } from '../lib/time'
import type { Profile, Match, Team } from '../types'
import PlayerAvatar from './PlayerAvatar'
import { pickConfig, formatLabelFor, splitPlayingAndReserves, stripFC } from '../lib/format'
import { fetchWeather, weatherEmoji, weatherLabel, type WeatherData } from '../lib/weather'

interface TeamDraft {
  id?: string
  name: string
  bibs: boolean
  captain?: Profile
  players: Profile[]
}

interface Props {
  nextThursday: string
  match: Match | null
  publishedTeams: (Team & { players: Profile[]; captain: Profile | null })[]
  onPublished: () => void
}

const ATTR_LABELS: { key: keyof Profile; label: string }[] = [
  { key: 'sp', label: 'Pace' },
  { key: 'sk', label: 'Skill' },
  { key: 'st', label: 'Stamina' },
  { key: 'tk', label: 'Tackling' },
  { key: 'ps', label: 'Passing' },
  { key: 'ag', label: 'Aggression' },
  { key: 'phy', label: 'Physicality' },
  { key: 'cp', label: 'Composure' },
  { key: 'wr', label: 'Work Rate' },
]

const TEAM_COLORS = ['#1E3A5F', '#14532D', '#7C2D12', '#4C1D95']

// When a player's nine base attrs are all equal it means they're the auto-
// default (the spreadsheet ratings have been entered into the six card_*
// fields instead). For those players we derive the nine attrs from card_*
// with overall_rating as the fallback for the four (stamina, aggression,
// composure, work rate) that don't have a card equivalent. Players with
// varied base attrs (already curated) are passed through unchanged so we
// don't flatten anything like Lawrie's 10/10/8/10/10/7/7/10/7.
function effectiveAttrs(p: Profile): Record<string, number> {
  const baseAllSame =
    p.sp === p.sk && p.sk === p.st && p.st === p.tk && p.tk === p.ps
    && p.ps === p.ag && p.ag === p.phy && p.phy === p.cp && p.cp === p.wr
  const hasCardStats = p.card_pace != null

  if (baseAllSame && hasCardStats) {
    const ovr = p.overall_rating
    return {
      sp:  p.card_pace        ?? ovr,
      sk:  p.card_dribbling   ?? ovr,
      st:  ovr,
      tk:  p.card_defence     ?? ovr,
      ps:  p.card_passing     ?? ovr,
      ag:  ovr,
      phy: p.card_physicality ?? ovr,
      cp:  ovr,
      wr:  ovr,
    }
  }

  return {
    sp: p.sp, sk: p.sk, st: p.st, tk: p.tk, ps: p.ps,
    ag: p.ag, phy: p.phy, cp: p.cp, wr: p.wr,
  }
}

function calcWeightedScore(player: Profile, weights: Record<string, number>): number {
  const attrs = effectiveAttrs(player)
  return ATTR_LABELS.reduce((sum, { key }) => sum + (attrs[key as string] || 0) * (weights[key] || 0), 0)
}

// Snake draft with position priority — the previous single-list sort was
// position-blind, which frequently clumped goalkeepers onto one team and
// left other teams with none (or with no attackers, no defenders, etc.).
//
// New approach: split the roster into pools by primary position, snake
// each pool in turn — GKs first (scarcest, most position-critical), then
// ATTs (also scarce), then DEFs, then MIDs. Direction and cursor carry
// over between pools so adjacent positions don't clump on the same team.
// A max-size cap keeps team sizes even when a pool is unusually large.
function snakeDraft(players: Profile[], numTeams: number, weights: Record<string, number>): Profile[][] {
  const teams: Profile[][] = Array.from({ length: numTeams }, () => [])
  const maxSize = Math.ceil(players.length / numTeams)
  const posOf = (p: Profile): string | null =>
    p.preferred_position_primary ?? p.position ?? null
  const sortByScore = (arr: Profile[]) =>
    [...arr].sort((a, b) => calcWeightedScore(b, weights) - calcWeightedScore(a, weights))

  const gks  = sortByScore(players.filter(p => posOf(p) === 'GK'))
  const atts = sortByScore(players.filter(p => posOf(p) === 'ATT'))
  const defs = sortByScore(players.filter(p => posOf(p) === 'DEF'))
  const mids = sortByScore(players.filter(p => posOf(p) === 'MID'))
  const rest = sortByScore(players.filter(p => {
    const pos = posOf(p)
    return pos !== 'GK' && pos !== 'ATT' && pos !== 'DEF' && pos !== 'MID'
  }))

  let idx = 0
  let dir: 1 | -1 = 1
  const advance = () => {
    idx += dir
    if (idx === numTeams) { idx = numTeams - 1; dir = -1 }
    else if (idx === -1)  { idx = 0;             dir =  1 }
  }
  const distribute = (pool: Profile[]) => {
    for (const p of pool) {
      // Skip full teams — keeps team sizes even when a position pool is
      // large (typically DEFs/MIDs). Bounded loop for safety in case
      // every team is full (shouldn't happen if maxSize is right).
      let attempts = 0
      while (teams[idx].length >= maxSize && attempts < numTeams * 2) {
        advance()
        attempts++
      }
      teams[idx].push(p)
      advance()
    }
  }

  distribute(gks)
  distribute(atts)
  distribute(defs)
  distribute(mids)
  distribute(rest)

  return teams
}

function pickCaptain(players: Profile[]): Profile {
  const sorted = [...players].sort((a, b) => b.overall_rating - a.overall_rating)
  const top3 = sorted.slice(0, 3)
  return top3[Math.floor(Math.random() * top3.length)]
}

const byName = (a: Profile, b: Profile) =>
  `${a.name} ${a.surname}`.localeCompare(`${b.name} ${b.surname}`, undefined, { sensitivity: 'base' })

const ATTR_TAGLINE: Record<string, string> = {
  sp: 'Pace to burn',
  sk: 'Silkiest technicians on the pitch',
  st: 'Will still be running in injury time',
  tk: 'Iron defensive unit',
  ps: 'Best passing side on the night',
  ag: 'Going to leave a few in',
  phy: 'Physical mismatch in their favour',
  cp: 'Coolest heads when it tightens up',
  wr: 'Engine room mileage',
}

function predictTable(teams: TeamDraft[], weights: Record<string, number>) {
  const stats = teams.map(team => {
    const total = team.players.reduce((s, p) => s + calcWeightedScore(p, weights), 0)
    const attrAvgs: Record<string, number> = {}
    for (const { key } of ATTR_LABELS) {
      const sum = team.players.reduce((acc, p) => acc + (effectiveAttrs(p)[key as string] || 0), 0)
      attrAvgs[key as string] = sum / Math.max(1, team.players.length)
    }
    return { team, total, attrAvgs }
  })
  stats.sort((a, b) => b.total - a.total)

  return stats.map((s, idx) => {
    let bestKey = 'sp'
    let bestDiff = -Infinity
    for (const { key } of ATTR_LABELS) {
      const mine = s.attrAvgs[key as string]
      const others = stats
        .filter((_, i) => i !== idx)
        .reduce((acc, t) => acc + t.attrAvgs[key as string], 0) / Math.max(1, stats.length - 1)
      const diff = mine - others
      if (diff > bestDiff) { bestDiff = diff; bestKey = key as string }
    }
    return { team: s.team, reasoning: ATTR_TAGLINE[bestKey] ?? 'Solid all-round' }
  })
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function buildTalkingPoints(teams: TeamDraft[]): string[] {
  const flat = teams.flatMap(t => t.players.map(p => ({ player: p, team: t })))
  if (flat.length === 0) return []
  const captains = teams.map(t => t.captain).filter(Boolean) as Profile[]
  const fullName = (p: Profile) => `${p.name} ${p.surname}`
  const pool: string[] = []

  const cuntiest = [...flat].sort((a, b) => b.player.cunt - a.player.cunt)[0]
  if (cuntiest) pool.push(`Designated cunt of the night: ${fullName(cuntiest.player)} — he knows what he did.`)

  if (captains.length >= 2) {
    const topCap = [...captains].sort((a, b) => b.overall_rating - a.overall_rating)[0]
    const lowCap = [...captains].sort((a, b) => a.overall_rating - b.overall_rating)[0]
    if (topCap) pool.push(`Captain banker: ${fullName(topCap)}. The other three are playing for second.`)
    if (lowCap && lowCap.id !== topCap?.id) {
      pool.push(`If ${fullName(lowCap)}'s lot wins it, scenes. Captain rating ${lowCap.overall_rating} — a proper heist.`)
    }
  }

  const fightiest = [...flat].sort((a, b) => b.player.ag - a.player.ag)[0]
  if (fightiest) pool.push(`Refs already taking note of ${fullName(fightiest.player)}. Bring shin pads, lads.`)

  const sniper = [...flat].sort((a, b) => (b.player.sp + b.player.sk) - (a.player.sp + a.player.sk))[0]
  if (sniper) pool.push(`${fullName(sniper.player)} on golden boot watch — just put it on his head.`)

  const lazy = [...flat].sort((a, b) => a.player.wr - b.player.wr)[0]
  if (lazy) pool.push(`${fullName(lazy.player)} on tracking-back watch. Spoiler: he's not.`)

  const passer = [...flat].sort((a, b) => b.player.ps - a.player.ps)[0]
  if (passer) pool.push(`Give it to ${fullName(passer.player)} and let him think for the rest of you.`)

  const composed = [...flat].sort((a, b) => a.player.cp - b.player.cp)[0]
  if (composed) pool.push(`${fullName(composed.player)} stepping up to a penalty: pray.`)

  const wtps = flat.filter(({ player }) => {
    const t = player.player_type ?? 'wtp'
    return t === 'wtp' || t === 'wtp_priority'
  })
  if (wtps.length >= 3) {
    pool.push(`${wtps.length} casuals making the cut tonight — subs better be on it or there'll be questions in the AGM.`)
  }

  return shuffle(pool).slice(0, 4)
}

function buildWhatsAppText(
  teams: TeamDraft[],
  nextThursday: string,
  weights: Record<string, number>,
  weather: WeatherData | null,
  debutantIds: Set<string>,
): string {
  const dateLabel = format(new Date(nextThursday + 'T12:00:00'), 'do MMMM')
  const totalPlayers = teams.reduce((sum, t) => sum + t.players.length, 0)
  const cfg = pickConfig(totalPlayers)
  const formatLabel = `${formatLabelFor(cfg)}${cfg ? ` · ${cfg.numTeams} teams` : ''}`

  let text = `🏆 WANSTEAD FELLAS — THURSDAY NIGHT FOOTBALL\n`
  text += `📅 ${dateLabel} | ${formatLabel} | 9–10pm\n`

  if (weather) {
    text += `\n${weatherEmoji(weather.weatherCode)} Forecast: ${weatherLabel(weather.weatherCode)} · ${weather.temperatureC}°C · ${weather.windSpeedMph}mph wind · ${weather.precipitationProbability}% rain\n`
  }

  for (const team of teams) {
    text += `\n*${team.name}* ${team.bibs ? '🟡 BIBS' : '⬜ NO BIBS'}\n`
    for (const p of [...team.players].sort(byName)) {
      const debutTag = debutantIds.has(p.id) ? ' 🆕 DEBUT' : ''
      text += `${p.name} ${p.surname}${debutTag}\n`
    }
  }

  if (teams.length >= 2) {
    const table = predictTable(teams, weights)
    text += `\n📊 LIKELY FINAL TABLE\n`
    table.forEach((row, i) => {
      text += `${i + 1}. ${row.team.name} — ${row.reasoning}\n`
    })
  }

  const banter = buildTalkingPoints(teams)
  if (banter.length > 0) {
    text += `\n💬 TALKING POINTS\n`
    for (const point of banter) text += `• ${point}\n`
  }

  text += `\nTotal players: ${totalPlayers}\nSee you Thursday! ⚽`
  return text
}

function buildFlatList(teams: TeamDraft[]): string {
  const all = teams.flatMap(t => t.players)
  const sorted = [...all].sort(byName)
  return sorted.map(p => `${p.name} ${p.surname}`).join('\n')
}

export default function AdminTeamBuilder({ nextThursday, match, publishedTeams, onPublished }: Props) {
  const [availablePlayers, setAvailablePlayers] = useState<Profile[]>([])
  const [signupTimes, setSignupTimes] = useState<Record<string, string>>({})
  const [weights, setWeights] = useState<Record<string, number>>(() =>
    Object.fromEntries(ATTR_LABELS.map(a => [a.key, 1]))
  )
  const [draftTeams, setDraftTeamsState] = useState<TeamDraft[]>([])
  const setDraftTeams: React.Dispatch<React.SetStateAction<TeamDraft[]>> = useCallback(updater => {
    setDraftTeamsState(prev => {
      const next = typeof updater === 'function'
        ? (updater as (p: TeamDraft[]) => TeamDraft[])(prev)
        : updater
      void (async () => {
        if (next.length === 0) {
          await supabase.from('team_drafts').delete().eq('match_date', nextThursday)
        } else {
          await supabase
            .from('team_drafts')
            .upsert({ match_date: nextThursday, draft: next }, { onConflict: 'match_date' })
        }
      })()
      return next
    })
  }, [nextThursday])

  useEffect(() => {
    let cancelled = false
    async function hydrate() {
      const { data } = await supabase
        .from('team_drafts')
        .select('draft')
        .eq('match_date', nextThursday)
        .maybeSingle()
      if (cancelled) return
      setDraftTeamsState(data && Array.isArray(data.draft) ? (data.draft as TeamDraft[]) : [])
    }
    hydrate()
    return () => { cancelled = true }
  }, [nextThursday])

  const [canGenerate, setCanGenerate] = useState(() => canGenerateTeams(nextThursday))
  useEffect(() => {
    setCanGenerate(canGenerateTeams(nextThursday))
    const id = setInterval(() => setCanGenerate(canGenerateTeams(nextThursday)), 60000)
    return () => clearInterval(id)
  }, [nextThursday])
  const [swapModal, setSwapModal] = useState<{ player: Profile; fromTeamIdx: number } | null>(null)
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [published, setPublished] = useState(publishedTeams.length > 0)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [republishConfirm, setRepublishConfirm] = useState(false)
  const [showWeights, setShowWeights] = useState(false)
  const [copied, setCopied] = useState<'whatsapp' | 'flat' | null>(null)
  const [debutantIds, setDebutantIds] = useState<Set<string>>(new Set())

  useEffect(() => { setPublished(publishedTeams.length > 0) }, [publishedTeams])

  // A player debuts when they have no prior team_players row for a match
  // earlier than nextThursday — i.e. they've never been picked for a team
  // before. Re-fetches whenever the draft or published line-up changes so
  // tags are accurate before the WhatsApp export.
  const playerIdsKey = React.useMemo(() => {
    const draftIds = draftTeams.flatMap(t => t.players.map(p => p.id))
    const publishedIds = publishedTeams.flatMap(t => t.players.map(p => p.id))
    return Array.from(new Set([...draftIds, ...publishedIds])).sort().join(',')
  }, [draftTeams, publishedTeams])

  useEffect(() => {
    let cancelled = false
    async function fetchDebutants() {
      if (!playerIdsKey) { setDebutantIds(new Set()); return }
      const allIds = playerIdsKey.split(',')
      const { data, error } = await supabase
        .from('v_player_match_history')
        .select('player_id, first_match_date')
        .in('player_id', allIds)
      if (cancelled) return
      if (error) { console.error('AdminTeamBuilder debutant fetch failed:', error); return }
      const veterans = new Set<string>()
      for (const row of (data ?? []) as Array<{ player_id: string; first_match_date: string }>) {
        if (row.first_match_date && row.first_match_date < nextThursday) veterans.add(row.player_id)
      }
      setDebutantIds(new Set(allIds.filter(id => !veterans.has(id))))
    }
    fetchDebutants()
    return () => { cancelled = true }
  }, [playerIdsKey, nextThursday])

  useEffect(() => {
    let cancelled = false
    fetchWeather(nextThursday)
      .then(data => { if (!cancelled) setWeather(data) })
      .catch(err => { console.error('AdminTeamBuilder weather fetch failed:', err) })
    return () => { cancelled = true }
  }, [nextThursday])

  useEffect(() => {
    async function load() {
      const { data: avail } = await supabase
        .from('availability')
        .select('player_id, created_at')
        .eq('match_date', nextThursday)
        .eq('status', 'confirmed')
      if (!avail || avail.length === 0) return
      const rows = avail as { player_id: string; created_at: string }[]
      const ids = rows.map(a => a.player_id)
      const times: Record<string, string> = {}
      for (const r of rows) times[r.player_id] = r.created_at
      const { data: profs } = await supabase.from('profiles').select('*').in('id', ids)
      setAvailablePlayers((profs as Profile[]) || [])
      setSignupTimes(times)
    }
    load()
  }, [nextThursday])

  function autoBalance() {
    const cfg = pickConfig(availablePlayers.length)
    if (!cfg) {
      alert(`Need at least 10 confirmed players to generate teams (currently ${availablePlayers.length}).`)
      return
    }
    const candidates = availablePlayers.map(p => ({ player: p, createdAt: signupTimes[p.id] ?? '' }))
    const { playing } = splitPlayingAndReserves(candidates, cfg.total)
    const playingProfiles = playing.map(c => c.player)
    const groups = snakeDraft(playingProfiles, cfg.numTeams, weights)
    const bibsPattern = cfg.numTeams === 2 ? [true, false] : [true, false, true, false]
    const teams: TeamDraft[] = groups.map((players, i) => {
      const captain = pickCaptain(players)
      return { name: `${captain.name} ${captain.surname} ${cfg.numTeams === 2 ? 'XI' : 'FC'}`, bibs: bibsPattern[i], captain, players }
    })
    setDraftTeams(teams)
    setPublished(false)
  }

  function swapPlayers(fromTeamIdx: number, fromPlayer: Profile, toTeamIdx: number, toPlayer: Profile) {
    setDraftTeams(prev => {
      const next = prev.map(t => ({ ...t, players: [...t.players] }))
      const fromTeam = next[fromTeamIdx]
      const toTeam = next[toTeamIdx]
      fromTeam.players = fromTeam.players.filter(p => p.id !== fromPlayer.id)
      toTeam.players = toTeam.players.filter(p => p.id !== toPlayer.id)
      fromTeam.players.push(toPlayer)
      toTeam.players.push(fromPlayer)
      if (fromTeam.captain?.id === fromPlayer.id) fromTeam.captain = pickCaptain(fromTeam.players)
      if (toTeam.captain?.id === toPlayer.id) toTeam.captain = pickCaptain(toTeam.players)
      const suffix = next.length === 2 ? 'XI' : 'FC'
      fromTeam.name = `${fromTeam.captain?.name ?? ''} ${fromTeam.captain?.surname ?? ''} ${suffix}`
      toTeam.name = `${toTeam.captain?.name ?? ''} ${toTeam.captain?.surname ?? ''} ${suffix}`
      return next
    })
    setSwapModal(null)
  }

  function balanceScore(): number {
    if (draftTeams.length < 2) return 0
    const scores = draftTeams.map(t =>
      t.players.reduce((s, p) => s + calcWeightedScore(p, weights), 0)
    )
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length
    const variance = scores.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / scores.length
    return Math.max(0, Math.round(100 - variance / 10))
  }

  async function publish() {
    if (draftTeams.length === 0) return
    setPublishing(true)
    setPublishError(null)
    try {
      let matchId = match?.id
      if (!matchId) {
        const { data: newMatch, error: matchErr } = await supabase
          .from('matches')
          .insert({ match_date: nextThursday, format: formatLabelFor(pickConfig(draftTeams.reduce((s, t) => s + t.players.length, 0))), status: 'published' })
          .select().single()
        if (matchErr) throw new Error(`Couldn't create match: ${matchErr.message}`)
        matchId = newMatch?.id
      } else {
        const { error: updErr } = await supabase.from('matches').update({ status: 'published' }).eq('id', matchId)
        if (updErr) throw new Error(`Couldn't mark match published: ${updErr.message}`)
      }
      if (!matchId) throw new Error("Couldn't determine match id after upsert")

      const { data: oldTeams, error: oldTeamsErr } = await supabase.from('teams').select('id').eq('match_id', matchId)
      if (oldTeamsErr) throw new Error(`Couldn't read existing teams: ${oldTeamsErr.message}`)
      if (oldTeams && oldTeams.length > 0) {
        const oldIds = oldTeams.map((t: { id: string }) => t.id)
        const { error: tpDelErr } = await supabase.from('team_players').delete().in('team_id', oldIds)
        if (tpDelErr) throw new Error(`Couldn't clear old team_players: ${tpDelErr.message}`)
        // Delete fixtures BEFORE teams — fixtures.team1_id/team2_id FKs
        // would otherwise block the team delete on RESTRICT.
        const { error: fxDelErr } = await supabase.from('fixtures').delete().eq('match_id', matchId)
        if (fxDelErr) throw new Error(`Couldn't clear old fixtures: ${fxDelErr.message}`)
        const { error: tDelErr } = await supabase.from('teams').delete().eq('match_id', matchId)
        if (tDelErr) throw new Error(`Couldn't clear old teams: ${tDelErr.message}`)
      }

      const insertedTeamIds: string[] = []
      for (const team of draftTeams) {
        const { data: teamRow, error: teamErr } = await supabase
          .from('teams')
          .insert({ match_id: matchId, name: team.name, captain_id: team.captain?.id ?? null, bibs: team.bibs })
          .select().single()
        if (teamErr || !teamRow) throw new Error(`Couldn't save team "${team.name}": ${teamErr?.message ?? 'no row returned'}`)
        insertedTeamIds.push(teamRow.id)
        const { error: tpErr } = await supabase.from('team_players').insert(
          team.players.map(p => ({ team_id: teamRow.id, player_id: p.id }))
        )
        if (tpErr) throw new Error(`Couldn't save players for "${team.name}": ${tpErr.message}`)
      }

      // Auto-generate round-robin fixtures so the admin doesn't have to hit
      // "Generate Fixtures" separately on the Match tab. Each pair of teams
      // plays once. For 4 teams that's 6 fixtures; for 2 teams (11v11) it's
      // 1 fixture. Matches the loop shape in AdminMatchEntry.roundRobinRows.
      // On re-publish the old team_players / teams / fixtures were already
      // cleared above, so this insert always starts from a clean slate.
      if (insertedTeamIds.length >= 2) {
        const fixtureRows: { match_id: string; team1_id: string; team2_id: string }[] = []
        for (let i = 0; i < insertedTeamIds.length; i++) {
          for (let j = i + 1; j < insertedTeamIds.length; j++) {
            fixtureRows.push({ match_id: matchId, team1_id: insertedTeamIds[i], team2_id: insertedTeamIds[j] })
          }
        }
        const { error: fxErr } = await supabase.from('fixtures').insert(fixtureRows)
        // Non-fatal — a unique-constraint clash (rare, means the fixtures
        // somehow survived the earlier delete) shouldn't block the whole
        // publish. Admin can regenerate manually.
        if (fxErr && fxErr.code !== '23505') {
          throw new Error(`Couldn't create fixtures: ${fxErr.message}`)
        }
      }

      // Open the MOTM/DOTD voting window for this match (10:30pm match
      // night → 10am next day). Preserves results_published if the row
      // already exists.
      const { opens_at, closes_at } = getVotingWindow(nextThursday)
      const { error: vwErr } = await supabase.from('voting_windows').upsert(
        { match_id: matchId, opens_at, closes_at },
        { onConflict: 'match_id' },
      )
      if (vwErr) throw new Error(`Couldn't open voting window: ${vwErr.message}`)

      // WTP charges are no longer created at publish time — they now fire
      // via the DB trigger (migration 044) when the match is marked
      // completed. This keeps a player's finances tab clean until they've
      // actually played (matches the admin's expectation that pre-match
      // signup shouldn't show as owing until the game has been played).

      setPublished(true)
      onPublished()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('Publish teams failed:', e)
      setPublishError(msg)
    } finally {
      setPublishing(false)
    }
  }

  async function copyToClipboard(text: string, type: 'whatsapp' | 'flat') {
    await navigator.clipboard.writeText(text)
    setCopied(type)
    setTimeout(() => setCopied(null), 2000)
  }

  const score = balanceScore()
  const teamsToShow = draftTeams.length > 0 ? draftTeams : publishedTeams.map(t => ({
    id: t.id,
    name: t.name,
    bibs: t.bibs,
    captain: t.captain ?? undefined,
    players: t.players,
  }))

  const totalPlayers = teamsToShow.reduce((sum, t) => sum + t.players.length, 0)
  const isOverCap = totalPlayers > 32

  return (
    <div className="px-4 pt-4" style={{ paddingBottom: 0 }}>
      <p className="text-xs font-medium uppercase tracking-widest mb-0.5" style={{ color: 'var(--color-primary)' }}>Teams</p>
      <div className="flex items-center justify-between mb-1">
        <h1 className="font-display text-2xl text-[var(--color-text)] tracking-wide">TEAM BUILDER</h1>
        <span className="text-xs px-2 py-1 rounded-full" style={{ background: 'var(--color-surface)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
          {availablePlayers.length} confirmed
        </span>
      </div>

      {published && draftTeams.length === 0 && (
        <div className="mb-3 px-3 py-2 rounded-xl text-xs font-medium"
          style={{ background: 'var(--color-success-bg)', color: 'var(--color-primary)', border: '1px solid var(--color-primary)' }}>
          ✓ Teams published and visible to players
        </div>
      )}

      {isOverCap && (
        <div className="mb-3 px-3 py-2 rounded-xl text-xs font-medium"
          style={{ background: 'var(--color-error-bg)', color: 'var(--color-error-text)', border: '1px solid #FECACA' }}>
          ⚠ {totalPlayers} players — over the 32-player cap
        </div>
      )}

      {/* Auto-balance button */}
      <button
        onClick={autoBalance}
        disabled={availablePlayers.length < 2 || !canGenerate}
        className="w-full py-3.5 rounded-2xl font-semibold text-sm mb-1 disabled:opacity-40 transition-opacity"
        style={{ background: 'var(--color-primary)', color: 'var(--color-surface)' }}
      >
        ⚡ Auto-Balance Teams
      </button>
      {!canGenerate && (
        <p className="text-xs mb-3 text-center" style={{ color: 'var(--color-text-muted)' }}>
          Team generation opens Wed 10pm (signup close) and locks 30 min before kick-off.
        </p>
      )}
      {canGenerate && <div className="mb-2" />}

      {/* Balance settings */}
      <div className="mb-4">
        <button
          onClick={() => setShowWeights(w => !w)}
          className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}
        >
          <span>⚙ Balance settings</span>
          <span style={{ fontSize: '0.6rem' }}>{showWeights ? '▲' : '▼'}</span>
        </button>

        {showWeights && (
          <div className="mt-2 p-4 rounded-2xl space-y-3" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            {ATTR_LABELS.map(({ key, label }) => (
              <div key={key} className="flex items-center gap-3">
                <span className="text-xs w-20 flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>{label}</span>
                <input
                  type="range" min={0} max={5} step={0.5}
                  value={weights[key] || 0}
                  onChange={e => setWeights(w => ({ ...w, [key]: parseFloat(e.target.value) }))}
                  className="flex-1"
                  style={{ '--val': weights[key] || 0, '--min': 0, '--max': 5 } as React.CSSProperties}
                />
                <span className="text-xs flex-shrink-0 text-right text-[var(--color-text)]" style={{ minWidth: 28, paddingRight: 4 }}>{weights[key] || 0}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Empty state */}
      {teamsToShow.length === 0 && (
        <div className="p-6 rounded-2xl text-center" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <p className="text-2xl mb-2">👥</p>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Tap Auto-Balance to generate teams based on signed-up players
          </p>
        </div>
      )}

      {/* Team cards */}
      {teamsToShow.length > 0 && (
        <>
          {draftTeams.length > 0 && (
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs uppercase tracking-widest font-semibold" style={{ color: '#9CA897' }}>Draft Teams</p>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full"
                  style={{ background: score >= 80 ? '#4ade80' : score >= 60 ? '#C9A227' : '#DC2626' }} />
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Balance: {score}%</span>
                {availablePlayers.length < 8 && (
                  <span className="text-xs" style={{ color: '#9CA897' }}>· improves with more players</span>
                )}
              </div>
            </div>
          )}

          <div className="space-y-3 mb-4">
            {teamsToShow.map((team, teamIdx) => {
              const color = TEAM_COLORS[teamIdx % TEAM_COLORS.length]
              return (
                <div key={team.id ?? teamIdx}
                  style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${color}55` }}>

                  {/* Coloured header — full-width band, 16px padding all sides */}
                  <div
                    style={{
                      background: color,
                      padding: 16,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                    }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3 className="font-display"
                        style={{
                          fontSize: 24,
                          lineHeight: 1.1,
                          color: '#FFFFFF',
                          letterSpacing: '0.02em',
                          wordBreak: 'normal',
                          overflowWrap: 'break-word',
                        }}>
                        {team.captain ? (
                          <>
                            <span style={{ marginRight: 6 }}>©</span>
                            {team.captain.name} {team.captain.surname}
                          </>
                        ) : (
                          stripFC(team.name)
                        )}
                      </h3>
                    </div>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '0.6px',
                      padding: '4px 10px',
                      borderRadius: 999,
                      background: team.bibs ? '#F59E0B' : '#3B82F6',
                      color: '#FFFFFF',
                      flexShrink: 0,
                    }}>
                      {team.bibs ? 'BIBS' : 'SKINS'}
                    </span>
                  </div>

                  <div style={{ background: 'var(--color-surface-2)' }}>
                    {[...team.players].sort(byName).map((p, idx) => (
                      <button
                        key={p.id}
                        onClick={() => draftTeams.length > 0 && setSwapModal({ player: p, fromTeamIdx: teamIdx })}
                        className="w-full flex items-center px-4 py-2.5 text-sm text-left transition-opacity"
                        style={{
                          background: 'transparent',
                          color: 'var(--color-text)',
                          borderTop: idx === 0 ? 'none' : '1px solid var(--color-border)',
                          cursor: draftTeams.length > 0 ? 'pointer' : 'default',
                        }}
                      >
                        <span className="truncate font-medium">{p.name} {p.surname}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          {publishError && (
            <div className="mb-3 px-3 py-2 rounded-xl text-xs font-medium"
              style={{ background: 'var(--color-error-bg)', color: 'var(--color-error-text)', border: '1px solid #FECACA' }}>
              ⚠ Publish failed — nothing saved. {publishError}
            </div>
          )}

          {draftTeams.length > 0 && (
            republishConfirm ? (
              <div className="mb-4 px-3 py-3 rounded-xl text-xs space-y-2"
                style={{ background: 'var(--color-warning-bg)', color: '#92400e', border: '1px solid #C9A227' }}>
                <p className="font-medium">
                  Re-publish replaces the current teams. Any existing fixtures and scores for this match will be deleted, and goal team attributions will be cleared.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={async () => { setRepublishConfirm(false); await publish() }}
                    disabled={publishing}
                    className="flex-1 py-2 rounded-lg font-semibold text-xs disabled:opacity-50"
                    style={{ background: 'var(--color-error-bg)', color: 'var(--color-error-text)', border: '1px solid #FECACA' }}
                  >
                    {publishing ? 'Publishing…' : 'Yes, re-publish'}
                  </button>
                  <button
                    onClick={() => setRepublishConfirm(false)}
                    disabled={publishing}
                    className="flex-1 py-2 rounded-lg text-xs disabled:opacity-50"
                    style={{ background: 'var(--color-surface)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => { if (published) setRepublishConfirm(true); else publish() }}
                disabled={publishing}
                className="w-full py-3 rounded-xl font-semibold text-sm disabled:opacity-50 mb-4"
                style={{ background: 'var(--color-primary)', color: 'var(--color-surface)' }}
              >
                {publishing ? 'Publishing…' : published ? '↺ Re-publish Teams' : 'Publish Teams'}
              </button>
            )
          )}

          {/* Finalise & Export section */}
          {teamsToShow.length > 0 && (
            <div style={{ marginTop: 8, paddingBottom: 16 }}>
              {/* Subtle divider */}
              <div style={{ height: 1, background: 'var(--color-border)', marginBottom: 16 }} />

              <p
                className="font-semibold"
                style={{
                  fontSize: 11,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: 'var(--color-text-muted)',
                  marginBottom: 12,
                }}
              >
                Finalise & Export
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Primary: WhatsApp */}
                <button
                  onClick={() => copyToClipboard(buildWhatsAppText(teamsToShow, nextThursday, weights, weather, debutantIds), 'whatsapp')}
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    borderRadius: 12,
                    fontSize: 14,
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    background: copied === 'whatsapp' ? 'var(--color-success-bg)' : 'var(--color-primary)',
                    color: copied === 'whatsapp' ? 'var(--color-success-text)' : '#FFFFFF',
                    border: 'none',
                  }}
                >
                  <span aria-hidden="true" style={{ fontSize: 16, lineHeight: 1 }}>
                    {copied === 'whatsapp' ? '✓' : '📋'}
                  </span>
                  {copied === 'whatsapp' ? 'Copied!' : 'Copy team sheet for WhatsApp'}
                </button>

                {/* Secondary: Flat list */}
                <button
                  onClick={() => copyToClipboard(buildFlatList(teamsToShow), 'flat')}
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    borderRadius: 12,
                    fontSize: 14,
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    background: copied === 'flat' ? 'var(--color-success-bg)' : 'var(--color-surface)',
                    color: copied === 'flat' ? 'var(--color-success-text)' : 'var(--color-text)',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  <span aria-hidden="true" style={{ fontSize: 16, lineHeight: 1 }}>
                    {copied === 'flat' ? '✓' : '📝'}
                  </span>
                  {copied === 'flat' ? 'Copied!' : 'Copy flat player list'}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Swap modal */}
      {swapModal && (
        <div className="fixed inset-0 flex items-end justify-center z-50 px-4 pb-4"
          style={{ background: 'rgba(0,0,0,0.85)' }}
          onClick={() => setSwapModal(null)}>
          <div className="w-full rounded-2xl p-5"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', maxWidth: 430 }}
            onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-[var(--color-text)] mb-0.5">
              Swap {swapModal.player.name} {swapModal.player.surname}
            </h3>
            <p className="text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>Select a player to swap with</p>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {draftTeams.map((team, teamIdx) => {
                if (teamIdx === swapModal.fromTeamIdx) return null
                const color = TEAM_COLORS[teamIdx % TEAM_COLORS.length]
                return [...team.players].sort(byName).map(p => (
                  <button
                    key={p.id}
                    onClick={() => swapPlayers(swapModal.fromTeamIdx, swapModal.player, teamIdx, p)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl text-left"
                    style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                  >
                    <PlayerAvatar profile={p} size={32} />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-[var(--color-text)]">{p.name} {p.surname}</p>
                      <p className="text-xs" style={{ color }}>{team.name}</p>
                    </div>
                  </button>
                ))
              })}
            </div>
            <button
              onClick={() => setSwapModal(null)}
              className="w-full mt-3 py-2.5 rounded-xl text-sm"
              style={{ background: 'var(--color-surface)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
