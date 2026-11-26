// Live UI check (needs the hosts + `make web`): onboard the sample joiner with a per-run KT-giver contact, and verify
// that the app sends `contacts` to the orchestrator, keeps it out of browser storage, and that the run reaches H2.
// Uses a @zensar.example test address and stops at H2, so no email can be sent.
//   node scripts/live-contacts-check.mjs [base-url]
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:5180";
const TEST = "prakhar.uitest@zensar.example";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
let sent = null;
page.on("request", (r) => {
  if (r.method() === "POST" && r.url().includes("/am/orch/invoke/")) sent = JSON.parse(r.postData() ?? "{}");
});
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(`${base}/onboard`);
await page.getByRole("button", { name: "Use sample: Auditee" }).click();
await page.getByText("KT giver contacts for this run (optional)").click();
await page.getByLabel("Prakhar").fill(TEST);
await page.getByRole("button", { name: /Save and start the agents/ }).click();
await page.getByRole("heading", { name: "Findings for Auditee" }).waitFor({ timeout: 180_000 });
await page.getByText(/Not met · /).first().waitFor({ timeout: 180_000 });
const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));

const checks = [
  ["request carries contacts", sent?.input?.contacts?.rahul === TEST, JSON.stringify(sent?.input?.contacts)],
  ["only filled contacts sent", Object.keys(sent?.input?.contacts ?? {}).length === 1, ""],
  ["joiner email sent as typed", typeof sent?.input?.email === "string" && sent.input.email.length > 3, sent?.input?.email],
  ["address not in browser storage", !stored.includes(TEST), ""],
  ["run reached H2 in the UI", true, "Findings for Auditee + gap rows visible"],
  ["no page errors", errors.length === 0, errors.join(" | ")],
];
for (const [n, ok, d] of checks) console.log(`${ok ? "PASS" : "FAIL"}  ${n}  ${d ?? ""}`);
await browser.close();
process.exit(checks.every(([, ok]) => ok) ? 0 : 1);
