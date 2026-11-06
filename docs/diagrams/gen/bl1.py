"""Blog-pack diagrams (BL1). Run: python3 docs/diagrams/gen/bl1.py, then
bash docs/diagrams/gen/render.sh docs/diagrams org-chart finance-gate switch-features-map eval-loop toolkit overnight-swarm
Exits 1 if any box label would overflow its box (estimated Excalifont width)."""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from exc import Scene, sequence, tw, th

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..") + "/"
GRAY = "#868e96"


def check(s, name):
    bad = []
    by_id = {e["id"]: e for e in s.els}
    for e in s.els:
        c = by_id.get(e.get("containerId") or "")
        if e["type"] == "text" and c and c["type"] != "arrow":
            if tw(e["text"], e["fontSize"]) > c["width"] - 12 or th(e["text"], e["fontSize"]) > c["height"] - 6:
                bad.append(e["text"].split("\n")[0])
    for b in bad:
        print(f"OVERFLOW {name}: {b!r}")
    return not bad


# 1. Org chart --------------------------------------------------------------------------------
def org_chart():
    s = Scene(11)
    s.text(40, 10, "The Kratos org: 16 agents, one Telegram group", 30)
    leads = [("an", "Analyst\nd2c-analyst · Analytics", "blue", [("Forecaster", "d2c-forecaster"), ("Insights", "d2c-insights")]),
             ("ad", "Ads Lead\nd2c-ads · Ads", "blue", [("Marketplaces", "d2c-marketplaces"), ("Google Ads", "d2c-google")]),
             ("op", "Ops Lead\nd2c-ops · Ops", "blue", [("Procurement", "d2c-procurement"), ("Logistics", "d2c-logistics")]),
             ("de", "Designer\nd2c-design · Design", "blue", [("Copywriter", "d2c-copywriter")]),
             ("cr", "Creators Lead\nd2c-influencers · Creators", "blue", [("UGC Producer", "d2c-ugc")]),
             ("fi", "Finance Lead\nd2c-finance · Finance", "red", [("Payroll & HR", "d2c-payroll")])]
    X0, STEP, W = 40, 300, 260
    cx = X0 + (5 * STEP + W) / 2
    s.box("fo", cx - 150, 70, 300, 64, "Founder\n(on Telegram, War Room)", "yellow", fs=18)
    s.box("ca", cx - 190, 180, 380, 80, "Sale Captain\nd2c-captain · War Room", "violet", fs=19)
    s.arrow([s.anchor("fo", "b"), s.anchor("ca", "t")], start="fo", end="ca", both=True)
    s.text(cx + 14, 146, "asks · approves", 16, color=GRAY)
    LY = 350
    for i, (k, lab, fill, specs) in enumerate(leads):
        x = X0 + i * STEP
        s.box(k, x, LY, W, 80, lab, fill, fs=17)
        if k == "fi":
            s.arrow([s.anchor("ca", "r", 0.5), (x + W / 2, 220), s.anchor(k, "t")], start="ca", end=k, both=True,
                    color="#e03131", label="the gate: nothing reaches\nthe founder until Finance approves",
                    label_at=(cx + 260, 234), sw=3)
        else:
            s.arrow([s.anchor("ca", "b", 0.06 + 0.22 * i), s.anchor(k, "t")], start="ca", end=k)
        for j, (name, aid) in enumerate(specs):
            y = LY + 120 + j * 92
            s.box(f"{k}{j}", x + 34, y, W - 34, 70, f"{name}\n{aid}", "green", fs=16)
            s.arrow([(x + 16, LY + 86), (x + 16, y + 35), s.anchor(f"{k}{j}", "l")], end=f"{k}{j}")
    s.text(X0, LY + 296, "6 leads, one forum topic each; the Captain talks only to leads.\n"
           "9 specialists: a lead splits work by @name in its topic, merges replies, reports once in War Room.", 16, color=GRAY)
    # Finance desk: private nudge Finance -> Creators
    fx, crx = X0 + 5 * STEP, X0 + 4 * STEP
    s.box("desk", crx, 720, fx + W - crx, 80,
          "Finance desk: internal_only Switch room\nagents only, no Telegram bridge", "violet", fs=17, dashed=True)
    s.arrow([s.anchor("fi", "r"), (fx + W + 40, LY + 40), (fx + W + 40, 760), s.anchor("desk", "r")],
            start="fi", end="desk", dashed=True, color="#6741d9", label="private nudge", label_at=(fx + W - 70, 690))
    s.arrow([s.anchor("desk", "l"), (crx - 20, 760), (crx - 20, LY + 40), s.anchor("cr", "l")],
            start="desk", end="cr", dashed=True, color="#6741d9")
    s.box("qa", X0, 720, 3 * STEP + W - 40, 80,
          "QA Lab topic: eval questions go to all 16 agents,\nanswers are scored against truths from data/", "gray", fs=17, dashed=True)
    s.save(OUT + "org-chart.excalidraw")
    return check(s, "org-chart")


