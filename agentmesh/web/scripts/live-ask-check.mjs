// Live UI check of Ask Handover (needs the hosts + `make web`): a normal question gets a cited answer, and an
// interview question is refused (privacy wall), with the trace pane showing privacy_check → refuse → reply.
//   node scripts/live-ask-check.mjs [base-url]
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:5180";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(`${base}/ask`);
await page.evaluate(() => localStorage.setItem("handover.trace", "open"));
await page.reload();

await page.getByRole("button", { name: "Who approves a production release?" }).click();
await page.getByText(/Fatima Khan/).first().waitFor({ timeout: 120_000 });
const cited = await page.locator(".cite").count();
const trusted = await page.getByText("Project documents", { exact: true }).count();

await page.getByRole("button", { name: /What did the panel say about/ }).click();
await page.getByText("Blocked by partition rules").waitFor({ timeout: 120_000 });
const trace = await page.locator(".tracepane").innerText();

const checks = [
  ["cited answer shown", cited > 0 && trusted > 0, `${cited} citation chips`],
  ["privacy refusal shown", true, "Blocked by partition rules"],
  ["trace shows privacy_check", trace.includes("privacy_check"), ""],
  ["trace shows refuse, no search", trace.includes("refuse") && !trace.includes("\nsearch\n"), ""],
  ["no page errors", errors.length === 0, errors.join(" | ")],
];
for (const [n, ok, d] of checks) console.log(`${ok ? "PASS" : "FAIL"}  ${n}  ${d}`);
await page.screenshot({ path: process.argv[3] ?? "/dev/null" }).catch(() => {});
await browser.close();
process.exit(checks.every(([, ok]) => ok) ? 0 : 1);
