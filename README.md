# Roxom.TV Teleprompter

Teleprompter colaborativo para vivo con tres roles:

- Producer: carga y edita el guion, ajusta configuración y manda señales.
- Host: controla lectura, Play/Pause y scroll maestro.
- Viewer: sigue el guion en modo solo lectura.

## Stack

- Next.js 15
- React 19
- Supabase Hosted
- OpenNext + Wrangler para Cloudflare Workers

## Local Setup

```bash
npm install
cp .env.example .env.local
npm run env:check
npm run db:migrate
npm run dev
```

En Windows PowerShell, si no tenés `cp`:

```powershell
Copy-Item .env.example .env.local
```

## Environment

`.env.local` no se commitea. Usá `.env.example` como plantilla.

Variables requeridas:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` o `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SECRET_KEY` o `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DATABASE_URL`
- `TELEPROMPTER_TOKEN_SECRET`

El service role key y `SUPABASE_DATABASE_URL` son secretos de servidor. No los expongas en cliente.

## Scripts

```bash
npm run dev
npm run lint
npm run typecheck
npm run build
npm run env:check
npm run db:migrate
npm run smoke:playback
npm run smoke:views
```

Para correr smoke tests contra otro puerto:

```powershell
$env:SMOKE_BASE_URL="http://localhost:3000"; npm run smoke:playback
```

## Deployment

Ver [DEPLOYMENT.md](./DEPLOYMENT.md) para Supabase, Vercel y Cloudflare/OpenNext.

Antes de producción, rotar cualquier secreto compartido en chats o entornos locales.
