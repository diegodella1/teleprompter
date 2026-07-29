# CLAUDE.md

Read and follow `AGENTS.md` before changing this repository.

Project notes:

- Product source of truth: `TELEPROMPTER_STANDALONE_PRD.md`.
- Keep one active Host per room and multiple read-only Viewers.
- Use durable Supabase state plus throttled Realtime Broadcast sync.
- Validate room PINs and role permissions server-side.
- Preserve Host ownership and ignore stale or non-owner playback events.
