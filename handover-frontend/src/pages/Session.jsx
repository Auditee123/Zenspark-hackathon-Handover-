import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { STAGES, usePipeline } from '../state/pipeline.jsx';
import { useActiveCandidate } from '../components/useActiveCandidate.js';
import { NeedCandidate, PageHead, Pill } from '../components/ui.jsx';

const SESSION = STAGES.findIndex((s) => s.key === 'ktSession');

export default function Session() {
  const c = useActiveCandidate();
  const { sendSessionMessage, finishSessions } = usePipeline();
  const navigate = useNavigate();
  const [day, setDay] = useState(0);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  if (!c) return <NeedCandidate />;
  const days = c.results.booked;

  if (!days) {
    return (
      <>
        <PageHead step="Step 5 of 6: KT Session" title="KT sessions" />
        <div className="card empty">
          <h2>No sessions booked yet</h2>
          <p>Sessions appear here once the candidate confirms dates in the KT Scheduler.</p>
          <Link className="btn btn-secondary" to={`/scheduler/${c.id}`}>Open KT Scheduler</Link>
        </div>
      </>
    );
  }

  const active = c.stageIndex === SESSION;
  const current = days[day];
  const send = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    const msg = text;
    setText('');
    await sendSessionMessage(c.id, current, msg);
    setSending(false);
  };

  return (
    <>
      <PageHead step="Step 5 of 6: KT Session" title={`${current.day}: ${current.topic}`}>
        The agent explains, checks understanding, and sends what it can’t answer to the outgoing expert.
      </PageHead>
      <div className="tabs" role="tablist">
        {days.map((d, i) => (
          <button key={d.day} type="button" role="tab" aria-selected={i === day} onClick={() => setDay(i)}>{d.day}</button>
        ))}
      </div>
      <div className="split">
        <section className="card wide chat">
          <ul className="messages" aria-live="polite">
            <li className="msg agent"><span className="who">KT Session agent</span><p>Welcome to {current.day}. Today we cover {current.topic.toLowerCase()}. Ask me anything as we go.</p></li>
            {c.chat.map((m, i) => (
              <li key={i} className={`msg ${m.who}`}>
                <span className="who">{m.who === 'agent' ? 'KT Session agent' : c.firstName}</span>
                <p>{m.text}</p>
                {m.escalated && <Pill tone="warn">Sent to the outgoing expert</Pill>}
              </li>
            ))}
            {sending && <li className="msg agent"><span className="who">KT Session agent</span><p className="muted">Thinking…</p></li>}
          </ul>
          <form className="composer" onSubmit={send}>
            <label className="sr-only" htmlFor="msg">Message the KT Session agent</label>
            <input id="msg" value={text} onChange={(e) => setText(e.target.value)} placeholder="Try: Why are failed events retried three times?" disabled={!active} />
            <button type="submit" className="btn" disabled={!active || sending}>Send</button>
          </form>
        </section>
        <section className="card">
          <h2>Schedule</h2>
          <ul className="list">{days.map((d) => <li key={d.day}><strong>{d.day}</strong><span className="muted">{d.when}</span></li>)}</ul>
          <p className="muted">Session notes are added to the knowledge base, marked unverified until the expert confirms them.</p>
          {active ? (
            <button type="button" className="btn" onClick={async () => { await finishSessions(c.id); navigate(`/assessment/${c.id}`); }}>Finish KT and start assessment</button>
          ) : c.stageIndex > SESSION && <Link className="btn btn-secondary" to={`/assessment/${c.id}`}>Open assessment</Link>}
        </section>
      </div>
    </>
  );
}
