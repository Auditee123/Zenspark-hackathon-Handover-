import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowUpRight, UserPlus } from "lucide-react";
import { useStore } from "../state/store";
import { PAUSES, STAGES, nameOf, stageOf } from "../runtime/pauses";
import type { StageKey } from "../runtime/pauses";
import type { RunView } from "../runtime/types";
import { Card, Empty, ErrorState, Kpi, Loading, PageHead, Pill, Progress, Seg, Who, fmtTime } from "../components/ui";
import type { Tone } from "../components/ui";

function nextStep(r: RunView): { text: string; tone: Tone; edge: "act" | "wait" | "ok" } {
  if (r.status === "error") return { text: "Run failed: see trace", tone: "bad", edge: "act" };
  if (r.status === "running") return { text: "Agents working", tone: "info", edge: "ok" };
  if (r.status === "completed") return r.state.ready ? { text: "Certified ready", tone: "good", edge: "ok" } : { text: String(r.state.outcome ?? "Finished"), tone: "", edge: "ok" };
  const p = r.pause ? PAUSES[r.pause.gate] : undefined;
  if (!p) return { text: `Waiting at ${r.pause?.gate}`, tone: "warn", edge: "wait" };
  const lead = p.role === "lead";
  return { text: p.text(nameOf(r), r), tone: lead ? "bad" : "warn", edge: lead ? "act" : "wait" };
}

function readiness(r: RunView): { value: number; label: string } {
  if (typeof r.state.overall === "number") return { value: r.state.overall, label: `Assessment score ${r.state.overall}%` };
  const gaps = r.state.gaps ?? [];
  const req = gaps.reduce((n, g) => n + g.required, 0);
  const have = gaps.reduce((n, g) => n + Math.min(g.required, g.current), 0);
  const v = req ? Math.round((100 * have) / req) : 0;
  return { value: v, label: req ? `Readiness estimate ${v}%` : "Not analysed yet" };
}

