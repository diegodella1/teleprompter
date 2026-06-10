create table if not exists public.script_blocks (
    id uuid primary key default gen_random_uuid(),
    room_id uuid not null references public.rooms(id) on delete cascade,
    position integer not null,
    title text not null,
    content jsonb not null default '{"spans":[]}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists script_blocks_room_position_idx on public.script_blocks(room_id, position);

insert into public.script_blocks (room_id, position, title, content, created_at, updated_at)
select
    scripts.room_id,
    0,
    'Script',
    jsonb_build_object(
        'spans',
        jsonb_build_array(
            jsonb_build_object(
                'id',
                gen_random_uuid()::text,
                'text',
                scripts.content
            )
        )
    ),
    scripts.updated_at,
    scripts.updated_at
from public.scripts
where not exists (
    select 1
    from public.script_blocks
    where script_blocks.room_id = scripts.room_id
);

alter table public.script_blocks enable row level security;
