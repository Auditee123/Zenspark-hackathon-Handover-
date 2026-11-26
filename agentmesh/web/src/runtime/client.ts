/**
 * Typed client for the AgentMesh host runtime (see agentmesh/API.md). Transport-agnostic: the same calls run
 * against the live hosts or the labelled mock.
 */
import { getTransport } from "./transport";
import type {
  AgentKey,
  DecisionBody,
  DecisionResult,
  FileRef,
  InvocationList,
  InvocationRow,
  InvokeResponse,
  OrchState,
  PendingPause,
  RunStatus,
  RunView,
  TimelineEvent,
  TraceRow,
} from "./types";
import { AGENT_NAMES } from "./types";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function detail(data: unknown): string {
  if (data && typeof data === "object" && "detail" in data) {
    const d = (data as { detail: unknown }).detail;
    return typeof d === "string" ? d : JSON.stringify(d);
  }
  return typeof data === "string" ? data.slice(0, 300) : JSON.stringify(data);
}

async function call<T>(agent: AgentKey, method: "GET" | "POST", path: string, body?: unknown): Promise<{ status: number; data: T }> {
  const t = await getTransport();
  const r = await t.request<T>(agent, method, path, body);
  if (r.status >= 400) throw new ApiError(r.status, `${AGENT_NAMES[agent]} ${method} ${path}: HTTP ${r.status} ${detail(r.data)}`);
  return r;
}

/** POST /invoke/{agent}: synchronous; resolves when the run pauses, ends or fails. */
export async function startRun<O = Record<string, unknown>>(agent: AgentKey, input: Record<string, unknown>): Promise<InvokeResponse<O>> {
  return (await call<InvokeResponse<O>>(agent, "POST", `/invoke/${AGENT_NAMES[agent]}`, { input })).data;
}

/** The name the host serves the agent under: with AGENT_NAME_PREFIX it is "<prefix>-<agent>" (GET /health). */
const serviceNames: Partial<Record<AgentKey, Promise<string>>> = {};
export function serviceName(agent: AgentKey): Promise<string> {
  serviceNames[agent] ??= call<{ agents?: string[] }>(agent, "GET", "/health")
    .then((r) => r.data.agents?.[0] ?? AGENT_NAMES[agent])
    .catch((e) => {
      delete serviceNames[agent];
      throw e;
    });
  return serviceNames[agent]!;
}

/**
 * Run a single-shot agent (handover-qa, handover-kt-session) and read its result. A completed /invoke returns only
 * {text, details, invocation_id}; the state is on GET /invocations/{id} -> latest_state (API.md).
 */
export async function runAndRead<S = Record<string, unknown>>(
  agent: AgentKey,
  input: Record<string, unknown>,
): Promise<{ ok: boolean; error: string | null; state: S; row: InvocationRow | null; integrity: Record<string, unknown> | null }> {
  const res = await startRun(agent, input);
  const id = res.output.invocation_id;
  const row = id ? await getInvocation(agent, id).catch(() => null) : null;
  const state = (row ? stateOf(row) : res.output) as S;
  return { ok: res.status !== "error", error: res.error, state, row, integrity: res.integrity };
}

export async function listInvocations(agent: AgentKey, params: { limit?: number; status?: string } = {}): Promise<InvocationList> {
  const q = new URLSearchParams({ agent: await serviceName(agent), limit: String(params.limit ?? 50) });
  if (params.status) q.set("status", params.status);
  return (await call<InvocationList>(agent, "GET", `/invocations?${q}`)).data;
}

export async function getInvocation(agent: AgentKey, id: string): Promise<InvocationRow> {
  return (await call<InvocationRow>(agent, "GET", `/invocations/${encodeURIComponent(id)}`)).data;
}

