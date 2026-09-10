# Dashboard

A personal task dashboard, built as one web app installed as a PWA on both a
MacBook and an iPhone. Sync is not device-to-device reconciliation — both
devices are clients of the same Supabase Postgres, with Realtime pushing
changes between them.

## Features

- **Kanban board** — To Do / In Progress / Done. Drag-and-drop on the Mac,
  a segmented one-column-at-a-time view with explicit move actions on the phone.
- **Quick Capture** — always visible, parses `#tags` and natural-language dates
  (`fri`, `tomorrow`, `next tue`) inline and strips them from the title.
- **Today's Focus** — capped at three, enforced by a partial unique index in
  Postgres rather than app logic.
- **Habits** — one tap per day, seven-day trail, streaks that ignore
  unscheduled days.
- **Evening review** — clear what's done, decide on overdue, pick tomorrow's three.
- **Calendar strip** — Mac only, read-only, positions computed from real event times.
- **Push notifications** — morning digest, evening nudge, due reminders and
  threshold alerts, all deduplicated and timezone-aware.
- **Offline** — opens from cache and renders the last-known board; writes are
  disabled rather than queued.

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · Tailwind v4 · Supabase
(Postgres, Auth, Realtime, Edge Functions, pg_cron) · TanStack Query with
IndexedDB persistence · dnd-kit · hand-written service worker.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in the values
npm run dev
```

## Architecture notes

- `src/lib/` is framework-free TypeScript — no React or Next imports — so the
  data layer would move to a Capacitor or Expo shell unchanged.
- `src/proxy.ts` is the Next.js 16 replacement for `middleware.ts`. The named
  export must be `proxy`; a file named `middleware.ts` would silently never run.
- Card ordering uses fractional indexing, so moving a card writes one row.
  Integer positions would renumber the whole column and, with Realtime on,
  cause a burst of sync events and visible flicker on the other device.
- All scheduling is Supabase `pg_cron`, not Vercel Cron: the Hobby plan caps
  cron at once per day, UTC only, which cannot serve both a morning digest and
  an evening nudge.
