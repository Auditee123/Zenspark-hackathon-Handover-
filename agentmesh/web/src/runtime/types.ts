/**
 * Types for the AgentMesh host runtime contract (agentmesh/API.md) and the Handover agents' state.
 * State shapes come from the orchestrator definition's own code steps (score_gaps, draft_plan, apply_review,
 * pick_slots, book_sessions, grade_mcq, score_assessment) and its AI steps' output schemas.
 */

export type AgentKey = "orch" | "qa" | "kt";

export const AGENT_NAMES: Record<AgentKey, string> = {
  orch: "handover-orchestrator",
  qa: "handover-qa",
  kt: "handover-kt-session",
};

// ---------- definitions (generated) ----------
export interface NodeSummary {
  id: string;
  type: string;
  description: string;
  model?: string;
  tool?: string;
  human?: boolean;
}
export interface AgentDefinitionSummary {
  name: string;
  description: string;
  governance: string;
  nodes: NodeSummary[];
  edges: { from: string; to: string; conditional?: boolean }[];
}

// ---------- host API ----------
export type InvokeStatus = "success" | "error" | "pending_hitl";

export interface FileRef {
  name: string;
  size: number;
  content_type: string;
  path: string;
  download: string;
}

export interface InvokeResponse<O = Record<string, unknown>> {
  agent_name: string;
  status: InvokeStatus;
  output: O & { invocation_id?: string; invocation_status?: string };
  error: string | null;
  integrity: Record<string, unknown> | null;
  files_produced: FileRef[];
}

/** A run row as GET /invocations and GET /invocations/{id} return it. Keys beyond these are not yet pinned. */
export interface InvocationRow {
  invocation_id: string;
  agent?: string;
  status: string;
  created_at?: string;
  updated_at?: string;
  current_node?: string | null;
  timeline?: TimelineEvent[];
  latest_state?: Record<string, unknown> | null;
  state?: Record<string, unknown> | null;
  output?: Record<string, unknown> | null;
  input?: Record<string, unknown> | null;
  error?: string | null;
  files_produced?: FileRef[];
  [k: string]: unknown;
}

export interface TimelineEvent {
  type: string;
  node?: string;
  gate?: string;
  status?: string;
  duration_ms?: number;
  model?: string;
  cost_usd?: number;
  decision?: string;
  reviewer?: string;
  notes?: string;
  timestamp?: string;
  [k: string]: unknown;
}

export interface InvocationList {
  invocations: InvocationRow[];
  total: number;
  limit: number;
  offset: number;
}

export interface JsonSchemaProp {
  type?: string;
  title?: string;
  description?: string;
}
export interface InputSchema {
  type?: string;
  required?: string[];
  properties?: Record<string, JsonSchemaProp>;
}

export interface PendingPause {
  gate: string;
  node: string;
  kind: "gate" | "input";
  summary: string;
  agent: string;
  invocation_id: string;
  input_schema?: InputSchema;
  policy?: { min_approvals?: number; approvers?: string[]; [k: string]: unknown };
  progress?: { approvals?: number; required?: number; reviewers?: string[]; [k: string]: unknown } | null;
  waiting_since?: string | null;
  due_at?: string | null;
  created_at?: string;
  [k: string]: unknown;
}

export interface DecisionBody {
  gate?: string;
  decision: "approved" | "rejected" | "submitted";
  notes?: string;
  reviewer?: string;
  input?: Record<string, unknown> | null;
  plan_revision?: number | null;
}

export interface DecisionResult {
  status: "ok" | "partial";
  invocation_id: string;
  decision: string;
  reviewer?: string;
  approvals?: number | unknown[];
  required?: number;
  invocation_status: string;
  pending?: unknown;
  error?: string | null;
}

// ---------- orchestrator domain ----------
export interface RoleSkill {
  skill_id: string;
  skill_name: string;
  required_level: number;
  critical: boolean | string;
  topic?: string;
}

