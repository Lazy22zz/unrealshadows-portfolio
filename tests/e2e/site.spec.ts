import { expect, test, type Page } from "@playwright/test";

const ROUTES = [
  "", "systems/", "systems/predicted-portals/", "systems/interaction/", "systems/minion-alerts/", "systems/chase-fatigue/",
  "systems/gravity-rooms/", "systems/team-muster/", "systems/multiplayer-session/", "systems/rolling-shelves/",
  "levels/", "levels/time-temple/", "levels/library-maze/", "levels/coin-lock/", "levels/gravity-cube/",
  "kb/", "kb/object-lifecycle/", "kb/replication/", "kb/cmc-prediction/", "kb/automated-testing/", "engineering/",
];

async function hydrated(page: Page) {
  await page.locator(".demo").first().scrollIntoViewIfNeeded();
  await page.waitForFunction(() => [...document.querySelectorAll("astro-island")].every((i) => !i.hasAttribute("ssr")));
}

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  return errors;
}

for (const r of ROUTES) {
  test(`route /${r} renders without errors or horizontal overflow`, async ({ page }) => {
    const errors = watchErrors(page);
    const res = await page.goto(r);
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1").first()).toBeVisible();
    const vw = page.viewportSize()!.width;
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(vw + 1);
    // every internal link resolves under the base path
    const hrefs = await page.locator("a[href^='/']").evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href")!));
    for (const h of hrefs) expect(h.startsWith("/unrealshadows-portfolio/") || h.startsWith("/unrealshadows-portfolio")).toBeTruthy();
    expect(errors).toEqual([]);
  });
}

test("deep link to a section scrolls to its heading", async ({ page }) => {
  await page.goto("systems/predicted-portals/#how-it-works");
  await expect(page.locator("#how-it-works")).toBeInViewport();
});

test("library maze: winches change which shelf tops are reachable", async ({ page }) => {
  await page.goto("levels/library-maze/");
  const demo = page.locator(".demo").first();
  await hydrated(page);
  const status = demo.locator(".card .small").first();
  await expect(status).toContainText("2 shelf tops");
  await demo.getByRole("button", { name: /Turn W1/ }).click();
  await expect(status).not.toContainText("2 shelf tops");
  await demo.getByRole("tab", { name: "Floor" }).click();
  await expect(demo.locator(".card strong").first()).toHaveText("Floor regions");
  await page.screenshot({ path: `test-results/maze-${test.info().project.name}.png` });
});

test("coin lock: seized disc refuses, auto-solve finishes", async ({ page }) => {
  await page.goto("levels/coin-lock/");
  const demo = page.locator(".demo").first();
  await hydrated(page);
  await demo.getByRole("button", { name: "Disc II", exact: true }).click();
  await demo.getByRole("button", { name: "Turn selected disc clockwise" }).click();
  await expect(demo.locator("[aria-live]")).toContainText("rusted solid");
  await demo.getByRole("button", { name: "Auto-solve" }).click();
  await expect(demo.locator("[aria-live]")).toContainText("Solved in", { timeout: 15_000 });
  await page.screenshot({ path: `test-results/coin-${test.info().project.name}.png` });
});

test("time temple: route playback switches era at a junction", async ({ page }) => {
  await page.goto("levels/time-temple/");
  const demo = page.locator(".demo").first();
  await hydrated(page);
  for (let i = 0; i < 23; i++) await demo.getByRole("button", { name: "Next step" }).click();
  await expect(demo.locator(".tt-card strong")).toContainText("Junction C");
  await expect(demo.getByRole("tab", { name: /Future/ })).toHaveAttribute("aria-selected", "true");
  await page.screenshot({ path: `test-results/temple-${test.info().project.name}.png` });
});

test("gravity cube: WebGL canvas or graceful fallback", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("levels/gravity-cube/");
  const demo = page.locator(".demo").first();
  await hydrated(page);
  await expect(demo.locator("canvas, .card strong").first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1500);
  await demo.screenshot({ path: `test-results/cube-default-${test.info().project.name}.png` });
  await demo.getByRole("button", { name: /Ceiling/ }).click();
  await expect(demo.locator(".gc-info .small").first()).toContainText("library maze");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `test-results/cube-${test.info().project.name}.png` });
  expect(errors).toEqual([]);
});

test("system graph: scenarios and node details", async ({ page }) => {
  await page.goto("systems/");
  const demo = page.locator(".demo").first();
  await hydrated(page);
  await demo.getByRole("button", { name: "Pause" }).click();
  await demo.getByRole("tab", { name: "Walk through a portal" }).click();
  await expect(demo.locator(".sg-text")).toContainText("queues the claim");
  await demo.getByRole("button", { name: /Guard AI/ }).click();
  await expect(demo.locator(".card code")).toContainText("AUS_MinionAIController");
});

test("search index is built", async ({ page }) => {
  const res = await page.request.get("pagefind/pagefind-ui.js");
  expect(res.status()).toBe(200);
});
