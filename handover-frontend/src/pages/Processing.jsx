import { Link } from 'react-router-dom';
import { STAGES, usePipeline } from '../state/pipeline.jsx';
import { useActiveCandidate } from '../components/useActiveCandidate.js';
import { ErrorNote, NeedCandidate, PageHead, Pill } from '../components/ui.jsx';

const PAGE = { approval: 'gaps', ktScheduler: 'scheduler', ktSession: 'session', assessment: 'assessment', signoff: 'assessment' };
const ACTION = { approval: 'Review gaps and plan', ktScheduler: 'Open KT Scheduler', ktSession: 'Open KT Session', assessment: 'Open assessment', signoff: 'Review the report' };

function statusOf(c, i) {
  if (i < c.stageIndex) return ['Done', 'ok'];
  if (i > c.stageIndex) return ['Not started', 'idle'];
  if (c.status === 'error') return ['Failed', 'bad'];
  if (c.status === 'running') return ['Running', 'info'];
  return [STAGES[i].human ? 'Needs a person' : 'Waiting', 'warn'];
}

export default function Processing() {
  const c = useActiveCandidate();
  const { retry } = usePipeline();
  if (!c) return <NeedCandidate />;
  const current = STAGES[c.stageIndex];
  const waitingOnPerson = current && current.human && c.status === 'waiting';

  return (
    <>
      <PageHead step="Step 2 of 6: Processing" title="The agents hand off to each other">
        {c.firstName} {c.lastName}, {c.role}. You only step in at approvals.
      </PageHead>
      <ErrorNote candidate={c} onRetry={() => retry(c.id)} />

      <div className="split">
        <section className="card wide">
          <h2>Pipeline: 7 agents, 2 sign-offs</h2>
          <ol className="pipeline">
            {STAGES.map((s, i) => {
              const [label, tone] = statusOf(c, i);
              return (
                <li key={s.key} className={i === c.stageIndex ? 'current' : undefined}>
                  <span className={`dot dot-${tone}`}>{i + 1}</span>
                  <span className="pipe-text"><strong>{s.label}</strong><span className="muted">{s.text}</span></span>
                  <Pill tone={tone}>{label}</Pill>
                </li>
              );
            })}
          </ol>
          {waitingOnPerson && <Link className="btn" to={`/${PAGE[current.key]}/${c.id}`}>{ACTION[current.key]}</Link>}
          {c.stageIndex >= STAGES.length && <Link className="btn" to={`/assessment/${c.id}`}>View certificate</Link>}
        </section>

        <section className="stack">
          <div className="card">
            <h2>Partitions</h2>
            <p className="muted">Each document has its own partition, so agents only read what they need.</p>
            {c.results.partitions ? (
              <ul className="list">
                {c.results.partitions.map((p) => <li key={p.name}><strong>{p.name}</strong><span className="muted">{p.chunks} chunks</span></li>)}
              </ul>
            ) : <p className="muted">{c.sample ? 'Sample candidate: added before this demo.' : 'Storing documents…'}</p>}
          </div>
          <div className="card">
            <h2>Agent activity</h2>
            {c.log.length === 0 ? <p className="muted">Nothing yet.</p> : (
              <ul className="log">{c.log.map((l, i) => <li key={i}><span className="muted">{l.t}</span>{l.text}</li>)}</ul>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