# 2. Finance gate -----------------------------------------------------------------------------
def finance_gate():
    s = Scene(12)
    s.text(40, 10, "The Finance gate: a private nudge, then a public approval", 30)
    actors = [("f", "Founder\n(Telegram)"), ("ca", "Sale Captain\nWar Room"), ("fi", "Finance Lead"),
              ("desk", "Finance desk\n(internal_only)"), ("cr", "Creators Lead\nCreators topic")]
    fills = dict(f="yellow", ca="violet", fi="red", desk="gray", cr="blue")
    msgs = [
        ("f", "ca", "\"Plan our festive sale: 30% off,\n5 days, ₹5L marketing budget\""),
        ("ca", "cr", "briefs every lead by @name"),
        ("cr", "ca", "draft: 4 biggest creators, ₹3.55L", "dashed"),
        ("ca", "fi", "@d2c-finance check the plan"),
        ("note", "fi", "kit sql: creators ₹3.55L\nvs ₹1.5L cap → fails", "orange"),
        ("fi", "desk", "send_targeted_message\n\"cut ₹2.05L, engagement picks\""),
        ("note", ("desk", "cr"), "no bridge: the nudge never reaches Telegram", "gray"),
        ("desk", "cr", "nudge delivered"),
        ("cr", "desk", "revised privately: ₹1.18L", "dashed"),
        ("cr", "ca", "clean shortlist in Creators topic", "dashed"),
        ("ca", "fi", "re-check: ₹4.68L of ₹5L"),
        ("fi", "fi", "pins \"Finance sign-off\"\n(room document)"),
        ("fi", "ca", "approved · EBITDA +₹1.61L", "dashed"),
        ("ca", "ca", "pins \"Festive sale plan — v1\""),
        ("ca", "f", "final plan, asks to approve", "dashed"),
        ("f", "ca", "\"Approved\" → every lead confirms"),
    ]
    sequence(s, actors, msgs, y0=70, fills=fills, gap=330, bw=230, step=62)
    s.save(OUT + "finance-gate.excalidraw")
    return check(s, "finance-gate")


