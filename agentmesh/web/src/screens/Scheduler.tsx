import { useState } from "react";
import { CalendarCheck, Download } from "lucide-react";
import { useStore } from "../state/store";
import { downloadFile, saveBlob, submitForm } from "../runtime/client";
import { nameOf } from "../runtime/pauses";
import { Avatar, Card, Note, PageHead, Pill, fmtDate } from "../components/ui";
import { Calendar, sessionEvents } from "../components/viz";
import { NoRun, RunStatus, WaitingFor, canAct } from "./common";

export default function Scheduler() {
  const { selected: run, viewAs, decide, toast } = useStore();
  const [picks, setPicks] = useState<Record<number, string>>({});
  if (!run) return <div className="content page"><PageHead eyebrow="Step 4 · KT scheduler" title="KT schedule" agent="orch" /><NoRun what="the KT schedule" /></div>;

  const s = run.state;
  const proposals = s.proposals ?? [];
  const sessions = s.sessions ?? [];
  const confirming = run.pause?.gate === "confirm_slots";
  const act = canAct(run, ["confirm_slots"], viewAs) && viewAs === "joiner";
  const choice = (day: number) => picks[day] ?? proposals.find((p) => p.day === day)?.options[0]?.code;
  const codes = proposals.map((p) => choice(p.day)).filter(Boolean).join(",");
  const ics = run.files.find((f) => f.name.includes(".ics"));
  const pendingEvents = proposals.map((p) => {
    const o = p.options.find((x) => x.code === choice(p.day)) ?? p.options[0];
    return { date: p.date, start: o?.start ?? "10:00", label: `Day ${p.day} · ${p.giver_name.split(" ")[0]}`, sub: o ? `${o.start}–${o.end}` : "", pending: true };
  });

  const downloadIcs = async () => {
    try {
      if (ics) await downloadFile("orch", ics);
      else if (s.ics_text) saveBlob(new Blob([s.ics_text], { type: "text/calendar" }), `handover-${s.candidate_id}-kt.ics`);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "bad");
    }
  };

  return (
    <div className="content page">
      <PageHead
        eyebrow="Step 4 · KT scheduler"
        title={viewAs === "joiner" ? "Pick a time for each KT session" : `Schedule ${nameOf(run)}'s KT`}
        lead="The scheduler checks each KT giver's calendar, offers two free slots per session, and books them once the joiner confirms. Busy times are avoided (Rahul is busy on 1 Dec at 14:00, Ananya on 2 Dec at 10:00)."
        agent="orch"
        actions={
          sessions.length ? (
            <button type="button" className="btn" onClick={() => void downloadIcs()}>
              <Download size={15} aria-hidden="true" /> Calendar invites (.ics)
            </button>
          ) : undefined
        }
      />
      <RunStatus run={run} />
      {confirming && !act && <WaitingFor run={run} who="joiner" />}
      {proposals.length === 0 && sessions.length === 0 ? (
        <Card>
          <p className="muted">Time proposals appear after the plan is approved by both H3 approvers.</p>
        </Card>
      ) : (
        <div className="split">
          <Card title={sessions.length ? "Booked sessions" : "Sessions and slots"} sub={sessions.length ? `${sessions.length} sessions booked; invites sent` : act ? "Choose one option per session, then confirm." : "Proposed to the joiner"}>
            <div className="stack">
              {(sessions.length ? sessions.map((x) => ({ day: x.day, date: x.date, title: x.title, giver_name: x.giver_name, options: [], booked: `${x.start}–${x.end}` })) : proposals.map((p) => ({ ...p, booked: "" }))).map((p) => (
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
                  {p.booked ? (
                    <Pill tone="good">Booked · {p.booked}</Pill>
                  ) : (
                    <div className="row" role="radiogroup" aria-label={`Day ${p.day} options`}>
                      {p.options.map((o) => (
                        <button key={o.code} type="button" role="radio" aria-checked={choice(p.day) === o.code} disabled={!act} className={`btn sm slot${choice(p.day) === o.code ? " primary" : ""}`} onClick={() => setPicks({ ...picks, [p.day]: o.code })}>
                          {o.code} · {o.start}–{o.end}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {act && (
              <div className="actions">
                <button type="button" className="btn primary" onClick={() => void decide(run.id, () => submitForm("orch", run.id, "confirm_slots", { slot_choices: codes }, { reviewer: String(s.email ?? "") }), "Times confirmed. Sessions booked and invites written.")}>
                  <CalendarCheck size={15} aria-hidden="true" /> Confirm these times
                </button>
                <span className="small muted mono">{codes}</span>
              </div>
            )}
          </Card>
          <div className="stack" style={{ gap: 16 }}>
            <Card title={sessions.length ? "Calendar" : "Calendar preview"}>
              <Calendar events={sessions.length ? sessionEvents(sessions) : pendingEvents} />
              <div className="row">
                <Pill tone="info">Booked</Pill>
                <Pill tone="warn">Waiting for confirmation</Pill>
              </div>
            </Card>
            <Note>Proposals reach the joiner in this app and as an .ics invite. Outlook actionable messages and Teams cards are on the roadmap.</Note>
          </div>
        </div>
      )}
    </div>
  );
}
