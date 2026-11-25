import { Link } from 'react-router-dom';
import { stageOf } from '../state/pipeline.jsx';

export function Pill({ tone = 'idle', children }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

export function StagePill({ candidate }) {
  const s = stageOf(candidate);
  return <Pill tone={s.tone}>{s.label}</Pill>;
}

export function PageHead({ step, title, children }) {
  return (
    <header className="page-head">
      {step && <p className="step">{step}</p>}
      <h1>{title}</h1>
      {children && <p className="lede">{children}</p>}
    </header>
  );
}

export function SkillBar({ score, target, before }) {
  return (
    <div className="bars" aria-hidden="true">
      {before !== undefined && <div className="bar"><div className="bar-fill before" style={{ width: `${before * 20}%` }} /></div>}
      <div className="bar">
        <div className="bar-fill" style={{ width: `${score * 20}%` }} />
        {target !== undefined && <div className="bar-target" style={{ left: `calc(${target * 20}% - 2px)` }} />}
      </div>
    </div>
  );
}

export function NeedCandidate() {
  return (
    <div className="card empty">
      <h2>No candidate yet</h2>
      <p>Add a candidate on the Onboarding page and the agents will start working on them.</p>
      <Link className="btn" to="/">Go to onboarding</Link>
    </div>
  );
}

export function ErrorNote({ candidate, onRetry }) {
  if (candidate.status !== 'error') return null;
  return (
    <div className="note note-bad" role="alert">
      <strong>The agent call failed.</strong> {candidate.error}
      <button type="button" className="btn btn-secondary" onClick={onRetry}>Try again</button>
    </div>
  );
}
