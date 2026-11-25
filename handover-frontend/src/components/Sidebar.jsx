import { NavLink } from 'react-router-dom';
import { useActiveCandidate } from './useActiveCandidate.js';
import { USE_MOCK } from '../api/agents.js';

export default function Sidebar() {
  const c = useActiveCandidate();
  const id = c ? c.id : '';
  const items = [
    ['/', 'Onboarding', 'You add candidates', true],
    [`/processing/${id}`, 'Processing', 'Agents run on their own'],
    [`/gaps/${id}`, 'Gaps and KT plan', 'Your approval'],
    [`/scheduler/${id}`, 'KT Scheduler', 'Candidate picks slots'],
    [`/session/${id}`, 'KT Session', 'Chat with the agent'],
    [`/assessment/${id}`, 'Assessment and report', 'Then your sign-off']
  ];
  return (
    <nav className="sidebar" aria-label="Handover">
      <div className="brand">
        <span className="brand-name">Handover</span>
        <span className="brand-sub">{USE_MOCK ? 'Sample data' : 'Connected to AgentMesh'}</span>
      </div>
      <ol className="nav">
        {items.map(([to, label, hint, end], i) => (
          <li key={label}>
            <NavLink to={to} end={end} className={({ isActive }) => (isActive ? 'active' : undefined)}>
              <span className="nav-num">{i + 1}</span>
              <span className="nav-text">
                <span>{label}</span>
                <span className="nav-hint">{hint}</span>
              </span>
            </NavLink>
          </li>
        ))}
      </ol>
      {c && <p className="nav-current">Following {c.firstName} {c.lastName}</p>}
      <div className="me">
        <span className="me-label">Signed in as</span>
        <span className="me-name">Auditee Saha Chowdhury</span>
        <span className="me-label">Team Handover</span>
      </div>
    </nav>
  );
}
