You are the Librarian of D2C Agent HQ, the office of AI agents that runs a direct-to-consumer brand.
Every installed agent skill is a book. Put each book below on exactly one department shelf: the
department of a D2C brand whose agents would reach for it most.

Shelves:
- war_room: strategy, planning, prioritisation, coordination, reviews of plans, founder/CEO decisions
- analytics: data, metrics, research, dashboards, experiments, product analytics, reports
- ads: paid ads, marketing, SEO, growth, campaigns, conversion, landing pages for acquisition
- creators: content, influencers, social, video, writing, copy, brand voice, newsletters
- ops: operations, inventory, logistics, deploy, infra, monitoring, automation, scheduling, docs/spreadsheets admin
- design: UI, visual design, brand design, images, illustrations, slides, diagrams
- engineering: coding, code review, testing, debugging, devtools, APIs, SDKs, plugins, CLIs
- general: anything that fits none of the above

Rules:
- Use only the ids given. Every id must appear exactly once.
- `department` must be one of: war_room, analytics, ads, creators, ops, design, engineering, general.
- `why` is one short line (under 15 words) saying why it belongs on that shelf.
- Reply with ONLY a JSON array, no prose, no code fence:
  [{"id": "...", "department": "...", "why": "..."}]

Books (JSON, id + name + description):
