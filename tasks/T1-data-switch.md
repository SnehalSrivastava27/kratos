# T1 · Demo data + Switch agents
**Wave:** 1 · **Owns:** `data/`, `switch/` · **Reads:** `docs/PLAN.md` §7–8, `contracts/roster.json`

## Goal
Create every demo data file and the seven agents' instruction files, ready to load into Switch.

## Deliverables
- `data/products.csv`, `past_sales.csv`, `regions.csv`, `warehouses.csv`, `channels.csv`,
  `meta_campaigns.csv`, `influencers.csv`, `budget.json` exactly as PLAN §7.
- `switch/agents/<agent-id>.md` for all 7 agents: PLAN §8 instructions + the Telegram formatting rule.
- `switch/d2c-team.template.yaml` (PLAN §8 template, instructions inlined).
- `switch/check_numbers.py`: recomputes forecast, revenue, EBITDA at ₹5L and with the top-4-by-reach
  creators, and prints them.

## Acceptance
- [ ] `python3 switch/check_numbers.py` prints EBITDA ≈ +128,914 (₹5L) and ≈ −76,086 (top-4 creators)
- [ ] Agent ids match `contracts/roster.json`
- [ ] Each agent file < 40 lines, includes the Telegram formatting rule

## Don't
Invent extra agents or change any number in PLAN §7.
