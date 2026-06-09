# CLAUDE.md

Roxom.TV engineering standards live in the shared standards repo. Read them before working:

@AGENTS.md

If `AGENTS.md` is not present in this repo, pull the canonical version from the
`roxomtv-standards` repo and copy it here (or add as a git submodule). Per-repo specifics below.

## Repo-specific notes

- Project: standalone Roxom.TV web teleprompter for remote production over WAN.
- Product source of truth: `TELEPROMPTER_STANDALONE_PRD.md`.
- Build around one active master per room and multiple read-only followers.
- Use Supabase durable state plus throttled Realtime Broadcast sync. Do not push 60fps scroll
  updates.
- Validate room PINs server-side or through a Supabase Edge Function; no client-only PIN security.
- Preserve master ownership with `active_master_client_id` and ignore stale/non-owner events.
