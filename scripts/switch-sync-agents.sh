#!/usr/bin/env bash
# Push switch/agents/<id>.md into the LIVE team agents on the local Switch server (Switch Console),
# and the stored "Kesar HQ D2C team" template from switch/d2c-team.template.yaml.
# Idempotent: rerun after editing switch/agents/*.md. Unchanged agents are left alone.
#
#   scripts/switch-sync-agents.sh
#
# How it works: an agent's instructions live in its managed-agent definition
# (PATCH /gateway/management/agents/<id>, what Console's agent editor sends). The new revision goes
# to Console's agent controller, which hands it to the running agent host; live Claude Code sessions
# under the old definition are stopped and resume their conversation under the new instructions the
# next time they are needed. No manual restart. Signs in as Console's admin (never printed).
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
TEMPLATE_NAME="Kesar HQ D2C team"
CORE_ENV="${SWITCHDASH:-$HOME/Library/Application Support/switchdash}/local-switch-server/native/run/switch-core.env"
TEAM=(d2c-captain d2c-analyst d2c-ads d2c-influencers d2c-ops d2c-design)
MARK="HOW YOU WRITE IN TELEGRAM"

envval() { grep -E "^$2=" "$1" | head -1 | cut -d= -f2- | sed -e 's/^["'\'']//' -e 's/["'\'']$//'; }
json() { local code=$1; shift; python3 -c "import json,sys; d=json.load(sys.stdin); $code" "$@"; }
say() { printf '• %s\n' "$*"; }

[ -f "$CORE_ENV" ] || { echo "No local Switch server found ($CORE_ENV). Open Switch Console and start it."; exit 1; }
API="http://127.0.0.1:$(envval "$CORE_ENV" SERVER_PORT)"
curl -sf "$API/health" >/dev/null || { echo "Switch server at $API is not answering. Start it in Switch Console."; exit 1; }
TMP=$(mktemp -d); chmod 700 "$TMP"; trap 'rm -rf "$TMP"' EXIT

python3 -c 'import json,sys; print(json.dumps({"email":sys.argv[1],"password":sys.argv[2]}))' \
  "$(envval "$CORE_ENV" GATEWAY_ADMIN_EMAIL)" "$(envval "$CORE_ENV" GATEWAY_ADMIN_PASSWORD)" > "$TMP/login"
curl -sf -c "$TMP/jar" -H 'Content-Type: application/json' --data-binary @"$TMP/login" "$API/gateway/auth/login" >/dev/null \
  || { echo "Sign-in to the local gateway failed."; exit 1; }
gw() { # gw METHOD PATH [JSON-FILE]  → body on stdout, fails on HTTP >= 400
  local args=(-sf -b "$TMP/jar" -X "$1" -H 'Accept: application/json')
  [ $# -ge 3 ] && args+=(-H 'Content-Type: application/json' --data-binary @"$3")
  curl "${args[@]}" "$API/gateway$2"
}

# ---- template --------------------------------------------------------------------------------
python3 -c 'import json,sys; print(json.dumps({"content":open(sys.argv[1]).read()}))' "$ROOT/switch/d2c-team.template.yaml" > "$TMP/tpl"
TPL_ID=$(gw GET "/templates?q=$(python3 -c 'import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))' "$TEMPLATE_NAME")" \
  | json 'print(next((t["id"] for t in d if t["name"]==sys.argv[1]), ""))' "$TEMPLATE_NAME")
if [ -n "$TPL_ID" ]; then gw PATCH "/templates/$TPL_ID" "$TMP/tpl" >/dev/null && say "template \"$TEMPLATE_NAME\" updated ($TPL_ID)"
else say "template \"$TEMPLATE_NAME\" not stored yet; scripts/switch-up.sh creates it"; fi

# ---- agents ------------------------------------------------------------------------------------
gw GET /management/agents > "$TMP/managed"
FAIL=0
for name in "${TEAM[@]}"; do
  id=$(json 'print(next((a["agent_id"] for a in d if a["name"]==sys.argv[1]), ""))' "$name" < "$TMP/managed")
  if [ -z "$id" ]; then say "$name: not on this server (create the team from the template first)"; FAIL=1; continue; fi
  # The .md body (minus its "# <id>" heading) is the agent's instructions, same as the template inlines.
  gw GET "/management/agents/$id" | python3 -c '
import json, sys
d = json.load(sys.stdin)
body = open(sys.argv[1]).read().split("\n", 1)[1].strip()
if d["definition"].get("instructions", "").strip() == body:
    sys.exit(3)
print(json.dumps({"definition": {**d["definition"], "instructions": body}}))' "$ROOT/switch/agents/$name.md" > "$TMP/patch" \
    && { gw PATCH "/management/agents/$id" "$TMP/patch" >/dev/null; say "$name: instructions updated"; } \
    || { [ $? -eq 3 ] && say "$name: already up to date" || { say "$name: update FAILED"; FAIL=1; }; }
done

# ---- read back: stored text + the controller applied the revision -------------------------------
for i in $(seq 1 15); do
  gw GET /management/agents > "$TMP/managed"
  json 'sys.exit(0 if all(a["status"] and a["status"].get("applied_revision")==a["revision"] for a in d if a["name"] in sys.argv[1:]) else 1)' "${TEAM[@]}" < "$TMP/managed" && break
  sleep 2
done
json '
ok = True
for a in d:
    if a["name"] not in sys.argv[2:]: continue
    has = sys.argv[1] in a["definition"].get("instructions", "")
    st = a.get("status") or {}
    applied = st.get("applied_revision") == a["revision"]
    ok &= has and applied
    print("•   %-16s rules=%s  revision %s, running %s (%s)" % (a["name"], "yes" if has else "NO", a["revision"], st.get("applied_revision"), st.get("process")))
sys.exit(0 if ok else 1)' "$MARK" "${TEAM[@]}" < "$TMP/managed" || FAIL=1
[ "$FAIL" = 0 ] && echo "All team agents have the current rules." || { echo "Some agents are not in sync (see above)."; exit 1; }
