# Barham Family Trip 🌴

A phone-first, install-to-home-screen **Progressive Web App** for the Barham family's
California & Nevada holiday (**8–29 Aug 2026**). Six of us — Paul, Nichola, Amelia, Marley,
and the two youngest Tobias & Niyah — each see the plan for every day, tick off bookings
together, pack our own bags, and say who's in for each day.

Built to work **fully offline** once installed — critical for the no-signal stretches
through Big Sur and Death Valley.

---

## What's inside

- **Vite + React + TypeScript** SPA (no Next.js — simpler for an offline PWA)
- **Tailwind CSS** with the exact palette from the printed itinerary
- **vite-plugin-pwa** (Workbox) — service worker, manifest, precache of the whole app + itinerary
- **React Router v6**
- **Supabase** — magic-link auth, shared bookings, per-day RSVPs, per-user packing, realtime
- **Zustand** — offline-first local state that the UI renders from
- **date-fns**, **lucide-react**

The full 22-day trip lives in [`data/itinerary.json`](data/itinerary.json) and is statically
imported, so it ships inside the JS bundle and is available offline the moment you install.

## Screens

| Route | What it is |
|---|---|
| `/login` | Gradient splash. Magic-link email sign-in (or a "pick your seat" picker in local preview). |
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
screen works. Auth + live sharing switch on the moment you add real Supabase credentials.

Other scripts:

```sh
pnpm build          # tsc -b && vite build  (must pass)
pnpm test           # vitest (12 tests)
pnpm lint           # eslint (clean)
node scripts/gen-icons.mjs   # regenerate the coral "B" PWA icons
```

---

## Connecting Supabase — free, no secrets, one SQL paste

> **Cost: £0.** Supabase Free plan (2 projects/org) + Vercel Hobby both cover a family of six.

1. **Create a project** — Supabase dashboard → *New project* → name `barham-trip`, region
   **London (eu-west-2)**, set a DB password. Wait ~2 min for it to go green.

2. **Run the setup SQL** — dashboard → *SQL Editor → New query* → paste the entire contents of
   [`supabase/setup.sql`](supabase/setup.sql) → **Run**. That one file creates every table,
   RLS policy, realtime + storage config, the auto-provision trigger, and seeds the family
   roster. It's idempotent — safe to re-run. (The individual files in
   [`supabase/migrations/`](supabase/migrations) are the source of truth; `setup.sql` is just
   them concatenated.)

3. **Add env vars** — copy `.env.example` to `.env.local` and fill in (Settings → API):

   ```sh
   VITE_SUPABASE_URL=https://<ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon / publishable key>
   ```

   Both are safe to expose to the browser. **No service-role key is ever needed.**

That's the entire backend. Restart `pnpm dev` and everyone can sign in.

### How accounts work (no seed script, no PINs)

- **Paul, Nichola, Amelia, Marley** sign in with a **magic link** to their own email. The
  first time they do, a database trigger auto-creates their `members` row, pulling their name,
  age band and avatar colour from the seed table (`member_seed`, written by `setup.sql`).
- **Tobias & Niyah** have no device. `setup.sql` inserts them as **managed members** under
  Paul's email. When Paul is signed in he sees "Tobias · you manage this" / "Niyah · you
  manage this" controls on each day and sets their choices for them. Row-Level Security
  enforces that only their managing adult can write their RSVPs.

To change the roster (names, colours, add someone), edit
[`supabase/migrations/005_family_seed.sql`](supabase/migrations/005_family_seed.sql), re-run
it, and it updates in place.

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

## Deploy (Vercel) — ⚠️ set the root directory

Because this app lives in the `barham-trip/` subfolder of the repo, the **Root Directory must
be `barham-trip`**, or Vercel will try to build the wrong project.

- Vercel dashboard → *Add New Project* → import the repo.
- **Root Directory** → `barham-trip`
- Framework preset: **Vite** (auto-detected). Build `pnpm build`, output `dist`.
- Add env vars `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- Deploy. `vercel.json` already handles SPA rewrites + no-cache for `sw.js`/manifest.
- Add the custom domain (e.g. `trip.barham.family`) under Settings → Domains if you want one.

The existing Wanstead Fellas Vercel project (which deploys from the repo root) is unaffected —
a sibling subfolder is invisible to its build.

---

## Project structure

```
barham-trip/
  data/itinerary.json            # the whole 22-day trip (static import)
  scripts/gen-icons.mjs          # generates the coral "B" PWA icons (no deps)
  src/
    lib/         supabase · itinerary (typed accessors) · date · family · weather
    store/       local.ts        # zustand offline-first state
    hooks/       useAuth · useRealtimeBookings · useDayRsvp · usePacking · useOnline
    components/  DayView · OptionCard · DayBadge · FamilyStrip · LegBanner ·
                 BottomTabs · AppLayout · OfflineIndicator · UpdateToast · Avatar · WeatherChip
    routes/      Login · Today · Trip · Leg · Day · Bookings · Packing · Costs · Me
  supabase/
    setup.sql                    # paste-and-run: the whole backend in one file
    migrations/                  # source of truth (001 schema · 002 realtime · 003 storage ·
                                 #   004 auto-provision trigger · 005 family seed)
  public/        manifest icons (icon-192/512, apple-touch-icon), favicon
```

## Editing the trip

`data/itinerary.json` is the single source of truth. The shape is fully typed in
`src/lib/itinerary.ts`; `pnpm test` validates it (five legs, 22 contiguous days, ≤2
alternatives per day, 17 bookings, 10 packing items). Edit the JSON and everything updates.
