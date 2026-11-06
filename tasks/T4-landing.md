# T4 · Landing page
**Wave:** 1 · **Owns:** `web/src/landing/` · **Reads:** `docs/PLAN.md` §9.1, §9.3, §9.7

## Goal
A light, bright, animated landing page (Perplexity-Teammates-style storytelling, daytime palette).

## Deliverables
- `web/src/landing/Landing.tsx` (default export) with the 8 sections in PLAN §9.7.
- Hero: right side renders `<HeroOffice />` from `web/src/landing/HeroOffice.tsx`, a placeholder box for now that T8 replaces with
  `<Office mode="autoplay" />`. Keep the frame (rounded window, soft shadow).
- Channel strip: generic icons (lucide-react) + platform names as text; no brand logos.
- Thinking cards with ticking checklists; EBITDA count-down/up section; self-drawing "how it works" line.
- Framer Motion, `prefers-reduced-motion` respected.

## Acceptance
- [ ] `npm run build` in `web/` passes
- [ ] Looks good at 1440px and 390px wide
- [ ] No dark theme; palette from PLAN §9.3

## Don't
Edit `web/src/office/` or the shell files.