# 3. Switch features map ----------------------------------------------------------------------
def features_map():
    s = Scene(13)
    s.text(40, 10, "Every Switch feature Kratos uses, and where", 30)
    cols = [
        ("Telegram + rooms", "blue", [
            ("Telegram bridge", "one bot carries all 16 agents"),
            ("One room per group", "\"Telegram: Kratos D2C\", matched by id"),
            ("Forum topics = threads", "/list_agents anchors a topic"),
            ("Markdown → Telegram HTML", "TELEGRAM_STYLE.md, tg-render.py"),
            ("Workspaces + gateway API", "link a group with a 6-digit code"),
        ]),
        ("Agents", "violet", [
            ("Template (YAML)", "d2c-team.template.yaml, 16 agents"),
            ("Managed agents", "definition.model → Haiku"),
            ("Management API", "Hire button creates an agent"),
            ("Addressing by @name", "Captain → leads → specialists"),
            ("Room roles (SW4)", "@finance-approver, @ops-oncall"),
        ]),
        ("Agent protocol", "green", [
            ("SSE stream + heartbeat", "d2c-observer, silent"),
            ("scope=all, filter=all", "every message lights the office"),
            ("post_message", "d2c-office posts founder orders"),
            ("Agent status \"live\"", "hire kickoff waits for it"),
            ("MCP tools mcp__switch__*", "agents call every op as a tool"),
        ]),
        ("Shared context", "orange", [
            ("read_context", "a new hire catches up first"),
            ("Room documents", "pinned plan + Finance sign-off"),
            ("References", "kratos_file → /gallery/... files"),
            ("internal_only room", "Finance desk, private nudge"),
            ("send_targeted_message", "targets, but is NOT private"),
        ]),
    ]
    X0, STEP, W, H = 40, 420, 390, 76
    s.box("sw", X0 + 400, 70, 3 * STEP + W - 800, 70,
          "Switch: Console + switch-core 0.31.0 on one Mac", "violet", fs=22)
    for i, (head, fill, cards) in enumerate(cols):
        x = X0 + i * STEP
        s.box(f"h{i}", x, 190, W, 50, head, fill, fs=22, sw=3)
        s.arrow([s.anchor("sw", "b", 0.1 + 0.8 * i / 3), s.anchor(f"h{i}", "t")], start="sw", end=f"h{i}")
        for j, (feat, where) in enumerate(cards):
            s.box(f"c{i}{j}", x, 270 + j * (H + 18), W, H, f"{feat}\n{where}", "white", fs=17, stroke="#495057")
    y = 270 + 5 * (H + 18) + 10
    s.box("not", X0, y, 3 * STEP + W, 64,
          "Not in 0.31.0: scheduler / cron (the office server is the clock for the 9 AM brief) · reactions and polls as agent ops\n"
          "Seen, not used yet: approval cards (host must stay live) · budgets · linked rooms · Slack / Discord / Teams bridges",
          "gray", fs=16, dashed=True)
    s.save(OUT + "switch-features-map.excalidraw")
    return check(s, "switch-features-map")


# 4. Eval loop --------------------------------------------------------------------------------
def eval_loop():
    s = Scene(14)
    s.text(40, 10, "The eval loop: questions with real answers, scored, fixed, rerun", 30)
    W, H = 330, 100
    top = [("q", "Questions\nevals/questions.mjs\n84 tier 1 + 64 tier 2", "yellow"),
           ("t", "Truths from data/\ncomputed by code,\nnever typed in", "gray"),
           ("ask", "Ask the agent\noffline: claude -p + rules\nlive: QA Lab topic via Switch", "violet"),
           ("sc", "Score\nnumber · text · oneof · style\nrefusal · safety", "orange")]
    bot = [("rep", "Report\nreports/latest.md\nreports/HISTORY.md", "blue"),
           ("fix", "Fix the instructions\nswitch/agents/*.md\n(definitions, refusals, style)", "red"),
           ("sync", "Push to live agents\nbuild-template.mjs\nswitch-sync-agents.sh", "green")]
    for i, (k, lab, f) in enumerate(top):
        s.box(k, 40 + i * 400, 90, W, H, lab, f, fs=18)
        if i:
            s.arrow([s.anchor(top[i - 1][0], "r"), s.anchor(k, "l")], start=top[i - 1][0], end=k)
    for i, (k, lab, f) in enumerate(bot):
        s.box(k, 1240 - i * 400, 300, W, H, lab, f, fs=18)
        if i:
            s.arrow([s.anchor(bot[i - 1][0], "l"), s.anchor(k, "r")], start=bot[i - 1][0], end=k)
    s.arrow([s.anchor("sc", "b"), s.anchor("rep", "t")], start="sc", end="rep")
    s.arrow([s.anchor("sync", "t"), s.anchor("ask", "b", 0.3)], start="sync", end="ask", dashed=True)
    s.text(150, 236, "rerun\n(--failed reruns only the misses)", 16, color=GRAY)
    s.box("nums", 40, 470, 1530, 130,
          "Run 0 · Sonnet · tier 1 only: 84/84, $6.78\n"
          "Run 1 · Haiku · old rules: 142/148 (tier 1 83/84, tier 2 59/64), 1.5 tool calls/q, $0.26\n"
          "Run 3 · Haiku · new rules: 146/149 (tier 1 83/84, tier 2 63/65), 1.1 tool calls/q, $0.20\n"
          "Per question: Haiku $0.0013 vs Sonnet $0.08 · every run: evals/reports/HISTORY.md", "white", fs=18,
          stroke="#495057")
    s.save(OUT + "eval-loop.excalidraw")
    return check(s, "eval-loop")


