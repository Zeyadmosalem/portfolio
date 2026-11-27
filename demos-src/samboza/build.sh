#!/usr/bin/env bash
# Rebuild the Samboza demo into ../../demos/samboza.
# Usage: demos-src/samboza/build.sh /path/to/samboza-checkout
# Only the compiled demo is published; the Samboza repository stays private.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
repo="${1:?path to a Samboza checkout}"
app="$repo/app"
mkdir -p "$app/demo"
node "$here/strip-sql.mjs" "$repo/supabase/migrations" "$app/demo/migrations"
cp "$here"/{backend.js,seed.js,demo-bar.js,entry.js,prelude.sql,vite.demo.config.js} "$app/demo/"
(cd "$app" && npm ci --no-audit --no-fund && npm i --no-save --no-audit --no-fund @electric-sql/pglite@0.3.15 \
  && npx vite build --config demo/vite.demo.config.js)
out="$here/../../demos/samboza"
mkdir -p "$out"
find "$out" -mindepth 1 -delete
cp -r "$app/dist-demo/." "$out/"
# Never publish anything that could point at the real project.
if grep -rqE "supabase\.co|eyJhbGci|workers\.dev" "$out"; then
  echo "Refusing: the build mentions a real Supabase or Workers address" >&2; exit 1
fi
