// Pulls data, code excerpts and screenshots from the (private) game repo into this public site repo.
// Everything it writes is committed, so the site builds without the game repo. Run: npm run sync
//
//   src/data/temple.json        Python: the repo's TempleV9Space / TempleV9Layout solver
//   src/data/library-maze.json  Python: the repo's LibraryMazeLayout solver (fails if its verify() fails)
//   src/data/cube.json          Python: the repo's Level_02 geometry dump
//   src/data/snippets.json      allowlisted C++ excerpts (scripts/sync/snippets.json)
//   src/data/tests.json         automation test inventory (names only)
//   src/data/project.json       commit, counts, module folders
//   public/media/*.webp         allowlisted screenshots (scripts/sync/media.json)
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const cfg = JSON.parse(fs.readFileSync(path.join(here, "sync.config.json"), "utf8"));
const game = path.resolve(root, cfg.gameRepo);
const mod = path.join(game, "Source", "UnrealShadows_LOTL");
const dataDir = path.join(root, "src", "data");
const mediaDir = path.join(root, "public", "media");
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(mediaDir, { recursive: true });

const only = process.argv.slice(2); // e.g. `npm run sync -- snippets media`
const want = (k) => only.length === 0 || only.includes(k);
const git = (...a) => execFileSync("git", ["-C", game, ...a], { encoding: "utf8" }).trim();
const py = (script, ...args) =>
  execFileSync(cfg.python, [path.join(here, script), game, ...args], { stdio: "inherit" });

// ---------------------------------------------------------------- level data (Python, the repo's own solvers)
if (want("data")) {
  py("export_temple.py", path.join(dataDir, "temple.json"));
  py("export_library_maze.py", path.join(dataDir, "library-maze.json"));
  py("export_cube.py", cfg.geometryDump, path.join(dataDir, "cube.json"));
}

// ---------------------------------------------------------------- code excerpts
function stripComments(lines) {
  const out = [];
  let inBlock = false;
  for (const raw of lines) {
    let l = raw;
    if (inBlock) {
      const end = l.indexOf("*/");
      if (end < 0) continue;
      l = l.slice(end + 2);
      inBlock = false;
      if (!l.trim()) continue;
    }
    const t = l.trim();
    if (t.startsWith("//")) continue;
    if (t.startsWith("/*")) {
      if (!t.includes("*/")) inBlock = true;
      continue;
    }
    // trailing // comment outside a string literal
    let q = false;
    for (let i = 0; i < l.length - 1; i++) {
      if (l[i] === '"' && l[i - 1] !== "\\") q = !q;
      if (!q && l[i] === "/" && l[i + 1] === "/") { l = l.slice(0, i).replace(/\s+$/, ""); break; }
    }
    out.push(l);
  }
  // collapse runs of blank lines
  return out.filter((l, i, a) => !(l.trim() === "" && (i === 0 || a[i - 1].trim() === "")));
}

function dedent(lines) {
  const ind = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^[\t ]*/)[0].replace(/\t/g, "    ").length));
  return lines.map((l) => l.replace(/\t/g, "    ").slice(ind));
}

if (want("snippets")) {
  const spec = JSON.parse(fs.readFileSync(path.join(here, "snippets.json"), "utf8"));
  const sha = git("rev-parse", "HEAD");
  const out = {};
  for (const [id, s] of Object.entries(spec)) {
    if (id.startsWith("_")) continue;
    const file = path.join(mod, s.file);
    const lines = fs.readFileSync(file, "utf8").replace(/\r/g, "").split("\n");
    const i = lines.findIndex((l) => l.trim() === s.from.trim());
    if (i < 0) throw new Error(`snippet ${id}: '${s.from}' not found in ${s.file}`);
    const body = dedent(lines.slice(i, i + s.lines));
    out[id] = {
      file: "Source/UnrealShadows_LOTL/" + s.file,
      line: i + 1,
      code: body.join("\n").replace(/\s+$/, ""),
      codeStripped: dedent(stripComments(body)).join("\n").replace(/\s+$/, ""),
      commit: sha.slice(0, 7),
    };
  }
  fs.writeFileSync(path.join(dataDir, "snippets.json"), JSON.stringify(out, null, 1));
  console.log(`snippets: ${Object.keys(out).length}`);
}

