// Edge Function: pin-login
//
// Lets the twins (no email) sign in with a 4-digit Family PIN.
//   POST { pin: "1234" }  ->  { access_token, refresh_token }
//
// Flow:
//   1. Hash the submitted PIN the same way the seed script did and compare it,
//      in constant-ish time, against every family_pins row (there are only two).
//   2. On a match, mint a one-time email OTP for that account via the Admin API
//      (service role) and immediately verify it to obtain a real session.
//
// No passwords are stored; family_pins is locked to the service role by RLS.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Recompute "<salt>:<sha256(salt:pin)>" and compare to the stored hash. */
async function pinMatches(pin: string, stored: string): Promise<boolean> {
  const [salt, expected] = stored.split(':')
  if (!salt || !expected) return false
  const actual = await sha256Hex(`${salt}:${pin}`)
  // length-safe compare
  if (actual.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let pin = ''
  try {
    const body = await req.json()
    pin = String(body?.pin ?? '').trim()
  } catch {
    return json({ error: 'Bad request' }, 400)
  }
  if (!/^\d{4}$/.test(pin)) return json({ error: 'Enter your 4-digit PIN.' }, 400)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: pins, error } = await admin
    .from('family_pins')
    .select('member_id, email, pin_hash')
  if (error) return json({ error: 'Server error' }, 500)

  let email: string | null = null
  for (const row of pins ?? []) {
    if (await pinMatches(pin, row.pin_hash)) {
      email = row.email
      break
    }
  }
  if (!email) return json({ error: 'Incorrect PIN. Try again.' }, 401)

  // Mint a one-time OTP for this account, then verify it to get a session.
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  const otp = linkData?.properties?.email_otp
  if (linkErr || !otp) return json({ error: 'Could not start session' }, 500)

  const anon = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: verifyData, error: verifyErr } = await anon.auth.verifyOtp({
    email,
    token: otp,
    type: 'email',
  })
  if (verifyErr || !verifyData.session) return json({ error: 'Could not start session' }, 500)

  return json({
    access_token: verifyData.session.access_token,
    refresh_token: verifyData.session.refresh_token,
  })
})
