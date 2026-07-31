# Barham Family Trip 🌴

A phone-first, install-to-home-screen **Progressive Web App** for the Barham family's
California & Nevada holiday (**8–29 Aug 2026**). Six of us — two adults + four kids
(17, 15, and 9-year-old twins) — each log in on our own phone and see the plan for
every day, tick off bookings together, pack our own bags, and say who's in for each day.

Built to work **fully offline** once installed — critical for the no-signal stretches
through Big Sur and Death Valley.

---

## What's inside

- **Vite + React + TypeScript** SPA (no Next.js — simpler for an offline PWA)
- **Tailwind CSS** with the exact palette from the printed itinerary
- **vite-plugin-pwa** (Workbox) — service worker, manifest, precache of the whole app + itinerary
- **React Router v6**
- **Supabase** — magic-link + PIN auth, shared bookings, per-day RSVPs, per-user packing, realtime
- **Zustand** — offline-first local state that the UI renders from
- **date-fns**, **lucide-react**

The full 22-day trip lives in [`data/itinerary.json`](data/itinerary.json) and is
statically imported, so it ships inside the JS bundle and is available offline the moment
you install the app.

## Screens

| Route | What it is |
|---|---|
| `/login` | Gradient splash. Magic-link email sign-in + a Family PIN for the twins. |
| `/` (Today) | Auto-detects today: shows today's day card, or a "Trip starts in N days" countdown. |
| `/trip` | The five legs (SF · PCH · Santa Monica · LA · Vegas). |
| `/leg/:id` | Leg overview + timeline of its days. |
| `/day/:n` | **The centrepiece** — recommended hero, alternatives, tip, live family RSVP panel. |
| `/bookings` | 17-item shared tracker — everyone sees the ticks + who/when. |
| `/packing` | 10-item packing list — private per user. |
| `/costs` | Read-only budget table. |
| `/me` | Account: name, avatar upload, sign out. |

Bottom tabs: **Today · Trip · Bookings · Packing**. Hamburger → Costs / Account.

---

## Quick start (local dev)

```sh
pnpm install
pnpm dev            # http://localhost:5173
```

**No Supabase needed to preview.** With no env vars set the app runs in **local preview
mode**: you pick a "seat" on the login screen and all state is stored on your device. Every
screen works, so you can see the whole thing immediately. Auth + live sharing switch on the
moment you add real Supabase credentials.

Other scripts:

```sh
pnpm build          # tsc -b && vite build  (must pass)
pnpm test           # vitest (12 tests)
pnpm lint           # eslint (clean)
node scripts/gen-icons.mjs   # regenerate the coral "B" PWA icons
```

---

## Connecting Supabase (auth + shared state)

1. **Create a project** (Supabase dashboard, or the Supabase MCP `create_project`).
2. **Env vars** — copy `.env.example` to `.env.local` and fill in:

   ```sh
   VITE_SUPABASE_URL=https://<ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon-key>
   ```

3. **Apply the migrations** (dashboard SQL editor, `supabase db push`, or the MCP
   `apply_migration` tool), in order:

   - `supabase/migrations/001_schema.sql` — tables + RLS
   - `supabase/migrations/002_realtime.sql` — realtime on `booking_status` + `day_rsvp`
   - `supabase/migrations/003_storage.sql` — `avatars` + `day-photos` buckets

4. **Deploy the PIN-login edge function** (for the twins):

   ```sh
   supabase functions deploy pin-login --no-verify-jwt
   ```

   It uses the project's built-in `SUPABASE_URL`, `SUPABASE_ANON_KEY` and
   `SUPABASE_SERVICE_ROLE_KEY` secrets — no extra config.

5. **Seed the six accounts** — see below.

### How auth works

- **Adults + teens** sign in with a **Supabase magic link** to their own email.
- **The twins (no email)** sign in with a **4-digit Family PIN**. The PIN is hashed
  (`salt:sha256(salt:pin)`, computed identically in the seed script and the edge function)
  and stored in `family_pins`, which is locked to the service role by RLS. On a correct PIN
  the `pin-login` function mints a one-time OTP for that pre-provisioned account and verifies
  it server-side to return a real session — **no passwords are ever stored**.

---

## Seeding the family (one-shot, run once by Paul)

```sh
SUPABASE_URL=https://<ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
pnpm seed
```

It walks you through the six seats, asking for each person's **display name** and **email**
(adults/teens) or a **4-digit PIN** (twins), then creates the auth users, the `members` rows,
and the hashed PINs. Re-running is safe — existing accounts are updated, not duplicated.

At the end it prints a **hand-out checklist**: which email to magic-link each person, and the
two PINs for the twins.

> The service role key is all-powerful — run this locally, never commit it, and never expose it
> to the client (it must not be prefixed with `VITE_`).

---

## PWA / offline

- Manifest: name **Barham Family Trip**, theme `#0e3a48`, standalone, 192/512 icons.
- Service worker auto-updates; a quiet **"A new version is ready — Refresh"** toast appears
  when an update is waiting (no forced reloads).
- The app shell **and** the itinerary are precached, so `/day/:n` is fully readable with zero
  connectivity. Supabase + weather use a network-first runtime cache; ticks are optimistic and
  retried when back online.
- **Add to Home Screen**: iOS Safari → Share → *Add to Home Screen*. Android Chrome → *Install app*.

---

## Deploy (Vercel)

```sh
vercel --prod
```

- Framework preset: **Vite**. Build `pnpm build`, output `dist`.
- `vercel.json` already handles SPA rewrites + no-cache for `sw.js`/manifest.
- Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as Vercel env vars.
- Point the chosen domain (e.g. `trip.barham.family`) at the deployment.

---

## Project structure

```
barham-trip/
  data/itinerary.json            # the whole 22-day trip (static import)
  scripts/
    seed_family.ts               # one-shot family setup
    gen-icons.mjs                # generates the coral "B" PWA icons (no deps)
  src/
    lib/         supabase · itinerary (typed accessors) · date · family · weather
    store/       local.ts        # zustand offline-first state
    hooks/       useAuth · useRealtimeBookings · useDayRsvp · usePacking · useOnline
    components/  DayView · OptionCard · DayBadge · FamilyStrip · LegBanner ·
                 BottomTabs · AppLayout · OfflineIndicator · UpdateToast · Avatar · WeatherChip
    routes/      Login · Today · Trip · Leg · Day · Bookings · Packing · Costs · Me
  supabase/
    migrations/  001_schema · 002_realtime · 003_storage
    functions/pin-login/         # twins' PIN sign-in
  public/        manifest icons (icon-192/512, apple-touch-icon), favicon
```

## Editing the trip

`data/itinerary.json` is the single source of truth. The shape is fully typed in
`src/lib/itinerary.ts`; `pnpm test` validates it (five legs, 22 contiguous days, ≤2
alternatives per day, 17 bookings, 10 packing items). Edit the JSON and everything updates.
