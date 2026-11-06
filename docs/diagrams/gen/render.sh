#!/usr/bin/env bash
# render.sh <dir> <slug>... : .excalidraw → .svg + .png via the gstack diagram bundle
set -e
STAGED=/var/folders/q6/btm7ywcd20q85gqp278vkxs40000gn/T//gstack-render/gstack-diagram-render-46ed274ca8b6bc76.html
cd "$1"; shift
for slug in "$@"; do
  SCENE=$(base64 < "$slug.excalidraw" | tr -d '\n')
  bun run ~/.claude/skills/gstack/bin/gstack-render.ts "$STAGED" --wait-selector '#done' \
    --eval "window.__excalidrawToSvg(decodeURIComponent(escape(atob('$SCENE')))).then(s => (window.__svg = s))" --out "$slug.svg" \
    --eval "window.__rasterize(window.__svg, 1950)" --out "$slug.png" 2>&1 | grep -E "^(OK|ERROR)"
done
