/**
 * MOCK MODE (VITE_RUNTIME=mock): a clearly labelled stand-in for the three AgentMesh hosts, for UI work while the
 * platform is unavailable. It implements the same HTTP routes as agentmesh/API.md, and its "nodes" are TypeScript
 * ports of the orchestrator definition's own custom-code steps (score_gaps, draft_plan, apply_review, pick_slots,
 * book_sessions, grade_mcq, score_assessment), so numbers match what the real agent computes. AI steps return
 * canned synthetic text. Nothing here is AgentMesh; the UI shows a MOCK banner whenever this is in use.
 */
import type { HttpResult, RuntimeMode, Transport } from "./transport";
import type {
  AgentKey,
  FileRef,
  Gap,
  Giver,
  Grading,
  InputSchema,
  OrchState,
  PlanDay,
  Proposal,
  Question,
  RoleSkill,
  Session,
  TimelineEvent,
} from "./types";
import { AGENT_NAMES } from "./types";

// ---------------------------------------------------------------- synthetic seed data (kit: Northwind Insurance)
const SKILLS: Record<string, { name: string; topic: string; docs: string[] }> = {
  spring: { name: "Spring Boot services", topic: "Spring Boot services on the claims platform", docs: ["Claims domain primer"] },
  kafka: { name: "Kafka event streaming", topic: "Kafka on claims-events: retries and idempotent consumers", docs: ["Claims events design", "Incident playbook"] },
  claims: { name: "Claims domain and rules", topic: "Claims lifecycle: FNOL to settlement", docs: ["Claims domain primer"] },
  pg: { name: "PostgreSQL and data model", topic: "Claims data model in PostgreSQL", docs: ["Claims domain primer"] },
  cicd: { name: "CI/CD and release process", topic: "Release process: pipelines, CAB and approvals", docs: ["Release runbook"] },
  obs: { name: "Observability and incidents", topic: "Dashboards, alerts and the P1 process", docs: ["Incident playbook"] },
  ways: { name: "Client ways of working", topic: "Northwind ways of working", docs: ["Engagement handbook", "Owner directory"] },
};
const ROLE: Record<string, [string, number, boolean][]> = {
  java: [["spring", 4, true], ["kafka", 4, true], ["claims", 3, true], ["pg", 3, false], ["cicd", 3, false], ["obs", 3, false], ["ways", 3, false]],
};
const roleSkills = (role: string): (RoleSkill & { docs: string })[] =>
  (ROLE[role] ?? ROLE.java).map(([id, req, crit]) => ({
    skill_id: id,
    skill_name: SKILLS[id].name,
    required_level: req,
    critical: crit,
    topic: SKILLS[id].topic,
    docs: SKILLS[id].docs.join(";"),
  }));

const GIVERS: (Giver & { slot_a: string; slot_b: string })[] = [
  { giver_id: "ananya", name: "Murali", email: "murali@zensar.example", skills: "claims;ways", slot_a: "10:00", slot_b: "15:00" },
  { giver_id: "rahul", name: "Prakhar", email: "prakhar@zensar.example", skills: "kafka;spring;pg", slot_a: "10:00", slot_b: "14:00" },
  { giver_id: "sneha", name: "Sneha Iyer", email: "sneha.iyer@zensar.example", skills: "cicd;ways", slot_a: "11:00", slot_b: "15:00" },
  { giver_id: "karan", name: "Karan Shah", email: "karan.shah@zensar.example", skills: "obs;pg;spring", slot_a: "10:00", slot_b: "16:00" },
  { giver_id: "divya", name: "Divya Menon", email: "divya.menon@zensar.example", skills: "pw;api;tdata;triage", slot_a: "11:00", slot_b: "14:00" },
];
const CALENDAR = [
  { giver_id: "rahul", date: "2026-12-01", start: "14:00", status: "busy" },
  { giver_id: "ananya", date: "2026-12-02", start: "10:00", status: "busy" },
];
const CFG = { w: [10, 20, 35, 35], max_days: 6, orientation: true, pass_overall: 70, pass_critical: 60, max_rounds: 3 };

type Ratings = [number | null, number | null, number | null, number | null];
const PRIYA_EVIDENCE: Record<string, { r: Ratings; quotes: string[] }> = {
  spring: { r: [4, 4, 4, 4], quotes: ["L1: Clearly explained layered design, testing and error handling.", "L3: Delivered two services end to end at her last project."] },
  kafka: { r: [3, 3, 2, 2], quotes: ["L1: Knows producers and consumers; unsure about retries and dead-letter topics.", "L2: Could not explain how consumers stay idempotent when a message is retried."] },
  claims: { r: [1, null, 1, 1], quotes: ["L2: Limited insurance exposure; could not describe a claim lifecycle.", "L3: No insurance background; needs a domain primer early."] },
  pg: { r: [3, 3, 3, null], quotes: ["L1: Writes joins comfortably; new to our schema.", "L2: Comfortable with indexes and transactions."] },
  cicd: { r: [3, 2, null, 2], quotes: ["L1: Has not worked with release approvals.", "L3: Used Jenkins but never a change advisory board."] },
  obs: { r: [2, null, 2, null], quotes: ["L2: Has read dashboards; has not handled a P1."] },
  ways: { r: [3, null, 3, 3], quotes: ["L2: Communicates clearly; new to client-facing work.", "L3: Good attitude; will need help with Northwind contacts at first."] },
};
function evidenceFor(candidate: string): Record<string, { r: Ratings; quotes: string[] }> {
  if (candidate === "priya-sharma" || candidate === "auditee") return PRIYA_EVIDENCE;
  // Any other synthetic joiner: deterministic ratings derived from the id.
  let h = 0;
  for (const c of candidate) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const out: Record<string, { r: Ratings; quotes: string[] }> = {};
  for (const id of Object.keys(SKILLS)) {
    h = (h * 1103515245 + 12345) >>> 0;
    const base = 1 + (h % 5);
    out[id] = { r: [Math.min(5, base + 1), base, Math.max(1, base - (h % 2)), base], quotes: [`L2: Rated ${base}/5 on ${SKILLS[id].name.toLowerCase()}.`] };
  }
  return out;
}

// ---------------------------------------------------------------- ports of the definition's code steps
const round05 = (n: number) => Math.round(n * 2) / 2;