# 5. Toolkit ----------------------------------------------------------------------------------
def toolkit():
    s = Scene(15)
    s.text(40, 10, "The toolkit: agents run commands, not guesses", 30)
    s.box("ag", 40, 250, 260, 120, "Agent\n(Claude Code on Haiku,\nrun by Switch)", "violet", fs=18)
    s.box("kit", 400, 250, 300, 120, "node kit/bin/kit.mjs\n<command> [spec]\none JSON object out", "yellow", fs=18)
    s.arrow([s.anchor("ag", "r", 0.35), s.anchor("kit", "l", 0.35)], start="ag", end="kit")
    s.arrow([s.anchor("kit", "l", 0.7), s.anchor("ag", "r", 0.7)], start="kit", end="ag", dashed=True)
    s.text(306, 214, "Bash(kit)", 16, color=GRAY)
    s.text(306, 384, "{\"ok\":true,...}", 16, color=GRAY)
    # data path
    s.box("csv", 820, 80, 280, 90, "data/*.csv + json\nseeded, 3 months", "gray", fs=18)
    s.box("db", 1180, 80, 360, 90, "node:sqlite (read-only)\ncache + marts: data/.cache/kratos.db", "green", fs=17)
    s.box("q", 1180, 220, 360, 90, "sql · tables · stats · forecast\nmetric (50 D2C metrics) · brief", "green", fs=17)
    s.arrow([s.anchor("csv", "r"), s.anchor("db", "l")], start="csv", end="db")
    s.arrow([s.anchor("db", "b"), s.anchor("q", "t")], start="db", end="q")
    s.arrow([s.anchor("kit", "t"), (550, 125), s.anchor("csv", "l")], start="kit", end="csv")
    s.arrow([s.anchor("q", "l"), s.anchor("kit", "r", 0.25)], start="q", end="kit", dashed=True)
    s.text(780, 222, "numbers", 16, color=GRAY)
    # files path
    s.box("mk", 820, 440, 300, 90, "chart · deck · xlsx\ndocx · pdf · banner", "orange", fs=18)
    s.box("gal", 1180, 440, 360, 90, "gallery/live-run/<file>\nreturns url /gallery/...", "orange", fs=18)
    s.box("tg", 1180, 590, 360, 80, "link in the Telegram reply\n+ gallery wall in the office", "blue", fs=17)
    s.arrow([s.anchor("kit", "b"), (550, 485), s.anchor("mk", "l")], start="kit", end="mk")
    s.arrow([s.anchor("mk", "r"), s.anchor("gal", "l")], start="mk", end="gal")
    s.arrow([s.anchor("gal", "b"), s.anchor("tg", "t")], start="gal", end="tg")
    s.box("guard", 40, 590, 1060, 80,
          "Guards: one SELECT/WITH, PRAGMA query_only + SQLite authorizer, no network,\n"
          "files only in gallery/live-run/, 1 MB spec, 10k rows, 40 slides, 60 s per command", "white", fs=17,
          stroke="#495057", dashed=True)
    s.save(OUT + "toolkit.excalidraw")
    return check(s, "toolkit")