/** GET /invocations/{id}/pending, or null when the run isn't paused (404). */
export async function getPending(agent: AgentKey, id: string): Promise<PendingPause | null> {
  try {
    return (await call<PendingPause>(agent, "GET", `/invocations/${encodeURIComponent(id)}/pending`)).data;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

export async function listPending(agent: AgentKey): Promise<PendingPause[]> {
  return (await call<{ pending: PendingPause[] }>(agent, "GET", `/approvals/pending?agent=${await serviceName(agent)}`)).data.pending ?? [];
}

async function decide(agent: AgentKey, id: string, body: DecisionBody): Promise<DecisionResult> {
  // 200 = applied (run moved on); 202 = partial (n-of-m gate waits for more approvers).
  return (await call<DecisionResult>(agent, "POST", `/approvals/${encodeURIComponent(id)}`, body)).data;
}

/** Approve or reject a hitl_gate. */
export function decideGate(
  agent: AgentKey,
  id: string,
  gate: string,
  decision: "approved" | "rejected",
  opts: { notes?: string; reviewer?: string } = {},
): Promise<DecisionResult> {
  return decide(agent, id, { gate, decision, notes: opts.notes ?? "", reviewer: opts.reviewer ?? "" });
}

/** Submit (or decline) an ask_user form. */
export function submitForm(
  agent: AgentKey,
  id: string,
  gate: string,
  input: Record<string, unknown> | null,
  opts: { reviewer?: string; decline?: boolean } = {},
): Promise<DecisionResult> {
  return decide(agent, id, {
    gate,
    decision: opts.decline ? "rejected" : "submitted",
    input: opts.decline ? null : input,
    reviewer: opts.reviewer ?? "",
  });
}

export async function downloadFile(agent: AgentKey, file: FileRef): Promise<void> {
  const blob = await (await getTransport()).fileBlob(agent, file.download);
  saveBlob(blob, file.name);
}

export function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- normalising a run row into what the screens read ----------

function runStatus(s: string | undefined): RunStatus {
  if (s === "pending_hitl") return "pending_hitl";
  if (s === "completed" || s === "success") return "completed";
  if (s === "error" || s === "failed" || s === "cancelled" || s === "failed_recoverable") return "error";
  return "running";
}

/** The run's state. The exact key on GET /invocations/{id} is pinned on the first live run (API.md). */
export function stateOf(row: InvocationRow): OrchState {
  const s = row.latest_state ?? row.state ?? row.output ?? {};
  return (s && typeof s === "object" ? s : {}) as OrchState;
}

interface Routing {
  model?: string;
  cost_usd?: number;
}

export function traceOf(row: InvocationRow, state: OrchState): TraceRow[] {
  const rows: TraceRow[] = [];
  // Live hosts keep per-step timings and model choices in the state, not in the timeline (API.md).
  const durations = state._node_durations_ms ?? {};
  const routing = (state._llm_routing ?? {}) as Record<string, Routing>;
  const gov = (node: string) => durations[node] !== undefined && rows.push({ node, status: "done", ms: durations[node] });
  const gates = new Set<string>();
  gov("__input_governance__");
  for (const e of (row.timeline ?? []) as TimelineEvent[]) {
    if (e.type === "hitl_waiting" && (e.gate || e.node)) {
      gates.add(String(e.gate ?? e.node));
      rows.push({ node: String(e.gate ?? e.node), status: "hitl", at: e.timestamp });
    } else if (e.type === "hitl_decision" && (e.gate || e.node)) {
      const last = [...rows].reverse().find((r) => r.node === (e.gate ?? e.node) && r.status === "hitl");
      if (last) last.status = "done";
    } else if (e.node && (e.type === "node_completion" || e.type === "node_end" || e.type === "node")) {
      // A gate's own node_completion follows its decision; its hitl row already shows it.
      if (gates.has(e.node)) continue;
      const route = routing[e.node];
      rows.push({
        node: e.node,
        status: e.status === "error" ? "err" : e.status === "skipped" ? "skip" : "done",
        ms: typeof e.duration_ms === "number" ? e.duration_ms : durations[e.node],
        model: e.model ?? route?.model,
        cost: e.cost_usd ?? route?.cost_usd,
        at: e.timestamp,
      });
    }
  }
  if (runStatus(row.status) === "completed") gov("__output_governance__");
  if (rows.length === 0 && state._node_durations_ms) {
    for (const [node, ms] of Object.entries(state._node_durations_ms)) rows.push({ node, status: "done", ms });
  }
  if (row.current_node && runStatus(row.status) === "running") rows.push({ node: row.current_node, status: "run" });
  return rows;
}

export function toRunView(agent: AgentKey, row: InvocationRow, pause: PendingPause | null): RunView {
  const state = stateOf(row);
  return {
    id: row.invocation_id,
    agent,
    status: runStatus(row.status),
    state,
    pause,
    error: row.error ?? null,
    files: row.files_produced ?? [],
    trace: traceOf(row, state),
    createdAt: row.created_at ?? "",
    busy: false,
  };
}
