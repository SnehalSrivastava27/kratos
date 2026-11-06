#!/usr/bin/env bash
# Push switch/agents/<id>.md into the LIVE team agents on the local Switch server (Switch Console),
# and the stored "Kesar HQ D2C team" template from switch/d2c-team.template.yaml.
# Idempotent: rerun after editing switch/agents/*.md. Unchanged agents are left alone.
#
#   scripts/switch-sync-agents.sh
#   DRY_RUN=1 scripts/switch-sync-agents.sh   # list what would be pushed; no API calls
#
# The team comes from contracts/roster.json (kind=agent, minus the librarian). The template is rebuilt from the
# .md files first (scripts/build-template.mjs), so the stored template always matches them.
#
# How it works: an agent's instructions live in its managed-agent definition
# (PATCH /gateway/management/agents/<id>, what Console's agent editor sends). The new revision goes
# to Console's agent controller, which hands it to the running agent host; live Claude Code sessions
# under the old definition are stopped and resume their conversation under the new instructions the
# next time they are needed. No manual restart. Signs in as Console's admin (never printed).
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
TEMPLATE_NAME="Kesar HQ D2C team"
export TEAM_MODEL=${TEAM_MODEL:-claude-haiku-5-5} # every team agent runs on Haiku
CORE_ENV="${SWITCHDASH:-$HOME/Library/Application Support/switchdash}/local-switch-server/native/run/switch-core.env"
# shellcheck disable=SC2207 # ids have no spaces
TEAM=($(python3 -c 'import json,sys; print(" ".join(p["id"] for p in json.load(open(sys.argv[1]))["people"] if p["kind"]=="agent" and p["id"]!="librarian"))' "$ROOT/contracts/roster.json"))

envval() { grep -E "^$2=" "$1" | head -1 | cut -d= -f2- | sed -e 's/^["'\'']//' -e 's/["'\'']$//'; }
json() { local code=$1; shift; python3 -c "import json,os,sys; d=json.load(sys.stdin); $code" "$@"; }
say() { printf '• %s\n' "$*"; }

if [ "${DRY_RUN:-0}" = 1 ]; then
  echo "DRY RUN: no API calls, no file writes."
  node "$ROOT/scripts/build-template.mjs" --check | sed 's/^/• /'
  for a in "${TEAM[@]}"; do
    [ -f "$ROOT/switch/agents/$a.md" ] && say "$a: would PATCH /gateway/management/agents/<id> from switch/agents/$a.md ($(wc -c < "$ROOT/switch/agents/$a.md" | tr -d ' ') bytes)" \
      || say "$a: switch/agents/$a.md MISSING"
  done
  say "would PATCH the stored \"$TEMPLATE_NAME\" template"
  exit 0
fi
node "$ROOT/scripts/build-template.mjs" | sed 's/^/• /'

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
  if [ -z "$id" ]; then say "$name: not on this server (run scripts/switch-up.sh: it creates missing agents)"; FAIL=1; continue; fi
  # The .md body (minus its "# <id>" heading) is the agent's instructions, same as the template inlines.
  rc=0
  gw GET "/management/agents/$id" | python3 -c '
import json, os, sys
d = json.load(sys.stdin)
body = open(sys.argv[1]).read().split("\n", 1)[1].strip()
model = os.environ["TEAM_MODEL"]
if d["definition"].get("instructions", "").strip() == body and d["definition"].get("model") == model:
    sys.exit(3)
print(json.dumps({"definition": {**d["definition"], "instructions": body, "model": model}}))' "$ROOT/switch/agents/$name.md" > "$TMP/patch" || rc=$?
  if [ "$rc" = 3 ]; then say "$name: already up to date"
  elif [ "$rc" != 0 ]; then say "$name: update FAILED (could not read the agent or its .md)"; FAIL=1
  elif gw PATCH "/management/agents/$id" "$TMP/patch" >/dev/null; then say "$name: instructions/model updated"
  else say "$name: update FAILED (PATCH refused)"; FAIL=1; fi
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
    body = open("%s/switch/agents/%s.md" % (sys.argv[1], a["name"])).read().split("\n", 1)[1].strip()
    has = a["definition"].get("instructions", "").strip() == body and a["definition"].get("model") == os.environ["TEAM_MODEL"]
    st = a.get("status") or {}
    applied = st.get("applied_revision") == a["revision"]
    ok &= has and applied
    print("•   %-16s current=%s  model %s, revision %s, running %s (%s)" % (a["name"], "yes" if has else "NO", a["definition"].get("model"), a["revision"], st.get("applied_revision"), st.get("process")))
sys.exit(0 if ok else 1)' "$ROOT" "${TEAM[@]}" < "$TMP/managed" || FAIL=1
[ "$FAIL" = 0 ] && echo "All team agents have the current rules." || { echo "Some agents are not in sync (see above)."; exit 1; }
