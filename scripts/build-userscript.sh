#!/bin/sh
set -eu

output="$PWD/dist-userscript"
if [ -e "$output" ]; then
  /usr/bin/trash "$output"
fi

exec pnpm exec vite build --config vite.userscript.config.ts