function scoreGaps(s: OrchState): Partial<OrchState> {
  const ev = evidenceFor(String(s.candidate_id));
  const gaps: Gap[] = (s.role_skills ?? []).map((rs) => {
    const e = ev[rs.skill_id] ?? { r: [null, null, null, null] as Ratings, quotes: [] };
    let num = 0;
    let den = 0;
    e.r.forEach((v, i) => {
      if (v !== null) {
        num += v * CFG.w[i];
        den += CFG.w[i];
      }
    });
    const current = den ? round05(num / den) : 0;
    const required = Number(rs.required_level) || 3;
    const gap = Math.max(0, required - current);
    const interviews = e.r.slice(1).filter((v): v is number => v !== null);
    const present = e.r.filter((v): v is number => v !== null);
    const spread = present.length > 1 ? Math.max(...present) - Math.min(...present) : 0;
    return {
      skill_id: rs.skill_id,
      skill: rs.skill_name,
      required,
      current,
      gap,
      critical: rs.critical === true,
      verdict: gap <= 0 ? "Met" : gap <= 1 ? "Partial" : "Not met",
      confidence: interviews.length >= 2 && spread <= 1 ? "High" : interviews.length ? "Medium" : "Low",
      source: interviews.length ? "Interview-validated" : "Resume-inferred",
      ratings: { resume: e.r[0], l1: e.r[1], l2: e.r[2], l3: e.r[3] },
      quotes: e.quotes,
    };
  });
  const open = gaps.filter((g) => g.gap > 0);
  return { gaps, gap_count: open.length, critical_gap_count: open.filter((g) => g.critical).length };
}

function draftPlan(s: OrchState): Partial<OrchState> {
  const rnd = s.round ?? 1;
  const load: Record<string, number> = {};
  const pick = (sid: string) => {
    const pool = (GIVERS.filter((g) => (g.skills ?? "").split(";").includes(sid)).length ? GIVERS.filter((g) => (g.skills ?? "").split(";").includes(sid)) : GIVERS)
      .slice()
      .sort((a, b) => (load[a.giver_id] ?? 0) - (load[b.giver_id] ?? 0));
    const g = pool[0];
    load[g.giver_id] = (load[g.giver_id] ?? 0) + 1;
    return g;
  };
  const docsFor = (ids: string[]) => ids.flatMap((id) => SKILLS[id]?.docs ?? []);
  const day = (title: string, ids: string[], minutes: number, why: string, format: string, docs?: string[], giver?: Giver): PlanDay => {
    const g = giver ?? pick(ids[0]);
    return { day: 0, title, skills: ids, minutes, why, format, giver_id: g.giver_id, giver_name: g.name, giver_email: g.email, docs: docs ?? docsFor(ids) };
  };
  const name = (sid: string) => SKILLS[sid]?.name ?? sid;
  let days: PlanDay[] = [];
  if (rnd > 1) {
    for (const sid of s.weak_skills ?? []) {
      days.push(day(`Deep dive: ${SKILLS[sid]?.topic ?? sid}`, [sid], 60, `Round ${rnd}: assessment score ${s.scores?.[sid] ?? "?"}% on ${name(sid)}`, "Worked examples and practice questions"));
    }
  } else {
    const gaps = (s.gaps ?? []).filter((g) => g.gap > 0).sort((a, b) => Number(!a.critical) - Number(!b.critical) || b.gap - a.gap);
    if (CFG.orientation) days.push(day("Project orientation and who owns what", ["ways"], 45, "Standard first day for every joiner (config: orientation)", "Walkthrough", ["Engagement handbook", "Owner directory"]));
    const small: Gap[] = [];
    for (const g of gaps) {
      if (g.gap >= 2 && g.critical) {
        const giver = pick(g.skill_id);
        days.push(day(SKILLS[g.skill_id].topic, [g.skill_id], 60, `Gap ${g.gap} on a critical skill`, "Walkthrough", undefined, giver));
        days.push(day(`Hands-on: ${name(g.skill_id).toLowerCase()} on real tickets`, [g.skill_id], 60, "Second session because the gap is 2 or more", "Hands-on lab", undefined, giver));
      } else if (g.gap >= 1.5) {
        days.push(day(SKILLS[g.skill_id].topic, [g.skill_id], 60, `Gap ${g.gap}${g.critical ? " on a critical skill" : ""}`, "Walkthrough and quick check"));
      } else small.push(g);
    }
    for (let i = 0; i < small.length; i += 2) {
      const a = small[i];
      const b = small[i + 1];
      const ids = b ? [a.skill_id, b.skill_id] : [a.skill_id];
      days.push(day(b ? `${name(a.skill_id)} and ${name(b.skill_id).toLowerCase()}` : SKILLS[a.skill_id].topic, ids, 45, "Small gaps combined into one session", "Walkthrough"));
    }
    const crit = gaps.filter((g) => g.critical).map((g) => g.skill_id);
    if (crit.length && days.length < CFG.max_days) {
      days.push(day("Hands-on: walk through a past incident, start to finish", crit, 60, "Critical gaps close best with a real end-to-end example", "Hands-on lab", ["Incident playbook"]));
    }
  }
  days = days.slice(0, CFG.max_days).map((d, i) => ({ ...d, day: i + 1 }));
  return {
    plan: days,
    plan_days: days.length,
    plan_hours: Math.round((days.reduce((n, d) => n + d.minutes, 0) / 60) * 10) / 10,
    plan_version: (s.plan_version ?? 0) + 1,
    change_summary: "",
  };
}

function applyReview(s: OrchState): Partial<OrchState> & { needs_ai_refine: boolean } {
  const review = (s.review ?? {}) as Record<string, unknown>;
  const plan = (s.plan ?? []).map((d) => ({ ...d, _moved: false }));
  const done: string[] = [];
  const skill = String(review.move_skill_id ?? "").trim().toLowerCase();
  const toDay = Number.parseInt(String(review.to_day ?? ""), 10);
  if (skill && toDay) {
    const idx = plan.findIndex((d) => d.skills.map((x) => x.toLowerCase()).includes(skill) && !d.title.toLowerCase().startsWith("hands-on"));
    if (idx >= 0) {
      const [moved] = plan.splice(idx, 1);
      moved._moved = true;
      plan.splice(Math.max(0, Math.min(plan.length, toDay - 1)), 0, moved);
      done.push(`Moved "${moved.title}" to day ${toDay}`);
    } else done.push(`No session covers ${skill}, so nothing was moved`);
  }
  const gid = String(review.giver_id ?? "").trim().toLowerCase();
  const g = GIVERS.find((x) => x.giver_id === gid);
  if (g) {
    const hit = plan.filter((d) => !skill || d.skills.map((x) => x.toLowerCase()).includes(skill));
    hit.forEach((d) => Object.assign(d, { giver_id: gid, giver_name: g.name, giver_email: g.email }));
    done.push(`Assigned ${g.name} to ${hit.length} session(s)`);
  }
  const max = Number.parseInt(String(review.max_sessions ?? ""), 10);
  while (max && plan.length > Math.max(1, max)) {
    let k = 1;
    let best = Infinity;
    for (let i = 1; i < plan.length - 1; i++) {
      const pair = [plan[i], plan[i + 1]];
      if (pair.some((x) => x._moved || x.title.toLowerCase().startsWith("hands-on"))) continue;
      const m = plan[i].minutes + plan[i + 1].minutes;
      if (m < best) {
        best = m;
        k = i;
      }
    }
    const a = plan[k];
    const b = plan[k + 1] ?? plan[k - 1];
    const merged = { ...a, title: `${a.title} + ${b.title}`, skills: [...new Set([...a.skills, ...b.skills])], minutes: Math.min(90, a.minutes + b.minutes - 15), docs: [...new Set([...a.docs, ...b.docs])], why: "Merged at the reviewer's request" };
    plan.splice(Math.min(k, plan.indexOf(b)), 2, merged);
  }
  if (max) done.push(`Plan now has ${plan.length} sessions`);
  const out = plan.map(({ _moved: _m, ...d }, i) => ({ ...d, day: i + 1 }));
  const freeText = String(review.change_request ?? "").trim();
  return { plan: out, plan_days: out.length, plan_version: (s.plan_version ?? 1) + (done.length ? 1 : 0), change_summary: done.join(". "), needs_ai_refine: Boolean(freeText) && !done.length };
}

