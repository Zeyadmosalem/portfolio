#!/usr/bin/env bash
# Rebuild the NC Spark demo into ../../demos/nc-spark.
# Usage: demos-src/nc-spark/build.sh /path/to/nc-spark-checkout
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
app="${1:?path to an nc-spark checkout}"
mkdir -p "$app/demo"
cp "$here"/{supabase-mock.js,seed.js,demo-bar.js,entry.js,vite.demo.config.js} "$app/demo/"
(cd "$app" && npm ci --no-audit --no-fund && npx vite build --config demo/vite.demo.config.js)
out="$here/../../demos/nc-spark"
mkdir -p "$out"
find "$out" -mindepth 1 -delete
cp -r "$app/dist-demo/." "$out/"
