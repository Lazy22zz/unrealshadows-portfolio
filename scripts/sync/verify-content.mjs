// Checks the site's text against the game repo: every `sources:` path must exist, and every UE-style identifier
// (AUS_/UUS_/FUS_/EUS_/IUS_ types and US… namespaces) written in content or components must appear in the C++ source.
// Run: npm run verify  (needs the game repo next to this one, see sync.config.json)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const cfg = JSON.parse(fs.readFileSync(path.join(here, "sync.config.json"), "utf8"));
const game = path.resolve(root, cfg.gameRepo);
const mod = path.join(game, "Source", "UnrealShadows_LOTL");

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!["node_modules", "dist", ".astro", "data"].includes(e.name)) walk(p, acc); }
    else acc.push(p);
  }
  return acc;
}

const source = walk(path.join(mod, "Public")).concat(walk(path.join(mod, "Private")))
  .filter((f) => /\.(h|cpp)$/.test(f)).map((f) => fs.readFileSync(f, "utf8")).join("\n");
const content = walk(path.join(root, "src")).filter((f) => /\.(mdx|astro|tsx|ts)$/.test(f));

const problems = [];
const ident = /\b((?:[AUFEI]US_|US)[A-Z][A-Za-z0-9_]*)(?:::([A-Za-z_][A-Za-z0-9_]*))?/g;
const ALLOW = new Set(["USB", "USD", "US_PROJECT", "US_VERSION"]);
for (const f of content) {
  const txt = fs.readFileSync(f, "utf8");
  for (const m of txt.matchAll(/^\s+- (Source\/[^\s]+|ArtSource\/[^\s]+)$/gm)) {
    if (!fs.existsSync(path.join(game, m[1]))) problems.push(`${path.relative(root, f)}: missing path ${m[1]}`);
  }
  for (const m of txt.matchAll(ident)) {
    const [, name, member] = m;
    if (ALLOW.has(name) || name.length < 5) continue;
    if (!new RegExp(`\\b${name}\\b`).test(source)) problems.push(`${path.relative(root, f)}: unknown identifier ${name}`);
    else if (member && !new RegExp(`\\b${member}\\b`).test(source)) problems.push(`${path.relative(root, f)}: unknown member ${name}::${member}`);
  }
}
const uniq = [...new Set(problems)];
if (uniq.length) {
  console.log(uniq.join("\n"));
  console.log(`\n${uniq.length} problem(s)`);
  process.exit(1);
}
console.log(`content verified: ${content.length} files, all paths and identifiers found in the game repo`);
