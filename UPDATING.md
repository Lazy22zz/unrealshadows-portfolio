# Updating the site

Everything the site shows about the game comes from three places. Change the right one.

| What changed in the game | What to do here |
|---|---|
| Level layout (temple, library maze) or the Level_02 geometry | `npm run sync -- data` (re-runs the Python exporters; the library maze export fails if its `verify()` fails) |
| C++ code quoted on the site | `npm run sync -- snippets`. If an excerpt's first line changed, fix `from` in `scripts/sync/snippets.json` (sync stops with a clear error). |
| New automation tests | `npm run sync -- tests` (counts and lists `IMPLEMENT_*_AUTOMATION_TEST`) |
| New screenshots | Add an entry to `scripts/sync/media.json` (path under the game repo, alt text, optional `cropTop`/`cropBottom`), then `npm run sync -- media` |
| A new test run, status change or iteration | Edit `src/data/engineering.json` — every result needs a `source` pointing at a record in the game repo |
| New system write-up | Add `src/content/systems/<slug>.mdx` (frontmatter schema in `src/content.config.ts`); it appears on `/systems/` automatically |
| New knowledge-base article | Add `src/content/kb/<slug>.mdx` (Chinese; same seven-section structure) |

`npm run sync` with no arguments runs everything. It reads the game repo from `scripts/sync/sync.config.json`
(`gameRepo`, default `../UE5.8-LOTL`) and needs Python 3 for the level exporters. Generated files go to `src/data/` and
`public/media/` and are committed, so CI never needs the private repo.

Then:

```bash
npm run verify   # identifiers + paths still exist in the game repo
npm test
npm run build && npm run e2e
```

## Rules for content

- Nothing without a source: numbers, test results and status must point at a hand-off note or evidence file.
- Code excerpts are allowlisted one by one in `scripts/sync/snippets.json`; never paste whole files.
- Screenshots must be real captures; no mock-ups presented as gameplay.
- Never copy anything from `Source/tmp/` of the game repo (third-party book pages).

## Adding a snippet in an MDX file

```mdx
import Snippet from "../../components/Snippet.astro";

<Snippet id="portal-flags" strip caption="optional caption" />
```

`strip` removes `//` comments (most source comments are in Chinese; use it on the English pages).

## Deployment

Push to `main`. `.github/workflows/deploy.yml` runs the unit tests, builds, and publishes `dist/` to GitHub Pages.
The base path is set in `astro.config.mjs` (`base: "/unrealshadows-portfolio"`); if the repository is renamed, change it
there and in `playwright.config.ts`. Always build internal links with `url()` from `src/lib/url.ts` (inside MDX import it
as `{ url as u }` — MDX already exports a `url`).
