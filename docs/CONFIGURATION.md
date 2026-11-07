# Configuration

Every environment variable Kratos reads.

← [Back to README](../README.md)

Set in `.env` (gitignored) or the environment. All are optional in development.

| Variable | Default | What |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | – | Bot token, read by `scripts/switch-up.sh` and the server |
| `BOT_USERNAME` | `kratosd2c_bot` | The bot's username, shown in setup instructions |
| `OBSERVER_TOKEN` | – | Bearer token the observer sends on `POST /api/events`. Required in production |
| `ADMIN_TOKEN` | – | Bearer token for admin routes (replay, QA Lab, ROI). Required in production |
| `ALLOW_OPEN` | – | `1` lets production start without the two tokens (throwaway instances only) |
| `PORT` | `8787` | Server port |
| `DATA_DIR` | `.data` | Where `events.db` (SQLite) lives |
| `OWNER_EMAIL` | first user | The host owner: sees tenant-wide ROI and can re-shelve the skills library |
| `TEAM_MODEL` | `claude-haiku-5-5` | Model for the team and every hire |
| `HIRE_MAX` | `24` | Most employees in the office at once (plus 3 hires per 10 minutes per workspace) |
| `ROI_BUDGETS` | off | `on` allows creating, editing and deleting Switch budgets (and enforcing caps) from the office |
| `TRUST_OTLP_ENDPOINT` / `TRUST_API_KEY` | – | Export both before running `scripts/switch-up.sh` to send Claude Code usage telemetry to Switch Trust (written into the agents' local, gitignored settings). Usage only, never message content |
| `MORNING_BRIEF` / `MORNING_BRIEF_AT` | on / `09:00` | `off` disables the daily brief; time is HH:MM IST |
| `OFFICE_ORIGINS` | – | Extra allowed origins/hosts for write requests, comma-separated |
| `TRUST_LOOPBACK` | on in dev | `0` when behind a reverse proxy on the same host |
| `TRUST_PROXY` | – | `1` to trust `X-Forwarded-Proto` from a remote proxy |
| `RATE_LIMIT_PER_MIN` / `MAX_WS_CLIENTS` / `QA_PER_MIN` | `120` / `400` / `30` | Request, socket and QA Lab limits |
| `KPI_DATA_DIR` | `data/` | Where the Data Wall reads its CSVs |
| `SERVER_URL` | `http://localhost:8787` | Office server the observer and live evals talk to |
| `SWITCH_CORE_ENV` | Switch Console's path | Local Switch server credentials file |

Self-hosting and Docker: [docs/DEPLOY.md](DEPLOY.md).
