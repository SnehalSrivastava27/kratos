#!/usr/bin/env bash
# render.sh <dir> <slug>... : .excalidraw → .svg + .png (1950 px wide) via the gstack `diagram` render bundle.
# Stage the bundle once as the gstack diagram skill's Step 2 does; this picks the newest staged copy.
set -e
STAGED=$(ls -t "${TMPDIR:-/tmp}"/gstack-render/gstack-diagram-render-*.html 2>/dev/null | head -1)
[ -n "$STAGED" ] || { echo "no staged gstack diagram bundle: run the diagram skill's Step 2 first"; exit 1; }
cd "$1"; shift
for slug in "$@"; do
  SCENE=$(base64 < "$slug.excalidraw" | tr -d '\n')
  bun run ~/.claude/skills/gstack/bin/gstack-render.ts "$STAGED" --wait-selector '#done' \
    --eval "window.__excalidrawToSvg(decodeURIComponent(escape(atob('$SCENE')))).then(s => (window.__svg = s))" --out "$slug.svg" \
    --eval "window.__rasterize(window.__svg, 1950)" --out "$slug.png" 2>&1 | grep -E "^(OK|ERROR)"
done
