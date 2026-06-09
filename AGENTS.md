# Roxom.TV — Engineering Standards (AI Agent Rules)

Canonical rules for any AI coding tool (Claude Code, Cursor, Codex, Copilot) building Roxom.TV
features, apps, or services. Tool-agnostic source of truth. Per-tool config files point here.

Roxom.TV is a 24/7 Bitcoin & crypto financial **news network** (media/broadcasting).
It is NOT the trading platform — that's Roxom, the sibling company. Don't conflate them.
The current Roxom.TV design standard is **Signal** (see below) — **not** spark-ui /
`@roxom-markets/*` (those belong to the sibling company).

---

## Stack

- **Frontend**: Next.js 14–16 (App Router) for apps; React 18–19, TypeScript `strict`,
  TailwindCSS v3–4, shadcn/ui or Radix, Framer Motion, React Hook Form + Zod, SWR or TanStack
  Query. (Signal itself is React 19 + Vite — see Design.)
- **APIs**: Fastify + TypeScript (`rtv-api`, `rtv-proxy`).
- **Edge/runtime**: Cloudflare Workers via OpenNext adapter (Next apps) or Vite build (Signal).
  Vercel only where noted (`rtv-proxy`).
- **Data**: Cloudflare **D1** (SQLite) + **R2** (objects) for newer projects; Supabase
  (Postgres/auth/realtime) for legacy. `rtv-api` caches via **Cloudflare KV** (`kv-store`,
  TTLs in `CACHE_*_TTL_SEC` env). No ORM on Supabase (raw SQL); Drizzle on D1.
- **Design**: **Signal** design system (canonical). Older `@roxomtv/design-system` npm token lib
  is legacy — use Signal tokens for new work.
- **Scraping**: Apify SDK v3 actors (Node 18, `undici`, no browser automation).
- **Package mgr**: npm everywhere; pnpm only in `design-system`.

---

## Design system — Signal (canonical)

Repo `Signal-DesignSystem-RoxomTV` (pkg name `signal`). The current Roxom.TV visual standard +
living docs site. Stack: **React 19 + Vite, plain CSS with CSS custom properties** (no Tailwind
preset here). Deploy: `npm run deploy` → `vite build && wrangler deploy --keep-vars`. Dark-mode
only. Supersedes `@roxomtv/design-system` as the source of truth for color/type/motion/radii.

**Consume**: copy `src/tokens/tokens.css` + `src/styles/global.css` into the app and reference the
CSS variables — **never hardcode hex/px**. Reference primitives live in `src/app/ds/` (barrel
`src/app/ds/index.js`): `Button, Badge, Card, Toggle, Input, Pill, Skeleton, Ticker, Modal`. Each
is a co-located `.jsx` + `.css` pair — port or reuse these, don't roll your own.

**Core tokens** (from `tokens.css`):
- **Color** — bg: `--color-bg-base #060707`, `--color-bg-surface #191919`, overlay/accent-tint/
  selected. Accent neon green: `--color-accent #1ae784` (active `#16cc74`; + 10/20/40 alpha).
  Text: primary `#ffffff`, secondary 60%, tertiary 40%, muted `#a0a2a1`, on-accent `#191919`.
  Borders: white-alpha 10/20/30 + `--color-border-accent #1ae784`. Semantic:
  `--color-live #e7000b`, `--color-error #ef4444`.
- **Type** — `--font-primary 'DM Sans'`, `--font-mono 'JetBrains Mono'`. Scale (px): hero 160,
  xl 36, lg 20, body-lg 16, body-md 14, caption 12.
- **Space** — 4px base: `--space-1..10` = 4, 8, 10, 12, 16, 24, 32, 40, 60, 80.
- **Radius** — xs 4, sm 6, **md 10 (universal standard)**, lg 16, xl 20, 2xl 29, 3xl 40, full.
- **Effects** — neon-green glow shadows `--shadow-glow-sm..xl`, `--shadow-modal`; glass
  `--glass-bg` / `--glass-blur blur(8px)` / `--glass-border`.
- **Motion** — durations: fast 150ms, std 220ms, slow 300ms. Easings: `--ease-out`,
  `--ease-snappy`, `--ease-smooth`.
- **Layout** — `--sidebar-width 260`, `--topbar-height 60`, `--content-max 800`.

---

## TypeScript

- Never `any` — explicit types always. `strict: true` in every `tsconfig.json`.
- Result pattern for errors: `{ success: true; data: T } | { success: false; error: E }`.
- Const assertions for immutable data. Generic constraints on all generics.
- Functions under ~30 lines.
- Import order: React → external libs → internal utils → store → types → components.

## React / Frontend

- `useMemo`/`useCallback` for expensive ops and callbacks passed to children.
- `React.memo` for components with complex props.
- No inline objects/functions in JSX props — use stable refs.
- Always clean up effects (`AbortController`, `clearInterval`, `removeEventListener`).
- Prefer Server Components; Client Components only when interactivity needs them.
- Style from **Signal CSS variables** — never hardcode hex/px. Reuse Signal primitives first.

## Comments

- Sparingly. JSDoc for public/exported APIs and complex types.
- Inline comments only for non-obvious logic. Code self-documents via naming + small functions.
- Don't comment every change.

## Lint / Format (all repos)

- ESLint + Prettier standard: **4-space** indent, `curly` always, blank line before conditionals.
- `rtv-api` uses Biome; `rtv-proxy` uses ESLint.
- **Before every commit**: run `lint` + `tsc --noEmit` on each repo touched.

## Testing

- Vitest preferred (Next.js). Jest + ts-jest for legacy.
- Runtime-test in **dev** before opening/merging a PR — passing tests + build alone don't qualify.

---

## Git / Branching

