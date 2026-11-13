# Unreal Shadows — interactive project documentation

Source of the portfolio site for **Unreal Shadows**, a 1–2 player co-op stealth puzzle game in Unreal Engine 5.8 C++.

**Live site:** https://lazy22zz.github.io/unrealshadows-portfolio/

The game repository is private. This repository only contains the website plus data, short code excerpts and screenshots
that were explicitly allowlisted and copied from it.

## Pages

| Route | Content |
|---|---|
| `/` | Game overview, core loop, classes, screenshots, credits |
| `/systems/` | Interactive call-chain graph + eight system write-ups (`src/content/systems/*.mdx`) |
| `/levels/` | Four interactive level/puzzle demos (`src/pages/levels/*.mdx`) |
| `/kb/` | Chinese UE5 knowledge base tied to the project's code (`src/content/kb/*.mdx`) |
| `/engineering/` | Structure, decisions, tests, status, iterations, credits (`src/data/engineering.json`) |

Stack: Astro 5 (static), MDX, React islands, Three.js (gravity cube only), Pagefind search, Shiki highlighting.

## Local preview

```bash
npm install
npm run build      # astro check + static build + Pagefind index
npm run preview    # http://localhost:4321/unrealshadows-portfolio/
```

`npm run dev` works too, but search only exists after `npm run build`.

## Updating the site after the game changes

See [UPDATING.md](UPDATING.md). Short version:

```bash
npm run sync       # re-export level data, code excerpts, test inventory, screenshots from ../UE5.8-LOTL
npm run verify     # every class name and source path on the site must exist in the game repo
npm test           # coin-lock rule port (vitest)
npm run build && npm run e2e   # Playwright: every route, phone + desktop, demo interactions
SITE_URL=https://lazy22zz.github.io/unrealshadows-portfolio/ npm run e2e   # same suite against the live site
git add -A && git commit -m "Sync from game <commit>" && git push   # GitHub Actions deploys
```

## Tests

- `npm test` — Vitest: the TypeScript port of the coin lock rules must reproduce the C++ test's worst cases (4 / 5 / 7).
- `npm run e2e` — Playwright on desktop and phone viewports: all routes render with no console errors or horizontal
  overflow, internal links stay under the base path, and each interactive demo responds as expected.
