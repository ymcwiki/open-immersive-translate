#!/bin/sh
set -eu

output="$PWD/dist-firefox"
if [ -e "$output" ]; then
  /usr/bin/trash "$output"
fi

exec pnpm exec vite build --config vite.firefox.config.ts
