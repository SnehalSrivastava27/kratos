"""BL2 diagrams (ROI + Trust, office floor plan, system architecture). Run: python3 docs/diagrams/gen/bl2.py, then
bash docs/diagrams/gen/render.sh docs/diagrams 16-roi-trust 17-office-floor-plan 18-architecture
Exits 1 if any box label would overflow its box. (15 is SW6's switch-coverage diagram.)"""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from exc import Scene
from bl1 import check, OUT, GRAY


# 16. ROI + Trust data flow ---------------------------------------------------------------------
def roi_trust():
    s = Scene(18)
    s.text(40, 10, "Switch ROI + Trust: what every agent costs, and what guards it", 30)
    srcs = [("use", "Usage counters\nGET /gateway/tenants/{id}/usage\nturns · messages · tokens by model", "violet"),
            ("bud", "Budgets\nGET /gateway/tenants/{id}/budgets\n(listed, never created in a demo)", "violet"),
            ("tru", "Trust settings\nGET /gateway/trust-settings\nhosted: disabled (no policy / key)", "violet")]
    s.text(40, 66, "Switch (switch-core 0.31.0, host owner only)", 18, color=GRAY)
    for i, (k, lab, f) in enumerate(srcs):
        s.box(k, 40, 100 + i * 130, 400, 100, lab, f, fs=17)
    s.text(40, 496, "Ours", 18, color=GRAY)
    s.box("ev", 40, 530, 400, 80, "Office event store (SQLite)\nposts + pinned docs per agent", "orange", fs=16)
    guards = [("lk", "lockdown.json\ntool list,\nauto mode off"), ("sf", "SAFETY block\nin all 16\nagents' rules"),
              ("evl", "latest.md\nsafety asks\nrefused 4/4")]
    for i, (k, lab) in enumerate(guards):
        s.box(k, 40 + i * 135, 640, 130, 90, lab, "gray", fs=15)
    s.box("api", 600, 240, 420, 200,
          "server/src/roi.ts\nGET /api/roi?ws=&hours=\njoin usage with posts + docs\nprice tokens at list rates\n→ estimated USD (a floor)\nfails soft: source \"unavailable\"",
          "yellow", fs=17)
    for k in ("use", "bud", "tru"):
        s.arrow([s.anchor(k, "r"), s.anchor("api", "l", 0.2 + 0.3 * ["use", "bud", "tru"].index(k))], start=k, end="api")
    s.arrow([s.anchor("ev", "r"), (540, 570), (540, 420), s.anchor("api", "l", 0.9)], start="ev", end="api")
    s.arrow([s.anchor("evl", "r"), (640, 685), s.anchor("api", "b", 0.1)], start="evl", end="api", dashed=True, color=GRAY)
    s.text(460, 694, "guardrails, read once\n(fallback if missing)", 15, color=GRAY)
    s.box("pan", 1140, 220, 430, 240,
          "RoiPanel.tsx (coin button, HUD)\n\nROI card: turns, est. cost,\ndeliverables, cost per deliverable,\n1-2 recommendations\n\nTrust card: hosted Trust status +\nlockdown · SAFETY · Finance gate",
          "blue", fs=17)
    s.arrow([s.anchor("api", "r"), s.anchor("pan", "l")], start="api", end="pan", label="JSON", fs=16)
    s.box("demo", 1140, 520, 430, 80, "/demo: DEMO_ROI, modelled on the live\nWar Room run, labelled \"demo\"", "gray", fs=16, dashed=True)
    s.arrow([s.anchor("demo", "t"), s.anchor("pan", "b")], start="demo", end="pan", dashed=True)
    s.box("bpost", 600, 60, 420, 90, "POST /api/roi/budgets\noff unless ROI_BUDGETS=on, owner only", "red", fs=16, dashed=True)
    s.arrow([s.anchor("bpost", "l"), (470, 105), (470, 280), s.anchor("bud", "r", 0.3)], start="bpost", end="bud", dashed=True,
            color="#e03131")
    s.box("find", 600, 740, 970, 100,
          "Live, last 24 h: 96 team turns ≈ $9.08 · $8.75 of it early Opus runs, $0.33 on Haiku\n"
          "Captain = 40% of turns · ~250 cache-read tokens per output token\n"
          "Haiku prompts over 100K tokens bill 5x: treat the estimate as a floor", "white", fs=17, stroke="#495057")
    s.save(OUT + "16-roi-trust.excalidraw")
    return check(s, "16-roi-trust")