export default function CommandCentre() {
  const { runs, loaded, hostError, refresh, activity, select } = useStore();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<StageKey | null>(null);
  const [view, setView] = useState<"board" | "table">("board");
  const byStage = useMemo(() => {
    const m: Record<string, RunView[]> = {};
    for (const r of runs) (m[stageOf(r)] ??= []).push(r);
    return m;
  }, [runs]);
  const actions = runs.filter((r) => r.pause && PAUSES[r.pause.gate]?.role === "lead");
  const shown = filter ? (byStage[filter] ?? []) : runs;
  const open = (r: RunView) => {
    select(r.id);
    navigate(r.pause ? (PAUSES[r.pause.gate]?.route ?? "/runs") : r.state.gaps ? "/analysis" : "/runs");
  };

  return (
    <div className="content page">
      <PageHead
        eyebrow="Command centre"
        title="Good morning, Meera"
        lead="Every new joiner on Claims Platform Modernisation, where they are, and what needs you. Agents do the work in between; you approve at four points."
        agent="orch"
        actions={
          <>
            <Link className="btn" to="/ask">
              Ask Handover
            </Link>
            <Link className="btn primary" to="/onboard">
              <UserPlus size={15} aria-hidden="true" /> Onboard joiners
            </Link>
          </>
        }
      />
      {hostError && <ErrorState title="Can't load joiners from the orchestrator" error={hostError} onRetry={() => void refresh()} />}
      {!loaded ? (
        <Card>
          <Loading />
        </Card>
      ) : (
        <>
          <div className="grid g5">
            <Kpi value={runs.filter((r) => !(r.status === "completed" && r.state.ready)).length} label="Joiners in flight" />
            <Kpi value={actions.length} label="Waiting on you" tone={actions.length ? "bad" : undefined} />
            <Kpi value={runs.reduce((n, r) => n + (r.state.sessions_booked ?? 0), 0)} label="KT sessions booked" />
            <Kpi value={runs.filter((r) => r.state.ready).length} label="Certified ready" tone="good" />
            <Kpi value={runs.filter((r) => (r.state.round ?? 1) > 1).length} label="Sent to round 2" />
          </div>

          <div className="pipe" role="group" aria-label="Pipeline stages">
            {STAGES.map((s) => (
              <button key={s.key} type="button" className={`st${filter === s.key ? " on" : ""}`} onClick={() => setFilter(filter === s.key ? null : s.key)} aria-pressed={filter === s.key}>
                <b>{byStage[s.key]?.length ?? 0}</b>
                <span>{s.label}</span>
                <span className="faint">{s.sub}</span>
              </button>
            ))}
          </div>

          <div className="split">
            <Card
              title={`Joiners${filter ? ` · ${STAGES.find((s) => s.key === filter)?.label}` : ""}`}
              actions={
                <>
                  {filter && (
                    <button type="button" className="btn sm ghost" onClick={() => setFilter(null)}>
                      Clear filter
                    </button>
                  )}
                  <Seg label="Layout" value={view} onChange={setView} items={[{ key: "board", label: "Board" }, { key: "table", label: "Table" }]} />
                </>
              }
            >
              {shown.length === 0 ? (
                <Empty
                  title={runs.length ? "No joiners at this stage." : "No joiners yet"}
                  action={
                    runs.length ? (
                      <button type="button" className="btn sm" onClick={() => setFilter(null)}>
                        Show all
                      </button>
                    ) : (
                      <Link className="btn primary sm" to="/onboard">
                        Onboard a joiner
                      </Link>
                    )
                  }
                />
              ) : view === "board" ? (
                <div className="board">
                  {STAGES.filter((s) => byStage[s.key]?.length && (!filter || filter === s.key)).map((s) => (
                    <div key={s.key} className="col">
                      <h4>
                        <span>{s.label}</span>
                        <span>{byStage[s.key].length}</span>
                      </h4>
                      {byStage[s.key].map((r) => {
                        const n = nextStep(r);
                        const rd = readiness(r);
                        return (
                          <button key={r.id} type="button" className={`kcard ${n.edge}`} style={{ textAlign: "left" }} onClick={() => open(r)}>
                            <Who name={nameOf(r)} sub={`Java backend · round ${r.state.round ?? 1}`} />
                            <span className="small">{n.text}</span>
                            <Progress value={rd.value} tone={r.state.ready ? "good" : undefined} />
                            <span className="tiny muted">{rd.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="tbl">
                  <table>
                    <thead>
                      <tr>
                        <th>Joiner</th>
                        <th>Stage</th>
                        <th>Next step</th>
                        <th>Readiness</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((r) => {
                        const n = nextStep(r);
                        const st = STAGES.find((s) => s.key === stageOf(r));
                        return (
                          <tr key={r.id} className="click" onClick={() => open(r)}>
                            <td>
                              <button type="button" className="btn ghost sm" style={{ padding: 0, color: "var(--fg)" }} onClick={() => open(r)}>
                                <b>{nameOf(r)}</b>
                              </button>
                            </td>
                            <td>
                              <Pill tone={(st?.tone ?? "") as Tone}>{st?.label}</Pill>
                            </td>
                            <td>
                              <Pill tone={n.tone}>{n.text}</Pill>
                            </td>
                            <td className="num">{readiness(r).value}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="tiny muted">Card edge: red = you act next · amber = waiting on someone else · green = on track.</p>
            </Card>

            <div className="stack" style={{ gap: 16 }}>
              <Card title="Needs your action" actions={<Pill tone="human">{actions.length}</Pill>}>
                {actions.length === 0 ? (
                  <p className="small muted">Nothing is waiting on you. Onboard a joiner to start.</p>
                ) : (
                  <div className="stack">
                    {actions.slice(0, 6).map((r) => (
                      <button key={r.id} type="button" className="card flat" style={{ textAlign: "left", cursor: "pointer", padding: 12 }} onClick={() => open(r)}>
                        <div className="row between">
                          <b className="small">{PAUSES[r.pause!.gate]?.text(nameOf(r), r)}</b>
                          <Pill tone="human">{PAUSES[r.pause!.gate]?.tag}</Pill>
                        </div>
                        <span className="tiny muted">Waiting since {fmtTime(r.pause?.waiting_since ?? undefined) || "now"}</span>
                      </button>
                    ))}
                  </div>
                )}
              </Card>
              <Card
                title="Agent activity"
                actions={
                  <Link className="btn ghost sm" to="/runs">
                    All runs <ArrowUpRight size={13} aria-hidden="true" />
                  </Link>
                }
              >
                {runs.length + activity.length === 0 ? (
                  <p className="small muted">No agent runs yet.</p>
                ) : (
                  <div className="stack">
                    {[
                      ...runs.slice(0, 4).map((r) => ({ id: r.id, agent: "handover-orchestrator", label: nameOf(r), steps: r.trace.filter((t) => t.status === "done").length, status: r.status })),
                      ...activity.slice(0, 4).map((a) => ({ id: a.id, agent: a.agent === "qa" ? "handover-qa" : "handover-kt-session", label: a.label, steps: a.steps, status: a.status })),
                    ].map((a) => (
                      <div key={a.id} className="row between">
                        <div className="stack" style={{ gap: 0, minWidth: 0 }}>
                          <span className="mono small">{a.agent}</span>
                          <span className="tiny muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 260 }}>
                            {a.label} · {a.steps} steps
                          </span>
                        </div>
                        <Pill tone={a.status === "completed" ? "good" : a.status === "pending_hitl" ? "human" : a.status === "error" ? "bad" : "info"}>
                          {a.status === "pending_hitl" ? "Waiting for a person" : a.status === "completed" ? "Completed" : a.status === "error" ? "Failed" : "Running"}
                        </Pill>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
