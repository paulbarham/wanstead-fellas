# Wanstead Fellas ⚽

Thursday Night Football management app. React + Vite + Supabase + Tailwind CSS.

---

## Local Development

### 1. Clone and install

```bash
npm install
```

### 2. Set up environment

```bash
cp .env.example .env.local
```

Edit `.env.local` and fill in your Supabase URL and anon key.

### 3. Run locally

```bash
npm run dev
```

Open http://localhost:5173

---

## Supabase Setup

### Create a new Supabase project

1. Go to [supabase.com](https://supabase.com) and create a new project.
2. Copy your **Project URL** and **anon public key** from Settings → API.
3. Paste them into `.env.local`.

### Run the database migration

1. In your Supabase project, go to **SQL Editor**.
2. Open `supabase/migrations/001_initial.sql`.
3. Paste the entire file into the editor and click **Run**.

This creates all tables, RLS policies, and the avatars storage bucket.

### Storage bucket

The SQL migration creates the `avatars` bucket automatically. If it doesn't appear in Storage → Buckets, manually create a bucket named `avatars` with **Public** access enabled.

### Admin account

The first user who registers with the email `pabarham@gmail.com` will automatically be granted admin access.

---

## Deploy to Vercel

### Method 1: Vercel CLI

```bash
npm install -g vercel
vercel
```

When prompted, set environment variables:
- `VITE_SUPABASE_URL` — your Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — your Supabase anon key

### Method 2: GitHub + Vercel dashboard

1. Push this repo to GitHub.
2. Go to [vercel.com](https://vercel.com) → New Project → Import from GitHub.
3. Set the Framework Preset to **Vite**.
4. Under Environment Variables, add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Click **Deploy**.

The `vercel.json` file already handles SPA routing (all routes serve `index.html`).

---

## Tech Stack

- **React 19** + **TypeScript**
- **Vite 8** — build tool
- **Supabase** — auth, database (PostgreSQL), file storage
- **Tailwind CSS v4** — styling
- **date-fns** + **date-fns-tz** — timezone-aware date handling
- **react-router-dom v7** — routing
- **lucide-react** — icons

---

## Features

| Feature | Player | Admin |
|---------|--------|-------|
| Sign-up for Thursday | ✓ (with deadline) | ✓ (always) |
| View teams | ✓ | ✓ |
| Build balanced teams | — | ✓ |
| Publish teams | — | ✓ |
| View match results | ✓ | ✓ |
| Enter results | — | ✓ from 9pm Thu |
| Player Top Trump cards | View | Edit stats + badges |
| Upload own photo | ✓ | ✓ (any player) |
| Submit feedback | ✓ | ✓ |
| Manage feedback | — | ✓ |

---

## Time Logic (Europe/London)

- **Sign-ups open**: Thursday 10pm → Wednesday 10pm
- **Sign-ups locked**: Wednesday 10pm → Thursday 9pm
- **Match live / result entry**: Thursday 9pm → Thursday 10pm
- **Post match / reset**: After Thursday 10pm
