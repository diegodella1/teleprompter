alter table public.rooms
    add column if not exists producer_pin_hash text,
    add column if not exists host_pin_hash text,
    add column if not exists viewer_pin_hash text,
    add column if not exists active_host_client_id text;

update public.rooms
set
    producer_pin_hash = coalesce(producer_pin_hash, master_pin_hash),
    host_pin_hash = coalesce(host_pin_hash, follower_pin_hash),
    viewer_pin_hash = coalesce(viewer_pin_hash, follower_pin_hash),
    active_host_client_id = coalesce(active_host_client_id, active_master_client_id);

alter table public.rooms
    alter column producer_pin_hash set not null,
    alter column host_pin_hash set not null,
    alter column viewer_pin_hash set not null;

alter table public.room_presence
    drop constraint if exists room_presence_role_check;

update public.room_presence
set role = case
    when role = 'master' then 'producer'
    when role = 'follower' then 'viewer'
    else role
end;

alter table public.room_presence
    add constraint room_presence_role_check check (role in ('producer', 'host', 'viewer'));
