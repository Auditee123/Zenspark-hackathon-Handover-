import { useState } from 'react';
import { Link } from 'react-router-dom';
import { STAGES, usePipeline } from '../state/pipeline.jsx';
import { useActiveCandidate } from '../components/useActiveCandidate.js';
import { NeedCandidate, PageHead } from '../components/ui.jsx';

const SCHED = STAGES.findIndex((s) => s.key === 'ktScheduler');

export default function Scheduler() {
  const c = useActiveCandidate();
  const { confirmSlots } = usePipeline();
  const [picks, setPicks] = useState({});
  const [other, setOther] = useState('');
  if (!c) return <NeedCandidate />;
  const { slots, booked } = c.results;

  if (!slots) {
    return (
      <>
        <PageHead step="Step 4 of 6: KT Scheduler" title="Pick a time for each KT session" />
        <div className="card empty">
          <h2>No slots yet</h2>
          <p>The KT Scheduler starts once you approve the gaps and plan.</p>
          <Link className="btn btn-secondary" to={`/gaps/${c.id}`}>Go to approval</Link>
        </div>
      </>
    );
  }

  const choose = (i, j) => setPicks({ ...picks, [i]: j });
  const pending = c.stageIndex === SCHED && c.status === 'waiting';
  const confirm = () => confirmSlots(c.id, slots.map((s, i) => ({ day: s.day, topic: s.topic, when: s.options[picks[i] ?? 0] })));

  return (
    <>
      <PageHead step="Step 4 of 6: KT Scheduler" title={`${c.firstName}, pick a time for each KT session`}>
        The agent checked the expert’s calendar and offers two free slots per session.
      </PageHead>
      <div className="split">
        <section className="card wide">
          <h2>Proposed slots</h2>
          <ul className="slots">
            {slots.map((s, i) => (
              <li key={s.day}>
                <span className="slot-topic"><strong>{s.day}</strong><span>{s.topic}</span></span>
                <span className="slot-options" role="group" aria-label={`${s.day} time`}>
                  {s.options.map((o, j) => (
                    <button key={o} type="button" className="chip" aria-pressed={(picks[i] ?? 0) === j} disabled={!pending} onClick={() => choose(i, j)}>{o}</button>
                  ))}
                </span>
              </li>
            ))}
          </ul>
          {pending && (
            <>
              <label className="field">None of these work? Suggest a day and time
                <input value={other} onChange={(e) => setOther(e.target.value)} placeholder="For example, Fri 5 Dec, 11:00" />
              </label>
              <button type="button" className="btn" onClick={confirm}>Confirm these dates</button>
            </>
          )}
        </section>
        <section className="card">
          <h2>Calendar invites</h2>
          {booked ? (
            <>
              <div className="note note-ok"><strong>{booked.length} Outlook invites sent</strong> to {c.firstName} and the outgoing expert.</div>
              <ul className="list">{booked.map((b) => <li key={b.day}><strong>{b.day}</strong><span className="muted">{b.when}</span></li>)}</ul>
              <Link className="btn" to={`/session/${c.id}`}>Open KT Session</Link>
            </>
          ) : (
            <p className="muted">Once {c.firstName} confirms, the agent sends Outlook invites through Microsoft Graph. If that isn’t available, it attaches .ics files instead.</p>
          )}
        </section>
      </div>
    </>
  );
}
