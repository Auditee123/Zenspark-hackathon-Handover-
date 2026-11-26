import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ApiError, getInvocation, getPending, listInvocations, startRun, toRunView } from "../runtime/client";
import { HostUnreachableError, RUNTIME_MODE } from "../runtime/transport";
import type { RuntimeMode } from "../runtime/transport";
import type { AgentKey, DecisionResult, InvocationRow, PlanDay, RunView, TraceRow } from "../runtime/types";
import type { Role } from "../runtime/pauses";

export type Theme = "light" | "dark";
export interface Toast {
  id: number;
  text: string;
  tone?: "good" | "bad";
}
export interface ActivityItem {
  id: string;
  agent: AgentKey;
  status: string;
  label: string;
  createdAt: string;
  steps: number;
}
export interface SideTrace {
  agent: AgentKey;
  title: string;
  rows: TraceRow[];
}

interface Ctx {
  mode: RuntimeMode;
  theme: Theme;
  setTheme: (t: Theme) => void;
  viewAs: Role;
  setViewAs: (r: Role) => void;
  lens: boolean;
  setLens: (b: boolean) => void;
  traceOpen: boolean;
  setTraceOpen: (b: boolean) => void;
  runs: RunView[];
  loaded: boolean;
  hostError: string | null;
  selected: RunView | null;
  select: (id: string | null) => void;
  starting: boolean;
  planHistory: Record<string, Record<number, PlanDay[]>>;
  activity: ActivityItem[];
  refresh: () => Promise<void>;
  startJoiner: (input: Record<string, unknown>) => Promise<{ ok: boolean; error?: string; id?: string }>;
  decide: (runId: string, call: () => Promise<DecisionResult>, okText?: string) => Promise<DecisionResult | null>;
  toasts: Toast[];
  toast: (text: string, tone?: Toast["tone"]) => void;
  sideTrace: SideTrace | null;
  setSideTrace: (t: SideTrace | null) => void;
  /** Error text per run, from /invoke or /approvals responses (the run record's own error field can be empty). */
  runErrors: Record<string, string>;
}

const StoreContext = createContext<Ctx | null>(null);

const read = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private mode: fine */
  }
};

