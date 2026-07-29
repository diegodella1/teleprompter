#!/usr/bin/env bash
set -euo pipefail

project_dir="/home/diego/Documents/teleprompter/teleprompter"

cd "$project_dir"
rtk npm ci
rtk npm run env:check
rtk npm run lint
rtk npm run typecheck
rtk npm run build
rtk sudo systemctl restart teleprompter.service
rtk curl \
    --fail \
    --silent \
    --show-error \
    --retry 15 \
    --retry-connrefused \
    --retry-delay 1 \
    --max-time 5 \
    http://127.0.0.1:3458/ >/dev/null

echo "Teleprompter deployed and healthy on port 3458."