- Commit to `dev` or a feature branch cut from `dev`. **Never** push directly to `master`/`main`.
- Prod branch differs per repo — confirm before `gh pr create --base` (e.g. `rtv-api`=master,
  `rtvwebsite-v2`=master, `xchyron`=main).
- GitHub org login is **`roxom-tv`** (hyphen), not `roxomtv`. Common 404 source.
- Commit messages: simple, conventional. **No** Co-Authored-By trailer, no "Generated with"
  footer.

---

## Cloudflare Workers (hard-won rules — read before deploying)

- Worker config is **`wrangler.jsonc`**, never `.toml`. Migrate legacy `.toml`.
- **No `vars` block** in `wrangler.jsonc`, and **always** pass `--keep-vars` on `wrangler deploy`
  — otherwise dashboard-managed vars get wiped. (Signal's `npm run deploy` already does this.)
- CF Workers Build dashboard "Build command" must call `npm run deploy[:dev]`, never raw
  `wrangler deploy` (raw strips `--keep-vars`).
- `NEXT_PUBLIC_*` vars need both `wrangler.jsonc` **and** the CF Build env (OpenNext + CF).
- Delete placeholder envs from `wrangler.jsonc`/`.env` before deploy — they overwrite real CF
  dashboard envs.
- On CF/OpenNext, `request.nextUrl.protocol` is always `http:`. Derive https from
  `x-forwarded-proto` / `cf-visitor`. **Never 308-redirect a POST** (drops the body).

## Supabase

- After `DROP`+`CREATE` of a function, run `NOTIFY pgrst, 'reload schema'`.

## Data freshness / charts

- Charts read **DB-first** (Supabase/KV/D1); the ingestor keeps data fresh. Align UI poll cadence
  to the producer, don't out-poll it.
- First snapshot row may be previous-day (upstream API delay) — never use `chartData[0]` as
  prev-close.

## rtv-api specifics

- New routes must register in **both** Fastify routes **and** `workers/index.ts`, or they 404 in
  prod.
- Auto-deploys on push: `dev`→dev Worker, `main`→`api.roxom.tv`. No manual `wrangler deploy`.

## Don't fix transient prod alerts

- If the system self-heals, verify via data-freshness — don't touch code.

---

## Security (non-negotiable)

- **Secrets**: never paste real keys/tokens/PEMs into chat, commits, logs, or client bundles.
  Store in CF dashboard vars / `.dev.vars` (gitignored) / GitHub secrets. `NEXT_PUBLIC_*` is
  shipped to the browser — never put a secret there.
- **Rotate** any credential that touched a transcript, screenshot, or public surface before the
  next deploy. Assume leaked = compromised.
- **`.npmrc` GitHub Packages tokens**: gitignored only; emit a placeholder in templates, never a
  real `_authToken`.
- **Input validation**: validate every external input with Zod / JSON Schema at the boundary —
  API routes, Worker fetch handlers, Apify actor input, form submissions. Don't trust query
  params, headers, or body shape.
- **SQL**: parameterized queries only (Supabase client params / Drizzle bindings). Never string-
  concatenate user input into SQL.
- **Auth / authz**: re-validate identity & permissions server-side on every mutation — never
  trust a client-sent `userId`/role. Check ownership before returning or mutating records.
- **CORS**: allowlist explicit origins on Fastify/Workers; no wildcard `*` on authenticated
  endpoints.
- **Output**: rely on React's escaping; avoid `dangerouslySetInnerHTML`. Sanitize any HTML from
  scraped/AI-generated content before render.
- **Dependencies**: no unvetted new deps; run an audit before adding. Pin versions.
- **Logging**: never log secrets, tokens, full request bodies with PII, or full auth headers.

---

## Building something new

- **New Next.js app** → import Signal tokens (`tokens.css` + `global.css`), Inter/DM Sans via
  `next/font`, shared eslint/tsconfig. Gitignored `.npmrc` if pulling any GitHub Packages dep —
  never a real token.
- **New feature module** → style from Signal CSS variables, reuse Signal primitives, TanStack
  Query / SWR, Zustand (if needed), React Hook Form + Zod. Standard folder convention (`app/
  components/ store/ services/ hooks/ helpers/ types/`).
- **New component** → reuse a Signal primitive first (`src/app/ds/`); if new, match Signal token
  usage + co-located `.jsx`/`.css` pattern; tokens only, no hardcoded hex/px.
- **New Fastify route** → schema-validate (Zod/JSON Schema), authz server-side, register in both
  routes + worker index (see rtv-api).
- **New Apify actor** → SDK v3 `Actor.main()`, `undici` for HTTP, JSON-schema-validated input,
  `apify push` to deploy.

---

## Teleprompter Project Notes

- This repo is for a standalone Roxom.TV web teleprompter for remote production over WAN.
- Current source of product truth: `TELEPROMPTER_STANDALONE_PRD.md`.
- Treat v1 as a normal web app, not a PWA/native desktop app.
- Core architecture: one active master per room, multiple read-only followers, durable room state,
  and throttled Supabase Realtime Broadcast events for sync.
- Do not send 60fps scroll updates through Supabase. Broadcast scroll snapshots every 100-250 ms
  and let followers interpolate locally.
- Presence is only for connected user state, not high-frequency scroll sync.
- PIN validation must happen server-side or through a Supabase Edge Function. Do not implement
  client-only PIN checks.
- Never expose Supabase service-role keys, PIN hashes, or unrestricted room writes to browser code.
- Persist late-join/reconnect state in Supabase. Followers must load room, script, config, and
  `last_state` before applying live events.
- Master ownership must be explicit through `active_master_client_id`; stale or non-owner master
  events must be ignored.
- Use both `scrollTop` and `scrollRatio` in sync payloads to tolerate layout differences across
  devices.