# 17. Office floor plan (task/O7: contracts/zones.json placed by layout.ts ZONE_MOVES, wings from ANNEX) ----------------
ZONES = [  # id, label, x, z, w, d, fill
    ("design_studio", "Design Studio", -10.75, -8, 9.5, 5, "violet"),
    ("telegram_hub", "Telegram Hub\n+ Switch core", 2, -8, 10, 5, "blue"),
    ("data_wall", "Data Wall", 14.5, -8, 9, 5, "green"),
    ("creator_studio", "Creator Studio", 15.1, -16.4, 9, 5.5, "violet"),
    ("war_room", "War Room", 2, -0.5, 9, 6, "yellow"),
    ("growth_pod", "Growth Pod", 47.2, 4.4, 9.5, 5.5, "green"),
    ("dispatch_dock", "Dispatch\nDock", -12, 7.5, 7.5, 5.5, "orange"),
    ("dark_store", "Dark\nstore", -6.5, 7.5, 3.5, 4, "orange"),
    ("chai_pantry", "Chai\nCorner", -0.5, 7.5, 5, 5, "orange"),
    ("meeting_room", "Huddle\nRoom", 4.25, 7.5, 4.5, 5, "gray"),
    ("reception", "Recep-\ntion", 8.75, 7.5, 4.5, 5, "gray"),
    ("founder_desk", "Founder's Desk", 15.25, 7.5, 8.5, 5, "yellow"),
    ("library", "Skills\nLibrary", -20, -7, 7.6, 7.6, "teal"),
    ("finance_cabin", "Finance\nCabin", -20, -16.4, 7.6, 5, "red"),
    ("open_desks", "Open\nDesks", -20, 6.6, 7.6, 8, "gray"),
]
ANNEX = [  # from layout.ts ANNEX
    ("briefing", "Captain's Briefing Room", -15.3, -28.2, 16, 8.6, "meeting"),
    ("focus_room", "Focus Room", 1.8, -28.2, 8.2, 8.6, "meeting"),
    ("reading_lounge", "Reading\nLounge", 15.1, -28.2, 9.2, 8.6, "lounge"),
    ("garden", "Garden\nAtrium", 1.8, -16.4, 8.2, 8.2, "atrium"),
    ("boardroom", "Boardroom", 32, -28.2, 15, 8.6, "meeting"),
    ("sky_lounge", "Sky Lounge", 54, -28.2, 18, 8.6, "lounge"),
    ("cafe", "Café & Pantry", 32, -13.2, 15, 10.4, "pantry"),
    ("atrium", "Atrium", 54, -13.2, 18, 10.4, "atrium"),
    ("town_hall", "Town Hall\nhackathon screen\n(click / E opens it)", 32, 4.4, 15, 12, "townhall"),
    ("glass_room", "Glass\nRoom", 59.75, 4.6, 7.5, 9.2, "meeting"),
]
KIND_FILL = dict(meeting="#e5dbff", lounge="#ffe8cc", pantry="#fff3bf", atrium="#d3f9d8", townhall="#c5f6fa")


def floor_plan():
    s = Scene(19)
    S, X0, Y0 = 17, 40, 90
    P = lambda x, z: (X0 + (x + 24) * S, Y0 + (z + 33) * S)
    s.text(40, 10, "The office: an 88 × 44 m HQ (the original 44 × 22 m office is the front-left block)", 30)
    x0, y0 = P(-24, -33)
    s.box("floor", x0, y0, 88 * S, 44 * S, "", "#f8f9fa", stroke="#495057", sw=3)
    cx, cy = P(-24, -11)
    s.box("core", cx, cy, 44 * S, 22 * S, "", "none", dashed=True, stroke="#1971c2", sw=2)
    # walls: the old back wall (z -11.15, x -24..20.15) with two doorways, the west-wing inner wall (x -16.15)
    for a, b in [(-24, -6.4), (-2.8, 6.45), (10.05, 20.15)]:
        s.line([P(a, -11.15), P(b, -11.15)], dashed=False, color="#212529", sw=4)
    for a, b in [(-11, -5.6), (-3.7, 2.6), (4.5, 11)]:
        s.line([P(-16.15, a), P(-16.15, b)], dashed=False, color="#212529", sw=4)
    for k, lab, x, z, w, d, f in ZONES:
        px, py = P(x - w / 2, z - d / 2)
        s.box(k, px, py, w * S, d * S, lab, f, fs=14)
    for k, lab, x, z, w, d, kind in ANNEX:
        px, py = P(x - w / 2, z - d / 2)
        s.box(k, px, py, w * S, d * S, lab, KIND_FILL[kind], fs=16 if kind != "townhall" else 15)
    s.text(P(20.4, -6)[0], P(20.4, -6)[1], "boule-\nvard\n(4 m)", 15, color=GRAY)
    s.text(*P(-15, -20.5), "north wing:\nmostly open\nwalking space", 16, color=GRAY)
    s.text(*P(25.5, -22), "east wing", 16, color=GRAY)
    s.text(*P(-23.6, 11.4), "west wing", 15, color=GRAY)
    dx, dy = P(9.7, 11)
    s.arrow([(dx, dy + 46), (dx, dy + 6)], color="#2f9e44", sw=3)
    s.text(dx + 10, dy + 18, "front door (new hires walk in)", 15, color="#2f9e44")
    nx = X0 + 88 * S + 30
    s.box("leg", nx, Y0, 330, 748,
          "Blue dashed: the original\n44 × 22 m office.\n\nDepartment zones come\nfrom contracts/zones.json\n(15 zones, 21 desks, no\nnew ones). Finance,\nCreators and Growth\nmoved into the wings\n(layout.ts ZONE_MOVES),\nSwitch cables follow.\n\n"
          "Pastel rooms (ANNEX):\nweb-only, room to walk.\n\n"
          "Camera: eye-level third\nperson behind the founder\n(ported from agent-office,\nMIT). Stand still while the\nstory plays and it glides\nto whoever is talking.\nSpectator view: the eye\nbutton.\n\n1 grid unit = 1 m",
          "white", fs=16, stroke="#495057", valign="top")
    s.save(OUT + "17-office-floor-plan.excalidraw")
    return check(s, "17-office-floor-plan")


