# Teleprompter Standalone Web WAN - PRD

## Red Team Findings

This product looks simple, but the risky part is not rendering text. The risky part is keeping a remote host aligned with a remote master over the public internet.

- Supabase Realtime should not receive 60fps scroll updates. Use throttled Broadcast messages for shared state and let followers interpolate locally.
- Presence is useful for connected user state, not high-frequency scroll sync.
- A client-side PIN check is not security. PINs must be validated server-side or through a Supabase Edge Function.
- A single-master model needs explicit ownership. Without an active master lock, two browser tabs can fight over scroll state.
- WAN latency will vary by device and network. Followers must tolerate jitter, missing packets, and reconnects.
- Followers joining late need a durable state snapshot, not only ephemeral realtime events.
- Scroll position based only on pixels can drift across devices if font, viewport, or content differs. Include both `scrollTop` and normalized `scrollRatio`.
- The system must define what happens when the master disconnects, reconnects, or opens the same room in multiple tabs.

## Product Summary

Build a standalone web teleprompter for remote production over the internet. A room has one active master and multiple followers. The master controls script content, playback, scroll position, shared display configuration, and talent signals. Followers connect from remote devices and follow the master in near real time.

This is a normal web app, not a PWA requirement.

## Goals

- Create and join teleprompter rooms using a short room code and role PIN.
- Support one active master per room.
- Support multiple followers per room.
- Let the master create, edit, paste, and import scripts from `.txt` or `.md`.
- Sync script updates, playback state, scroll position, display configuration, and signals over WAN.
- Keep follower scrolling smooth despite throttled realtime updates.
- Persist room state so reconnects and late joins recover cleanly.
- Keep the v1 small enough for a demo while avoiding obvious security and sync mistakes.

## Non-Goals

- No native desktop app in v1.
- No PWA/offline install requirement in v1.
- No video, audio, streaming, recording, or production switcher integration.
- No multi-master collaborative editing in v1.
- No complex user accounts unless needed by the chosen Supabase security setup.
- No rich document editor beyond plain text/Markdown-style script markup.

## Roles

### Master

The master is the only role allowed to change shared room state.

Master can:

- Edit/import script.
- Start, pause, and stop scrolling.
- Set scroll speed.
- Jump to top or manually seek through the script.
- Change shared font size, line height, margins, guide line position, and theme.
- Send and clear signals.
- See connected followers.
- Claim or reclaim master ownership using the master PIN.

### Follower

Followers are read-only teleprompter clients. Multiple followers may be connected at the same time.

Followers can:

- View the synchronized script.
- Follow master playback and scroll position.
- Receive signals.
- Toggle local mirror mode.
- Enter fullscreen.
- Optionally apply local-only display adjustments that do not update shared room state.

Followers cannot:

- Edit the script.
- Control shared scrolling.
- Send signals.
- Change room configuration for other clients.

## User Flows

### Create Room

1. User opens the web app.
2. User chooses "Create Room".
3. User enters room name, master PIN, and follower PIN.
4. App creates a room with a short code.
5. Creator enters as master.

### Join as Master

1. User enters room code.
2. User selects master role.
3. User enters master PIN.
4. App validates PIN server-side.
5. If no active master exists, this client becomes active master.
6. If another master is active, show current master status and allow reclaim with confirmation.

### Join as Follower

1. User enters room code.
2. User selects follower role.
3. User enters follower PIN.
4. App validates PIN server-side.
5. App loads script, config, and last room state.
6. App subscribes to realtime updates and follows the master.

### Script Import

1. Master clicks import.
2. Master selects `.txt` or `.md`.
3. App loads file content into the editor.
4. Master confirms update.
5. Script is persisted and broadcast to followers.

### Live Prompting

1. Master presses play.
2. Master scrolls locally at selected speed.
3. Master broadcasts throttled scroll snapshots.
4. Followers interpolate between snapshots and display smooth scroll.
5. Master can pause, change speed, seek, or send signals.

## Functional Requirements

### Room Management

- Generate short human-readable room codes.
- Room codes must be unique.
- Room must store separate master and follower PIN hashes.
- Room must store active master client id.
- Room must store last known playback and scroll state.

