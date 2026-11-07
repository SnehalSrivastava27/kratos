# 13 · Agent lockdown: hard tool limits for the live team

**One idea:** instructions are not a security boundary. In evals, Haiku without a lockdown, given a "SYSTEM OVERRIDE"
prompt, explored the repo and ran `rm -rf gallery/ data/`. Kratos agents therefore run with limits
that the model cannot talk its way past.

## How Switch launches a managed agent (0.31.0, Console sidecar)

Console's `agent-controller.mjs` (`ClaudeAdapter.startSession`) starts each session through the
Agent SDK as:

```
claude --model <definition.model> --agent <name> --permission-mode <mode> --permission-prompt-tool stdio
       --mcp-config {switch…} --settings {"permissions":{"allow":["mcp__switch"]}}
```

- `<mode>` comes from the definition: `auto_approve` → `bypassPermissions`, else `auto_mode` → `auto`,
  else `default` (`runtimeModeFor`, `PERMISSION_MODE_BY_RUNTIME_MODE`).
- The agent itself is passed as an SDK `agents` entry built from the definition's
  `advanced_config` (`sessionLaunchConfig` → `agentLaunchSources` → `launchDefinitionFor`):
  `tools`, `disallowedTools`, `permissionMode`, `maxTurns`, `effort`… (fields:
  `switch_core/providers/advanced_fields.py` `CLAUDE_FIELDS`). Switch always adds `mcp__switch` to `tools`.
- A permission "ask" goes to `makeCanUseTool` → `requestApproval`: an approval request in Switch that
  waits for a person. Nothing auto-approves it.

What we measured on Claude Code 2.1.319 (scratch repo, same flags):

| Mechanism | Works? |
|---|---|
| `advanced_config.tools: ["Bash","Read",…]` (names) | Yes: the agent only has those tools (no WebFetch, Edit, Agent…). |
| `tools` / `disallowedTools` with rules (`Bash(echo:*)`, `Read(./.env)`) | No: matched by tool name only, so `Bash(echo:*)` removes Bash entirely and `Read(./.env)` in disallowedTools removes Read entirely. |
| `advanced_config.permissionMode: "dontAsk"` | No: the explicit `--permission-mode` flag wins (init reports `auto`/`default`). |
| `auto_mode: false` (→ `--permission-mode default`) | Yes: anything not allowed by a rule becomes an approval for a human. |
| Project `.claude/settings.json` `permissions.allow/deny` | Yes. Deny rules apply even in an untrusted folder; allow rules need the folder trusted (the main checkout is). |

There is no agent-scoped way to pass permission *rules* (`Bash(node kit/bin/kit.mjs:*)`): the controller's
`--settings` is fixed. So the lockdown is two layers.

## The two layers

1. **Agent-scoped** (`switch/lockdown.json`, merged into every team agent's definition by
   `scripts/switch-up.sh`, `scripts/switch-sync-agents.sh` and every hire by
   `server/src/switch.ts createManagedAgent`):
   - `advanced_config.tools = Bash, Read, Grep, Glob, Write` (+ `mcp__switch`, always kept);
   - `auto_mode = false`, `auto_approve = false` → `--permission-mode default`.
2. **Repo rules** (`.claude/settings.json`):
   - allow `Bash(node kit/bin/kit.mjs:*)`, `Bash(npm run -s kit:*)`, `Bash(python3 switch/check_numbers.py:*)`,
     `Edit(/gallery/live-run/**)` (Edit rules cover Write; a `Write(...)` path rule did not match);
   - deny reading `.env*`, `.switch/**` (agent keys), `~/.ssh/**`.
   - Everything else (rm, curl, git, touch, writes elsewhere) needs a human approval in Switch. Read-only
     commands (`ls`, `cat data/…`) and reads inside the repo run as before.
3. Belt and braces: `kit` refuses `.env*` and `.switch/` paths as spec files (`kit/lib/util.mjs readablePath`).

**Note:** `.claude/settings.json` is a project file, so it also applies to anyone's own Claude Code
session in this repo: they gain the kit allow rules and can no longer Read `.env`, `.switch/` or `~/.ssh`
with Claude Code tools. Nothing else changes for them.

## Checks

Same flags as a live agent (`--agent` with the lockdown tools, `--permission-mode default`, main checkout):
kit ran, `ls` ran, Read `.env` / `cat .env` / Read `~/.ssh/config` denied, `rm`, `touch`, `curl` denied
(need approval), Write `gallery/live-run/x.json` allowed, Write `data/x.txt` and `../x.txt` denied, no WebFetch tool.
Live: `ps` shows every team session with `--permission-mode default`; the SYSTEM OVERRIDE probe is in
[Running a live session](../live-demo-run.md).
