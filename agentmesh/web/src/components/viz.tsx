/** Visualisations from the prototype: bullet gap bars, heatmap, plan days with diff, calendar, chat. */
import type { ReactNode } from "react";
import type { Gap, PlanDay, Session } from "../runtime/types";
import { Avatar, Pill, fmtDate } from "./ui";
import type { Tone } from "./ui";

/** Bullet bar: accent = current level, black marker = required level, grey = "before" level (optional). */
export function Bullet({ cur, req, before, max = 5 }: { cur: number; req: number; before?: number; max?: number }) {
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
  return (
    <div className="bullet" role="img" aria-label={`Current ${cur} of ${max}, required ${req}${before !== undefined ? `, before ${before}` : ""}`}>
      {before !== undefined && <div className="cur before" style={{ width: pct(before) }} />}
      <div className="cur" style={{ width: pct(cur), ...(before !== undefined ? { top: 5, bottom: 5 } : {}) }} />
      <div className="req" style={{ left: `calc(${pct(req)} - 1.5px)` }} />
      {[0, 1, 2, 3, 4, 5].map((t) => (
        <span key={t} className="tick" style={{ left: pct(t) }} aria-hidden="true">
          {t}
        </span>
      ))}
    </div>
  );
}

export const verdictTone = (v: string): Tone => (v === "Met" ? "good" : v === "Partial" ? "warn" : "bad");
export const confTone = (c: string): Tone => (c === "High" ? "good" : c === "Medium" ? "info" : "warn");

export function GapRow({ g, onOpen }: { g: Gap; onOpen?: () => void }) {
  return (
    <div className="gaprow">
      <div className="stack" style={{ gap: 0 }}>
        {onOpen ? (
          <button type="button" className="btn ghost sm" style={{ padding: 0, justifyContent: "flex-start", color: "var(--fg)" }} onClick={onOpen}>
            <b>{g.skill}</b>
          </button>
        ) : (
          <b>{g.skill}</b>
        )}
        <span className="tiny muted">
          {g.critical ? "Critical · " : ""}
          {g.source}
        </span>
      </div>
      <div style={{ paddingBottom: 14 }}>
        <Bullet cur={g.current} req={g.required} />
      </div>
      <Pill tone={verdictTone(g.verdict)}>{g.verdict === "Met" ? "Met" : `${g.verdict} · ${g.gap}`}</Pill>
      <Pill tone={confTone(g.confidence)}>{g.confidence} confidence</Pill>
    </div>
  );
}