const addMin = (t: string, m: number) => {
  const [h, mm] = t.split(":").map(Number);
  const total = h * 60 + mm + m;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};
const nextWeekday = (d: Date) => {
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d;
};

function pickSlots(s: OrchState): Partial<OrchState> {
  let d = new Date(`${(s.start_date ?? "2026-11-30").slice(0, 10)}T00:00:00Z`);
  const rnd = s.round ?? 1;
  if (rnd > 1) d.setUTCDate(d.getUTCDate() + 7 * (rnd - 1) + 7);
  d = nextWeekday(d);
  const proposals: Proposal[] = (s.plan ?? []).map((p, i) => {
    if (i > 0) d = nextWeekday(new Date(d.getTime() + 86_400_000));
    const iso = d.toISOString().slice(0, 10);
    const busy = new Set(CALENDAR.filter((c) => c.giver_id === p.giver_id && c.date === iso).map((c) => c.start));
    const g = GIVERS.find((x) => x.giver_id === p.giver_id);
    const starts: string[] = [];
    for (const t of [g?.slot_a, g?.slot_b, "11:00", "16:00", "14:00", "10:00"]) if (t && !busy.has(t) && !starts.includes(t)) starts.push(t);
    return {
      day: i + 1,
      date: iso,
      title: p.title,
      minutes: p.minutes,
      giver_name: p.giver_name,
      giver_email: p.giver_email,
      options: starts.slice(0, 2).map((t, j) => ({ code: `${i + 1}${"AB"[j]}`, start: t, end: addMin(t, p.minutes) })),
    };
  });
  return { proposals };
}

function bookSessions(s: OrchState): Partial<OrchState> {
  const raw = String((s.slot_answer as Record<string, unknown> | undefined)?.slot_choices ?? "");
  const picks = new Set(raw.replace(/;/g, ",").split(",").map((x) => x.trim().toUpperCase()).filter(Boolean));
  const stamp = (day: string, t: string) => `${day.replace(/-/g, "")}T${t.replace(":", "")}00`;
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Zensar Handover//KT//EN", "METHOD:REQUEST"];
  const sessions: Session[] = (s.proposals ?? []).map((p) => {
    const o = p.options.find((x) => picks.has(x.code.toUpperCase())) ?? p.options[0];
    ics.push("BEGIN:VEVENT", `UID:mock-${s.candidate_id}-${p.day}`, `DTSTART;TZID=Asia/Kolkata:${stamp(p.date, o.start)}`, `DTEND;TZID=Asia/Kolkata:${stamp(p.date, o.end)}`, `SUMMARY:KT Day ${p.day}: ${p.title}`, "END:VEVENT");
    return { day: p.day, date: p.date, start: o.start, end: o.end, title: p.title, giver_name: p.giver_name, giver_email: p.giver_email, status: "booked", uid: `mock-${s.candidate_id}-${p.day}`, sequence: 0 };
  });
  ics.push("END:VCALENDAR");
  return { sessions, sessions_booked: sessions.length, ics_text: ics.join("\r\n"), invitees: invitees(s, sessions) };
}

/** The joiner plus each distinct KT giver (book_sessions / apply_reschedule, Builder fix 4). */
function invitees(s: OrchState, sessions: Session[]) {
  const seen = new Set<string>();
  const out: { name?: string; email?: string }[] = [];
  for (const [name, email] of [[s.name, s.email] as const, ...sessions.map((x) => [x.giver_name, x.giver_email] as const)]) {
    if (email && !seen.has(String(email))) {
      seen.add(String(email));
      out.push({ name: String(name ?? ""), email: String(email) });
    }
  }
  return out;
}

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

/** Port of repropose_slot (Builder fix 4): two new options for the requested day, same date first, then the next weekday. */
function reproposeSlot(s: OrchState): Partial<OrchState> {
  const req = (s.kt_done ?? {}) as Record<string, unknown>;
  const day = Number(req.reschedule_day ?? 0);
  const sessions = s.sessions ?? [];
  const cur = sessions.find((x) => x.day === day);
  if (!cur) return { reproposal: {}, reproposal_text: `There is no session on day ${day}, so nothing was moved.` };
  const len = Math.max(15, toMin(cur.end) - toMin(cur.start));
  const g = GIVERS.find((x) => x.name === cur.giver_name);
  const options: { code: string; date: string; start: string; end: string }[] = [];
  let d = new Date(`${cur.date}T00:00:00Z`);
  for (let k = 0; k < 2 && options.length < 2; k++) {
    if (k === 1) d = nextWeekday(new Date(d.getTime() + 86_400_000));
    const iso = d.toISOString().slice(0, 10);
    const busy = new Set(CALENDAR.filter((c) => c.giver_id === g?.giver_id && c.date === iso).map((c) => c.start));
    const taken = new Set(sessions.filter((x) => x.date === iso).map((x) => x.start));
    for (const t of [g?.slot_a, g?.slot_b, "11:00", "16:00", "14:00", "10:00"]) {
      if (!t || busy.has(t) || taken.has(t) || options.some((o) => o.date === iso && o.start === t)) continue;
      options.push({ code: "AB"[options.length], date: iso, start: t, end: addMin(t, len) });
      if (options.length === 2) break;
    }
  }
  const who = String(req.requested_by || "someone");
  const why = String(req.reschedule_reason || "");
  return {
    reproposal: { day, title: cur.title, giver_name: cur.giver_name, current: { date: cur.date, start: cur.start, end: cur.end }, requested_by: who, reason: why, options },
    reproposal_text: `Day ${day}, ${cur.title} with ${cur.giver_name}: ${who} asked to move it from ${cur.date} ${cur.start}${why ? ` (${why})` : ""}. New options: ${options.map((o) => `${o.code} = ${o.date} ${o.start} to ${o.end}`).join(", ") || "none found"}.`,
  };
}

