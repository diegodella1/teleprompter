#!/usr/bin/env bash
set -euo pipefail

container_name="${SUPABASE_DB_CONTAINER:-supabase-db}"

for migration in supabase/migrations/*.sql; do
    migration_name="$(basename "$migration")"
    container_path="/tmp/$migration_name"

    rtk docker cp "$migration" "$container_name:$container_path"
    rtk docker exec "$container_name" psql \
        -v ON_ERROR_STOP=1 \
        -U postgres \
        -d postgres \
        -f "$container_path"
done
