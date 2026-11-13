import { defineConfig, devices } from "@playwright/test";

// Smoke + interaction tests against the built site. `npm run e2e` builds nothing: run `npm run build` first.
// SITE_URL=https://lazy22zz.github.io/unrealshadows-portfolio/ npm run e2e  -> test the deployed site instead.
const SITE = process.env.SITE_URL;
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  reporter: "list",
  use: {
    baseURL: SITE ?? "http://localhost:4321/unrealshadows-portfolio/",
    launchOptions: { args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
  },
  webServer: SITE ? undefined : { command: "npx astro preview --port 4321", url: "http://localhost:4321/unrealshadows-portfolio/", reuseExistingServer: true },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
});