/** Port of apply_reschedule (Builder fix 4). */
function applyReschedule(s: OrchState): Partial<OrchState> {
  const rp = s.reproposal ?? {};
  const choice = String((s.reschedule_answer as Record<string, unknown> | undefined)?.choice ?? "A").trim().toUpperCase().slice(0, 1);
  const opt = rp.options?.find((o) => o.code === choice) ?? rp.options?.[0];
  const changes = [...(s.schedule_changes ?? [])];
  const sessions = (s.sessions ?? []).map((x) => {
    if (!opt || x.day !== rp.day) return x;
    changes.push({ day: x.day, title: x.title, from: `${x.date} ${x.start}`, to: `${opt.date} ${opt.start}`, requested_by: rp.requested_by, reason: rp.reason });
    return { ...x, date: opt.date, start: opt.start, end: opt.end, status: "rescheduled", sequence: (x.sequence ?? 0) + 1 };
  });
  const stamp = (day: string, t: string) => `${day.replace(/-/g, "")}T${t.replace(":", "")}00`;
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Zensar Handover//KT//EN", "METHOD:REQUEST"];
  for (const x of sessions) ics.push("BEGIN:VEVENT", `UID:${x.uid ?? ""}`, `SEQUENCE:${x.sequence ?? 0}`, `DTSTART;TZID=Asia/Kolkata:${stamp(x.date, x.start)}`, `DTEND;TZID=Asia/Kolkata:${stamp(x.date, x.end)}`, `SUMMARY:KT Day ${x.day}: ${x.title}`, "END:VEVENT");
  ics.push("END:VCALENDAR");
  return { sessions, schedule_changes: changes, ics_text: ics.join("\r\n"), invitees: invitees(s, sessions) };
}

const BANK: Record<string, [string, string[]][]> = {
  claims: [
    ["What does the claims lifecycle on the Northwind platform cover?", ["FNOL to settlement", "Quote to bind", "Renewal to cancellation", "Billing to collections"]],
    ["Which claims are routed to a senior adjuster?", ["Claims above INR 5 lakh", "Any claim with a photo attached", "Claims filed at the weekend", "Only motor claims"]],
  ],
  kafka: [
    ["A claim event fails processing three times. Where does it go?", ["The claims-events.DLQ topic", "It is dropped", "Back to the producer", "An email to StreamOps"]],
    ["How does the payments consumer stay idempotent when a message is retried?", ["It checks claim_event_id in processed_events", "It retries until the broker gives up", "It locks the topic partition", "It drops duplicates by timestamp"]],
    ["How are claim events partitioned?", ["By policy number", "By claim amount", "Round robin", "By region"]],
    ["Why is the retry limit three and not five?", ["Three retries with backoff fit the 30-second consumer timeout; five caused duplicates", "Kafka allows at most three", "Five retries cost more", "It is a library default"]],
  ],
  cicd: [["Who approves a production release?", ["Fatima Khan, the Northwind release manager", "The on-call engineer", "Any senior developer", "The Zensar delivery head"]]],
  obs: [["What does a P1 mean in the incident process?", ["Page on-call and open the bridge", "Log a ticket for the next sprint", "Email the client", "Restart the service"]]],
};
function genQuestions(s: OrchState): Partial<OrchState> {
  const plan = (s.round ?? 1) > 1 ? (s.weak_skills ?? []).flatMap((sid) => (BANK[sid] ?? []).map((q) => [sid, q] as const)) : [...BANK.claims.map((q) => ["claims", q] as const), ...BANK.kafka.slice(0, 3).map((q) => ["kafka", q] as const)];
  const questions: Question[] = plan.slice(0, 5).map(([sid, [text, opts]], i) => {
    const rot = (i * 3 + 1) % 4; // rotate so the right answer isn't always A
    const options = opts.map((_, k) => opts[(k + rot) % 4]);
    return { qid: `q${i + 1}`, skill_id: sid, question: text, options, correct: "ABCD"[options.indexOf(opts[0])] };
  });
  return { questions, questions_text: questions.map((q, i) => `${i + 1}. ${q.question}\n${q.options.map((o, k) => `   ${"ABCD"[k]}) ${o}`).join("\n")}`).join("\n") };
}

function gradeAndScore(s: OrchState): Partial<OrchState> {
  const answers = (s.answers ?? {}) as Record<string, unknown>;
  const grading: Grading[] = (s.questions ?? []).map((q, i) => {
    const given = String(answers[`a${i + 1}`] ?? "").trim().toUpperCase().slice(0, 1);
    return { qid: q.qid, skill_id: q.skill_id, given, expected: q.correct ?? "", correct: Boolean(given) && given === q.correct };
  });
  const tally: Record<string, [number, number]> = {};
  for (const g of grading) {
    const t = (tally[g.skill_id] ??= [0, 0]);
    t[1] += 1;
    if (g.correct) t[0] += 1;
  }
  const scores: Record<string, number> = (s.round ?? 1) > 1 ? { ...(s.scores ?? {}) } : {};
  for (const [sid, [ok, total]] of Object.entries(tally)) scores[sid] = total ? Math.round((100 * ok) / total) : 0;
  const vals = Object.values(scores);
  const overall = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
  const crit = new Set((s.role_skills ?? []).filter((r) => r.critical === true).map((r) => r.skill_id));
  const weak: string[] = [];
  let critOk = true;
  for (const [sid, v] of Object.entries(scores)) {
    if (crit.has(sid) && v < CFG.pass_critical) {
      critOk = false;
      weak.push(sid);
    } else if (!crit.has(sid) && v < CFG.pass_overall) weak.push(sid);
  }
  const ready = overall >= CFG.pass_overall && critOk;
  return { grading, scores, overall, ready, weak_skills: weak, outcome: ready ? "ready" : (s.round ?? 1) >= CFG.max_rounds ? "escalate" : "retrain" };
}

// ---------------------------------------------------------------- node catalogue (durations, models, costs)
const LLM: Record<string, [string, number, number]> = {
  extract_evidence: ["gpt-4.1", 0.00592, 3200],
  explain_gaps: ["DeepSeek-V4-Flash", 0.00033, 1400],
  summarise_notes: ["gpt-5.4-mini", 0.00272, 2100],
  gen_questions: ["gpt-5.4", 0.01551, 3600],
  refine_plan: ["gpt-5.4", 0.012, 3000],
  answer: ["DeepSeek-V4-Pro", 0.0049, 2600],
  turn: ["gpt-5.4-mini", 0.002, 2200],
  write_notes: ["gpt-5.4-mini", 0.0023, 2400],
};
const SLOW: Record<string, number> = { mask_resume: 1100, mask_l1: 900, mask_l2: 900, mask_l3: 950, store_docs: 1300, search_project: 1600, send_proposals: 700, send_certificate: 700, write_invites: 600, write_certificate: 900, store_notes: 800, fetch_notes: 500, store_expert_answers: 700, search: 900, context: 800, check: 1100, __input_governance__: 380, __output_governance__: 420 };
const SPEED = 0.33; // the mock waits a third of the "recorded" duration so the UI demo moves along

