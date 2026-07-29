# Teleprompter — Engineering Standards

Repository-specific source of truth for AI and human contributors.

## Product

Teleprompter is a collaborative web teleprompter for remote live production over WAN.
It supports three roles:

- Producer: edits scripts, configures the room, and sends live signals.
- Host: controls playback, speed, and the shared scroll position.
- Viewer: follows the synchronized prompt in read-only mode.

The product source of truth is `TELEPROMPTER_STANDALONE_PRD.md`.

## Stack

- Next.js App Router, React, strict TypeScript.
- Supabase Postgres plus Realtime Broadcast.
- Local systemd service behind Cloudflare Tunnel in production.
- OpenNext and Wrangler remain available as an alternative Cloudflare Workers target.
- npm is the package manager.

## Code quality

- Never use `any`; model inputs and results explicitly.
- Keep exported APIs typed and functions focused.
- Prefer Server Components unless browser interactivity requires a Client Component.
- Clean up timers, subscriptions, and event listeners.
- Avoid inline object and function props when stable references are practical.
- Use four-space indentation.
- Run `npm run lint`, `npm run typecheck`, and `npm run build` before publishing.
- Run runtime smoke tests before production deployment.

## Realtime architecture

- One active Host owns playback for each room.
- Producer manages content and signals; Viewers never mutate shared state.
- Persist room, script, config, presence, and last playback state for reconnects.
- Broadcast scroll snapshots every 100–250 ms; never send 60 fps through Supabase.
- Followers interpolate between snapshots locally.
- Include both `scrollTop` and `scrollRatio` to tolerate layout differences.
- Ignore stale or non-owner Host events.

## Security

- Validate PINs and permissions server-side.
- Never expose service-role keys, database URLs, token secrets, or PIN hashes to browser code.
- Keep secrets in ignored environment files or platform secret stores.
- Validate external input at API boundaries.
- Use parameterized database queries.
- Check room ownership and role on every mutation.
- Do not log credentials, authorization headers, or full request bodies with sensitive data.

## Deployment

- Production URL: `https://teleprompter.diegodella.ar`.
- Service: `teleprompter.service`.
- Local origin: `http://127.0.0.1:3458`.
- Deploy with `bash scripts/deploy_local_tunnel.sh`.
- Preserve Cloudflare-managed variables when using Workers by passing `--keep-vars`.
- Database migrations are additive; do not drop production tables during rollback.

## Git

- Work on a feature branch when starting from `main`.
- Use concise conventional commit messages.
- Do not add generated attribution footers.
