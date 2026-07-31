/**
 * One-shot family setup. Paul runs this once, locally, with the service role key.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... pnpm seed
 *
 * It creates the six auth accounts, the matching `members` rows, and the twins'
 * hashed Family PINs. Adults/teens sign in with a magic link to their email;
 * the twins sign in with their 4-digit PIN (verified by the pin-login edge
 * function). Re-running is safe — existing accounts are updated, not duplicated.
 */
import { createClient } from '@supabase/supabase-js'
import { createHash, randomBytes } from 'node:crypto'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout, env, exit } from 'node:process'

type AgeGroup = 'adult' | 'teen' | 'child'

interface SeatDef {
  key: string
  defaultName: string
  age_group: AgeGroup
  color: string
  usesPin: boolean
  /** Synthesised login email for PIN accounts (no real inbox needed). */
  pinEmail?: string
}

// Order + defaults mirror src/lib/family.ts. Paul confirms/overrides at the prompt.
const SEATS: SeatDef[] = [
  { key: 'paul', defaultName: 'Paul', age_group: 'adult', color: '#0e3a48', usesPin: false },
  { key: 'sam', defaultName: 'Sam', age_group: 'adult', color: '#4a8896', usesPin: false },
  { key: 'jack', defaultName: 'Jack (17)', age_group: 'teen', color: '#e08853', usesPin: false },
  { key: 'ella', defaultName: 'Ella (15)', age_group: 'teen', color: '#c86c3a', usesPin: false },
  { key: 'leo', defaultName: 'Leo (9)', age_group: 'child', color: '#7a9e5e', usesPin: true, pinEmail: 'leo.twin@barham.trip' },
  { key: 'mia', defaultName: 'Mia (9)', age_group: 'child', color: '#b5657e', usesPin: true, pinEmail: 'mia.twin@barham.trip' },
]

function hashPin(pin: string): string {
  const salt = randomBytes(8).toString('hex')
  const hash = createHash('sha256').update(`${salt}:${pin}`).digest('hex')
  return `${salt}:${hash}`
}

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

  const created: { name: string; how: string }[] = []

  for (const seat of SEATS) {
    console.log(`— Seat: ${seat.defaultName} (${seat.age_group}) —`)
    const name = (await rl.question(`  Display name [${seat.defaultName}]: `)).trim() || seat.defaultName

    let email: string
    let pin: string | null = null

    if (seat.usesPin) {
      email = seat.pinEmail!
      // Ask for a 4-digit PIN.
      while (true) {
        const p = (await rl.question('  4-digit PIN for this twin: ')).trim()
        if (/^\d{4}$/.test(p)) {
          pin = p
          break
        }
        console.log('  Please enter exactly 4 digits.')
      }
    } else {
      while (true) {
        const e = (await rl.question('  Email (magic-link sign-in): ')).trim()
        if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) {
          email = e
          break
        }
        console.log('  Please enter a valid email.')
      }
    }

    // Create or fetch the auth user.
    const { data: createdUser, error: createErr } = await admin.auth.admin.createUser({
      email: email!,
      email_confirm: true,
      user_metadata: { display_name: name },
    })

    let userId = createdUser?.user?.id
    if (createErr || !userId) {
      // Likely already exists — look it up by listing (small user base).
      const { data: list } = await admin.auth.admin.listUsers()
      const existing = list?.users.find((u) => u.email?.toLowerCase() === email!.toLowerCase())
      if (!existing) {
        console.error(`  ✖ Could not create or find ${email}: ${createErr?.message}`)
        continue
      }
      userId = existing.id
      console.log('  (account already existed — updating)')
    }

    // Upsert the members row.
    const { error: memErr } = await admin.from('members').upsert(
      {
        id: userId,
        display_name: name,
        age_group: seat.age_group,
        color: seat.color,
      },
      { onConflict: 'id' },
    )
    if (memErr) console.error(`  ✖ members upsert failed: ${memErr.message}`)

    // Store the twin's hashed PIN.
    if (seat.usesPin && pin) {
      const { error: pinErr } = await admin.from('family_pins').upsert(
        { member_id: userId, email: email!, pin_hash: hashPin(pin) },
        { onConflict: 'member_id' },
      )
      if (pinErr) console.error(`  ✖ family_pins upsert failed: ${pinErr.message}`)
      created.push({ name, how: `PIN ${pin}` })
    } else {
      created.push({ name, how: `magic link → ${email!}` })
    }

    console.log(`  ✔ ${name} ready\n`)
  }

  await rl.close()

  console.log('\n=========================================')
  console.log(' FAMILY SETUP COMPLETE — hand these out:')
  console.log('=========================================')
  for (const c of created) console.log(`  • ${c.name}: ${c.how}`)
  console.log('\nAdults/teens: open the app and request a magic link to the email above.')
  console.log('Twins: open the app and enter their 4-digit PIN.\n')
}

main().catch((err) => {
  console.error(err)
  exit(1)
})