const SEG = {
  toH2: ["__input_governance__", "route_mode", "check_input", "mask_resume", "mask_l1", "mask_l2", "mask_l3", "store_docs", "load_role_skills", "load_config", "extract_evidence", "score_gaps", "explain_gaps", "save_gaps"],
  toReview: ["after_h2", "load_givers", "search_project", "draft_plan"],
  toSlots: ["save_plan", "load_calendar", "pick_slots", "invite_email", "send_proposals"],
  toKtDone: ["book_sessions", "write_invites", "save_sessions", "send_invites"],
  reschedule: ["repropose_slot", "send_reproposal"],
  rebook: ["apply_reschedule", "write_invites", "save_sessions", "send_invites"],
  toH1: ["store_notes", "fetch_notes", "summarise_notes"],
  toTest: ["store_expert_answers", "gen_questions"],
  grade: ["grade_mcq", "score_assessment", "save_assessment"],
  round2: ["next_round", "draft_plan"],
  finish: ["mark_ready", "certificate_text", "write_certificate", "send_certificate", "__output_governance__"],
};

interface MockRun {
  id: string;
  agent: AgentKey;
  status: string;
  state: OrchState & Record<string, unknown>;
  timeline: TimelineEvent[];
  created_at: string;
  updated_at: string;
  current_node: string | null;
  gate: string | null;
  approvals: string[];
  files: FileRef[];
  input: Record<string, unknown>;
  error: string | null;
}

