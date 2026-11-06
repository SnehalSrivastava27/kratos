#!/usr/bin/env bash
# Bring the Kesar HQ D2C team up on the LOCAL Switch server that Switch Console runs.
# Idempotent: rerun it any time (e.g. after each phone step in docs/GO_LIVE.md).
#
#   scripts/switch-up.sh            # needs TELEGRAM_BOT_TOKEN in <main checkout>/.env
#
# What it does, as the Console's own admin (credentials read from Console's run dir, never printed):
#   1. signs in to the local gateway        5. joins every team agent + d2c-observer to "Kratos D2C" if it exists
#   2. connects the Telegram bot             6. (v3) nothing: the office server creates the topics when a signed-in
#   3. checks Claude Code is available          user links a group at /connect (docs/GO_LIVE.md)
#   4. stores the team template, registers   7. starts the office server (:8787) and the observer
#      d2c-observer (passive, owner-only)    8. prints the steps only a human can do
# Never calls getUpdates/setWebhook: Switch itself polls the bot.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
MAIN=$(cd "$(git -C "$ROOT" rev-parse --path-format=absolute --git-common-dir)/.." && pwd) # main checkout
ENV_FILE=${ENV_FILE:-$MAIN/.env}
AGENT_DIR=${AGENT_DIR:-$MAIN}             # the template's `directory`: where Console runs the agents
ROOM_NAME=${ROOM_NAME:-Kratos D2C}
BOT_USERNAME=${BOT_USERNAME:-kratosd2c_bot}
TEMPLATE_NAME="Kesar HQ D2C team"
SWITCHDASH=${SWITCHDASH:-"$HOME/Library/Application Support/switchdash"}
CORE_ENV="$SWITCHDASH/local-switch-server/native/run/switch-core.env"
LOG_DIR=${LOG_DIR:-/tmp/switch-up}
TEAM=(d2c-captain d2c-analyst d2c-ads d2c-influencers d2c-ops d2c-design)
TOPICS=("war_room:War Room:7322096" "analytics:Analytics:16766590" "ads:Ads:13338331"
        "creators:Creators:9367192" "ops:Ops:16749490" "design:Design:16478047")

TODO=()
say() { printf '• %s\n' "$*"; }
todo() { TODO+=("$*"); }
envval() { grep -E "^$2=" "$1" | head -1 | cut -d= -f2- | sed -e 's/^["'\'']//' -e 's/["'\'']$//'; }
json() { local code=$1; shift; python3 -c "import json,sys; d=json.load(sys.stdin); $code" "$@"; }

