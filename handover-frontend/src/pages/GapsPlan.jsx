import { useState } from 'react';
import { Link } from 'react-router-dom';
import { STAGES, usePipeline } from '../state/pipeline.jsx';
import { useActiveCandidate } from '../components/useActiveCandidate.js';
import { NeedCandidate, PageHead, Pill, SkillBar } from '../components/ui.jsx';

const APPROVAL = STAGES.findIndex((s) => s.key === 'approval');

export default function GapsPlan() {
  const c = useActiveCandidate();
  const { approvePlan } = usePipeline();
  const [busy, setBusy] = useState(false);
  if (!c) return <NeedCandidate />;
  const { skills, plan } = c.results;
  const ready = c.stageIndex === APPROVAL && c.status === 'waiting';
  const approved = c.stageIndex > APPROVAL;

  if (!skills || !plan) {
    return (
      <>
        <PageHead step="Step 3 of 6: Gap Finder and KT Planner" title={`${c.firstName}’s gaps and KT plan`} />
        <div className="card empty">
          <h2>{c.sample ? 'Sample candidate' : 'The agents are still working'}</h2>
          <p>{c.sample ? 'Add a new candidate to see live results here.' : 'Gap Finder and KT Planner results appear here as soon as they finish.'}</p>
          <Link className="btn btn-secondary" to={`/processing/${c.id}`}>Watch processing</Link>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHead step="Step 3 of 6: Gap Finder and KT Planner" title={`${c.firstName}’s gaps, and the plan that closes them`}>
        Built from the JD and the L1–L3 feedback. Every score shows which partition it came from.
      </PageHead>
      <div className="split even">
        <section className="card">
          <h2>Skills and gaps</h2>
          <p className="muted">Bar: {c.firstName} today. Grey mark: what the JD needs.</p>
          <ul className="skills">
            {skills.map((s) => (
              <li key={s.name}>
                <div className="skill-head"><strong>{s.name}</strong><span>{s.score}/5 <span className="muted">needs {s.target}/5</span></span></div>
                <SkillBar score={s.score} target={s.target} />
                <span className="muted">{s.evidence}</span>
                <Pill tone="info">Source: {s.source}</Pill>
              </li>
            ))}
          </ul>
        </section>
        <section className="stack">
          <div className="card">
            <h2>Recommended KT plan</h2>
            <ol className="days">
              {plan.map((d) => <li key={d.day}><strong>{d.day}</strong><span><span>{d.topic}</span><span className="muted">{d.why}</span></span></li>)}
            </ol>
          </div>
          <div className="card">
            <h2>Approval</h2>
            <ul className="list">
              <li><strong>Outgoing expert</strong><Pill tone="ok">Approved</Pill></li>
              <li><strong>Auditee Saha Chowdhury (you)</strong><Pill tone={approved ? 'ok' : 'warn'}>{approved ? 'Approved' : 'Waiting'}</Pill></li>
            </ul>
            {ready && (
              <div className="actions">
                <button type="button" className="btn" disabled={busy} onClick={async () => { setBusy(true); await approvePlan(c.id); }}>Approve gaps and plan</button>
                <button type="button" className="btn btn-secondary">Request changes</button>
              </div>
            )}
            {approved && (
              <div className="note note-info">
                Handed to the KT Scheduler agent automatically. <Link to={`/scheduler/${c.id}`}>Open KT Scheduler</Link>
              </div>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