export function errorText(e: unknown): string {
  if (e instanceof HostUnreachableError || e instanceof ApiError) return e.message;
  return e instanceof Error ? e.message : String(e);
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => (read("handover.theme") === "dark" ? "dark" : "light"));
  const [viewAs, setViewAs] = useState<Role>("lead");
  const [lens, setLens] = useState(false);
  // Open by default on wide screens; at 1280 px the canvas needs the room (one click opens it, and it is remembered).
  const [traceOpen, setTraceOpenState] = useState(() => {
    const pref = read("handover.trace");
    return pref ? pref === "open" : window.innerWidth >= 1440;
  });
  const [runs, setRuns] = useState<RunView[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [hostError, setHostError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [starting, setStarting] = useState(false);
  const [planHistory, setPlanHistory] = useState<Record<string, Record<number, PlanDay[]>>>({});
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [sideTrace, setSideTrace] = useState<SideTrace | null>(null);
  const [runErrors, setRunErrors] = useState<Record<string, string>>({});
  const knownIds = useRef<Set<string>>(new Set());
  const startingRef = useRef(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    write("handover.theme", t);
  }, []);
  const setTraceOpen = useCallback((b: boolean) => {
    setTraceOpenState(b);
    write("handover.trace", b ? "open" : "closed");
  }, []);

  const toast = useCallback((text: string, tone?: Toast["tone"]) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const list = await listInvocations("orch", { limit: 50 });
      const views = await Promise.all(
        list.invocations.map(async (row: InvocationRow) => {
          // Running and paused runs need the full record (state, timeline) and the pause details.
          const full = row.status === "running" || row.status === "pending_hitl" || !row.latest_state ? await getInvocation("orch", row.invocation_id).catch(() => row) : row;
          const pause = full.status === "pending_hitl" ? await getPending("orch", row.invocation_id).catch(() => null) : null;
          return toRunView("orch", full, pause);
        }),
      );
      setRuns(views);
      setHostError(null);
      setPlanHistory((h) => {
        let next = h;
        for (const v of views) {
          const ver = v.state.plan_version;
          if (v.state.plan && ver && !h[v.id]?.[ver]) {
            next = { ...next, [v.id]: { ...(next[v.id] ?? {}), [ver]: v.state.plan } };
          }
        }
        return next;
      });
      // A run started from this screen: select it as soon as the host lists it.
      for (const v of views) {
        if (!knownIds.current.has(v.id)) {
          knownIds.current.add(v.id);
          if (startingRef.current && v.status === "running") setSelectedId(v.id);
        }
      }
      setSelectedId((cur) => cur ?? (views.find((v) => v.status === "pending_hitl") ?? views.find((v) => v.status === "running") ?? views[0])?.id ?? null);
    } catch (e) {
      setHostError(errorText(e));
    } finally {
      setLoaded(true);
    }
    // Activity across the two helper agents (each host may be down independently).
    const side: ActivityItem[] = [];
    for (const agent of ["qa", "kt"] as AgentKey[]) {
      try {
        const l = await listInvocations(agent, { limit: 8 });
        for (const r of l.invocations) {
          const st = (r.latest_state ?? r.input ?? {}) as Record<string, unknown>;
          side.push({ id: r.invocation_id, agent, status: r.status, label: String(st.question ?? st.session_title ?? st.message ?? ""), createdAt: r.created_at ?? "", steps: r.timeline?.length ?? 0 });
        }
      } catch {
        /* that host is down; the command centre shows what it can */
      }
    }
    setActivity(side.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }, []);

  const anyActive = starting || runs.some((r) => r.status === "running") || Object.values(busy).some(Boolean);
  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), anyActive ? 1500 : 8000);
    return () => clearInterval(t);
  }, [refresh, anyActive]);

  const startJoiner = useCallback(
    async (input: Record<string, unknown>) => {
      setStarting(true);
      startingRef.current = true;
      try {
        const res = await startRun("orch", input);
        const id = res.output.invocation_id;
        if (id) {
          knownIds.current.add(id);
          setSelectedId(id);
        }
        await refresh();
        if (res.status === "error") {
          if (id) setRunErrors((m) => ({ ...m, [id]: res.error ?? "The run failed" }));
          return { ok: false, error: res.error ?? "The run failed", id };
        }
        return { ok: true, id };
      } catch (e) {
        return { ok: false, error: errorText(e) };
      } finally {
        setStarting(false);
        startingRef.current = false;
      }
    },
    [refresh],
  );

  const decide = useCallback(
    async (runId: string, call: () => Promise<DecisionResult>, okText?: string) => {
      setBusy((b) => ({ ...b, [runId]: true }));
      try {
        const r = await call();
        if (r.invocation_status === "error") {
          const msg = r.error ?? "The run failed after this decision. See the agent trace and the host log.";
          setRunErrors((m) => ({ ...m, [runId]: msg }));
          toast(msg, "bad");
        } else if (r.status === "partial") toast(`Approval recorded (${Array.isArray(r.approvals) ? r.approvals.length : r.approvals} of ${r.required}). Waiting for the next approver.`, "good");
        else if (okText) toast(okText, "good");
        await refresh();
        return r;
      } catch (e) {
        toast(errorText(e), "bad");
        await refresh();
        return null;
      } finally {
        setBusy((b) => ({ ...b, [runId]: false }));
      }
    },
    [refresh, toast],
  );

  const runsWithBusy = useMemo(() => runs.map((r) => (busy[r.id] ? { ...r, busy: true } : r)), [runs, busy]);
  const selected = runsWithBusy.find((r) => r.id === selectedId) ?? null;

  const value: Ctx = {
    mode: RUNTIME_MODE,
    theme,
    setTheme,
    viewAs,
    setViewAs,
    lens,
    setLens,
    traceOpen,
    setTraceOpen,
    runs: runsWithBusy,
    loaded,
    hostError,
    selected,
    select: setSelectedId,
    starting,
    planHistory,
    activity,
    refresh,
    startJoiner,
    decide,
    toasts,
    toast,
    sideTrace,
    setSideTrace,
    runErrors,
  };
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Ctx {
  const c = useContext(StoreContext);
  if (!c) throw new Error("useStore outside StoreProvider");
  return c;
}