/** Cohort heatmap: one row per joiner, one column per skill, cell = gap. */
export function Heatmap({ rows }: { rows: { name: string; gaps: Gap[] }[] }) {
  const skills = rows[0]?.gaps ?? [];
  const color = (gap: number) => (gap <= 0 ? "var(--h0)" : gap <= 0.5 ? "var(--h1)" : gap <= 1 ? "var(--h2)" : gap <= 1.5 ? "var(--h3)" : "var(--h4)");
  return (
    <div className="heat" style={{ gridTemplateColumns: `150px repeat(${skills.length}, minmax(64px,1fr))` }} role="table" aria-label="Gap heatmap">
      <div />
      {skills.map((s) => (
        <div key={s.skill_id} className="hd" role="columnheader">
          {s.skill}
          {s.critical ? " *" : ""}
        </div>
      ))}
      {rows.map((r) => (
        <div key={r.name} style={{ display: "contents" }} role="row">
          <div className="rh" role="rowheader">
            {r.name}
          </div>
          {skills.map((s) => {
            const g = r.gaps.find((x) => x.skill_id === s.skill_id);
            return (
              <div key={s.skill_id} className="c" style={{ background: color(g?.gap ?? 0) }} role="cell" title={g ? `${g.skill}: current ${g.current}, required ${g.required}` : ""}>
                {g && g.gap > 0 ? g.gap : "✓"}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export type DiffKind = "add" | "mv" | "rm" | "";
const keyOf = (d: PlanDay) => d.title;

/** Compare plan versions by session title: new, moved/changed, removed (prototype diffPlans). */
export function diffPlans(prev: PlanDay[] | undefined, next: PlanDay[]): { day: PlanDay; kind: DiffKind; note?: string }[] {
  if (!prev) return next.map((day) => ({ day, kind: "" }));
  const before = new Map(prev.map((d) => [keyOf(d), d]));
  const out: { day: PlanDay; kind: DiffKind; note?: string }[] = next.map((d) => {
    const p = before.get(keyOf(d));
    if (!p) return { day: d, kind: "add" };
    const notes: string[] = [];
    if (p.day !== d.day) notes.push(`day ${p.day} → ${d.day}`);
    if (p.giver_id !== d.giver_id) notes.push(`${p.giver_name} → ${d.giver_name}`);
    if (p.minutes !== d.minutes) notes.push(`${p.minutes} → ${d.minutes} min`);
    return { day: d, kind: notes.length ? "mv" : "", note: notes.join(" · ") || undefined };
  });
  const titles = new Set(next.map(keyOf));
  for (const p of prev) if (!titles.has(keyOf(p))) out.push({ day: p, kind: "rm" });
  return out;
}

export function PlanDayCard({ d, kind = "", note, gapSkills, skillName }: { d: PlanDay; kind?: DiffKind; note?: string; gapSkills?: Set<string>; skillName: (id: string) => string }) {
  return (
    <div className={`day ${kind}`}>
      <span className="dn">{kind === "rm" ? "REMOVED" : `DAY ${d.day}`}</span>
      <div className="stack" style={{ gap: 4 }}>
        <b>{d.title}</b>
        <span className="small muted">{d.why}</span>
        <div className="row" style={{ gap: 5 }}>
          {d.skills.map((s) => (
            <Pill key={s} tone={gapSkills?.has(s) ? "warn" : ""}>
              {skillName(s)}
            </Pill>
          ))}
          {d.docs.map((doc) => (
            <span key={doc} className="cite">
              {doc}
            </span>
          ))}
        </div>
        {note && <span className="tiny" style={{ color: "var(--warn)", fontWeight: 600 }}>Changed: {note}</span>}
        {kind === "add" && <span className="tiny" style={{ color: "var(--good)", fontWeight: 600 }}>New in this version</span>}
      </div>
      <div className="stack" style={{ alignItems: "flex-end", gap: 4 }}>
        <div className="row" style={{ gap: 6 }}>
          <Avatar name={d.giver_name} size={24} />
          <span className="small">{d.giver_name}</span>
        </div>
        <span className="tiny muted">
          {d.minutes} min · {d.format}
        </span>
      </div>
    </div>
  );
}

/** Week calendar (Mon-Fri, 9:00-16:00). Events: booked (accent) or pending (amber). */
export function Calendar({ events }: { events: { date: string; start: string; label: string; sub: string; pending?: boolean }[] }) {
  if (events.length === 0) return <p className="small muted">No sessions to show yet.</p>;
  const first = new Date(`${[...events].sort((a, b) => a.date.localeCompare(b.date))[0].date}T00:00:00Z`);
  const monday = new Date(first.getTime() - ((first.getUTCDay() + 6) % 7) * 86_400_000);
  const days = Array.from({ length: 5 }, (_, i) => new Date(monday.getTime() + i * 86_400_000).toISOString().slice(0, 10));
  const hours = [9, 10, 11, 12, 13, 14, 15, 16];
  return (
    <div style={{ overflowX: "auto" }}>
      <div className="cal" role="grid" aria-label="KT calendar">
        <div className="h" style={{ borderLeft: 0 }} />
        {days.map((d) => (
          <div key={d} className="h" role="columnheader">
            {fmtDate(d)}
          </div>
        ))}
        {hours.map((h) => (
          <div key={h} style={{ display: "contents" }}>
            <div className="t">{`${h}:00`}</div>
            {days.map((d) => {
              const ev = events.filter((e) => e.date === d && Number(e.start.split(":")[0]) === h);
              return (
                <div key={d} className="c">
                  {ev.map((e) => (
                    <div key={e.label} className={`ev${e.pending ? " pend" : ""}`} title={`${e.label} · ${e.sub}`}>
                      <b>{e.label}</b>
                      <br />
                      {e.sub}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export const sessionEvents = (sessions: Session[]) => sessions.map((s) => ({ date: s.date, start: s.start, label: `Day ${s.day} · ${s.giver_name.split(" ")[0]}`, sub: `${s.start}–${s.end}` }));

export function Bubble({ who, by, children, cites, extra }: { who: "me" | "agent" | "giver" | "sys" | "ai"; by?: string; children: ReactNode; cites?: string[]; extra?: ReactNode }) {
  return (
    <div className={`msg ${who}`}>
      {by && <span className="by">{by}</span>}
      <div style={{ whiteSpace: "pre-wrap" }}>{children}</div>
      {cites && cites.length > 0 && (
        <div className="cites">
          {cites.map((c) => (
            <span key={c} className="cite">
              {c}
            </span>
          ))}
        </div>
      )}
      {extra}
    </div>
  );
}
