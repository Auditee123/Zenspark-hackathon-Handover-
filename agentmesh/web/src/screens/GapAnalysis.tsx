import { useState } from "react";
import { Check, X } from "lucide-react";
import { useStore } from "../state/store";
import { decideGate } from "../runtime/client";
import { PEOPLE, nameOf } from "../runtime/pauses";
import type { Gap } from "../runtime/types";
import { Card, Drawer, Field, Kpi, Note, PageHead, Pill, Tabs, Who } from "../components/ui";
import { Bullet, GapRow, Heatmap, confTone, verdictTone } from "../components/viz";
import { NoRun, RunStatus, WaitingFor, canAct } from "./common";

/** gap_explanation comes back as Markdown with a table first; show the prose part. */
function explanationLines(md?: string): string[] {
  if (!md) return [];
  return md
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("|") && !/^H2:/.test(l))
    .map((l) => l.replace(/^[-*]\s*/, "").replace(/\*\*/g, ""));
}

export default function GapAnalysis() {
  const { selected: run, runs, viewAs, decide } = useStore();
  const [tab, setTab] = useState<"one" | "cohort">("one");
  const [open, setOpen] = useState<Gap | null>(null);
  const [notes, setNotes] = useState("");
  if (!run) return <div className="content page"><PageHead eyebrow="Step 2 · Gap analysis" title="Findings per joiner" agent="orch" /><NoRun what="the gap analysis" /></div>;

  const s = run.state;
  const gaps = s.gaps ?? [];
  const atH2 = run.pause?.gate === "h2_gap_approval";
  const act = canAct(run, ["h2_gap_approval"], viewAs);
  const approved = Boolean(s.gaps_approved) || (Boolean(gaps.length) && !atH2 && run.status !== "running");
  const cohort = runs.filter((r) => r.state.gaps?.length).map((r) => ({ name: nameOf(r), gaps: r.state.gaps! }));
  const lines = explanationLines(String(s.gap_explanation ?? ""));
  const sendH2 = (decision: "approved" | "rejected") =>
    decide(run.id, () => decideGate("orch", run.id, "h2_gap_approval", decision, { notes, reviewer: PEOPLE.lead.email }), decision === "approved" ? "Findings approved. The KT plan agent is drafting the plan." : "Findings rejected. The run ends.");

  return (
    <div className="content page">
      <PageHead
        eyebrow="Step 2 · Gap analysis"
        title={`Findings for ${nameOf(run)}`}
        lead="The engine weighs the resume and the three interview panels against the role profile (resume 10%, L1 20%, L2 35%, L3 35%). Open any skill to see the evidence behind its score."
        agent="orch"
        actions={approved ? <Pill tone="good">H2 approved</Pill> : atH2 ? <Pill tone="human">Waiting for H2</Pill> : undefined}
      />
      <RunStatus run={run} />
      <Tabs value={tab} onChange={setTab} items={[{ key: "one", label: "One joiner" }, { key: "cohort", label: "Whole cohort" }]} />

      {tab === "cohort" ? (
        <Card title="Java backend engineers · gap heatmap" sub="Cell = gap to the required level (0 = met). * = critical skill.">
          {cohort.length ? <Heatmap rows={cohort} /> : <p className="small muted">No joiner has been analysed yet.</p>}
        </Card>
      ) : gaps.length === 0 ? (
        <Card>
          <p className="muted">{run.status === "running" ? "The gap analysis appears here as soon as the score_gaps step finishes." : "No gap analysis for this run."}</p>
        </Card>
      ) : (
        <>
          <Card flat>
            <div className="row between">
              <Who name={nameOf(run)} sub={`Java backend engineer · start ${s.start_date ?? ""}`} />
              <span className="small muted">Weights: resume 10% · L1 20% · L2 35% · L3 35%</span>
            </div>
          </Card>
          <div className="grid g4">
            <Kpi value={gaps.filter((g) => g.verdict === "Met").length} label="Skills met" tone="good" />
            <Kpi value={gaps.filter((g) => g.verdict === "Partial").length} label="Partial gaps" />
            <Kpi value={gaps.filter((g) => g.verdict === "Not met").length} label="Not met" tone="bad" />
            <Kpi value={s.critical_gap_count ?? gaps.filter((g) => g.gap > 0 && g.critical).length} label="Critical skills with a gap" />
          </div>
          <div className="split">
            <Card title="Skill by skill" sub="Bar = current level · black marker = level the role needs · open a skill for its evidence">
              <div>
                {gaps.map((g) => (
                  <GapRow key={g.skill_id} g={g} onOpen={() => setOpen(g)} />
                ))}
              </div>
            </Card>
            <div className="stack" style={{ gap: 16 }}>
              <Card title="What the engine found" sub="explain_gaps · AI summary of the evidence">
                {lines.length ? (
                  <div className="stack">
                    {lines.slice(0, 5).map((l, i) => (
                      <p key={i} className="small" style={{ borderLeft: "2px solid var(--accent)", paddingLeft: 10 }}>
                        {l}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="small muted">No summary yet.</p>
                )}
              </Card>
              <Card title={approved ? "Findings approved" : "Your approval (H2)"}>
                {act ? (
                  <>
                    <p className="small">Approving starts the KT plan agent. Rejecting ends this run.</p>
                    <Field label="Notes (optional, kept in the audit trail)">
                      <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
                    </Field>
                    <div className="actions">
                      <button type="button" className="btn good" onClick={() => void sendH2("approved")}>
                        <Check size={15} aria-hidden="true" /> Approve findings (H2)
                      </button>
                      <button type="button" className="btn bad" onClick={() => void sendH2("rejected")}>
                        <X size={15} aria-hidden="true" /> Reject
                      </button>
                    </div>
                  </>
                ) : atH2 ? (
                  <WaitingFor run={run} who="lead" />
                ) : approved ? (
                  <Note tone="good">Approved. The plan is on the KT plan screen.</Note>
                ) : (
                  <p className="small muted">Available when the run pauses at H2.</p>
                )}
              </Card>
            </div>
          </div>
        </>
      )}

      {open && (
        <Drawer title={open.skill} onClose={() => setOpen(null)}>
          <Bullet cur={open.current} req={open.required} />
          <div className="row" style={{ marginTop: 14 }}>
            <Pill tone={verdictTone(open.verdict)}>{open.verdict}</Pill>
            <Pill>
              Current {open.current} · required {open.required}
            </Pill>
            <Pill tone={confTone(open.confidence)}>{open.confidence} confidence</Pill>
            <Pill>{open.source}</Pill>
          </div>
          <h3>Ratings by source</h3>
          <div className="tbl">
            <table>
              <tbody>
                {(["resume", "l1", "l2", "l3"] as const).map((k) => (
                  <tr key={k}>
                    <td>{k === "resume" ? "Resume" : `${k.toUpperCase()} interview`}</td>
                    <td className="num">{open.ratings?.[k] ?? "—"}/5</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>Evidence</h3>
          {open.quotes?.length ? open.quotes.map((q) => <div key={q} className="quote">{q}</div>) : <p className="small muted">No quotes extracted.</p>}
          <p className="tiny muted">Current level = weighted average of the sources above, rounded to the nearest 0.5. Quotes come from the masked documents.</p>
        </Drawer>
      )}
    </div>
  );
}