export interface Gap {
  skill_id: string;
  skill: string;
  required: number;
  current: number;
  gap: number;
  critical: boolean;
  verdict: "Met" | "Partial" | "Not met";
  confidence: "High" | "Medium" | "Low";
  source: string;
  ratings: { resume: number | null; l1: number | null; l2: number | null; l3: number | null };
  quotes: string[];
}

export interface PlanDay {
  day: number;
  title: string;
  skills: string[];
  minutes: number;
  why: string;
  format: string;
  giver_id: string;
  giver_name: string;
  giver_email?: string;
  docs: string[];
}

export interface SlotOption {
  code: string;
  start: string;
  end: string;
}
export interface Proposal {
  day: number;
  date: string;
  title: string;
  minutes: number;
  giver_name: string;
  giver_email?: string;
  options: SlotOption[];
}
export interface Session {
  day: number;
  date: string;
  start: string;
  end: string;
  title: string;
  giver_name: string;
  status: string;
}
export interface Question {
  qid: string;
  skill_id: string;
  question: string;
  options: string[];
  correct?: string;
}
export interface Grading {
  qid: string;
  skill_id: string;
  given: string;
  expected: string;
  correct: boolean;
}
export interface Giver {
  giver_id: string;
  name: string;
  email?: string;
  skills?: string;
}

/** The orchestrator's state as far as the UI reads it (every field optional: it fills in as the run goes). */
export interface OrchState {
  mode?: string;
  candidate_id?: string;
  name?: string;
  email?: string;
  role_id?: string;
  start_date?: string;
  round?: number;
  role_skills?: RoleSkill[];
  givers?: Giver[];
  gaps?: Gap[];
  gap_count?: number;
  critical_gap_count?: number;
  gap_table?: string;
  gap_explanation?: string;
  gaps_approved?: boolean;
  plan?: PlanDay[];
  plan_days?: number;
  plan_hours?: number;
  plan_version?: number;
  plan_table?: string;
  change_summary?: string;
  plan_approved?: boolean;
  proposals?: Proposal[];
  proposal_text?: string;
  sessions?: Session[];
  sessions_table?: string;
  sessions_booked?: number;
  ics_text?: string;
  key_points?: string[];
  open_questions?: string[];
  questions?: Question[];
  questions_text?: string;
  grading?: Grading[];
  scores?: Record<string, number>;
  overall?: number;
  ready?: boolean;
  weak_skills?: string[];
  outcome?: string;
  score_table?: string;
  certificate_md?: string;
  /** search_project (knowledge.search_multi, since the 26 Nov v3 export): a list of hits, not a string. */
  project_context?: { id?: string; score?: number; text?: string; metadata?: Record<string, unknown> }[];
  stored_resume?: Record<string, unknown>;
  stored_l1?: Record<string, unknown>;
  stored_l2?: Record<string, unknown>;
  stored_l3?: Record<string, unknown>;
  _node_durations_ms?: Record<string, number>;
  _llm_routing?: Record<string, { model?: string; cost_usd?: number; provider?: string; tier?: string }>;
  [k: string]: unknown;
}

export interface QaOutput {
  question?: string;
  answer?: string;
  trust?: string;
  citations?: string[];
  grounded?: { verdict?: string; faithfulness?: number; confidence?: number; [k: string]: unknown };
}

export interface KtOutput {
  reply?: string;
  citations?: string[];
  open_question?: string;
  notes?: string;
}

// ---------- UI-side view of a run ----------
export type TraceStatus = "done" | "run" | "hitl" | "err" | "skip";
export interface TraceRow {
  node: string;
  status: TraceStatus;
  ms?: number;
  model?: string;
  cost?: number;
  at?: string;
}

export type RunStatus = "running" | "pending_hitl" | "completed" | "error";

export interface RunView {
  id: string;
  agent: AgentKey;
  status: RunStatus;
  state: OrchState;
  pause: PendingPause | null;
  error: string | null;
  files: FileRef[];
  trace: TraceRow[];
  createdAt: string;
  busy: boolean;
}
