# TelePRO

Teleprompter colaborativo con estética de control broadcast para producciones en vivo, accesible desde cualquier navegador.

Producción: [teleprompter.diegodella.ar](https://teleprompter.diegodella.ar)

## Roles

- **Producer:** crea la sala, carga y edita el guion, ajusta configuración y envía señales.
- **Host:** controla Play/Pause, velocidad y scroll maestro.
- **Viewer:** sigue el guion sincronizado en modo solo lectura.

## Funcionalidades

- Salas protegidas con PIN independiente por rol.
- Invitaciones seguras para Producer, Host y Viewer.
- Guiones por bloques con formato enriquecido.
- Scroll sincronizado y estado persistente para reconexiones.
- Señales en vivo como `STANDBY`, `GO`, `30s`, `60s` y `WRAP`.
- Manual operativo integrado en `/manual`.

## Stack

- Next.js 15 y React 19.
- TypeScript estricto.
- Supabase Postgres y Realtime Broadcast.
- systemd y Cloudflare Tunnel en producción.
- OpenNext y Wrangler como alternativa para Cloudflare Workers.

## Desarrollo local

```bash
npm ci
cp .env.example .env.local
npm run env:check
npm run db:migrate
npm run dev
```

La aplicación queda disponible en `http://localhost:3000`.

## Variables de entorno

`.env.local` está ignorado por Git. Usá `.env.example` como plantilla.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` o `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SECRET_KEY` o `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DATABASE_URL`
- `TELEPROMPTER_TOKEN_SECRET`

Las claves de servidor, URL de base de datos y secreto de tokens nunca deben llegar al cliente.

## Verificación

```bash
npm run env:check
npm run lint
npm run typecheck
npm run build
npm run check:rich-selection
SMOKE_BASE_URL=http://localhost:3000 npm run smoke:playback
SMOKE_BASE_URL=http://localhost:3000 npm run smoke:views
```

## Producción

El host actual ejecuta `teleprompter.service` en `127.0.0.1:3458` y publica HTTPS mediante
Cloudflare Tunnel.

```bash
bash scripts/deploy_local_tunnel.sh
```

Migraciones contra el Supabase local:

```bash
npm run db:migrate:local
```

Operación, rollback y alternativa Cloudflare Workers: [DEPLOYMENT.md](./DEPLOYMENT.md).