[ -f "$CORE_ENV" ] || { echo "No local Switch server found ($CORE_ENV). Open Switch Console and start it."; exit 1; }
[ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE (needs TELEGRAM_BOT_TOKEN)"; exit 1; }
BOT_TOKEN=$(envval "$ENV_FILE" TELEGRAM_BOT_TOKEN)
[ -n "$BOT_TOKEN" ] || { echo "TELEGRAM_BOT_TOKEN missing in $ENV_FILE"; exit 1; }
API="http://127.0.0.1:$(envval "$CORE_ENV" SERVER_PORT)"
ENDPOINT="http://localhost:$(envval "$CORE_ENV" SERVER_PORT)"
mkdir -p "$LOG_DIR"
TMP=$(mktemp -d); chmod 700 "$TMP"; trap 'rm -rf "$TMP"' EXIT
curl -sf "$API/health" >/dev/null || { echo "Switch server at $API is not answering. Start it in Switch Console."; exit 1; }

# ---- 1. admin session -------------------------------------------------------------------------
python3 -c 'import json,sys; print(json.dumps({"email":sys.argv[1],"password":sys.argv[2]}))' \
  "$(envval "$CORE_ENV" GATEWAY_ADMIN_EMAIL)" "$(envval "$CORE_ENV" GATEWAY_ADMIN_PASSWORD)" > "$TMP/login"
gw() { # gw METHOD PATH [JSON]  → body on stdout, fails on HTTP >= 400
  local args=(-sf -b "$TMP/jar" -X "$1" -H 'Accept: application/json')
  [ $# -ge 3 ] && args+=(-H 'Content-Type: application/json' --data-binary "$3")
  curl "${args[@]}" "$API/gateway$2"
}
curl -sf -c "$TMP/jar" -H 'Content-Type: application/json' --data-binary @"$TMP/login" "$API/gateway/auth/login" \
  | json 'print("signed in as", d["email"], "(" + d["role"] + ")")' | sed 's/^/• /'

# ---- 2. Telegram bridge -----------------------------------------------------------------------
if gw GET /collaborations | json 'sys.exit(0 if any(b["bridge_type"]=="telegram" for b in d) else 1)'; then
  say "Telegram already connected"
else
  python3 -c 'import json,sys; print(json.dumps({"bridge_type":"telegram","display_name":"Telegram","connection_config":{"bot_token":sys.argv[1],"bot_username":sys.argv[2]},"set_as_default":True,"channel_creation_enabled":False}))' \
    "$BOT_TOKEN" "$BOT_USERNAME" > "$TMP/bridge"
  gw POST /collaborations "$(cat "$TMP/bridge")" >/dev/null && say "Telegram connected (@$BOT_USERNAME)"
fi
gw GET /collaborations | json '[print("•   bridge", b["bridge_type"], b["status"], "rooms:", b["room_count"]) for b in d if b["bridge_type"]=="telegram"]'

# ---- 3. providers ----------------------------------------------------------------------------
python3 - "$SWITCHDASH/agent-controller/provider-precheck.json" <<'PY' || todo "Switch Console → Settings → Agent providers: make Claude Code read Installed (run \`claude\` once to log in)."
import json,sys
try: p=[x for x in json.load(open(sys.argv[1]))["providers"] if x["status"]["provider"]=="claude"][0]
except Exception: sys.exit(1)
s=p["status"]; print(f"• Claude Code installed={s['installed']} version={s.get('version')} auth={s.get('auth')} ({p.get('path')})")
sys.exit(0 if s["installed"] and s.get("auth")=="ok" else 1)
PY

# ---- 4. template + agents --------------------------------------------------------------------
TPL_BODY=$(python3 -c 'import json,sys; print(json.dumps({"name":sys.argv[1],"description":"6 D2C agents in the Kratos D2C Telegram forum","kind":"group","content":open(sys.argv[2]).read()}))' \
  "$TEMPLATE_NAME" "$ROOT/switch/d2c-team.template.yaml")
TPL_ID=$(gw GET "/templates?q=$(python3 -c 'import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))' "$TEMPLATE_NAME")" \
  | json 'print(next((t["id"] for t in d if t["name"]==sys.argv[1]), ""))' "$TEMPLATE_NAME" 2>/dev/null || true)
if [ -n "$TPL_ID" ]; then gw PATCH "/templates/$TPL_ID" "$(echo "$TPL_BODY" | json 'print(json.dumps({"content":d["content"]}))')" >/dev/null
else TPL_ID=$(gw POST /templates "$TPL_BODY" | json 'print(d["id"])'); fi
say "template \"$TEMPLATE_NAME\" stored ($TPL_ID)"

gw GET /agents > "$TMP/agents"
agent_id() { json 'print(next((a["id"] for a in d if a["name"]==sys.argv[1]), ""))' "$1" < "$TMP/agents"; }
MISSING=()
for a in "${TEAM[@]}"; do [ -n "$(agent_id "$a")" ] || MISSING+=("$a"); done
if [ ${#MISSING[@]} -eq 0 ]; then say "all 6 team agents exist"
else
  say "team agents missing: ${MISSING[*]}"
  todo "Mac, Switch Console (once): run \`open 'switchdash://open/template/$TPL_ID'\` → Use → check directory = $AGENT_DIR → Create. (Console must create these: it runs their Claude Code sessions.)"
fi

OBS_CREDS="$MAIN/observer/.switch/agents/d2c-observer.json"
OBS_ID=$(agent_id d2c-observer)
if [ -z "$OBS_ID" ]; then
  REG=$(gw POST /agents/register "$(python3 -c 'import json,sys; print(json.dumps({"agent_type":"claude-code","name":"d2c-observer","description":"Silent office observer. Do not address.","options":{"channels_enabled":False,"repo_dir":sys.argv[1]},"icon_url":None,"display_name":None,"overwrite":False}))' "$MAIN/observer")")
  mkdir -p "$(dirname "$OBS_CREDS")"; (umask 077; echo "$REG" | json 'json.dump({"env":{"SWITCH_AGENT_ID":d["id"],"SWITCH_API_ENDPOINT":sys.argv[1],"SWITCH_API_TOKEN":d["api_key"]}}, open(sys.argv[2],"w"), indent=2)' "$ENDPOINT" "$OBS_CREDS")
  OBS_ID=$(echo "$REG" | json 'print(d["id"])'); say "registered d2c-observer ($OBS_ID, passive)"
elif [ ! -f "$OBS_CREDS" ]; then
  todo "d2c-observer exists on the server but $OBS_CREDS is gone (its key is shown once). Delete d2c-observer in Console → Your Agents, then rerun this script."
else say "d2c-observer exists ($OBS_ID)"; fi
gw PUT "/agents/$OBS_ID/addressing-policy" '{"policy":{"rules":[{"rooms":"*","room_groups":"*","users":[],"agents":[],"owner":true,"owner_agents":false,"platform":false}]}}' >/dev/null
if [ "$ROOT" != "$MAIN" ] && [ -f "$OBS_CREDS" ]; then mkdir -p "$ROOT/observer/.switch/agents"; (umask 077; cp "$OBS_CREDS" "$ROOT/observer/.switch/agents/"); fi

# ---- 5. rooms + invites ----------------------------------------------------------------------
gw GET /rooms > "$TMP/rooms"
json '[print("•   room %r (%s) agents=%s" % (r["name"], r.get("bridge_type"), r.get("agent_count"))) for r in d]' < "$TMP/rooms"
ROOM_ID=$(json 'print(next((r["id"] for r in d if r["name"]==sys.argv[1]), ""))' "$ROOM_NAME" < "$TMP/rooms")
CHAT_ID=""
if [ -z "$ROOM_ID" ]; then
  todo "Phone: add @$BOT_USERNAME to the Telegram group \"$ROOM_NAME\" (it becomes a Switch room)."
else
  IDS=$(gw GET /agents | json 'print(json.dumps([a["id"] for a in d if a["name"] in sys.argv[1:]]))' "${TEAM[@]}" d2c-observer)
  gw POST "/rooms/$ROOM_ID/agents" "{\"agent_ids\":$IDS}" >/dev/null
  gw GET "/rooms/$ROOM_ID" > "$TMP/room"
  CHAT_ID=$(json 'print(d["external_channel_id"])' < "$TMP/room")
  json 'print("• room", repr(d["name"]), "telegram chat", d["external_channel_id"], "members:", d["agent_count"], "agents")' < "$TMP/room"
fi

# ---- 6. workspaces (v3) -------------------------------------------------------------------------
# Topics are no longer made here: the office server creates them when a user links the group with a code
# (sign up at /signup, then /connect). The old observer/topics.json is read once, to keep the existing
# "Kratos D2C" topics and history for whoever links that group.
todo "Browser: open http://localhost:8787/signup, sign up, then /connect, and send the 6-digit code in the Telegram group (docs/GO_LIVE.md)."

# ---- 7. office server + observer -------------------------------------------------------------
grep -q '^OBSERVER_TOKEN=' "$ENV_FILE" || echo "OBSERVER_TOKEN=$(openssl rand -hex 24)" >> "$ENV_FILE"
export OBSERVER_TOKEN; OBSERVER_TOKEN=$(envval "$ENV_FILE" OBSERVER_TOKEN)
if curl -sf -o /dev/null "http://localhost:8787/api/health"; then say "office server already on :8787"
else
  (cd "$ROOT/server" && { [ -d node_modules ] || npm install --silent; } && npm run build --silent >/dev/null)
  # ENV_FILE: the server reads TELEGRAM_BOT_TOKEN from it (linking checks + forum topics); TOPICS_FILE: the pre-v3 map
  (cd "$ROOT/server" && PORT=8787 ENV_FILE="$ENV_FILE" TOPICS_FILE="${TOPICS_FILE:-$MAIN/observer/topics.json}" BOT_USERNAME="$BOT_USERNAME" \
    exec nohup node dist/index.js > "$LOG_DIR/office-server.log" 2>&1 < /dev/null) & echo $! > "$LOG_DIR/office-server.pid"
  sleep 2; say "office server started (pid $(cat "$LOG_DIR/office-server.pid"), log $LOG_DIR/office-server.log)"
fi
if [ -f "$LOG_DIR/observer.pid" ] && kill -0 "$(cat "$LOG_DIR/observer.pid")" 2>/dev/null; then say "observer already running (pid $(cat "$LOG_DIR/observer.pid"))"
elif [ -f "$ROOT/observer/.switch/agents/d2c-observer.json" ]; then
  (cd "$ROOT/observer" && exec nohup node src/index.ts > "$LOG_DIR/observer.log" 2>&1 < /dev/null) & echo $! > "$LOG_DIR/observer.pid"
  sleep 3; say "observer started (pid $(cat "$LOG_DIR/observer.pid"), log $LOG_DIR/observer.log): $(grep -m1 connected "$LOG_DIR/observer.log" || echo 'not connected yet, see log')"
fi

# ---- 8. what's left ------------------------------------------------------------------------
if [ ${#TODO[@]} -eq 0 ]; then echo; echo "All set. Phone: in the War Room topic send \"@d2c-captain Plan our festive sale: 30% off, 5 days, ₹5L marketing budget\"."
else echo; echo "Left for you (then rerun scripts/switch-up.sh):"; i=1; for t in "${TODO[@]}"; do echo "  $i. $t"; i=$((i+1)); done; fi
