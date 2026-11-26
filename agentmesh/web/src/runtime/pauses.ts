import type { RunView } from "./types";

export type Role = "lead" | "joiner" | "giver";

export type StageKey = "added" | "docs" | "gaps" | "plan" | "sched" | "kt" | "assess" | "retrain" | "ready";

/** The prototype's nine pipeline stages. */
export const STAGES: { key: StageKey; label: string; sub: string; tone: string }[] = [
  { key: "added", label: "Added", sub: "Joiner created", tone: "" },
  { key: "docs", label: "Knowledge base", sub: "Docs indexing", tone: "info" },
  { key: "gaps", label: "Gap review", sub: "H2 · lead approves", tone: "human" },
  { key: "plan", label: "Plan review", sub: "H3 · lead + expert", tone: "human" },
  { key: "sched", label: "Scheduling", sub: "Joiner confirms", tone: "warn" },
  { key: "kt", label: "In KT", sub: "Agent-assisted", tone: "agent" },
  { key: "assess", label: "Assessment", sub: "Scored per skill", tone: "info" },
  { key: "retrain", label: "Round 2", sub: "Targeted KT", tone: "bad" },
  { key: "ready", label: "Ready", sub: "H4 signed off", tone: "good" },
];

export interface PauseInfo {
  /** Route of the screen that handles this pause. */
  route: string;
  /** Who acts on it. */
  role: Role;
  /** Short label for inbox pills. */
  tag: string;
  stage: StageKey;
  /** Inbox text. */
  text: (name: string, run: RunView) => string;
}

/** Every orchestrator pause and the screen that handles it. Unknown pauses fall back to GenericPause. */
export const PAUSES: Record<string, PauseInfo> = {
  h2_gap_approval: { route: "/analysis", role: "lead", tag: "H2", stage: "gaps", text: (n) => `Approve gap findings for ${n}` },
  review_plan: { route: "/review", role: "lead", tag: "Review", stage: "plan", text: (n, r) => `Review KT plan v${r.state.plan_version ?? 1} for ${n}` },
  h3_plan_approval: { route: "/review", role: "lead", tag: "H3", stage: "plan", text: (n, r) => `Approve KT plan v${r.state.plan_version ?? 1} for ${n} (2 approvers)` },
  confirm_slots: { route: "/schedule", role: "joiner", tag: "Confirm", stage: "sched", text: (n) => `${n} picks KT session times` },
  kt_done: { route: "/session", role: "giver", tag: "KT", stage: "kt", text: (n) => `Run KT sessions with ${n} and save the notes` },
  confirm_reschedule: { route: "/schedule", role: "joiner", tag: "New time", stage: "kt", text: (n, r) => `${n} picks a new time for KT day ${r.state.reproposal?.day ?? "?"}` },
  h1_expert_answers: { route: "/session", role: "giver", tag: "H1", stage: "kt", text: (n) => `Notes from ${n}'s KT need the KT giver's approval` },
  take_assessment: { route: "/assessment", role: "joiner", tag: "Test", stage: "assess", text: (n) => `${n} takes the readiness assessment` },
  h4_signoff: { route: "/readiness", role: "lead", tag: "H4", stage: "assess", text: (n) => `Readiness decision for ${n}` },
};

export const ROLE_LABEL: Record<Role, string> = { lead: "Transition lead", joiner: "Joiner", giver: "KT giver" };

/** Synthetic personas (from the prototype). */
export const PEOPLE = {
  lead: { name: "Ricky", title: "Transition lead · Zensar", email: "ricky@zensar.example" },
  giver: { name: "Prakhar", title: "KT giver · Integration", email: "prakhar@zensar.example" },
};

export function stageOf(run: RunView): StageKey {
  const s = run.state;
  if (run.status === "completed" && s.ready) return "ready";
  if ((s.round ?? 1) > 1 && run.pause && ["review_plan", "h3_plan_approval", "confirm_slots", "kt_done", "h1_expert_answers"].includes(run.pause.gate)) return "retrain";
  if (run.pause) return PAUSES[run.pause.gate]?.stage ?? "added";
  if (run.status === "running" || run.status === "error") {
    if (s.gaps) return s.plan ? "plan" : "gaps";
    return "docs";
  }
  return "added";
}

export function nameOf(run: RunView): string {
  return String(run.state.name ?? run.state.candidate_id ?? run.id);
}
