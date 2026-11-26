import { useState } from "react";
import { CalendarCheck, CalendarClock, Download, Mail } from "lucide-react";
import { useStore } from "../state/store";
import { downloadFile, saveBlob, submitForm } from "../runtime/client";
import { PEOPLE, nameOf } from "../runtime/pauses";
import type { RunView, Session } from "../runtime/types";
import { Avatar, Card, Field, Modal, Note, PageHead, Pill, fmtDate } from "../components/ui";
import type { Tone } from "../components/ui";
import { Calendar } from "../components/viz";
import type { CalEvent } from "../components/viz";
import { NoRun, RunStatus, WaitingFor, canAct } from "./common";

const first = (name: string) => name.split(" ")[0];

/** Each email the agent tried to send, from the Notification Router results in the run state. */
function deliveries(run: RunView): { what: string; to: string; status: string }[] {
  const s = run.state;
  const one = (what: string, d: unknown, fallbackTo: string) => {
    if (!d || typeof d !== "object") return [];
    const r = d as Record<string, unknown>;
    return [{ what, to: String(r.recipient ?? r.recipient_id ?? fallbackTo), status: String(r.status ?? r.delivery_status ?? JSON.stringify(r).slice(0, 60)) }];
  };
  const inv = s.invites_delivery;
  return [
    ...one("Time proposals", s.proposal_delivery, String(s.email ?? "")),
    ...(Array.isArray(inv) ? inv.flatMap((d, i) => one("Booked sessions + invite", d, String(s.invitees?.[i]?.email ?? ""))) : one("Booked sessions + invite", inv, "")),
    ...one("New time options", s.reproposal_delivery, String(s.email ?? "")),
  ];
}
const deliveryTone = (st: string): Tone => (/fail|error|refus|bounce/i.test(st) ? "bad" : /mock|simulat|queued|pending|not sent/i.test(st) ? "warn" : /sent|deliver|ok|success|accepted/i.test(st) ? "good" : "");

const stripHtml = (html: string) => html.replace(/<li>/g, "\n• ").replace(/<\/p>|<br\s*\/?>/g, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\n{3,}/g, "\n\n").trim();

/** Calendar weeks (Mon-Fri) that hold at least one event. */
function weeks(events: CalEvent[]): CalEvent[][] {
  const by = new Map<string, CalEvent[]>();
  for (const e of events) {
    const d = new Date(`${e.date}T00:00:00Z`);
    const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10);
    by.set(monday, [...(by.get(monday) ?? []), e]);
  }
  return [...by.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
}

