import { useState } from 'react';
import { Link } from 'react-router-dom';
import { STAGES, usePipeline } from '../state/pipeline.jsx';
import { useActiveCandidate } from '../components/useActiveCandidate.js';
import { NeedCandidate, PageHead, Pill, SkillBar } from '../components/ui.jsx';

const at = (key) => STAGES.findIndex((s) => s.key === key);

export default function Assessment() {
  const c = useActiveCandidate();
  const { submitAnswers, signOff } = usePipeline();
  const [answers, setAnswers] = useState({});
  if (!c) return <NeedCandidate />;
  const { questions, assessment, report } = c.results;
  const answering = c.stageIndex === at('assessment') && c.status === 'waiting';
  const signing = c.stageIndex === at('signoff') && c.status === 'waiting';
  const done = c.stageIndex >= STAGES.length;

  if (!questions) {
    return (
      <>
        <PageHead step="Step 6 of 6: Assessment and report" title="Final assessment" />
        <div className="card empty">
          <h2>Not started</h2>
          <p>The Assessment agent prepares questions once the KT sessions are finished.</p>
          <Link className="btn btn-secondary" to={`/session/${c.id}`}>Open KT Session</Link>
        </div>
      </>
    );
  }

  const result = (id) => assessment?.results.find((r) => r.id === id);

  return (
    <>
      <PageHead step="Step 6 of 6: Assessment and report" title={`${c.firstName}’s final assessment`}>
        The report is written only after the Assessment agent has scored the answers.
      </PageHead>

      <section className="card">
        <h2>Assessment agent</h2>
        <p className="muted">Questions built from the KT topics and session notes. Showing {questions.length} of {c.results.totalQuestions}.</p>
        <ol className="questions">
          {questions.map((q) => {
            const r = result(q.id);
            return (
              <li key={q.id}>
                <div className="q-head"><Pill tone="info">{q.skill}</Pill>{r && <Pill tone={r.correct ? 'ok' : 'warn'}>{r.correct ? 'Correct' : 'Partly correct'}</Pill>}</div>
                <label className="field">{q.text}
                  <textarea rows={2} value={answers[q.id] || ''} disabled={!answering} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} />
                </label>
              </li>
            );
          })}
        </ol>
        {answering && <button type="button" className="btn" onClick={() => submitAnswers(c.id, answers)}>Submit answers</button>}
        {c.status === 'running' && c.stageIndex >= at('assessment') && <p className="muted">Scoring and writing the report…</p>}
        {assessment && <div className="note note-info"><strong>Scored {assessment.score} of {assessment.total}.</strong> The Report agent used this to write the report below.</div>}
      </section>

      {report && (
        <div className="split">
          <section className="card wide">
            <h2>Readiness report</h2>
            <p className="muted">Top bar: before KT (from L1–L3). Bottom bar: after the final assessment.</p>
            <ul className="skills">
              {report.skills.map((s) => (
                <li key={s.name}>
                  <div className="skill-head"><strong>{s.name}</strong><span>{s.before}/5 to <strong>{s.after}/5</strong></span></div>
                  <SkillBar before={s.before} score={s.after} />
                  <span className="muted">{s.evidence}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="card">
            <h2>Sign-off</h2>
            <p>{report.summary}</p>
            {signing && <button type="button" className="btn" onClick={() => signOff(c.id)}>Sign off and issue certificate</button>}
            {done && (
              <div className="certificate">
                <span className="cert-kind">Readiness certificate</span>
                <span className="cert-name">{c.firstName} {c.lastName}</span>
                <span className="muted">{c.role}</span>
                <span>Ready to work on all assessed skills, with before/after evidence attached.</span>
                <span className="muted">Signed by Auditee Saha Chowdhury, {new Date().toLocaleDateString()}</span>
                <button type="button" className="btn btn-secondary" onClick={() => window.print()}>Print or save as PDF</button>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