const ASK_SCHEMAS: Record<string, InputSchema> = {
  review_plan: { type: "object", required: [], properties: { approve: { type: "boolean", title: "Approve this plan" }, move_skill_id: { type: "string", title: "Skill id" }, to_day: { type: "integer", title: "To day" }, giver_id: { type: "string", title: "Giver id" }, max_sessions: { type: "integer", title: "Max sessions" }, change_request: { type: "string", title: "Change request" } } },
  confirm_slots: { type: "object", required: ["slot_choices"], properties: { slot_choices: { type: "string", title: "Slot choices (e.g. 1A,2B,3A)" } } },
  kt_done: { type: "object", required: [], properties: { session_notes: { type: "string", title: "Session notes or transcript" }, sessions_completed: { type: "boolean", title: "Sessions completed" }, reschedule_day: { type: "integer", title: "Move the session on day" }, requested_by: { type: "string", title: "Who asked" }, reschedule_reason: { type: "string", title: "Reason" } } },
  confirm_reschedule: { type: "object", required: ["choice"], properties: { choice: { type: "string", title: "New time (A or B)" } } },
  h1_expert_answers: { type: "object", required: ["answers", "approve_notes"], properties: { answers: { type: "string", title: "Answers to the open questions" }, approve_notes: { type: "boolean", title: "Approve the notes" } } },
  take_assessment: { type: "object", required: [], properties: Object.fromEntries([1, 2, 3, 4, 5].map((i) => [`a${i}`, { type: "string", title: `Answer ${i}`, description: "A, B, C or D" }])) },
};
const GATE_KIND = (gate: string) => (gate in ASK_SCHEMAS ? "input" : "gate");
const MIN_APPROVALS: Record<string, number> = { h3_plan_approval: 2 };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const nowIso = () => new Date().toISOString();
const hex = (n: number) => Array.from({ length: n }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");

class MockBackend {
  runs: MockRun[] = [];
  expertAnswers: string[] = [];
  private files = new Map<string, { content: string; type: string }>();
  private seeded: Promise<void>;

  constructor() {
    this.seeded = this.seed();
  }

  // -------- simulation
  private async step(run: MockRun, node: string, fast: boolean) {
    run.current_node = node;
    const llm = LLM[node];
    const ms = llm ? llm[2] + Math.round(Math.random() * 600) : (SLOW[node] ?? 30 + Math.round(Math.random() * 140));
    if (!fast) await sleep(Math.min(1400, ms * SPEED));
    this.apply(run, node);
    run.timeline.push({ type: "node_completion", node, status: "ok", duration_ms: ms, model: llm?.[0], cost_usd: llm?.[1], timestamp: nowIso() });
    run.updated_at = nowIso();
  }

  private async segment(run: MockRun, nodes: string[], then: string | null, fast = false) {
    run.status = "running";
    run.gate = null;
    for (const n of nodes) await this.step(run, n, fast);
    run.current_node = then;
    if (then) {
      run.status = "pending_hitl";
      run.gate = then;
      run.approvals = [];
      run.timeline.push({ type: "hitl_waiting", gate: then, node: then, timestamp: nowIso() });
    } else {
      run.status = "completed";
    }
    run.updated_at = nowIso();
  }

  private file(run: MockRun, name: string, content: string, type: string) {
    const path = `outputs/${AGENT_NAMES[run.agent]}/2026/11/26/${hex(32)}/${name}`;
    this.files.set(path, { content, type });
    const ref: FileRef = { name, size: content.length, content_type: type, path, download: `/files/${path}` };
    run.files = [...run.files.filter((f) => f.name !== name), ref];
    return ref;
  }

  private apply(run: MockRun, node: string) {
    const s = run.state;
    const set = (p: Partial<OrchState> & Record<string, unknown>) => Object.assign(s, p);
    switch (node) {
      case "load_role_skills":
        return set({ role_skills: roleSkills(String(s.role_id ?? "java")) });
      case "load_givers":
        return set({ givers: GIVERS });
      case "store_docs":
        return set(Object.fromEntries(["stored_resume", "stored_l1", "stored_l2", "stored_l3"].map((k) => [k, { status: "indexed", collection: `handover-${k.replace("stored_", "")}`, scope: "agent" }])));
      case "score_gaps":
        return set(scoreGaps(s));
      case "explain_gaps": {
        const g = (s.gaps ?? []).filter((x) => x.gap > 0).sort((a, b) => b.gap - a.gap);
        return set({ gap_explanation: g.length ? `${s.name} is strongest on ${(s.gaps ?? []).filter((x) => x.verdict === "Met").map((x) => x.skill).join(", ") || "none of the skills"}. The biggest gaps are ${g.slice(0, 2).map((x) => `${x.skill} (${x.current} of ${x.required})`).join(" and ")}. All three panels agree on the claims domain gap; the resume claims more Kafka than the L2 and L3 panels found.` : `${s.name} meets every skill the role needs.` });
      }
      case "after_h2":
        return set({ gaps_approved: true });
      case "search_project":
        // Mirrors the live step: knowledge.search_multi returns a list of hits.
        return set({ project_context: ["Engagement handbook", "Incident playbook", "Owner directory", "Claims domain primer"].map((title, i) => ({ id: `mock-${i}`, score: 0.6 - i * 0.05, text: `(${title}, synthetic)`, metadata: { title, collection: "handover-project" } })) });
      case "draft_plan":
        return set(draftPlan(s));
      case "apply_review":
        return set(applyReview(s));
      case "refine_plan":
        return set({ change_summary: "(Mock) Free-text change requests need the live refine_plan AI step; the plan is unchanged." });
      case "render_plan":
        return set({ plan_version: (s.plan_version ?? 1) + 1 });
      case "save_plan":
        return set({ plan_approved: true });
      case "pick_slots":
        return set(pickSlots(s));
      case "book_sessions":
        return set(bookSessions(s));
      // Email steps: mock mode never sends anything; the record says so.
      case "send_proposals":
        return set({ proposal_delivery: { status: "mock: not sent", channel: "email", recipient: s.email } });
      case "send_invites":
        return set({ invites_delivery: (s.invitees ?? []).map((i) => ({ status: "mock: not sent", channel: "email", recipient: i.email })) });
      case "send_reproposal":
        return set({ reproposal_delivery: { status: "mock: not sent", channel: "email", recipient: s.email } });
      case "repropose_slot":
        return set(reproposeSlot(s));
      case "apply_reschedule":
        return set(applyReschedule(s));
      case "write_invites":
        return set({ ics_file: this.file(run, `handover-${s.candidate_id}-kt.ics.txt`, String(s.ics_text ?? ""), "text/plain") });
      case "summarise_notes": {
        const notes = String((s.kt_done as Record<string, unknown> | undefined)?.session_notes ?? "");
        const open = [...notes.matchAll(/open question:\s*([^?]+\?)/gi)].map((m) => m[1].trim().replace(/^./, (c) => c.toUpperCase()));
        const answered = (q: string) => this.expertAnswers.some((a) => a.toLowerCase().includes("retry") && q.toLowerCase().includes("retry"));
        const points = notes.split(/[;.]\s+/).map((x) => x.trim()).filter((x) => x && !/open question/i.test(x)).slice(0, 7);
        return set({ key_points: points, open_questions: open.filter((q) => !answered(q)) });
      }
      case "store_expert_answers":
        this.expertAnswers.push(String((s.giver_answers as Record<string, unknown> | undefined)?.answers ?? ""));
        return;
      case "gen_questions":
        return set(genQuestions(s));
      case "grade_mcq":
        return;
      case "score_assessment":
        return set(gradeAndScore(s));
      case "next_round":
        return set({ round: (s.round ?? 1) + 1, change_summary: "" });
      case "mark_ready":
        return set({ ready: true });
      case "certificate_text":
        return set({ certificate_md: `# Readiness certificate\n\n${s.name} (${s.role_id === "java" ? "Java backend engineer" : s.role_id}) is ready for Claims Platform Modernisation, Northwind Insurance.\n\nOverall assessment: ${s.overall}%. Rounds of KT: ${s.round}.` });
      case "write_certificate":
        return set({ certificate_file: this.file(run, `handover-certificate-${s.candidate_id} (MOCK).txt`, `MOCK DATA, not issued by AgentMesh.\n\n${s.certificate_md}`, "text/plain") });
      default:
        return;
    }
  }

  private newRun(agent: AgentKey, input: Record<string, unknown>): MockRun {
    const run: MockRun = { id: `mock-${hex(12)}`, agent, status: "running", state: { ...input }, timeline: [], created_at: nowIso(), updated_at: nowIso(), current_node: null, gate: null, approvals: [], files: [], input, error: null };
    this.runs.unshift(run);
    return run;
  }

  private async seed() {
    const base = { mode: "run", role_id: "java", start_date: "2026-11-30", round: 1, resume_text: "(synthetic)", l1_text: "(synthetic)", l2_text: "(synthetic)", l3_text: "(synthetic)" };
    const karthik = this.newRun("orch", { ...base, candidate_id: "karthik-rao", name: "Karthik Rao", email: "karthik.rao@zensar.example" });
    await this.segment(karthik, SEG.toH2, "h2_gap_approval", true);
    const neha = this.newRun("orch", { ...base, candidate_id: "neha-kapoor", name: "Neha Kapoor", email: "neha.kapoor@zensar.example" });
    await this.segment(neha, SEG.toH2, "h2_gap_approval", true);
    await this.segment(neha, SEG.toReview, "review_plan", true);
    neha.state.review = { approve: true };
    neha.timeline.push({ type: "hitl_decision", gate: "review_plan", decision: "submitted" });
    await this.segment(neha, [], "h3_plan_approval", true);
    neha.timeline.push({ type: "hitl_decision", gate: "h3_plan_approval", decision: "approved" });
    await this.segment(neha, SEG.toSlots, "confirm_slots", true);
  }

  // -------- routes (same as the real host; see agentmesh/API.md)
  async handle(agent: AgentKey, method: string, path: string, body: unknown): Promise<HttpResult<unknown>> {
    await this.seeded;
    const url = new URL(path, "http://mock");
    const p = url.pathname;
    const json = (status: number, data: unknown): HttpResult<unknown> => ({ status, data: structuredClone(data) });
    const own = this.runs.filter((r) => r.agent === agent);
    const row = (r: MockRun) => ({ invocation_id: r.id, agent: AGENT_NAMES[r.agent], status: r.status, created_at: r.created_at, updated_at: r.updated_at, current_node: r.current_node, timeline: r.timeline, latest_state: r.state, files_produced: r.files, input: r.input, error: r.error });

    if (method === "GET" && p === "/health") return json(200, { status: "healthy", service: AGENT_NAMES[agent], agents: [AGENT_NAMES[agent]], build: { commit: "mock" } });
    if (method === "GET" && p === "/invocations") {
      const limit = Number(url.searchParams.get("limit") ?? 50);
      return json(200, { invocations: own.slice(0, limit).map(row), total: own.length, limit, offset: 0 });
    }
    if (method === "GET" && p === "/invocations/stats") {
      const c = (s: string) => own.filter((r) => r.status === s).length;
      return json(200, { total: own.length, running: c("running"), completed: c("completed"), pending_hitl: c("pending_hitl"), error: c("error"), queued: 0, interrupted: 0, cancelled: 0 });
    }
    if (method === "GET" && p === "/approvals/pending") {
      return json(200, { pending: own.filter((r) => r.gate).map((r) => ({ ...this.pending(r), created_at: r.created_at })), total: own.filter((r) => r.gate).length });
    }
    let m = p.match(/^\/invocations\/([^/]+)(\/pending)?$/);
    if (method === "GET" && m) {
      const r = own.find((x) => x.id === decodeURIComponent(m![1]));
      if (!r) return json(404, { detail: `invocation '${m[1]}' not found` });
      if (m[2]) return r.gate ? json(200, this.pending(r)) : json(404, { detail: "Invocation is not waiting for approval" });
      return json(200, row(r));
    }
    m = p.match(/^\/files\/(.+)$/);
    if (method === "GET" && m) {
      const f = this.files.get(decodeURIComponent(m[1]));
      return f ? json(200, f) : json(404, { detail: "not a file this host produced" });
    }
    m = p.match(/^\/invoke\/([^/]+)$/);
    if (method === "POST" && m) return json(200, await this.invoke(agent, (body as { input?: Record<string, unknown> })?.input ?? {}));
    m = p.match(/^\/approvals\/([^/]+)$/);
    if (method === "POST" && m) return this.decide(own.find((x) => x.id === decodeURIComponent(m![1])), body as Record<string, unknown>);
    return json(404, { detail: `mock: no route for ${method} ${p}` });
  }

  private pending(r: MockRun) {
    const gate = r.gate ?? "";
    const s = r.state;
    const summary: Record<string, string> = {
      h2_gap_approval: `H2: approve the gap findings for ${s.name} (${s.role_id}). ${s.gap_count} skills have a gap, ${s.critical_gap_count} of them critical. Approving starts the KT plan.`,
      review_plan: `KT plan v${s.plan_version} for ${s.name}: ${s.plan_days} sessions. ${s.change_summary ?? ""}`,
      h3_plan_approval: `H3: approve KT plan v${s.plan_version} for ${s.name}. Two approvals are needed: the transition lead and the lead KT giver.`,
      confirm_slots: `${s.name}, pick one option per session (for example 1A,2B,3A).`,
      kt_done: `KT sessions booked for ${s.name}. When the sessions are done, confirm here. To move a session, enter its day number, who asked and why, and leave Sessions completed unticked.`,
      confirm_reschedule: `${s.name}, ${s.reproposal_text ?? ""} Pick A or B.`,
      h1_expert_answers: `H1: KT giver, please check the notes from ${s.name}'s KT sessions.`,
      take_assessment: `${s.name}, answer each question with one letter: A, B, C or D.`,
      h4_signoff: `H4: ${s.name} passed the readiness rules (overall ${s.overall}%). Sign off to issue the readiness certificate.`,
    };
    const min = MIN_APPROVALS[gate] ?? 1;
    return {
      gate,
      node: gate,
      kind: GATE_KIND(gate),
      summary: summary[gate] ?? gate,
      agent: AGENT_NAMES[r.agent],
      invocation_id: r.id,
      ...(gate in ASK_SCHEMAS ? { input_schema: ASK_SCHEMAS[gate] } : {}),
      policy: { min_approvals: min, approvers: ["reviewer"] },
      progress: { approvals: r.approvals.length, required: min, reviewers: r.approvals },
      waiting_since: r.updated_at,
    };
  }

  private async invoke(agent: AgentKey, input: Record<string, unknown>) {
    const run = this.newRun(agent, input);
    if (agent === "orch") {
      Object.assign(run.state, { mode: input.mode ?? "run", round: input.round ?? 1 });
      await this.segment(run, SEG.toH2, "h2_gap_approval");
    } else if (agent === "qa") {
      for (const n of ["__input_governance__", "search", "answer", "check", "reply", "__output_governance__"]) await this.step(run, n, false);
      Object.assign(run.state, qaAnswer(String(input.question ?? ""), this.expertAnswers));
      run.status = "completed";
    } else {
      const end = [true, "true", "yes"].includes(input.end_session as never);
      for (const n of ["__input_governance__", "context", "turn", ...(end ? ["write_notes", "store_notes", "notify_orchestrator"] : ["reply_user"]), "__output_governance__"]) await this.step(run, n, false);
      Object.assign(run.state, ktTurn(input, this.expertAnswers));
      run.status = "completed";
    }
    return { agent_name: AGENT_NAMES[agent], status: run.status === "pending_hitl" ? "pending_hitl" : run.status === "completed" ? "success" : "error", output: { ...run.state, invocation_id: run.id, invocation_status: run.status }, error: run.error, integrity: { verdict: "mock", live: 0, simulated: run.timeline.length }, files_produced: run.files };
  }

  private async decide(run: MockRun | undefined, body: Record<string, unknown>): Promise<HttpResult<unknown>> {
    const res = (status: number, data: unknown): HttpResult<unknown> => ({ status, data });
    if (!run) return res(404, { detail: "invocation not found" });
    const decision = String(body.decision ?? "");
    if (!["approved", "rejected", "submitted"].includes(decision)) return res(422, { detail: "decision must be 'approved', 'rejected' or 'submitted'" });
    if (!run.gate) return res(409, { detail: `Invocation ${run.id} is not waiting for approval` });
    const gate = run.gate;
    if (body.gate && body.gate !== gate) return res(422, { detail: `Invocation ${run.id} is waiting at '${gate}', not '${String(body.gate)}'` });
    const reviewer = String(body.reviewer || "dev@localhost");
    const min = MIN_APPROVALS[gate] ?? 1;
    if (decision === "approved" && min > 1) {
      if (run.approvals.includes(reviewer)) return res(403, { detail: `${reviewer} has already approved this gate` });
      run.approvals.push(reviewer);
      run.timeline.push({ type: "hitl_decision", gate, decision, reviewer, notes: String(body.notes ?? ""), timestamp: nowIso() });
      if (run.approvals.length < min) return res(202, { status: "partial", invocation_id: run.id, decision, reviewer, auth: "anonymous_dev", approvals: run.approvals.length, required: min, invocation_status: "pending_hitl" });
    } else {
      run.timeline.push({ type: "hitl_decision", gate, decision, reviewer, notes: String(body.notes ?? ""), timestamp: nowIso() });
    }
    const s = run.state;
    const input = (body.input ?? {}) as Record<string, unknown>;
    if (decision === "rejected" && GATE_KIND(gate) === "gate") {
      Object.assign(s, { outcome: `rejected at ${gate}` });
      await this.segment(run, ["__output_governance__"], null);
    } else {
      const store: Record<string, string> = { review_plan: "review", confirm_slots: "slot_answer", kt_done: "kt_done", confirm_reschedule: "reschedule_answer", h1_expert_answers: "giver_answers", take_assessment: "answers" };
      if (store[gate]) s[store[gate]] = decision === "rejected" ? {} : input;
      // decisions resume synchronously, like the real host: run to the next pause, then answer
      switch (gate) {
        case "h2_gap_approval":
          await this.segment(run, SEG.toReview, "review_plan");
          break;
        case "review_plan": {
          const approve = [true, "true", "yes"].includes((s.review as Record<string, unknown>)?.approve as never);
          if (approve) await this.segment(run, [], "h3_plan_approval");
          else {
            await this.segment(run, ["apply_review"], null);
            await this.segment(run, s.needs_ai_refine ? ["refine_plan", "render_plan"] : [], "review_plan");
          }
          break;
        }
        case "h3_plan_approval":
          await this.segment(run, SEG.toSlots, "confirm_slots");
          break;
        case "confirm_slots":
          await this.segment(run, SEG.toKtDone, "kt_done");
          break;
        case "kt_done":
          if (Number((s.kt_done as Record<string, unknown> | undefined)?.reschedule_day ?? 0)) await this.segment(run, SEG.reschedule, "confirm_reschedule");
          else await this.segment(run, SEG.toH1, "h1_expert_answers");
          break;
        case "confirm_reschedule":
          await this.segment(run, SEG.rebook, "kt_done");
          break;
        case "h1_expert_answers":
          await this.segment(run, SEG.toTest, "take_assessment");
          break;
        case "take_assessment":
          await this.segment(run, SEG.grade, null);
          if (s.outcome === "ready") await this.segment(run, [], "h4_signoff");
          else if (s.outcome === "retrain") await this.segment(run, SEG.round2, "review_plan");
          else await this.segment(run, ["escalate", "__output_governance__"], null);
          break;
        case "h4_signoff":
          await this.segment(run, SEG.finish, null);
          break;
      }
    }
    return res(200, { status: "ok", invocation_id: run.id, decision, reviewer, auth: "anonymous_dev", approvals: run.approvals.length || 1, required: min, invocation_status: run.status, pending: run.gate ? this.pending(run) : null, error: null });
  }

  fileContent(download: string) {
    return this.files.get(download.replace(/^\/files\//, ""));
  }
}

// ---------------------------------------------------------------- handover-qa and handover-kt-session (canned, synthetic)
function qaAnswer(q: string, expert: string[]) {
  const t = q.toLowerCase();
  if (/(panel|interview|feedback|l1|l2|l3|assessment result|score)/.test(t) && /(auditee|priya|karthik|neha|say|said|about)/.test(t))
    return { answer: "That information is not available in this chat.", trust: "Blocked", citations: [], grounded: { verdict: "not_applicable" } };
  if (/retry/.test(t) && /(three|3|five|limit)/.test(t)) {
    if (expert.length)
      return { answer: "Three retries with backoff fit inside the 30-second consumer timeout agreed with StreamOps; five retries caused duplicate-processing alerts.", trust: "Expert answer · verified", citations: ["handover-expert-answers/priya-sharma answers round 1"], grounded: { verdict: "supported", faithfulness: 1 } };
    return { answer: "The project documents don't say why the limit is three. StreamOps owns the Kafka platform; ask in #streamops-support. I've logged this as an open question.", trust: "No answer · logged", citations: ["Owner directory"], grounded: { verdict: "supported", faithfulness: 1 } };
  }
  if (/(release|deploy|production|cab)/.test(t))
    return { answer: "Fatima Khan, Northwind release manager, approves every production release. Raise the CAB request by Tuesday noon for Thursday releases.", trust: "Project documents", citations: ["Release runbook", "Owner directory"], grounded: { verdict: "supported", faithfulness: 1 } };
  if (/(fail|dlq|dead)/.test(t) && /(event|claim|kafka|message)/.test(t))
    return { answer: "Failed claim events are retried three times with backoff, then moved to the claims-events.DLQ topic.", trust: "Project documents", citations: ["Claims events design"], grounded: { verdict: "supported", faithfulness: 1 } };
  if (/(adjust|lakh|lifecycle|fnol)/.test(t))
    return { answer: "A claim runs from FNOL to settlement. Claims above INR 5 lakh go to a senior adjuster.", trust: "Project documents", citations: ["Claims domain primer"], grounded: { verdict: "supported", faithfulness: 1 } };
  if (/(p1|incident|on-call|bridge)/.test(t))
    return { answer: "A P1 means page on-call and open the bridge.", trust: "Project documents", citations: ["Incident playbook"], grounded: { verdict: "supported", faithfulness: 1 } };
  return { answer: "I couldn't find that in the project documents, expert answers or session notes. I've logged it as an open question for the transition lead.", trust: "No answer · logged", citations: [], grounded: { verdict: "no_context" } };
}

function ktTurn(input: Record<string, unknown>, expert: string[]) {
  if ([true, "true", "yes"].includes(input.end_session as never)) {
    const history = (input.history as { speaker?: string; text?: string }[] | undefined) ?? [];
    const lines = history.filter((h) => h.text).map((h) => `${h.speaker ?? "Speaker"}: ${h.text}`);
    return { reply: "Session closed. Notes saved as unverified until the KT giver approves them.", notes: `Session notes: ${String(input.session_title ?? "KT session")}\n\n${lines.join("\n") || "(no conversation captured)"}`, citations: [], open_question: "" };
  }
  const t = String(input.message ?? "").toLowerCase();
  if (/retry/.test(t) && /(three|3|five|why|limit)/.test(t)) {
    if (expert.length) return { reply: "Three retries with backoff fit inside the 30-second consumer timeout agreed with StreamOps; five caused duplicate-processing alerts.", citations: ["handover-expert-answers/priya-sharma answers round 1"], open_question: "" };
    return { reply: "The documents say failed events are retried three times and then go to claims-events.DLQ, but not why the limit is three. StreamOps owns the Kafka platform. I've logged it as an open question for the KT giver.", citations: ["Claims events design", "Owner directory"], open_question: "Why is the retry limit three and not five?" };
  }
  if (/(partition|order)/.test(t)) return { reply: "Claim events are partitioned by policy number, so events for one policy stay in order.", citations: ["Claims events design"], open_question: "" };
  if (/(idempot|duplicate|processed)/.test(t)) return { reply: "The payments consumer checks claim_event_id in the processed_events table before doing any work.", citations: ["Claims events design"], open_question: "" };
  if (/(who|owner|contact)/.test(t)) return { reply: "Anil Rao owns adjudication rules; Fatima Khan approves releases; StreamOps owns the Kafka platform.", citations: ["Owner directory"], open_question: "" };
  return { reply: "Noted. I'll add that to the session notes. Ask me about the claims flow, Kafka retries or who owns what.", citations: ["Engagement handbook"], open_question: "" };
}

const backend = new MockBackend();

export class MockTransport implements Transport {
  readonly mode: RuntimeMode = "mock";

  async request<T>(agent: AgentKey, method: "GET" | "POST", path: string, body?: unknown): Promise<HttpResult<T>> {
    await sleep(40); // a little network latency
    return (await backend.handle(agent, method, path, body)) as HttpResult<T>;
  }

  async fileBlob(_agent: AgentKey, download: string): Promise<Blob> {
    const f = backend.fileContent(download);
    if (!f) throw new Error("This file is not available in mock mode");
    return new Blob([f.content], { type: f.type });
  }
}
