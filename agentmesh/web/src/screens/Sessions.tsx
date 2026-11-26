import { useState } from "react";
import type { FormEvent } from "react";
import { Check, Loader2, Send, Square } from "lucide-react";
import { errorText, useStore } from "../state/store";
import { runAndRead, submitForm, toRunView } from "../runtime/client";
import { PEOPLE, nameOf } from "../runtime/pauses";
import { H1_SAMPLE_ANSWER, PRIYA_KT_NOTES } from "../runtime/samples";
import type { KtOutput } from "../runtime/types";
import { Card, ErrorState, Field, Note, PageHead, Pill, Tabs } from "../components/ui";
import { Bubble } from "../components/viz";
import { NoRun, RunStatus, WaitingFor, canAct } from "./common";

interface Turn {
  speaker: string;
  text: string;
  who: "me" | "agent" | "giver";
  cites?: string[];
  open?: string;
}

export default function Sessions() {
  const { selected: run, viewAs, decide, setSideTrace } = useStore();
  const [tab, setTab] = useState<"room" | "paste">("room");
  const [day, setDay] = useState(0);
  const [turns, setTurns] = useState<Record<number, Turn[]>>({});
  const [msg, setMsg] = useState("");
  const [speaker, setSpeaker] = useState<"joiner" | "giver">("joiner");
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [paste, setPaste] = useState("");
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [approveNotes, setApproveNotes] = useState(true);
  if (!run) return <div className="content page"><PageHead eyebrow="Step 5 · KT sessions" title="KT sessions" agent="kt" /><NoRun what="the KT sessions" /></div>;

  const s = run.state;
  const sessions = s.sessions ?? [];
  const gate = run.pause?.gate;
  const ktDone = gate === "kt_done";
  const h1 = gate === "h1_expert_answers";
  const cur = sessions[day];
  const history = turns[day] ?? [];
  const joiner = nameOf(run);
  const giverName = cur?.giver_name ?? PEOPLE.giver.name;
  const canRoom = ktDone && (viewAs === "giver" || viewAs === "lead" || viewAs === "joiner");

  const send = async (e: FormEvent, end = false) => {
    e.preventDefault();
    if (!cur || (!msg.trim() && !end)) return;
    const who = speaker === "joiner" ? joiner : giverName;
    const text = end ? "That's all for today." : msg.trim();
    const mine: Turn = { speaker: who, text, who: speaker === "joiner" ? "me" : "giver" };
    setTurns({ ...turns, [day]: [...history, mine] });
    setMsg("");
    setSending(true);
    setChatError(null);
    try {
      const r = await runAndRead<KtOutput>("kt", {
        candidate_id: s.candidate_id,
        session_title: `Day ${cur.day} ${cur.title}`,
        skill_id: s.plan?.[cur.day - 1]?.skills?.[0] ?? "",
        giver_name: giverName,
        speaker: who,
        message: text,
        history: history.map((t) => ({ speaker: t.speaker, text: t.text })),
        ...(end ? { end_session: true } : {}),
      });
      if (r.row) setSideTrace({ agent: "kt", title: `KT session · Day ${cur.day}`, rows: toRunView("kt", r.row, null).trace });
      if (!r.ok) throw new Error(r.error ?? "The KT session agent failed");
      setTurns((t) => ({ ...t, [day]: [...(t[day] ?? []), { speaker: "Handover agent", text: r.state.reply ?? "", who: "agent", cites: r.state.citations, open: r.state.open_question || undefined }] }));
      if (end && r.state.notes) setNotes((n) => ({ ...n, [day]: r.state.notes! }));
    } catch (err) {
      setChatError(errorText(err));
    } finally {
      setSending(false);
    }
  };

  const allNotes = Object.values(notes).join("\n\n");
  const finish = (text: string) => void decide(run.id, () => submitForm("orch", run.id, "kt_done", { sessions_completed: true, session_notes: text }, { reviewer: PEOPLE.giver.email }), "Sessions marked complete. The agent is summarising the notes for the KT giver (H1).");
  const sendH1 = () => {
    const qs = s.open_questions ?? [];
    const text = qs.length ? qs.map((q, i) => `Q: ${q}\nA: ${answers[i] ?? ""}`).join("\n\n") : (answers[0] ?? "No open questions.");
    void decide(run.id, () => submitForm("orch", run.id, "h1_expert_answers", { answers: text, approve_notes: approveNotes }, { reviewer: PEOPLE.giver.email }), "Notes approved. Answers move to the trusted Expert answers collection; the assessment is being written.");
  };

  return (
    <div className="content page">
      <PageHead
        eyebrow="Step 5 · KT sessions"
        title={h1 ? "Approve the KT notes (H1)" : cur ? `Day ${cur.day}: ${cur.title}` : "KT sessions"}
        lead="The KT giver teaches; the Handover agent sits in, answers from the project knowledge base with sources, and logs anything nobody can answer. Notes stay unverified until the KT giver approves them (H1)."
        agent={h1 || !ktDone ? "orch" : "kt"}
      />
      <RunStatus run={run} />
      {sessions.length === 0 ? (
        <Card>
          <p className="muted">Sessions appear here once the joiner confirms times in the KT scheduler.</p>
        </Card>
      ) : h1 ? (
        canAct(run, ["h1_expert_answers"], viewAs) && viewAs !== "joiner" ? (
          <div className="split">
            <Card title="Open questions" sub="Answer them; approved answers become trusted knowledge that the Q&A chat can cite.">
              {(s.open_questions ?? []).length === 0 ? (
                <p className="small muted">No open questions in these notes.</p>
              ) : (
                (s.open_questions ?? []).map((q, i) => (
                  <Field key={q} label={q}>
                    <textarea className="input" rows={3} value={answers[i] ?? ""} onChange={(e) => setAnswers({ ...answers, [i]: e.target.value })} />
                    <button type="button" className="btn ghost sm" style={{ alignSelf: "flex-start" }} onClick={() => setAnswers({ ...answers, [i]: H1_SAMPLE_ANSWER })}>
                      Use the runbook answer
                    </button>
                  </Field>
                ))
              )}
              <label className="row small">
                <input type="checkbox" checked={approveNotes} onChange={(e) => setApproveNotes(e.target.checked)} /> Approve the notes as accurate
              </label>
              <div>
                <button type="button" className="btn good" disabled={(s.open_questions ?? []).some((_, i) => !answers[i]?.trim())} onClick={sendH1}>
                  <Check size={15} aria-hidden="true" /> Approve notes (H1)
                </button>
              </div>
            </Card>
            <Card title="Key points from the sessions" sub={<Pill tone="warn">Unverified · waiting for H1</Pill>}>
              <ul className="small" style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
                {(s.key_points ?? []).map((k) => (
                  <li key={k}>{k}</li>
                ))}
              </ul>
            </Card>
          </div>
        ) : (
          <WaitingFor run={run} who="giver" />
        )
      ) : (
        <>
          {ktDone && !canRoom && <WaitingFor run={run} who="giver" />}
          <div className="row" role="tablist" aria-label="Sessions">
            {sessions.map((x, i) => (
              <button key={x.day} type="button" role="tab" aria-selected={i === day} className={`chip${i === day ? " on" : ""}`} onClick={() => setDay(i)}>
                Day {x.day} · {notes[i] ? "notes saved" : x.date.slice(5)}
              </button>
            ))}
          </div>
          <Tabs value={tab} onChange={setTab} items={[{ key: "room", label: "Agent in the session" }, { key: "paste", label: "Paste notes or transcript" }]} />
          <div className="split">
            {tab === "room" ? (
              <Card title="Session room" sub={`${giverName} with ${joiner} · handover-kt-session answers live`} actions={<Pill tone="agent">Live agent</Pill>}>
                <div className="chat" aria-live="polite">
                  <Bubble who="agent" by="Handover agent">
                    Welcome to day {cur.day}: {cur.title}. Ask me anything as you go; I answer from the project documents and approved expert answers, and log what nobody can answer.
                  </Bubble>
                  {history.map((t, i) => (
                    <Bubble key={i} who={t.who} by={t.speaker} cites={t.cites} extra={t.open ? <Pill tone="warn">Logged as an open question for the KT giver</Pill> : undefined}>
                      {t.text}
                    </Bubble>
                  ))}
                  {sending && (
                    <Bubble who="agent" by="Handover agent">
                      <span className="row muted">
                        <Loader2 size={14} className="spin" aria-hidden="true" /> Thinking…
                      </span>
                    </Bubble>
                  )}
                </div>
                {chatError && <ErrorState title="The KT session agent didn't answer" error={chatError} />}
                <form className="composer" onSubmit={(e) => void send(e)}>
                  <select className="input" style={{ maxWidth: 150, flex: "none" }} aria-label="Speaker" value={speaker} onChange={(e) => setSpeaker(e.target.value as "joiner" | "giver")}>
                    <option value="joiner">{joiner}</option>
                    <option value="giver">{giverName}</option>
                  </select>
                  <label className="sr-only" htmlFor="kt-msg">
                    Message
                  </label>
                  <input id="kt-msg" className="input" value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Try: Why is the retry limit three and not five?" disabled={!canRoom || sending} />
                  <button type="submit" className="btn primary" disabled={!canRoom || sending || !msg.trim()}>
                    <Send size={14} aria-hidden="true" /> Send
                  </button>
                </form>
                <div className="actions">
                  <button type="button" className="btn" disabled={!canRoom || sending || history.length === 0 || Boolean(notes[day])} onClick={(e) => void send(e as unknown as FormEvent, true)}>
                    <Square size={13} aria-hidden="true" /> End session and save notes
                  </button>
                  {notes[day] && <Pill tone="good">Notes saved for day {cur.day}</Pill>}
                </div>
              </Card>
            ) : (
              <Card title="Paste notes or a transcript" sub="Use this if the agent wasn't in the session.">
                <textarea className="input" rows={8} value={paste} onChange={(e) => setPaste(e.target.value)} />
                <div className="actions">
                  <button type="button" className="btn sm" onClick={() => setPaste(PRIYA_KT_NOTES)}>
                    Use sample notes (kit)
                  </button>
                </div>
              </Card>
            )}
            <div className="stack" style={{ gap: 16 }}>
              <Card title="Schedule">
                <div className="stack small">
                  {sessions.map((x, i) => (
                    <div key={x.day} className="row between">
                      <span>
                        <b>Day {x.day}</b> {x.title}
                      </span>
                      {notes[i] ? <Pill tone="good">Notes</Pill> : <span className="muted tiny">{`${x.date.slice(5)} ${x.start}`}</span>}
                    </div>
                  ))}
                </div>
              </Card>
              <Card title="Finish KT">
                <p className="small muted">When the sessions are done, the notes go to the orchestrator; it summarises them and asks the KT giver to approve (H1).</p>
                {ktDone && canRoom ? (
                  <button type="button" className="btn primary" disabled={!allNotes && !paste.trim()} onClick={() => finish([allNotes, paste.trim()].filter(Boolean).join("\n\n"))}>
                    <Check size={15} aria-hidden="true" /> Sessions completed: send notes
                  </button>
                ) : (
                  <Note>{s.key_points ? "Sessions completed. Notes are with the KT giver." : "Available while the run waits for the KT sessions."}</Note>
                )}
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