# 18. System architecture (refresh of architecture.*) ------------------------------------------------
def architecture():
    s = Scene(20)
    s.text(40, 10, "Kratos end to end: Telegram → Switch → 16 agents → the office", 30)
    s.box("fo", 40, 330, 180, 80, "Founder\n(Telegram app)", "yellow", fs=18)
    s.box("tg", 290, 270, 300, 200,
          "Telegram forum group\n\"Kratos D2C\"\n\nWar Room · Analytics · Ads\nCreators · Ops · Design\nFinance · QA Lab", "blue", fs=16)
    s.arrow([s.anchor("fo", "r"), s.anchor("tg", "l")], start="fo", end="tg", both=True)
    s.box("sw", 680, 250, 380, 240,
          "Switch server (local)\n\nTelegram bridge · rooms + threads\nagent protocol (SSE + ops)\nroom documents · roles\nmanagement API\nusage · budgets · trust settings",
          "violet", fs=16)
    s.arrow([s.anchor("tg", "r"), s.anchor("sw", "l")], start="tg", end="sw", both=True, label="one bot", fs=15)
    s.box("con", 680, 70, 380, 110,
          "Switch Console (Mac app)\n16 Claude Code agents on Haiku\nlocked down (lockdown.json)", "violet", fs=16)
    s.arrow([s.anchor("con", "b"), s.anchor("sw", "t")], start="con", end="sw", both=True)
    s.box("repo", 1170, 70, 420, 110,
          "Repo checkout\ndata/*.csv · kit (SQL, charts, decks)\nswitch/agents/*.md · gallery/live-run/", "gray", fs=16)
    s.arrow([s.anchor("con", "r"), s.anchor("repo", "l")], start="con", end="repo", both=True, label="kit", fs=15)
    s.box("desk", 290, 560, 300, 80, "Finance desk\ninternal_only room, no bridge", "violet", fs=16, dashed=True)
    s.arrow([s.anchor("sw", "b", 0.1), (720, 600), s.anchor("desk", "r")], start="sw", end="desk", dashed=True,
            color="#6741d9", label="private nudge", label_at=(610, 606))
    s.box("obs", 1170, 240, 300, 70, "d2c-observer\nsilent, reads every room", "green", fs=16)
    s.box("off", 1170, 420, 300, 70, "d2c-office\nposts founder orders", "green", fs=16)
    s.arrow([s.anchor("sw", "r", 0.15), s.anchor("obs", "l")], start="sw", end="obs", label="SSE", fs=15)
    s.arrow([s.anchor("off", "l"), s.anchor("sw", "r", 0.8)], start="off", end="sw", label="post_\nmessage", fs=15)
    s.box("srv", 1560, 240, 340, 250,
          "Office server :8787\naccounts · workspaces\nSQLite events · QA Lab\nhire · commands · roles\n9 AM morning brief\nGET /api/roi (ROI + Trust)",
          "orange", fs=16)
    s.arrow([s.anchor("obs", "r"), s.anchor("srv", "l", 0.12)], start="obs", end="srv", label="/api/events", fs=15)
    s.arrow([s.anchor("srv", "l", 0.88), s.anchor("off", "r")], start="srv", end="off")
    s.box("web", 1560, 590, 340, 170,
          "Browser\nlanding page /\n3D office /app, /demo\n88 × 44 m HQ, follow camera\nSwitch hub · ROI + Trust panel",
          "yellow", fs=16)
    s.arrow([s.anchor("srv", "b", 0.3), s.anchor("web", "t", 0.3)], start="srv", end="web", label="/ws", fs=15)
    s.arrow([s.anchor("web", "t", 0.7), s.anchor("srv", "b", 0.7)], start="web", end="srv", label="/api", fs=15)
    s.arrow([s.anchor("srv", "b", 0.05), (1577, 820), (880, 820), s.anchor("sw", "b", 0.5)], start="srv", end="sw",
            dashed=True, label="gateway (admin): hire agents, room roles · read usage, budgets, trust settings",
            label_at=(900, 828))
    s.box("ev", 1170, 590, 300, 110, "Evals\nevals/run.mjs: claude -p offline,\nor live in the QA Lab topic", "gray", fs=15,
          dashed=True)
    s.save(OUT + "18-architecture.excalidraw")
    return check(s, "18-architecture")


if __name__ == "__main__":
    ok = all([roi_trust(), floor_plan(), architecture()])
    sys.exit(0 if ok else 1)
