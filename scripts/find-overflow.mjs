// Debug helper: walk down from <body> to find which branch makes the page wider than a phone. node scripts/find-overflow.mjs <route>
import { chromium } from "@playwright/test";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 412, height: 900 } });
await p.goto("http://localhost:4321/unrealshadows-portfolio/" + (process.argv[2] ?? ""));
console.log(await p.evaluate(() => {
  const out = [`doc ${document.documentElement.scrollWidth}`];
  let el = document.body;
  for (let d = 0; d < 14 && el; d++) {
    const kids = [...el.children].filter((k) => getComputedStyle(k).overflowX === "visible" || k === el);
    const worst = kids.sort((a, b) => b.scrollWidth - a.scrollWidth)[0];
    if (!worst) break;
    out.push(`${worst.tagName}.${worst.className} sw=${worst.scrollWidth} cw=${worst.clientWidth}`);
    el = worst;
  }
  return out;
}));
await b.close();
