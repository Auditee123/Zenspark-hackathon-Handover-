import { Check, Download, Printer } from "lucide-react";
import { Link } from "react-router-dom";
import { useStore } from "../state/store";
import { decideGate, downloadFile } from "../runtime/client";
import { PEOPLE, nameOf } from "../runtime/pauses";
import { Card, Kpi, Note, PageHead, Pill } from "../components/ui";
import { GapRow } from "../components/viz";
import { NoRun, RunStatus, WaitingFor, canAct } from "./common";

export default function Readiness() {
  const { selected: run, viewAs, decide, toast } = useStore();
  if (!run) return <div className="content page"><PageHead eyebrow="Step 7 · Readiness" title="Readiness" agent="orch" /><NoRun what="the readiness decision" /></div>;

  const s = run.state;
  const scores = s.scores ?? {};
  const atH4 = run.pause?.gate === "h4_signoff";
  const done = run.status === "completed" && s.ready;
  const crit = (s.role_skills ?? []).filter((r) => r.critical === true || r.critical === "true").map((r) => r.skill_id);
  const critOk = crit.filter((c) => (scores[c] ?? 0) >= 60).length;
  const cert = run.files.find((f) => f.name.includes("certificate"));
  const skillName = (id: string) => s.role_skills?.find((r) => r.skill_id === id)?.skill_name ?? id;

  return (
    <div className="content page">
      <PageHead
        eyebrow="Step 7 · Readiness"
        title={s.overall === undefined ? "Readiness" : s.ready ? `${nameOf(run)} is ready` : `${nameOf(run)} is not ready yet`}
        lead="Every rule is checked in code: overall 70% and at least 60% on each critical skill. A pass goes to the transition lead for sign-off (H4); a fail sends only the weak skills back as a short round-2 plan."
        agent="orch"
      />
      <RunStatus run={run} />
      {s.overall === undefined ? (
        <Card>
          <p className="muted">Readiness is decided after the assessment is graded.</p>
        </Card>
      ) : (
        <>
          <div className="grid g3">
            <Kpi value={`${s.overall}%`} label="Overall · pass mark 70%" tone={s.overall >= 70 ? "good" : "bad"} />
            <Kpi value={`${critOk}/${crit.length || "–"}`} label="Critical skills at 60% or more" />
            <Kpi value={s.round ?? 1} label="Rounds of KT so far (limit 3)" />
          </div>
          <div className="split">
            <Card title="Before and after" sub="Grey = level from the gap analysis · blue = level shown in the assessment · marker = required">
              {Object.keys(scores).length === 0 ? (
                <p className="small muted">No scores.</p>
              ) : (
                Object.entries(scores).map(([sid, sc]) => {
                  const g = s.gaps?.find((x) => x.skill_id === sid);
                  const after = Math.round((sc / 100) * 5 * 2) / 2;
                  return (
                    <div key={sid}>
                      <GapRow
                        g={{
                          skill_id: sid,
                          skill: skillName(sid),
                          required: g?.required ?? 3,
                          current: after,
                          gap: Math.max(0, (g?.required ?? 3) - after),
                          critical: crit.includes(sid),
                          verdict: sc >= 60 ? "Met" : "Not met",
                          confidence: "High",
                          source: `Before ${g?.current ?? "?"} · assessment ${sc}%`,
                          ratings: { resume: null, l1: null, l2: null, l3: null },
                          quotes: [],
                        }}
                      />
                    </div>
                  );
                })
              )}
            </Card>
            <div className="stack" style={{ gap: 16 }}>
              {atH4 &&
                (canAct(run, ["h4_signoff"], viewAs) ? (
                  <Card title="Sign-off (H4)">
                    <p className="small">Signing off issues the readiness certificate and records the evidence: gap analysis, approved plans, verified notes and the assessment.</p>
                    <button type="button" className="btn good" onClick={() => void decide(run.id, () => decideGate("orch", run.id, "h4_signoff", "approved", { reviewer: PEOPLE.lead.email, notes: "Signed off." }), "Signed off. Certificate issued.")}>
                      <Check size={15} aria-hidden="true" /> Sign off
                    </button>
                  </Card>
                ) : (
                  <WaitingFor run={run} who="lead" />
                ))}
              {s.outcome === "retrain" && (
                <Card title="What happens next">
                  <p className="small">
                    Below the pass mark on: <b>{(s.weak_skills ?? []).map(skillName).join(", ")}</b>. Only these go back to the plan agent as a short round-2 plan.
                  </p>
                  <Link className="btn" to="/review">
                    Open the round-{s.round} plan
                  </Link>
                </Card>
              )}
              {s.outcome === "escalate" && <Note tone="bad">Round limit reached. Escalated to the delivery head.</Note>}
            </div>
          </div>
          {done && (
            <div className="cert">
              <div className="seal">
                READY
                <br />
                H4
              </div>
              <span className="eyebrow">Readiness certificate</span>
              <h2 style={{ fontSize: 22 }}>{nameOf(run)}</h2>
              <span className="muted">Java backend engineer · Claims Platform Modernisation, Northwind Insurance</span>
              <div className="row">
                {Object.keys(scores).map((sid) => (
                  <Pill key={sid} tone="good">
                    {skillName(sid)} {scores[sid]}%
                  </Pill>
                ))}
              </div>
              <span className="small">
                KT sessions attended: {s.sessions_booked ?? s.sessions?.length ?? "–"} across {s.round ?? 1} round(s) · Overall {s.overall}%
              </span>
              <span className="small muted">Signed off by {PEOPLE.lead.name}. Evidence: gap analysis, approved plans, verified notes, assessment.</span>
              <div className="actions">
                {cert && (
                  <button type="button" className="btn" onClick={() => void downloadFile("orch", cert).catch((e) => toast(String(e), "bad"))}>
                    <Download size={15} aria-hidden="true" /> Certificate ({cert.name.endsWith(".pdf") ? "PDF" : "file"})
                  </button>
                )}
                <button type="button" className="btn ghost" onClick={() => window.print()}>
                  <Printer size={15} aria-hidden="true" /> Print or save as PDF
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
