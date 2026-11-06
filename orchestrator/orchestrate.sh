#!/usr/bin/env bash
# D2C Agent HQ orchestrator: runs coding agents in parallel, one git worktree per task.
#
#   ./orchestrator/orchestrate.sh init            # commit scaffold, create worktrees + branches
#   ./orchestrator/orchestrate.sh launch 1        # start every wave-1 agent in the background
#   ./orchestrator/orchestrate.sh status          # board: process alive? + each status/<id>.json
#   ./orchestrator/orchestrate.sh logs T3         # follow one agent's log
#   ./orchestrator/orchestrate.sh nudge T3 "msg"  # re-run an agent with an extra instruction
#   ./orchestrator/orchestrate.sh merge 1         # merge finished wave-1 branches into main
#   ./orchestrator/orchestrate.sh stop [T3]       # stop one or all agents
#
# Agent CLI is configurable. Check your CLI's --help for the exact headless flags.
#   AGENT_CMD='claude -p --permission-mode acceptEdits'   (default, Claude Code)
#   AGENT_CMD='codex exec --full-auto'                     (Codex)
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"
TASKS="orchestrator/tasks.tsv"
WT_DIR="${WT_DIR:-$ROOT/../hq-worktrees}"
STATE="$ROOT/.orchestrator"
AGENT_CMD="${AGENT_CMD:-claude -p --permission-mode acceptEdits}"
mkdir -p "$STATE/logs" "$STATE/pids"

tasks_for_wave() { grep -v '^#' "$TASKS" | awk -v w="$1" -F'\t' '$1==w {print $2"\t"$3}'; }
all_tasks()      { grep -v '^#' "$TASKS" | awk -F'\t' '{print $2"\t"$3"\t"$1}'; }
wt()             { echo "$WT_DIR/$1"; }

prompt_for() { # $1=id $2=brief $3=extra
  cat <<P
You are coding agent $1 on the D2C Agent HQ project. Work ONLY on this task.
1. Read AGENTS.md (team rules) and $2 (your brief). Read the docs/PLAN.md sections it names.
2. Set status/$1.json to state "working" and commit.
3. Do the work in the order the brief gives. Commit small, messages start with [$1].
4. Update status/$1.json at each milestone. When every Acceptance box is true, set state "done".
5. If blocked, set state "blocked", explain in "blockers", and stop.
${3:+Extra instruction from the orchestrator: $3}
P
}

cmd_init() {
  [ -d .git ] || git init -q -b main
  git add -A && git commit -qm "[orchestrator] scaffold, contracts, briefs" || true
  mkdir -p "$WT_DIR"
  while IFS=$'\t' read -r id brief wave; do
    if [ ! -d "$(wt "$id")" ]; then
      git worktree add -q -b "task/$id" "$(wt "$id")" main
      echo "worktree $id → $(wt "$id")"
    fi
  done < <(all_tasks)
}

launch_one() { # $1=id $2=brief $3=extra
  local id="$1" dir; dir="$(wt "$id")"
  [ -d "$dir" ] || { echo "no worktree for $id (run init)"; return 1; }
  if [ -f "$STATE/pids/$id" ] && kill -0 "$(cat "$STATE/pids/$id")" 2>/dev/null; then
    echo "$id already running"; return 0; fi
  ( cd "$dir" && git merge -q main --no-edit 2>/dev/null || true
    nohup $AGENT_CMD "$(prompt_for "$id" "$2" "${3:-}")" </dev/null >>"$STATE/logs/$id.log" 2>&1 &
    echo $! > "$STATE/pids/$id" )
  echo "launched $id (pid $(cat "$STATE/pids/$id")) log: .orchestrator/logs/$id.log"
}

cmd_launch() {
  local wave="${1:?wave number}"
  while IFS=$'\t' read -r id brief; do launch_one "$id" "$brief"; done < <(tasks_for_wave "$wave")
}

cmd_status() {
  printf "%-4s %-6s %-8s %-5s %s\n" TASK PROC STATE PROG "NEXT / BLOCKERS"
  while IFS=$'\t' read -r id brief wave; do
    local proc="-" s="$(wt "$id")/status/$id.json" state="queued" prog="0" note=""
    [ -f "$STATE/pids/$id" ] && { kill -0 "$(cat "$STATE/pids/$id")" 2>/dev/null && proc="run" || proc="exit"; }
    if [ -f "$s" ] && command -v node >/dev/null; then
      read -r state prog note < <(node -e '
        const s=require(process.argv[1]);
        const b=(s.blockers||[]).join("; ");
        console.log(s.state||"?", s.progress??"?", b ? "BLOCKED: "+b : (s.next||""))' "$s" 2>/dev/null || echo "? ? unreadable")
    fi
    printf "%-4s %-6s %-8s %-5s %s\n" "$id" "$proc" "$state" "$prog%" "$note"
  done < <(all_tasks)
  # contract change requests surface here so the orchestrator decides centrally
  for f in "$WT_DIR"/*/status/*.json; do
    [ -f "$f" ] && command -v node >/dev/null && node -e '
      const s=require(process.argv[1]);(s.contract_requests||[]).forEach(r=>console.log("CONTRACT REQUEST ["+s.task+"]: "+r))' "$f" 2>/dev/null || true
  done
}

cmd_logs()  { tail -n 50 -f "$STATE/logs/${1:?id}.log"; }

cmd_nudge() {
  local id="${1:?id}" msg="${2:?message}" brief
  brief="$(all_tasks | awk -F'\t' -v i="$id" '$1==i{print $2}')"
  cmd_stop "$id" || true; launch_one "$id" "$brief" "$msg"
}

cmd_merge() {
  local wave="${1:?wave}"
  git checkout -q main
  while IFS=$'\t' read -r id brief; do
    local s="$(wt "$id")/status/$id.json"
    if [ -f "$s" ] && grep -q '"state": *"done"' "$s"; then
      if git merge --no-ff -q "task/$id" -m "[orchestrator] merge $id"; then echo "merged $id"
      else echo "CONFLICT merging $id: resolve, commit, re-run merge"; return 1; fi
    else echo "skip $id (not done)"; fi
  done < <(tasks_for_wave "$wave")
}

cmd_stop() {
  for f in "$STATE"/pids/${1:-*}; do
    [ -f "$f" ] || continue
    kill "$(cat "$f")" 2>/dev/null && echo "stopped $(basename "$f")" || true
    rm -f "$f"
  done
}

case "${1:-}" in
  init) cmd_init ;; launch) cmd_launch "${2:-}" ;; status) cmd_status ;;
  logs) cmd_logs "${2:-}" ;; nudge) cmd_nudge "${2:-}" "${3:-}" ;;
  merge) cmd_merge "${2:-}" ;; stop) cmd_stop "${2:-}" ;;
  *) sed -n '2,13p' "$0" ;;
esac
