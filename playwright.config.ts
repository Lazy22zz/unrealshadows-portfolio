import { defineConfig, devices } from "@playwright/test";

// Smoke + interaction tests against the built site. `npm run e2e` builds nothing: run `npm run build` first.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  reporter: "list",
  use: {
    baseURL: "http://localhost:4321/unrealshadows-portfolio/",
    launchOptions: { args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
  },
  webServer: { command: "npx astro preview --port 4321", url: "http://localhost:4321/unrealshadows-portfolio/", reuseExistingServer: true },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
});