### Script Management

- Master can edit script in a text editor.
- Master can import `.txt` and `.md`.
- Script changes persist to Supabase.
- Script changes broadcast to all followers.
- Followers receiving a script update must preserve relative scroll position where possible.

### Script Markup

The renderer must support these plain text conventions:

- `[PAUSA]` renders as a centered pause marker.
- `[VTR: text]` renders as a technical media cue.
- Lines wrapped in parentheses render as notes.
- `---` renders as a divider.
- `**text**` renders as bold emphasis.

### Playback

- Master can play/pause.
- Master can set speed.
- Master can manually scroll/seek.
- Master can jump to top.
- Followers mirror master playback state.
- Followers must not send playback state.

### Display Configuration

Shared config controlled by master:

- Font size.
- Line height.
- Horizontal margin.
- Guide line position.
- Theme colors.
- Default speed.

Local-only follower config:

- Mirror mode.
- Fullscreen.
- Optional local scale override.

### Signals

Master can send:

- `30s`
- `60s`
- `WRAP`
- `STANDBY`
- `GO`
- Custom message

Signals appear as prominent overlays on followers. Countdown signals decrement locally after receipt.

## Supabase Data Model

### `rooms`

Stores room identity, access, master ownership, and durable state.

Required fields:

- `id uuid primary key`
- `code text unique not null`
- `name text not null`
- `master_pin_hash text not null`
- `follower_pin_hash text not null`
- `active_master_client_id text null`
- `last_state jsonb not null default '{}'`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Recommended `last_state` shape:

```json
{
  "isPlaying": false,
  "scrollTop": 0,
  "scrollRatio": 0,
  "speed": 0,
  "sequence": 0,
  "updatedAt": "2026-06-09T00:00:00.000Z",
  "masterClientId": "client-id"
}
```

### `scripts`

Stores one script per room for v1.

Required fields:

- `room_id uuid primary key references rooms(id) on delete cascade`
- `content text not null default ''`
- `format text not null default 'text'`
- `updated_at timestamptz not null default now()`

### `room_config`

Stores shared display configuration.

Required fields:

- `room_id uuid primary key references rooms(id) on delete cascade`
- `font_size integer not null default 56`
- `line_height numeric not null default 1.45`
- `margin_percent integer not null default 14`
- `guide_position integer not null default 33`
- `default_speed numeric not null default 2`
- `theme jsonb not null default '{}'`
- `updated_at timestamptz not null default now()`

### `signals`

Stores recent signals for reconnect visibility and audit.

Required fields:

- `id uuid primary key`
- `room_id uuid references rooms(id) on delete cascade`
- `type text not null`
- `value text null`
- `expires_at timestamptz null`
- `created_at timestamptz not null default now()`

## Realtime Sync Protocol

Use one Supabase Realtime channel per room:

```txt
teleprompter:{roomId}
```

### Presence Payload

Presence tracks connected clients only.

```json
{
  "clientId": "uuid-or-random-id",
  "role": "master",
  "displayName": "Producer",
  "joinedAt": "2026-06-09T00:00:00.000Z"
}
```

### Broadcast Events

#### `scroll_state`

Sent by active master every 100-250 ms while playing or while manual seeking.

```json
{
  "scrollTop": 1234,
  "scrollRatio": 0.42,
  "speed": 2.5,
  "isPlaying": true,
  "sentAt": 1780000000000,
  "sequence": 128,
  "masterClientId": "client-id"
}
```

#### `playback_state`

Sent when play/pause/speed changes.

```json
{
  "isPlaying": false,
  "speed": 0,
  "scrollTop": 1234,
  "scrollRatio": 0.42,
  "sequence": 129,
  "masterClientId": "client-id"
}
```

#### `script_updated`

Sent after script persistence succeeds.

```json
{
  "updatedAt": "2026-06-09T00:00:00.000Z",
  "contentVersion": 12
}
```

Followers should refetch the script from Supabase after receiving this event.

#### `config_patch`

Sent after shared config persistence succeeds.

```json
{
  "font_size": 64,
  "guide_position": 35,
  "sequence": 130,
  "masterClientId": "client-id"
}
```

