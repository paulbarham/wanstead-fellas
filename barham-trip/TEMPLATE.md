# Reuse this app for a new holiday 🧳

This app is a reusable "holiday shell" — the trip content is data-driven, so a
new holiday is mostly swapping one JSON file and a bit of config. Start to a
live, installable app in ~20 minutes. **£0** on the same free tiers.

There's a ready-made blank starting point on the **`holiday-shell`** branch
(generic names, empty itinerary skeleton). Either branch from that, or copy the
`barham-trip/` folder and follow the steps below.

---

## 1. Copy the app

Either:
- **New repo/folder** — copy the whole `barham-trip/` folder, rename it, `pnpm install`; or
- **Branch** — `git checkout holiday-shell` and work from there.

## 2. Rename it — `src/config.ts`

```ts
export const APP = {
  name: 'Smith Family Trip',   // login splash
  short: 'Smith Trip',         // top header
  iconLetter: 'S',             // logo tile (a letter or an emoji)
}
```

Also update these three (grep for the old name to be sure):
- `index.html` → `<title>` and `apple-mobile-web-app-title`
- `vite.config.ts` → the `VitePWA` manifest `name` / `short_name` / `theme_color`
- (optional) recolour: the palette in `tailwind.config.ts` **and** the `:root`
  tokens in `src/styles.css` (keep the two in sync).

## 3. Put in the trip — `data/itinerary.json`

Replace it with your trip. The shape is documented in
[`data/itinerary.template.json`](data/itinerary.template.json) and typed in
`src/lib/itinerary.ts`. Fill in:
- `meta` — family, trip name, **start_date / end_date** (drive the "Today" logic), travellers, notes
- `legs[]` — each place: `id`, `num`, `title`, `range`, `tagline`, `notes`,
  `ideas[]` (the "things to do" board), and `days[]`
- each `day` — `n` (1..N, contiguous), `weekday`, `date`, `iso_date`, `title`,
  `subtitle`, `options[]` (one `recommended` + up to two `alternative`), `tip`
- `bookings[]`, `packing[]`, `costs[]`

`pnpm test` validates the shape (contiguous days, ≤2 alternatives, etc.) — keep
it green.

## 4. Who's coming — `src/lib/family.ts`

- `TRAVELLERS` — the roster shown on the Trip tab (name + colour, optional note).
- `DEFAULT_FAMILY` — the local-preview seats (used when there's no backend).

And in `supabase/migrations/005_family_seed.sql`:
- `member_seed` rows — the real **emails → names** so accounts auto-provision on
  first sign-in.
- the managed-member `insert`s — anyone with no device (like the twins), under a
  managing adult's email.

## 5. New Supabase project (free)

1. supabase.com → **New project** (Free plan).
2. **SQL Editor** → paste all of [`supabase/setup.sql`](supabase/setup.sql) → **Run**
   (it's every migration concatenated, idempotent, incl. your seed from step 4).
3. **Settings → API** → copy the **Project URL** and the **publishable / anon key**.
4. `cp .env.example .env.local` and fill both in. No service-role key needed.

Auth is **email + password**, auto-confirmed at the DB level (migration 007), so
no email sending / SMTP is required — works in an installed home-screen app.

## 6. Deploy (Vercel, free)

1. Vercel → **Add New… → Project** → import the repo.
2. **Root Directory** → the app folder (if it's a subfolder like `barham-trip`).
3. **Project Name** → sets your `<name>.vercel.app` URL — pick it now.
4. Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
5. **Deploy.**

Send everyone the URL: open it → email + a password they choose → **Add to Home
Screen**. Done.

---

## What you get, unchanged, every trip

- Offline-first PWA (whole itinerary bundled + precached; works with no signal)
- Today / Trip / Leg / Day screens, per-place "things to do" ideas board (add
  your own, Google-Maps links), editable shared bookings, per-user packing,
  costs, account with avatar upload
- Email + password auth, managed members, "Who's coming" roster
- Light + dark mode, auto-updating service worker

## What's trip-specific (i.e. what you change)

| File | What |
|---|---|
| `src/config.ts` | App name / short name / icon letter |
| `data/itinerary.json` | The entire trip (legs, days, ideas, bookings, packing, costs) |
| `src/lib/family.ts` | Travellers roster + local-preview seats |
| `supabase/migrations/005_family_seed.sql` | Real emails→names + managed members |
| `index.html`, `vite.config.ts` | Title + PWA manifest |
| `tailwind.config.ts`, `src/styles.css` | Palette (optional) |
| New Supabase project + new Vercel project | Per-trip backend + URL |
