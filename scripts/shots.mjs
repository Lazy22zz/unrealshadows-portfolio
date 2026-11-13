// Visual check helper: full-page screenshots of every route at desktop and phone width, plus console errors.
// Usage: node scripts/shots.mjs <outDir> [baseUrl]   (run `npm run preview` first)
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const out = process.argv[2] ?? "shots";
const base = process.argv[3] ?? "http://localhost:4321/unrealshadows-portfolio";
const only = process.argv.slice(4);
const routes = ["/", "/systems/", "/systems/predicted-portals/", "/levels/", "/levels/time-temple/", "/levels/library-maze/",
  "/levels/coin-lock/", "/levels/gravity-cube/", "/kb/", "/kb/replication/", "/engineering/"];
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
for (const [label, vp] of [["desk", { width: 1440, height: 900 }], ["phone", { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1 });
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  for (const r of routes) {
    if (only.length && !only.includes(r)) continue;
    await page.goto(base + r, { waitUntil: "networkidle" });
    // scroll through so client:visible islands hydrate
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } window.scrollTo(0, 0); });
    await page.evaluate(async () => { document.querySelectorAll('img[loading=lazy]').forEach((i) => (i.loading = 'eager')); await Promise.all([...document.images].map((i) => i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; }))); });
    await page.waitForTimeout(800);
    const name = `${label}-${r.replace(/\//g, "_") || "home"}.png`;
    await page.screenshot({ path: path.join(out, name), fullPage: true });
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    if (w > vp.width + 1) errors.push(`${r}: horizontal overflow ${w}px at ${vp.width}px`);
  }
  if (errors.length) console.log(label, "ERRORS:\n  " + [...new Set(errors)].join("\n  "));
  await page.close();
}
await browser.close();
console.log("done");
