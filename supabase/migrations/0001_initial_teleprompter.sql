create extension if not exists pgcrypto;

create table if not exists public.rooms (
    id uuid primary key default gen_random_uuid(),
    code text unique not null,
    name text not null,
    master_pin_hash text not null,
    follower_pin_hash text not null,
    active_master_client_id text null,
    realtime_topic_secret text not null,
    last_state jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.scripts (
    room_id uuid primary key references public.rooms(id) on delete cascade,
    content text not null default '',
    format text not null default 'markdown',
    content_version integer not null default 1,
    updated_at timestamptz not null default now()
);

create table if not exists public.room_config (
    room_id uuid primary key references public.rooms(id) on delete cascade,
    font_size integer not null default 56,
    line_height numeric not null default 1.45,
    margin_percent integer not null default 14,
    guide_position integer not null default 33,
    default_speed numeric not null default 2,
    theme jsonb not null default '{"mode":"dark"}'::jsonb,
    updated_at timestamptz not null default now()
);

create table if not exists public.signals (
    id uuid primary key default gen_random_uuid(),
    room_id uuid not null references public.rooms(id) on delete cascade,
    type text not null,
    value text null,
    expires_at timestamptz null,
    created_at timestamptz not null default now(),
    cleared_at timestamptz null
);

create table if not exists public.room_presence (
    room_id uuid not null references public.rooms(id) on delete cascade,
    client_id text not null,
    role text not null check (role in ('master', 'follower')),
    display_name text not null,
    joined_at timestamptz not null default now(),
    last_seen_at timestamptz not null default now(),
    primary key (room_id, client_id)
);

create index if not exists rooms_code_idx on public.rooms(code);
create index if not exists signals_room_active_idx on public.signals(room_id, created_at desc) where cleared_at is null;
create index if not exists room_presence_room_idx on public.room_presence(room_id, last_seen_at desc);

alter table public.rooms enable row level security;
alter table public.scripts enable row level security;
alter table public.room_config enable row level security;
alter table public.signals enable row level security;
alter table public.room_presence enable row level security;