export default function Scheduler() {
  const { selected: run, viewAs, decide, toast } = useStore();
  const [picks, setPicks] = useState<Record<number, string>>({});
  const [change, setChange] = useState<{ day: number; who: string; why: string } | null>(null);
  const [pick, setPick] = useState<string>("");
  if (!run) return <div className="content page"><PageHead eyebrow="Step 4 · KT scheduler" title="KT schedule" agent="orch" /><NoRun what="the KT schedule" /></div>;

  const s = run.state;
  const proposals = s.proposals ?? [];
  const sessions = s.sessions ?? [];
  const gate = run.pause?.gate;
  const joinerName = nameOf(run);
  const confirming = gate === "confirm_slots";
  const actSlots = canAct(run, ["confirm_slots"], viewAs) && viewAs === "joiner";
  const rescheduling = gate === "confirm_reschedule";
  const actResched = canAct(run, ["confirm_reschedule"], viewAs) && viewAs === "joiner";
  const canRequest = gate === "kt_done" && !run.busy;
  const rp = s.reproposal ?? {};
  const choice = (day: number) => picks[day] ?? proposals.find((p) => p.day === day)?.options[0]?.code;
  const codes = proposals.map((p) => choice(p.day)).filter(Boolean).join(",");
  const ics = run.files.find((f) => f.name.includes(".ics"));
  const changes = s.schedule_changes ?? [];
  const mails = deliveries(run);

  const status = (x: Session): { label: string; tone: Tone } =>
    rescheduling && rp.day === x.day ? { label: "Change requested", tone: "warn" } : x.status === "rescheduled" ? { label: "Rescheduled", tone: "agent" } : { label: "Booked", tone: "good" };
  const events: CalEvent[] = sessions.length
    ? sessions.map((x) => ({ date: x.date, start: x.start, label: `Day ${x.day} · ${first(x.giver_name)}`, sub: `${x.start}–${x.end}`, pending: rescheduling && rp.day === x.day, moved: x.status === "rescheduled" }))
    : proposals.map((p) => {
        const o = p.options.find((x) => x.code === choice(p.day)) ?? p.options[0];
        return { date: p.date, start: o?.start ?? "10:00", label: `Day ${p.day} · ${first(p.giver_name)}`, sub: o ? `${o.start}–${o.end}` : "", pending: true };
      });
  const people = [joinerName, ...new Set(sessions.map((x) => x.giver_name))];
  const reviewer = viewAs === "joiner" ? String(s.email ?? "") : viewAs === "giver" ? PEOPLE.giver.email : PEOPLE.lead.email;

  const downloadIcs = async () => {
    try {
      if (ics) await downloadFile("orch", ics);
      else if (s.ics_text) saveBlob(new Blob([s.ics_text], { type: "text/calendar" }), `handover-${s.candidate_id}-kt.ics`);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "bad");
    }
  };
  const sendChange = () => {
    if (!change) return;
    void decide(run.id, () => submitForm("orch", run.id, "kt_done", { reschedule_day: change.day, requested_by: change.who, reschedule_reason: change.why }, { reviewer }), `Change requested for day ${change.day}. The agent is finding new times.`);
    setChange(null);
  };

  return (
    <div className="content page">
      <PageHead
        eyebrow="Step 4 · KT scheduler"
        title={actSlots ? "Pick a time for each KT session" : rescheduling ? `New time needed for day ${rp.day ?? ""}` : `${joinerName}'s KT schedule`}
        lead="The scheduler offers two free slots per session from the KT givers' calendars, books them once the joiner confirms, and emails everyone the schedule. If someone can't make a session, the agent finds new times, the joiner picks one, and everyone gets the updated invite."
        agent="orch"
        actions={
          sessions.length ? (
            <button type="button" className="btn" onClick={() => void downloadIcs()}>
              <Download size={15} aria-hidden="true" /> Calendar invite (.ics)
            </button>
          ) : undefined
        }
      />
      <RunStatus run={run} />
      {confirming && !actSlots && <WaitingFor run={run} who="joiner" />}

      {rescheduling &&
        (actResched ? (
          <Card title={`Day ${rp.day}: pick a new time`} sub={`${rp.requested_by ?? "Someone"} can't make ${rp.current?.date ? fmtDate(rp.current.date) : ""} ${rp.current?.start ?? ""}${rp.reason ? ` · ${rp.reason}` : ""}`} actions={<Pill tone="human">Waiting for you</Pill>}>
            <p className="small">
              <b>{rp.title}</b> with {rp.giver_name}
            </p>
            <div className="row" role="radiogroup" aria-label="New time">
              {(rp.options ?? []).map((o) => (
                <button key={o.code} type="button" role="radio" aria-checked={pick === o.code} className={`btn slot${pick === o.code ? " primary" : ""}`} onClick={() => setPick(o.code)}>
                  {o.code} · {fmtDate(o.date)} {o.start}–{o.end}
                </button>
              ))}
            </div>
            {(rp.options ?? []).length === 0 && <Note tone="warn">The agent found no free time for this session. Ask the lead to pick a time with the KT giver.</Note>}
            <div>
              <button type="button" className="btn primary" disabled={!pick} onClick={() => void decide(run.id, () => submitForm("orch", run.id, "confirm_reschedule", { choice: pick }, { reviewer }), "New time confirmed. Everyone gets the updated invite.").then(() => setPick(""))}>
                <CalendarCheck size={15} aria-hidden="true" /> Confirm the new time
              </button>
            </div>
          </Card>
        ) : (
          <WaitingFor run={run} who="joiner" />
        ))}

      {proposals.length === 0 && sessions.length === 0 ? (
        <Card>
          <p className="muted">Time proposals appear after the plan is approved by both H3 approvers.</p>
        </Card>
      ) : (
        <div className="split">
          <Card
            title={sessions.length ? "Sessions" : "Sessions and slots"}
            sub={sessions.length ? `${sessions.length} booked${changes.length ? ` · ${changes.length} moved` : ""}` : actSlots ? "Choose one option per session, then confirm." : "Proposed to the joiner"}
          >
            <div className="stack">
              {sessions.length
                ? sessions.map((x) => {
                    const st = status(x);
                    return (
                      <div key={x.day} className="card flat" style={{ padding: 12, gap: 8 }}>
                        <div className="row between">
                          <div className="stack" style={{ gap: 0 }}>
                            <span className="tiny mono" style={{ color: "var(--accent)" }}>
                              DAY {x.day} · {fmtDate(x.date)} · {x.start}–{x.end}
                            </span>
                            <b>{x.title}</b>
                          </div>
                          <Pill tone={st.tone}>{st.label}</Pill>
                        </div>
                        <div className="row between">
                          <span className="row" style={{ gap: 6 }}>
                            <Avatar name={x.giver_name} size={24} />
                            <span className="small">{x.giver_name}</span>
                          </span>
                          {canRequest && (
                            <button type="button" className="btn sm" onClick={() => setChange({ day: x.day, who: viewAs === "joiner" ? joinerName : viewAs === "giver" ? x.giver_name : x.giver_name, why: "" })}>
                              <CalendarClock size={14} aria-hidden="true" /> Can't make it
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                : proposals.map((p) => (
                    <div key={p.day} className="card flat" style={{ padding: 12, gap: 8 }}>
                      <div className="row between">
                        <div className="stack" style={{ gap: 0 }}>
                          <span className="tiny mono" style={{ color: "var(--accent)" }}>
                            DAY {p.day} · {fmtDate(p.date)}
                          </span>
                          <b>{p.title}</b>
                        </div>
                        <span className="row" style={{ gap: 6 }}>
                          <Avatar name={p.giver_name} size={24} />
                          <span className="small">{p.giver_name}</span>
                        </span>
                      </div>
                      <div className="row" role="radiogroup" aria-label={`Day ${p.day} options`}>
                        {p.options.map((o) => (
                          <button key={o.code} type="button" role="radio" aria-checked={choice(p.day) === o.code} disabled={!actSlots} className={`btn sm slot${choice(p.day) === o.code ? " primary" : ""}`} onClick={() => setPicks({ ...picks, [p.day]: o.code })}>
                            {o.code} · {o.start}–{o.end}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
            </div>
            {actSlots && (
              <div className="actions">
                <button type="button" className="btn primary" onClick={() => void decide(run.id, () => submitForm("orch", run.id, "confirm_slots", { slot_choices: codes }, { reviewer }), "Times confirmed. Sessions booked; invites go to everyone.")}>
                  <CalendarCheck size={15} aria-hidden="true" /> Confirm these times
                </button>
                <span className="small muted mono">{codes}</span>
              </div>
            )}
            {gate === "kt_done" && <p className="tiny muted">Anyone can say they can't make a session. The agent proposes new times to {joinerName} and re-sends the invite once a time is picked.</p>}
          </Card>

          <div className="stack" style={{ gap: 16 }}>
            <Card title={sessions.length ? "Calendar" : "Calendar preview"}>
              {weeks(events).map((w, i) => (
                <Calendar key={i} events={w} />
              ))}
              <div className="row">
                <Pill tone="info">Booked</Pill>
                <Pill tone="agent">Rescheduled</Pill>
                <Pill tone="warn">Waiting for confirmation</Pill>
              </div>
            </Card>
            <Card title="Messages from the agent" sub="Emails sent through AgentMesh's Notification Router">
              {mails.length === 0 ? (
                <p className="small muted">No emails yet. The agent emails the time proposals once the plan is approved.</p>
              ) : (
                <div className="stack">
                  {mails.map((m, i) => (
                    <div key={i} className="row between">
                      <span className="row small" style={{ gap: 6, minWidth: 0 }}>
                        <Mail size={14} aria-hidden="true" />
                        <span>
                          <b>{m.what}</b> → {m.to || "joiner"}
                        </span>
                      </span>
                      <Pill tone={deliveryTone(m.status)}>{m.status}</Pill>
                    </div>
                  ))}
                </div>
              )}
              {s.invite_html && (
                <details>
                  <summary className="small" style={{ cursor: "pointer" }}>
                    Show the proposal email
                  </summary>
                  <div className="mail" style={{ marginTop: 8 }}>
                    <div className="mh">
                      <b>Confirm your KT sessions</b>
                      <span className="muted">To: {String(s.email ?? "")}</span>
                    </div>
                    <div className="mb small" style={{ whiteSpace: "pre-wrap" }}>
                      {stripHtml(String(s.invite_html))}
                    </div>
                  </div>
                </details>
              )}
            </Card>
            {changes.length > 0 && (
              <Card title="Changes">
                <div className="stack small">
                  {changes.map((c, i) => (
                    <div key={i}>
                      <b>Day {c.day}</b> moved from {c.from} to <b>{c.to}</b>
                      <div className="tiny muted">
                        Asked by {c.requested_by ?? "?"}
                        {c.reason ? ` · ${c.reason}` : ""}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
            <Note>Free and busy times come from the KT givers' calendar table in AgentMesh. Reading Outlook calendars directly is on the roadmap (it needs Microsoft Graph consent from the tenant admin).</Note>
          </div>
        </div>
      )}

      {change && (
        <Modal title={`Move day ${change.day}?`} onClose={() => setChange(null)}>
          <p className="small">The agent finds two new times that suit the KT giver's calendar, emails them to {joinerName}, and re-books once a time is picked.</p>
          <Field label="Who can't make it">
            <select className="input" value={change.who} onChange={(e) => setChange({ ...change, who: e.target.value })}>
              {people.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Reason (optional, shared with the joiner)">
            <input className="input" value={change.why} onChange={(e) => setChange({ ...change, why: e.target.value })} placeholder="e.g. Clashes with a release call" />
          </Field>
          <div className="actions">
            <button type="button" className="btn primary" onClick={sendChange}>
              Ask the agent for new times
            </button>
            <button type="button" className="btn" onClick={() => setChange(null)}>
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
