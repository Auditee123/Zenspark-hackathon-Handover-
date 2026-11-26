import { useState } from "react";
import { ChevronLeft, ChevronRight, Send } from "lucide-react";
import { useStore } from "../state/store";
import { submitForm } from "../runtime/client";
import { nameOf } from "../runtime/pauses";
import { Card, Kpi, Note, PageHead, Pill, Progress } from "../components/ui";
import { NoRun, RunStatus, WaitingFor, canAct } from "./common";

const LETTERS = ["A", "B", "C", "D"];

export default function Assessment() {
  const { selected: run, viewAs, decide } = useStore();
  const [i, setI] = useState(0);
  const [ans, setAns] = useState<Record<number, string>>({});
  if (!run) return <div className="content page"><PageHead eyebrow="Step 6 · Assessment" title="Assessment" agent="orch" /><NoRun what="the assessment" /></div>;

  const s = run.state;
  const qs = s.questions ?? [];
  const taking = run.pause?.gate === "take_assessment";
  const act = canAct(run, ["take_assessment"], viewAs) && viewAs === "joiner";
  const skillName = (id: string) => s.role_skills?.find((r) => r.skill_id === id)?.skill_name ?? id;
  const q = qs[i];
  const submit = () => {
    const input = Object.fromEntries(qs.slice(0, 5).map((_, k) => [`a${k + 1}`, ans[k] ?? ""]));
    void decide(run.id, () => submitForm("orch", run.id, "take_assessment", input, { reviewer: String(s.email ?? "") }), "Answers submitted. Graded in code; the readiness rules decide what happens next.");
  };
  const bySkill = [...new Set(qs.map((x) => x.skill_id))];

  return (
    <div className="content page">
      <PageHead
        eyebrow={`Step 6 · Assessment${(s.round ?? 1) > 1 ? ` · round ${s.round}` : ""}`}
        title={act ? `Question ${i + 1} of ${qs.length}` : `${nameOf(run)}'s assessment`}
        lead="Multiple-choice questions written from the KT notes and project documents, weighted towards the joiner's gaps. Answers are graded in code, not by AI: overall 70% and at least 60% on every critical skill."
        agent="orch"
      />
      <RunStatus run={run} />
      {qs.length === 0 ? (
        <Card>
          <p className="muted">The assessment is written after the KT giver approves the session notes (H1).</p>
        </Card>
      ) : act && q ? (
        <Card>
          <Progress value={((i + 1) / qs.length) * 100} />
          <div className="row">
            <Pill tone="info">{skillName(q.skill_id)}</Pill>
          </div>
          <h2 style={{ fontSize: 20 }}>{q.question}</h2>
          <div className="stack" role="radiogroup" aria-label={`Question ${i + 1}`}>
            {q.options.map((o, k) => (
              <label key={k} className={`opt${ans[i] === LETTERS[k] ? " on" : ""}`}>
                <input type="radio" name={`q${i}`} checked={ans[i] === LETTERS[k]} onChange={() => setAns({ ...ans, [i]: LETTERS[k] })} />
                <span>
                  <b>{LETTERS[k]})</b> {o.replace(/^[A-D]\)\s*/, "")}
                </span>
              </label>
            ))}
          </div>
          <div className="row between">
            <button type="button" className="btn" disabled={i === 0} onClick={() => setI(i - 1)}>
              <ChevronLeft size={15} aria-hidden="true" /> Back
            </button>
            {i < qs.length - 1 ? (
              <button type="button" className="btn primary" disabled={!ans[i]} onClick={() => setI(i + 1)}>
                Next <ChevronRight size={15} aria-hidden="true" />
              </button>
            ) : (
              <button type="button" className="btn primary" disabled={qs.some((_, k) => !ans[k])} onClick={submit}>
                <Send size={14} aria-hidden="true" /> Submit answers
              </button>
            )}
          </div>
        </Card>
      ) : (
        <>
          {taking && <WaitingFor run={run} who="joiner" />}
          <div className="grid g4">
            <Kpi value={qs.length} label="Questions" />
            <Kpi value={bySkill.length} label="Skills covered" />
            <Kpi value="70%" label="Pass mark overall" />
            <Kpi value="60%" label="Minimum on each critical skill" />
          </div>
          <Card title="Question plan" sub="The answer key never leaves the agent's grading step in this UI.">
            <div className="tbl">
              <table>
                <thead>
                  <tr>
                    <th>Skill</th>
                    <th>Questions</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {bySkill.map((sid) => {
                    const g = (s.grading ?? []).filter((x) => x.skill_id === sid);
                    const sc = s.scores?.[sid];
                    return (
                      <tr key={sid}>
                        <td>{skillName(sid)}</td>
                        <td className="num">{qs.filter((x) => x.skill_id === sid).length}</td>
                        <td>{sc !== undefined ? <Pill tone={sc >= 60 ? "good" : "bad"}>{sc}%</Pill> : g.length ? `${g.filter((x) => x.correct).length}/${g.length}` : <span className="muted">Not taken</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
          {s.outcome && <Note tone={s.outcome === "ready" ? "good" : "warn"}>Outcome: {s.outcome === "ready" ? "ready for sign-off (H4)" : s.outcome === "retrain" ? `round ${s.round ?? 2}: a short plan for ${(s.weak_skills ?? []).map(skillName).join(", ")}` : s.outcome}</Note>}
        </>
      )}
    </div>
  );
}
