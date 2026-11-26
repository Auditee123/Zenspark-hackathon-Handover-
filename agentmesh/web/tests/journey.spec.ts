import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * The short path for one joiner, in mock mode, switching "View as" like the live demo:
 * onboard Auditee → H2 → review (move Kafka to day 2, then approve) → H3 (lead + KT giver) → joiner confirms slots →
 * KT notes → H1 (KT giver) → joiner takes the assessment → readiness. Plus the Ask chat and its privacy wall.
 */
const viewAs = (page: Page, who: "Lead" | "Joiner" | "KT giver") => page.getByRole("group", { name: "View as" }).getByRole("button", { name: who, exact: true }).click();
const nav = (page: Page, label: RegExp) => page.getByRole("navigation", { name: "Handover" }).getByRole("link", { name: label }).click();

test("mock banner is always visible", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("status").filter({ hasText: "MOCK DATA" })).toBeVisible();
});

test("one joiner, start to readiness", async ({ page }) => {
  await page.goto("/onboard");
  await page.getByRole("button", { name: "Use sample: Auditee" }).click();
  await page.getByRole("button", { name: /Save and start the agents/ }).click();

  // H2: gap findings
  await expect(page.getByRole("heading", { name: "Findings for Auditee" })).toBeVisible();
  await expect(page.getByText("Not met · 1.5")).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: /Approve findings \(H2\)/ }).click();

  // review_plan: move Kafka to day 2 (deterministic), then approve
  await nav(page, /KT plan/);
  await expect(page.getByRole("heading", { name: /Review Auditee.s plan/ })).toBeVisible({ timeout: 60_000 });
  await page.getByLabel("Move the session on").selectOption("kafka");
  await page.getByLabel("To day").selectOption("2");
  await page.getByRole("button", { name: "Apply changes" }).click();
  await expect(page.getByText(/Moved "Kafka on claims-events.*" to day 2/)).toBeVisible();
  await expect(page.getByText("Plan v2 · changes since v1")).toBeVisible();
  await page.getByRole("button", { name: /Approve plan v2/ }).click();

  // H3: two approvers
  await expect(page.getByText("Approvals (H3)")).toBeVisible();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByText("1 of 2")).toBeVisible();
  await viewAs(page, "KT giver");
  await page.getByRole("button", { name: "Approve", exact: true }).click();

  // confirm_slots: the joiner picks times
  await viewAs(page, "Joiner");
  await nav(page, /My schedule/);
  await page.getByRole("button", { name: /Confirm these times/ }).click();
  await expect(page.getByText("Booked", { exact: true }).first()).toBeVisible();

  // Reschedule loop: the KT giver can't make day 2; the agent re-proposes; the joiner picks B; everyone is re-invited
  await viewAs(page, "KT giver");
  await nav(page, /^My schedule/);
  await page.getByRole("button", { name: /Can't make it/ }).nth(1).click();
  await page.getByLabel("Reason (optional, shared with the joiner)").fill("Clashes with a release call");
  await page.getByRole("button", { name: "Ask the agent for new times" }).click();
  await viewAs(page, "Joiner");
  await nav(page, /My schedule/);
  await expect(page.getByRole("heading", { name: "Day 2: pick a new time" })).toBeVisible();
  await page.getByRole("radio", { name: /^B · / }).click();
  await page.getByRole("button", { name: "Confirm the new time" }).click();
  await expect(page.getByText("Rescheduled", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Day 2.*moved from/)).toBeVisible();

  // kt_done: notes pasted by the KT giver
  await viewAs(page, "KT giver");
  await nav(page, /^Sessions/);
  await page.getByRole("tab", { name: "Paste notes or transcript" }).click();
  await page.getByRole("button", { name: "Use sample notes (kit)" }).click();
  await page.getByRole("button", { name: /Sessions completed: send notes/ }).click();

  // H1: the KT giver answers the open question and approves the notes
  await expect(page.getByRole("heading", { name: "Approve the KT notes (H1)" })).toBeVisible();
  await page.getByRole("button", { name: "Use the runbook answer" }).click();
  await page.getByRole("button", { name: /Approve notes \(H1\)/ }).click();

  // take_assessment: the joiner answers every question
  await viewAs(page, "Joiner");
  await nav(page, /Assessment/);
  await expect(page.getByRole("heading", { name: /Question 1 of/ })).toBeVisible();
  const total = Number((await page.getByRole("heading", { name: /Question 1 of/ }).textContent())?.match(/of (\d+)/)?.[1] ?? 5);
  for (let i = 0; i < total; i++) {
    await page.getByRole("radiogroup").getByRole("radio").first().check();
    await page.getByRole("button", { name: i < total - 1 ? /Next/ : /Submit answers/ }).click();
  }

  // Readiness: either sign-off (H4) or a round-2 plan; both are real outcomes of the readiness rules
  await viewAs(page, "Lead");
  await nav(page, /Readiness/);
  await expect(page.getByRole("heading", { name: /Auditee is (ready|not ready yet)/ })).toBeVisible();
});

test("Ask: cited answer and the privacy wall", async ({ page }) => {
  await page.goto("/ask");
  await page.getByRole("button", { name: "Who approves a production release?" }).click();
  await expect(page.getByText(/Fatima Khan/)).toBeVisible();
  await expect(page.getByText("Project documents", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "What did the panel say about Auditee?" }).click();
  await expect(page.getByText("Blocked by partition rules")).toBeVisible();
});
