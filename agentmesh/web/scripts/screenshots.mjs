// Screenshots of the main screens at 1280 px (light + one dark): node scripts/screenshots.mjs <out-dir> [base-url]
import { chromium } from "@playwright/test";
const out = process.argv[2];
const base = process.argv[3] ?? "http://localhost:5180";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
for (const [name, path, theme] of [["01-command", "/", "light"], ["02-analysis", "/analysis", "light"], ["03-review", "/review", "light"], ["04-onboard", "/onboard", "light"], ["05-review-dark", "/review", "dark"], ["06-runs", "/runs", "light"]]) {
  await page.goto(base + path);
  await page.evaluate(([t, tr]) => { localStorage.setItem("handover.theme", t); localStorage.setItem("handover.trace", tr); }, [theme, process.env.TRACE ?? "open"]);
  await page.reload();
  await page.waitForTimeout(4500);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: false });
}
console.log("errors:", errors.slice(0, 8));
await browser.close();
