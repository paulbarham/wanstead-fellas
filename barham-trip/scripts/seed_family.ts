/**
 * One-shot family setup. Paul runs this once, locally, with the service role key.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... pnpm seed
 *
 * Creates the six family accounts and the matching `members` rows:
 *   - Paul, Nichola, Amelia, Marley sign in with a magic link to their own email.
 *   - Tobias & Niyah have no device — they're created as "managed" members under
 *     Paul, who sets their day RSVPs from his own login. (They get a synthesised
 *     login only so the schema's foreign key holds; nobody signs in as them.)
 *
 * Re-running is safe — existing accounts are updated, not duplicated. Press Enter
 * at any prompt to accept the [default] shown in brackets.
 */
import { createClient } from '@supabase/supabase-js'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout, env, exit } from 'node:process'

type AgeGroup = 'adult' | 'teen' | 'child'

interface SeatDef {
  key: string
  defaultName: string
  age_group: AgeGroup
  color: string
  kind: 'email' | 'managed'
  /** Real inbox for email seats; a never-used synthesised address for managed. */
  defaultEmail: string
  /** For managed seats: whose profile they sit under. */
  managerKey?: string
}

const SEATS: SeatDef[] = [
  { key: 'paul', defaultName: 'Paul', age_group: 'adult', color: '#0e3a48', kind: 'email', defaultEmail: 'pabarham@gmail.com' },
  { key: 'nichola', defaultName: 'Nichola', age_group: 'adult', color: '#4a8896', kind: 'email', defaultEmail: 'nicholaannbarham@gmail.com' },
  { key: 'amelia', defaultName: 'Amelia', age_group: 'teen', color: '#e08853', kind: 'email', defaultEmail: 'Ameliabarham39@gmail.com' },
  { key: 'marley', defaultName: 'Marley', age_group: 'teen', color: '#c86c3a', kind: 'email', defaultEmail: 'marleyellisbarham@gmail.com' },
  { key: 'tobias', defaultName: 'Tobias', age_group: 'child', color: '#7a9e5e', kind: 'managed', managerKey: 'paul', defaultEmail: 'tobias@barham.trip' },
  { key: 'niyah', defaultName: 'Niyah', age_group: 'child', color: '#b5657e', kind: 'managed', managerKey: 'paul', defaultEmail: 'niyah@barham.trip' },
]

async function main() {
  const url = env.SUPABASE_URL
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    console.error('\n✖ Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment first.\n')
    exit(1)
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const rl = createInterface({ input: stdin, output: stdout })

  console.log('\n🌴  Barham Family Trip — family setup\n')
  console.log('Press Enter to accept the [default] in brackets.\n')

  const ids = new Map<string, string>() // seat key -> auth user id
  const summary: { name: string; how: string }[] = []

  async function ensureUser(email: string, name: string): Promise<string | null> {
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { display_name: name },
    })
    if (!error && created?.user?.id) return created.user.id
    // Probably already exists — find it.
    const { data: list } = await admin.auth.admin.listUsers()
    const existing = list?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
    if (existing) {
      console.log('  (account already existed — updating)')
      return existing.id
    }
    console.error(`  ✖ Could not create or find ${email}: ${error?.message}`)
    return null
  }

  for (const seat of SEATS) {
    console.log(`— ${seat.defaultName} (${seat.age_group}${seat.kind === 'managed' ? ', managed by ' + seat.managerKey : ''}) —`)
    const name = (await rl.question(`  Display name [${seat.defaultName}]: `)).trim() || seat.defaultName

    let email = seat.defaultEmail
    if (seat.kind === 'email') {
      const entered = (await rl.question(`  Email [${seat.defaultEmail}]: `)).trim()
      if (entered) email = entered
    } else {
      console.log(`  No device — will sit under ${seat.managerKey}. (login: ${email}, unused)`)
    }

    const userId = await ensureUser(email, name)
    if (!userId) continue
    ids.set(seat.key, userId)

    const managed_by = seat.managerKey ? ids.get(seat.managerKey) ?? null : null
    const { error: memErr } = await admin.from('members').upsert(
      { id: userId, display_name: name, age_group: seat.age_group, color: seat.color, managed_by },
      { onConflict: 'id' },
    )
    if (memErr) console.error(`  ✖ members upsert failed: ${memErr.message}`)

    summary.push({
      name,
      how: seat.kind === 'email' ? `magic link → ${email}` : `managed under ${seat.managerKey}`,
    })
    console.log(`  ✔ ${name} ready\n`)
  }

  await rl.close()

  console.log('\n=========================================')
  console.log(' FAMILY SETUP COMPLETE')
  console.log('=========================================')
  for (const c of summary) console.log(`  • ${c.name}: ${c.how}`)
  console.log('\nPaul, Nichola, Amelia, Marley: open the app and request a magic link to the email above.')
  console.log('Tobias & Niyah: no login needed — Paul sets their day choices from his own profile.\n')
}

main().catch((err) => {
  console.error(err)
  exit(1)
})