// ---------------------------------------------------------------- automation test inventory + project facts
function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

if (want("tests")) {
  const files = [...walk(path.join(mod, "Private")), ...walk(path.join(mod, "Public"))].filter((f) => /\.(h|cpp)$/.test(f));
  const tests = [];
  let loc = 0;
  for (const f of files) {
    const txt = fs.readFileSync(f, "utf8");
    loc += txt.split("\n").length;
    const re = /IMPLEMENT_(SIMPLE|COMPLEX)_AUTOMATION_TEST\(\s*\w+\s*,\s*"([^"]+)"/g;
    let m;
    while ((m = re.exec(txt))) tests.push({ name: m[2], kind: m[1].toLowerCase(), file: path.relative(game, f).replace(/\\/g, "/") });
  }
  tests.sort((a, b) => a.name.localeCompare(b.name));
  const groups = {};
  for (const t of tests) {
    const g = t.name.split(".").slice(1, 2).join(".") || "Other";
    groups[g] = (groups[g] || 0) + 1;
  }
  fs.writeFileSync(path.join(dataDir, "tests.json"), JSON.stringify({ count: tests.length, groups, tests }, null, 1));

  const folders = fs.readdirSync(path.join(mod, "Private"), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  const perFolder = Object.fromEntries(folders.map((d) => [d, walk(path.join(mod, "Private", d)).filter((f) => /\.(h|cpp)$/.test(f)).length + (fs.existsSync(path.join(mod, "Public", d)) ? walk(path.join(mod, "Public", d)).filter((f) => /\.(h|cpp)$/.test(f)).length : 0)]));
  const project = {
    commit: git("rev-parse", "--short=7", "HEAD"),
    commitDate: git("log", "-1", "--format=%cs"),
    firstCommit: git("log", "--reverse", "--format=%cs").split("\n")[0],
    commits: Number(git("rev-list", "--count", "HEAD")),
    sourceFiles: files.length,
    sourceLines: loc,
    folders: perFolder,
    engine: JSON.parse(fs.readFileSync(path.join(game, "UnrealShadows_LOTL.uproject"), "utf8")).EngineAssociation,
    syncedAt: new Date().toISOString().slice(0, 10),
  };
  fs.writeFileSync(path.join(dataDir, "project.json"), JSON.stringify(project, null, 1));
  console.log(`tests: ${tests.length}; source files: ${files.length}, ${loc} lines; commit ${project.commit}`);
}

// ---------------------------------------------------------------- screenshots
if (want("media")) {
  const spec = JSON.parse(fs.readFileSync(path.join(here, "media.json"), "utf8"));
  const index = {};
  for (const [id, m] of Object.entries(spec)) {
    if (id.startsWith("_")) continue;
    const src = path.join(game, m.src);
    if (!fs.existsSync(src)) throw new Error(`media ${id}: missing ${m.src}`);
    const meta = await sharp(src).metadata();
    const top = Math.round((m.cropTop || 0) * meta.height);
    const bottom = Math.round((m.cropBottom || 0) * meta.height);
    const region = { left: 0, top, width: meta.width, height: meta.height - top - bottom };
    const big = await sharp(src).extract(region).resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 80 }).toFile(path.join(mediaDir, `${id}.webp`));
    await sharp(src).extract(region).resize({ width: 640 }).webp({ quality: 72 }).toFile(path.join(mediaDir, `${id}-sm.webp`));
    index[id] = { alt: m.alt, width: big.width, height: big.height, source: m.src };
  }
  fs.writeFileSync(path.join(dataDir, "media.json"), JSON.stringify(index, null, 1));
  console.log(`media: ${Object.keys(index).length} images`);
}
