import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import react from "@astrojs/react";

// GitHub Pages project site: https://lazy22zz.github.io/unrealshadows-portfolio/
// Every internal link goes through import.meta.env.BASE_URL (see src/lib/url.ts).
export default defineConfig({
  site: "https://lazy22zz.github.io",
  base: "/unrealshadows-portfolio",
  trailingSlash: "ignore",
  integrations: [mdx(), react()],
  markdown: {
    shikiConfig: { theme: "github-dark-dimmed", wrap: false },
  },
  vite: { build: { chunkSizeWarningLimit: 900 } },
});
