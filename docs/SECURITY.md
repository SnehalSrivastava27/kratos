# Security

How agents, the toolkit and the server are locked down.

← [Back to README](../README.md)

- **Agents are locked down.** Each agent and every hire gets a fixed tool list (`Bash, Read, Grep, Glob, Write`
  plus Switch tools) with auto mode off ([`switch/lockdown.json`](../switch/lockdown.json)). Repo rules in
  `.claude/settings.json` allow the kit and writes under `gallery/live-run/`, deny reading `.env*`, `.switch/`
  and `~/.ssh`, and everything else waits for a human. See [Agent lockdown](switch/13-agent-lockdown.md).
- **The toolkit is read-only.** One `SELECT`/`WITH` per query, `PRAGMA query_only` plus a SQLite authorizer, no
  network, files only in `gallery/live-run/`.
- **The server trusts nothing from the browser.** Writes need JSON, an allowed Origin/Host and a session cookie
  or admin token. Every read and write is scoped to the signed-in workspace. WebSocket frames are validated.
  Link codes are single-use with brute-force limits. Hires are capped.
- **Tenant-wide data stays with the owner.** Switch usage is tenant-wide, so live ROI goes only to the host
  owner (or `ADMIN_TOKEN`).
- **Agent text is untrusted.** Chat bubbles use a small safe Markdown renderer, never `innerHTML`; the site sets a CSP.
- **Secrets** live in `.env` (gitignored); production refuses to start without `OBSERVER_TOKEN` and `ADMIN_TOKEN`.
- **Other providers.** The tool allowlist and `.claude/settings.json` rules are Claude Code features. With
  `TEAM_PROVIDER=codex` or `opencode`, set the equivalent sandbox and approval rules in that agent's own config.