#### `signal`

Sent by active master.

```json
{
  "id": "signal-id",
  "type": "wrap",
  "value": null,
  "expiresAt": null,
  "createdAt": "2026-06-09T00:00:00.000Z"
}
```

#### `clear_signal`

Clears active signal overlays.

```json
{
  "createdAt": "2026-06-09T00:00:00.000Z",
  "masterClientId": "client-id"
}
```

## Follower Sync Algorithm

- On join, fetch room, script, config, and `last_state`.
- Subscribe to realtime channel.
- Ignore any event with `sequence` lower than or equal to the last applied sequence.
- Ignore master-controlled events whose `masterClientId` does not match `active_master_client_id`.
- Apply config and script updates immediately.
- For `scroll_state`, do not jump every time unless drift is large.
- If drift is small, interpolate toward target scroll position.
- If drift is large, snap to target to recover alignment.
- If no master update arrives for a timeout window, keep current display and show disconnected/stale status.

## Security Requirements

- Never expose Supabase service role key in the browser.
- Never expose PIN hashes in unrestricted client reads.
- Validate PINs using a server-side endpoint or Supabase Edge Function.
- Return a scoped session token or signed role claim after PIN validation.
- Enforce that only the active master can update script, shared config, signals, and last state.
- Followers may read room content after follower PIN validation.
- Room codes are not secrets; PINs provide access control.
- For a demo, RLS can be simple, but it must not allow anonymous writes to arbitrary rooms.

## UI Requirements

### Landing / Join Screen

- Create room.
- Join room.
- Room code input.
- Role selection.
- PIN input.
- Clear validation errors.

### Master View

- Script editor.
- File import button.
- Prompt preview.
- Play/pause button.
- Speed control.
- Jump to top.
- Font size control.
- Margin control.
- Guide line control.
- Signal buttons.
- Connected followers list.
- Master connection status.

### Follower View

- Full-screen-oriented teleprompter display.
- Mirror toggle.
- Fullscreen button.
- Connection status indicator.
- Active signal overlay.
- Minimal controls that do not interfere with reading.

## Failure Modes

### Master Disconnects

- Followers show "Master disconnected" after timeout.
- Followers keep the latest script visible.
- Playback should stop or become stale after timeout.
- A user with master PIN can reclaim master role.

### Follower Disconnects

- Presence removes follower from connected list.
- Rejoining follower reloads persisted room state and resumes from latest realtime state.

### Master Opens Two Tabs

- Only one active `active_master_client_id` is accepted.
- New tab must explicitly reclaim master ownership.
- Old master tab must stop broadcasting when it detects ownership loss.

### Realtime Event Loss

- Followers recover from future snapshots.
- Durable state in `rooms.last_state` supports reconnect.
- Script/config updates are refetched from database after receiving broadcast.

### Device Layout Differences

- Use `scrollRatio` as fallback when `scrollTop` does not map cleanly.
- Followers should render shared font/config before applying scroll state.

## Test Plan

- Create a room and join as master.
- Join the same room with 2-4 followers.
- Verify only one active master can control the room.
- Verify followers receive script updates.
- Verify followers receive config updates.
- Verify play/pause/speed changes sync.
- Verify scroll remains smooth with throttled updates.
- Verify signal overlays appear and clear.
- Verify countdown signals count down locally.
- Verify follower reconnect loads script, config, and current state.
- Verify master disconnect displays follower warning.
- Verify master reclaim works with master PIN.
- Verify `.txt` import.
- Verify `.md` import.
- Verify mirror and fullscreen on follower devices.
- Test with simulated latency and packet delay.

## Acceptance Criteria

- A user can create a room and receive a short room code.
- A master can join with master PIN.
- Multiple followers can join with follower PIN.
- Followers cannot control shared room state.
- Master can edit/import a script and all followers update.
- Master can play/pause/scroll and all followers stay aligned within acceptable WAN tolerance.
- Master can send signals and all connected followers see them.
- Reconnected followers recover room state without manual reset.
- Master ownership prevents conflicting scroll broadcasts.
- No service role key or PIN hash is exposed to browser clients.
