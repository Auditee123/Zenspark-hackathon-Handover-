/** Agent runs, the joiner and KT-giver home pages, and the generic fallback for unknown pauses. */
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useStore } from "../state/store";
import { decideGate, submitForm } from "../runtime/client";
import { AGENT_DEFINITIONS } from "../runtime/agents.generated";
import { PAUSES, PEOPLE, STAGES, nameOf, stageOf } from "../runtime/pauses";
import type { RunView } from "../runtime/types";
import { AGENT_NAMES } from "../runtime/types";
import { Card, Field, Kpi, PageHead, Pill, fmtMs, fmtTime } from "../components/ui";
import { NoRun } from "./common";

export function AgentRuns() {
  const { runs, activity, select } = useStore();
  const navigate = useNavigate();
  const rows = [
    ...runs.map((r) => ({ id: r.id, agent: AGENT_NAMES.orch, who: nameOf(r), steps: r.trace.filter((t) => t.status === "done").length, status: r.pause ? `waiting at ${r.pause.gate}` : r.status, at: r.createdAt, ms: r.trace.reduce((n, t) => n + (t.ms ?? 0), 0), cost: r.trace.reduce((n, t) => n + (t.cost ?? 0), 0), run: r as RunView | null })),
    ...activity.map((a) => ({ id: a.id, agent: AGENT_NAMES[a.agent], who: a.label, steps: a.steps, status: a.status, at: a.createdAt, ms: 0, cost: 0, run: null })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <div className="content page">
      <PageHead eyebrow="Agent runs" title="Everything runs on AgentMesh" lead="Each row is an AgentMesh invocation on one of the three local agent hosts, with a governance check at both ends." agent="orch" />
      <div className="tbl">
        <table>
          <thead>
            <tr>
              <th>Run</th>
              <th>Agent</th>
              <th>Joiner / question</th>
              <th>Steps</th>
              <th>Status</th>
              <th>Started</th>
              <th>Time · cost</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">
                  No runs yet.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr
                key={r.id}
                className={r.run ? "click" : ""}
                onClick={() => {
                  if (r.run) {
                    select(r.run.id);
                    navigate(r.run.pause ? (PAUSES[r.run.pause.gate]?.route ?? "/") : "/analysis");
                  }
                }}
              >
                <td className="mono tiny">{r.id.slice(0, 8)}</td>
                <td className="mono small">{r.agent}</td>
                <td style={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.who}</td>
                <td className="num">{r.steps}</td>
                <td>
                  <Pill tone={r.status === "completed" ? "good" : r.status === "error" ? "bad" : r.status.startsWith("waiting") ? "human" : "info"}>{r.status}</Pill>
                </td>
                <td className="small">{fmtTime(r.at)}</td>
                <td className="small num">
                  {r.ms ? fmtMs(r.ms) : ""}
                  {r.cost ? ` · $${r.cost.toFixed(4)}` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>Agents on AgentMesh</h2>
      <div className="grid g3">
        {Object.values(AGENT_DEFINITIONS).map((d) => (
          <Card key={d.name} title={<span className="mono">{d.name}</span>} sub={`${d.nodes.length} nodes · ${d.nodes.filter((n) => n.human).length} human steps · governance ${d.governance}`}>
            <p className="small">{d.description}</p>
          </Card>
        ))}
      </div>
      <Card title="How this app talks to AgentMesh" flat>
        <p className="small mono">POST /invoke/&#123;agent&#125; · GET /invocations/&#123;id&#125; · GET /invocations/&#123;id&#125;/pending · POST /approvals/&#123;id&#125; · GET /files/&#123;path&#125;</p>
        <p className="small muted">Each agent runs as its exported AgentMesh host (ports 8001-8003); the app reaches them through one proxy per host. See agentmesh/API.md.</p>
      </Card>
    </div>
  );
}

const JOURNEY = ["Documents in", "Gap check", "KT plan", "Schedule", "KT sessions", "Assessment", "Ready"];
const stepIndex: Record<string, number> = { added: 0, docs: 0, gaps: 1, plan: 2, sched: 3, kt: 4, assess: 5, retrain: 2, ready: 6 };

export function JoinerHome() {
  const { selected: run } = useStore();
  if (!run) return <div className="content page"><PageHead eyebrow="My onboarding" title="Welcome" /><NoRun /></div>;
  const s = run.state;
  const idx = stepIndex[stageOf(run)] ?? 0;
  const gate = run.pause?.gate;
  const todo = gate === "confirm_slots" ? { text: `Confirm ${s.proposals?.length ?? ""} KT session times.`, to: "/schedule", cta: "Confirm times" } : gate === "take_assessment" ? { text: "Your assessment is ready.", to: "/assessment", cta: "Start assessment" } : gate === "kt_done" ? { text: "Your KT sessions are booked.", to: "/session", cta: "Open session room" } : null;
  return (
    <div className="content page">
      <PageHead eyebrow="My onboarding" title={`Welcome to Northwind Insurance, ${String(s.name ?? "").split(" ")[0]}`} lead="This is your personal plan to get productive on Claims Platform Modernisation. It is built from your interview feedback and only covers what you don't already know." />
      <div className="stepper" aria-label="Journey">
        {JOURNEY.map((j, i) => (
          <div key={j} className={i < idx ? "done" : i === idx ? "on" : ""}>
            <i>{i < idx ? "✓" : i + 1}</i>
            {j}
          </div>
        ))}
      </div>
      <div className="grid g3">
        <Card title="To do">
          {todo ? (
            <>
              <p className="small">{todo.text}</p>
              <Link className="btn primary sm" to={todo.to} style={{ alignSelf: "flex-start" }}>
                {todo.cta}
              </Link>
            </>
          ) : (
            <p className="small muted">Nothing to do right now. We'll let you know when something needs you.</p>
          )}
        </Card>
        <Card title="My plan">
          <p className="small">{s.plan ? `${s.plan.length} sessions · ${s.plan_hours ?? ""} hours${s.plan_approved ? " · approved by Meera Nair and the lead KT giver" : " · in review"}` : "Your plan is being prepared."}</p>
          <Link className="btn sm" to="/review" style={{ alignSelf: "flex-start" }}>
            View plan
          </Link>
        </Card>
        <Card title="Stuck?">
          <p className="small">Ask about the project, a process or who owns what. Answers come with sources.</p>
          <Link className="btn sm" to="/ask" style={{ alignSelf: "flex-start" }}>
            Ask Handover
          </Link>
        </Card>
      </div>
    </div>
  );
}

export function GiverHome() {
  const { runs, select } = useStore();
  const navigate = useNavigate();
  const mine = runs.filter((r) => r.pause && ["h3_plan_approval", "kt_done", "h1_expert_answers"].includes(r.pause.gate));
  const sessions = runs.flatMap((r) => (r.state.sessions ?? []).filter((x) => x.giver_name === PEOPLE.giver.name).map((x) => ({ r, x })));
  return (
    <div className="content page">
      <PageHead eyebrow="KT giver" title="Your KT requests" lead={`${PEOPLE.giver.name}: plans to sign off, sessions to run and notes to approve.`} />
      <div className="grid g3">
        <Kpi value={sessions.length} label="Upcoming sessions" />
        <Kpi value={mine.filter((r) => r.pause?.gate === "h1_expert_answers").length} label="Notes to approve (H1)" />
        <Kpi value={mine.filter((r) => r.pause?.gate === "h3_plan_approval").length} label="Plans awaiting your sign-off (H3)" />
      </div>
      <Card title="Waiting on you">
        {mine.length === 0 ? (
          <p className="small muted">Nothing waiting on you.</p>
        ) : (
          mine.map((r) => (
            <button
              key={r.id}
              type="button"
              className="card flat"
              style={{ textAlign: "left", cursor: "pointer", padding: 12 }}
              onClick={() => {
                select(r.id);
                navigate(PAUSES[r.pause!.gate].route);
              }}
            >
              <b className="small">{PAUSES[r.pause!.gate].text(nameOf(r), r)}</b>
            </button>
          ))
        )}
      </Card>
    </div>
  );
}

/** Any pause the UI has no screen for (a YAML change in the Builder): a form from its input_schema, or Approve/Reject. */
export function GenericPause() {
  const { selected: run, decide } = useStore();
  const [vals, setVals] = useState<Record<string, unknown>>({});
  if (!run?.pause) return <div className="content page"><PageHead eyebrow="Pause" title="Nothing is paused" /><NoRun /></div>;
  const p = run.pause;
  const props = p.input_schema?.properties ?? {};
  return (
    <div className="content page">
      <PageHead eyebrow={`Paused at ${p.gate}`} title={nameOf(run)} lead="This pause has no dedicated screen yet, so its form is built from the agent's input schema." agent="orch" />
      <Card title="Summary from the agent">
        <pre className="md">{p.summary}</pre>
      </Card>
      <Card title={p.kind === "input" ? "Your answer" : "Your decision"}>
        {p.kind === "input" ? (
          <>
            {Object.entries(props).map(([k, v]) => (
              <Field key={k} label={v.title ?? k} hint={v.description}>
                {v.type === "boolean" ? (
                  <input type="checkbox" checked={Boolean(vals[k])} onChange={(e) => setVals({ ...vals, [k]: e.target.checked })} />
                ) : (
                  <input className="input" type={v.type === "integer" || v.type === "number" ? "number" : "text"} value={String(vals[k] ?? "")} onChange={(e) => setVals({ ...vals, [k]: v.type === "integer" || v.type === "number" ? Number(e.target.value) : e.target.value })} />
                )}
              </Field>
            ))}
            <button type="button" className="btn primary" onClick={() => void decide(run.id, () => submitForm("orch", run.id, p.gate, vals, { reviewer: PEOPLE.lead.email }), "Submitted.")}>
              Submit
            </button>
          </>
        ) : (
          <div className="actions">
            <button type="button" className="btn good" onClick={() => void decide(run.id, () => decideGate("orch", run.id, p.gate, "approved", { reviewer: PEOPLE.lead.email }), "Approved.")}>
              Approve
            </button>
            <button type="button" className="btn bad" onClick={() => void decide(run.id, () => decideGate("orch", run.id, p.gate, "rejected", { reviewer: PEOPLE.lead.email }), "Rejected.")}>
              Reject
            </button>
          </div>
        )}
      </Card>
      <p className="tiny muted">Stage: {STAGES.find((s) => s.key === stageOf(run))?.label}</p>
    </div>
  );
}
