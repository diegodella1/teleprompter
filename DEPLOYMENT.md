# Deployment

The first deploy target is Vercel with Supabase Hosted. Cloudflare Workers/OpenNext remains
configured for a later deploy target.

## Supabase setup

Create a new Supabase Hosted project, then run:

```sql
-- Supabase SQL editor
-- paste supabase/migrations/0001_initial_teleprompter.sql
```

Enable Realtime in the project. This app uses Realtime Broadcast channels with a per-room secret
topic returned only after PIN validation.

## Environment variables

Create `.env.local` from `.env.example`:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_SECRET_KEY=
SUPABASE_DATABASE_URL=
TELEPROMPTER_TOKEN_SECRET=
```

Use a long random value for `TELEPROMPTER_TOKEN_SECRET`. The service role key must only exist in
server-side environments.

Validate envs without printing secrets:

```bash
npm run env:check
```

Apply database migrations:

```bash
npm run db:migrate
```

`SUPABASE_DATABASE_URL` is the Postgres connection string from Supabase. The anon/service keys are
REST JWTs and cannot create tables.

## Local development

```bash
npm run dev
```

## Vercel deploy

Add the same variables in Vercel Project Settings:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TELEPROMPTER_TOKEN_SECRET`

Then deploy with Vercel's standard Next.js build.

## Cloudflare Workers preview

```bash
npm run preview
```

## Cloudflare Workers deploy

```bash
npm run deploy
```

The deploy script runs `opennextjs-cloudflare deploy --keep-vars` so dashboard-managed
Cloudflare environment variables are preserved.

In CI or any non-interactive shell, Wrangler also requires:

```bash
CLOUDFLARE_API_TOKEN
```

## Cloudflare required secrets

Set secrets in Cloudflare, not in `wrangler.jsonc`.

```bash
wrangler secret put TELEPROMPTER_TOKEN_SECRET
```

## Backend status

Room, script, config, signal, and presence data are persisted in Supabase. Next API Route Handlers
use the Supabase service role key server-side for PIN validation and authorized writes.
