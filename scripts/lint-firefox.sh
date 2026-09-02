#!/bin/sh
set -eu

if [ ! -f dist-firefox/manifest.json ]; then
  echo "dist-firefox/manifest.json is missing; build Firefox first." >&2
  exit 1
fi

exec pnpm exec web-ext lint --source-dir dist-firefox