# 6. Overnight swarm --------------------------------------------------------------------------
def overnight():
    s = Scene(16)
    s.text(40, 10, "The overnight loop: the founder sleeps, the orchestrator ships", 30)
    s.box("fo", 40, 80, 360, 90, "Founder (01:45 IST)\na written grant, then sleep", "yellow", fs=18)
    s.box("or", 520, 70, 520, 110,
          "Orchestrator (Claude Code)\nplan + run log + findings: overnight-log.md\nbriefs · status/*.json · merges", "violet", fs=18)
    s.arrow([s.anchor("fo", "r"), s.anchor("or", "l")], start="fo", end="or")
    s.box("grant", 1140, 70, 420, 110,
          "Grant: live Switch OK, Haiku for\nTelegram agents, merge when CI\nand reviews pass, write findings", "gray", fs=17)
    s.arrow([s.anchor("or", "r"), s.anchor("grant", "l")], start="or", end="grant", both=True, dashed=True)
    s.box("waveA", 30, 240, 1540, 210, "", "none", dashed=True, stroke=GRAY)
    s.text(250, 418, "Wave A (01:50): 5 agents at once, each in ../hq-worktrees/<ID>, branch task/<ID>", 17, color=GRAY)
    tasks = [("LV1", "LV1 live bring-up\n16 agents on Haiku"), ("K3", "K3 kit metric\ncache + marts"),
             ("E2", "E2 tier-2 evals\nfix instructions"), ("SW4", "SW4 feature survey\nroles + morning brief"),
             ("DM1", "DM1 demo feed\nscript + README")]
    for i, (k, lab) in enumerate(tasks):
        x = 50 + i * 305
        s.box(k, x, 300, 280, 100, lab, "blue", fs=18)
        s.arrow([s.anchor("or", "b", 0.1 + 0.2 * i), s.anchor(k, "t")], start="or", end=k)
    a, b = s.anchor("SW4", "b", 0.3), s.anchor("E2", "b", 0.75)
    s.arrow([a, (a[0], 428), (b[0], 428), b], start="SW4", end="E2", dashed=True, color="#e8590c",
            label="SW4 patches → E2", label_at=(a[0] + 12, 410))
    pipe = [("val", "Validate\nbuild + tests + checks", "green"),
            ("rev", "Adversarial review\nfresh subagent reads the diff", "red"),
            ("fix", "Fix, or waive\nin the run log", "orange"),
            ("mg", "Merge\ninto backend-v2", "violet")]
    for i, (k, lab, f) in enumerate(pipe):
        s.box(k, 50 + i * 390, 500, 340, 90, lab, f, fs=18)
        if i:
            s.arrow([s.anchor(pipe[i - 1][0], "r"), s.anchor(k, "l")], start=pipe[i - 1][0], end=k)
    s.arrow([s.anchor("LV1", "b"), s.anchor("val", "t", 0.4)], start="LV1", end="val")
    s.text(220, 462, "status/<ID>.json says done", 16, color=GRAY)
    s.box("B", 50, 660, 720, 80, "Wave B: full live demo in War Room · BL1 blog pack", "blue", fs=18)
    s.box("C", 830, 660, 740, 80, "Wave C: final CI, review anything unreviewed, merge to main", "violet", fs=18)
    s.arrow([s.anchor("mg", "b", 0.3), (1323, 625), (410, 625), s.anchor("B", "t")], start="mg", end="B")
    s.arrow([s.anchor("B", "r"), s.anchor("C", "l")], start="B", end="C")
    p = s.anchor("mg", "r")
    s.arrow([p, (1590, p[1]), (1590, 210), (1100, 210), (1100, 160), s.anchor("or", "r", 0.82)], end="or", dashed=True)
    s.text(1460, 214, "next wave", 16, color=GRAY)
    s.save(OUT + "overnight-swarm.excalidraw")
    return check(s, "overnight-swarm")


if __name__ == "__main__":
    ok = all([org_chart(), finance_gate(), features_map(), eval_loop(), toolkit(), overnight()])
    sys.exit(0 if ok else 1)
