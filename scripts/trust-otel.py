#!/usr/bin/env python3
"""Claude Code OpenTelemetry -> Switch Trust, opt-in (docs: switch-trust/admin/data-sources/opentelemetry).

    TRUST_OTLP_ENDPOINT=https://<your instance>/agent/otel TRUST_API_KEY=<Ingest-only key> \
      python3 scripts/trust-otel.py <agent dir> [--dry-run]

Called by scripts/switch-up.sh and scripts/switch-sync-agents.sh. Writes the documented Claude Code variables into
<agent dir>/.claude/settings.local.json `env` (gitignored, mode 600). Console starts every managed agent with
`cwd` = its definition's directory and Claude Code's default setting sources, so this file reaches all of them.
Usage only: no OTEL_LOG_* (prompts, responses and tool content stay home).

One agent name for the team: Console launches each agent with an empty env and the same directory, and a managed-agent
definition has no env field, so there is no per-agent place for OTEL_RESOURCE_ATTRIBUTES. Every agent reports as
gen_ai.agent.name=kratos-team (TRUST_AGENT_NAME to change it); the per-agent split stays in the office's /api/roi.
Any other Claude Code session started in the same directory (yours, too) also reports under that name.

Both variables unset: the variables this script wrote are removed (telemetry off). The key is never printed.
"""
import json, os, sys
from urllib.parse import urlparse

OURS = ["CLAUDE_CODE_ENABLE_TELEMETRY", "CLAUDE_CODE_ENHANCED_TELEMETRY_BETA", "OTEL_METRICS_EXPORTER", "OTEL_LOGS_EXPORTER",
        "OTEL_TRACES_EXPORTER", "OTEL_EXPORTER_OTLP_PROTOCOL", "OTEL_EXPORTER_OTLP_ENDPOINT", "OTEL_SERVICE_NAME",
        "OTEL_RESOURCE_ATTRIBUTES", "OTEL_EXPORTER_OTLP_HEADERS"]

def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry = "--dry-run" in sys.argv or os.environ.get("DRY_RUN") == "1"
    if len(args) != 1:
        print("usage: TRUST_OTLP_ENDPOINT=… TRUST_API_KEY=… python3 scripts/trust-otel.py <agent dir> [--dry-run]")
        return 2
    path = os.path.join(args[0], ".claude", "settings.local.json")
    endpoint, key = os.environ.get("TRUST_OTLP_ENDPOINT", "").strip(), os.environ.get("TRUST_API_KEY", "").strip()
    name = os.environ.get("TRUST_AGENT_NAME", "kratos-team").strip()
    try:
        settings = json.load(open(path))
    except FileNotFoundError:
        settings = {}
    except ValueError:
        print(f"• telemetry: {path} is not JSON; left alone")
        return 1
    env = dict(settings.get("env") or {})

    if not endpoint and not key:
        ours = env.get("CLAUDE_CODE_ENABLE_TELEMETRY") == "1" and "gen_ai.agent.name=" in env.get("OTEL_RESOURCE_ATTRIBUTES", "")
        if not ours:
            print("• telemetry to Switch Trust: off (set TRUST_OTLP_ENDPOINT and TRUST_API_KEY to turn it on)")
            return 0
        print(f"• telemetry to Switch Trust: off, {'would remove' if dry else 'removing'} the OTel variables from {path}")
        if dry:
            return 0
        settings["env"] = {k: v for k, v in env.items() if k not in OURS}
        if not settings["env"]:
            del settings["env"]
        return write(path, settings)
    if not endpoint or not key:
        print("• telemetry: needs both TRUST_OTLP_ENDPOINT and TRUST_API_KEY; nothing changed")
        return 1
    u = urlparse(endpoint)
    if u.scheme != "https" and u.hostname not in ("localhost", "127.0.0.1"):
        print("• telemetry: TRUST_OTLP_ENDPOINT must be https:// (copy it from Trust → Settings → Data sources → OpenTelemetry)")
        return 1
    if not u.path.rstrip("/").endswith("/agent/otel"):
        print("• telemetry: note, the documented endpoint is a base URL ending in /agent/otel")
    want = {
        "CLAUDE_CODE_ENABLE_TELEMETRY": "1", "CLAUDE_CODE_ENHANCED_TELEMETRY_BETA": "1",
        "OTEL_METRICS_EXPORTER": "none", "OTEL_LOGS_EXPORTER": "otlp", "OTEL_TRACES_EXPORTER": "otlp",
        "OTEL_EXPORTER_OTLP_PROTOCOL": "http/protobuf", "OTEL_EXPORTER_OTLP_ENDPOINT": endpoint.rstrip("/"),
        "OTEL_SERVICE_NAME": "kratos", "OTEL_RESOURCE_ATTRIBUTES": f"gen_ai.agent.name={name}",
        "OTEL_EXPORTER_OTLP_HEADERS": f"Authorization=ApiKey {key}",
    }
    content = [k for k in env if k.startswith("OTEL_LOG_")]
    shown = {k: ("Authorization=ApiKey <redacted>" if k == "OTEL_EXPORTER_OTLP_HEADERS" else v) for k, v in want.items()}
    print(f"• telemetry to Switch Trust: {'would write' if dry else 'writing'} {path} env (usage only, no OTEL_LOG_*):")
    for k, v in shown.items():
        print(f"•   {k}={v}")
    print(f"•   every team agent reports as gen_ai.agent.name={name}: Console gives managed agents no per-agent env")
    if content:
        print(f"•   removing content flags {', '.join(content)} (usage only)")
    if dry:
        return 0
    if all(env.get(k) == v for k, v in want.items()) and not content:
        print("•   already set; restart the agents' sessions in Console if they started before it")
        return 0
    settings["env"] = {**{k: v for k, v in env.items() if not k.startswith("OTEL_LOG_")}, **want}
    rc = write(path, settings)
    print("•   new sessions pick it up; running ones keep their old settings until they restart")
    return rc

def write(path: str, settings: dict) -> int:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        json.dump(settings, f, indent=2)
        f.write("\n")
    os.replace(tmp, path)
    os.chmod(path, 0o600)
    return 0

if __name__ == "__main__":
    sys.exit(main())
