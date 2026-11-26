import { useMemo, useState } from "react";
import { Check, CheckCircle2, Circle, X } from "lucide-react";
import { useStore } from "../state/store";
import { decideGate, submitForm } from "../runtime/client";
import { PEOPLE, nameOf } from "../runtime/pauses";
import type { PlanDay } from "../runtime/types";
import { Card, Field, Kpi, Modal, Note, PageHead, Pill, Who } from "../components/ui";
import { PlanDayCard, diffPlans } from "../components/viz";
import { NoRun, RunStatus, WaitingFor, canAct } from "./common";

/** The KT giver who runs most of the (non-orientation) sessions: the second H3 approver. */
function leadGiver(plan: PlanDay[]): { name: string; email: string } {
  const count = new Map<string, { n: number; email: string }>();
  for (const d of plan.slice(1)) {
    const c = count.get(d.giver_name) ?? { n: 0, email: d.giver_email ?? "" };
    c.n += 1;
    count.set(d.giver_name, c);
  }
  const [name, v] = [...count.entries()].sort((a, b) => b[1].n - a[1].n)[0] ?? ["Lead KT giver", { email: "" }];
  return { name, email: v.email || `${name.toLowerCase().replace(/\s+/g, ".")}@zensar.example` };
}

export default function PlanReview() {
  const { selected: run, viewAs, decide, planHistory, setViewAs } = useStore();
  const [form, setForm] = useState({ move_skill_id: "", to_day: "", giver_id: "", max_sessions: "", change_request: "" });
  const [reject, setReject] = useState<string | null>(null);
  const plan = useMemo(() => run?.state.plan ?? [], [run?.state.plan]);
  const version = run?.state.plan_version ?? 0;
  const prev = run ? planHistory[run.id]?.[version - 1] : undefined;
  const diff = useMemo(() => diffPlans(prev, plan), [prev, plan]);
  if (!run) return <div className="content page"><PageHead eyebrow="Step 3 · KT plan" title="KT plan and review" agent="orch" /><NoRun what="the KT plan" /></div>;

  const s = run.state;
  const gate = run.pause?.gate;
  const skillName = (id: string) => s.role_skills?.find((r) => r.skill_id === id)?.skill_name ?? s.gaps?.find((g) => g.skill_id === id)?.skill ?? id;
  const gapSkills = new Set((s.gaps ?? []).filter((g) => g.gap > 0).map((g) => g.skill_id));
  const covered = new Set(plan.flatMap((d) => d.skills));
  const uncovered = [...gapSkills].filter((g) => !covered.has(g));
  const expert = leadGiver(plan);
  const approvers = ((run.pause?.progress?.approvers as string[] | undefined) ?? (run.pause?.progress?.reviewers as string[] | undefined) ?? []).map((a) => a.toLowerCase());
  const leadDone = approvers.includes(PEOPLE.lead.email);
  const expertDone = approvers.includes(expert.email.toLowerCase());
  const reviewing = gate === "review_plan";
  const atH3 = gate === "h3_plan_approval";
  const status = atH3 ? (leadDone ? "Waiting for expert approval" : "Waiting for your review") : reviewing ? "In review" : s.plan_approved ? "Approved" : plan.length ? "Draft" : "";

  const submitChanges = (approve: boolean) => {
    const input: Record<string, unknown> = {};
    if (approve) input.approve = true;
    else {
      if (form.move_skill_id) input.move_skill_id = form.move_skill_id;
      if (form.to_day) input.to_day = Number(form.to_day);
      if (form.giver_id) input.giver_id = form.giver_id;
      if (form.max_sessions) input.max_sessions = Number(form.max_sessions);
      if (form.change_request.trim()) input.change_request = form.change_request.trim();
    }
    void decide(run.id, () => submitForm("orch", run.id, "review_plan", input, { reviewer: PEOPLE.lead.email }), approve ? `Plan v${version} approved. Waiting for the two H3 approvals.` : "Changes sent. The plan agent is applying them.").then((r) => {
      if (r) setForm({ move_skill_id: "", to_day: "", giver_id: "", max_sessions: "", change_request: "" });
    });
  };
  const h3 = (who: "lead" | "expert") =>
    void decide(run.id, () => decideGate("orch", run.id, "h3_plan_approval", "approved", { reviewer: who === "lead" ? PEOPLE.lead.email : expert.email, notes: who === "lead" ? "Plan covers the gaps." : "Content checked." }), "Both approvals in. Scheduling starts.");
  const hasChange = Boolean(form.change_request.trim() || form.giver_id || form.max_sessions || (form.move_skill_id && form.to_day));

  return (
    <div className="content page">
      <PageHead
        eyebrow={`Step 3 · KT plan${(s.round ?? 1) > 1 ? ` · round ${s.round}` : ""}`}
        title={plan.length ? `Review ${nameOf(run)}'s plan` : "KT plan"}
        lead="Evidence first, then the plan. Change it with the controls (deterministic, no AI) or in your own words (handled by the plan AI step), then approve. Two people approve: you and the lead KT giver."
        agent="orch"
        actions={status ? <Pill tone={status === "Approved" ? "good" : status.startsWith("Waiting") ? "human" : "info"}>{status}</Pill> : undefined}
      />
      <RunStatus run={run} />
      {plan.length === 0 ? (
        <Card>
          <p className="muted">The plan appears after the gap findings are approved (H2).</p>
        </Card>
      ) : (
        <>
          <div className="grid g4">
            <Kpi value={plan.length} label="Sessions" />
            <Kpi value={`${s.plan_hours ?? Math.round((plan.reduce((n, d) => n + d.minutes, 0) / 60) * 10) / 10} h`} label="Total KT time" />
            <Kpi value={new Set(plan.map((d) => d.giver_id)).size} label="KT givers" />
            <Kpi value={`v${version}`} label={status || "Plan version"} />
          </div>
          <div className="split">
            <div className="stack" style={{ gap: 16 }}>
              <Card title="Evidence" sub="Gaps this plan must close">
                <div className="row">
                  {(s.gaps ?? [])
                    .filter((g) => g.gap > 0)
                    .map((g) => (
                      <Pill key={g.skill_id} tone={g.critical ? "bad" : "warn"}>
                        {g.skill} · gap {g.gap}
                        {g.critical ? " · critical" : ""}
                      </Pill>
                    ))}
                </div>
                {uncovered.length ? <Note tone="warn">Not covered by this version: {uncovered.map(skillName).join(", ")}. You can still approve, but the gap stays open.</Note> : <Note tone="good">Every gap is covered by at least one session.</Note>}
              </Card>
              <Card
                title={`Plan v${version}${prev ? ` · changes since v${version - 1}` : ""}`}
                actions={
                  prev ? (
                    <>
                      <Pill tone="good">new</Pill>
                      <Pill tone="warn">moved or changed</Pill>
                    </>
                  ) : undefined
                }
              >
                {s.change_summary && <Note tone="human">{s.change_summary}</Note>}
                <div className="stack">
                  {diff.map(({ day, kind, note }) => (
                    <PlanDayCard key={`${day.title}-${kind}`} d={day} kind={kind} note={note} gapSkills={gapSkills} skillName={skillName} />
                  ))}
                </div>
              </Card>
            </div>

            <div className="stack" style={{ gap: 16, position: "sticky", top: 70 }}>
              {(atH3 || s.plan_approved) && (
                <Card flat title="Approvals (H3)" actions={<Pill tone={leadDone && expertDone ? "good" : "human"}>{leadDone && expertDone ? "Approved by both" : `${approvers.length} of 2`}</Pill>}>
                  <div className="stack">
                    {[
                      { who: "lead" as const, name: `${PEOPLE.lead.name} (lead)`, done: leadDone || Boolean(s.plan_approved), role: "lead" as const },
                      { who: "expert" as const, name: `${expert.name} (lead KT giver)`, done: expertDone || Boolean(s.plan_approved), role: "giver" as const },
                    ].map((a) => (
                      <div key={a.who} className="row between">
                        <span className="row">
                          {a.done ? <CheckCircle2 size={16} color="var(--good)" aria-label="approved" /> : <Circle size={16} color="var(--faint)" aria-label="not yet" />}
                          {a.name}
                        </span>
                        {atH3 && !a.done && !run.busy && (viewAs === a.role ? (
                          <button type="button" className="btn good sm" onClick={() => h3(a.who)}>
                            <Check size={14} aria-hidden="true" /> Approve
                          </button>
                        ) : (
                          <button type="button" className="btn sm" onClick={() => setViewAs(a.role)}>
                            View as {a.role === "lead" ? "lead" : "KT giver"}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                  {atH3 && (viewAs === "lead" || viewAs === "giver") && !run.busy && (
                    <button type="button" className="btn bad sm" style={{ alignSelf: "flex-start" }} onClick={() => setReject("")}>
                      <X size={14} aria-hidden="true" /> Reject plan
                    </button>
                  )}
                </Card>
              )}
              {reviewing && canAct(run, ["review_plan"], viewAs) ? (
                <Card title="Ask for changes" sub="Fill in any of these, or approve as is.">
                  <div className="grid g2">
                    <Field label="Move the session on">
                      <select className="input" value={form.move_skill_id} onChange={(e) => setForm({ ...form, move_skill_id: e.target.value })}>
                        <option value="">Skill…</option>
                        {[...new Set(plan.flatMap((d) => d.skills))].map((id) => (
                          <option key={id} value={id}>
                            {skillName(id)}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="To day">
                      <select className="input" value={form.to_day} onChange={(e) => setForm({ ...form, to_day: e.target.value })}>
                        <option value="">Day…</option>
                        {plan.map((d) => (
                          <option key={d.day} value={d.day}>
                            Day {d.day}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Change the KT giver to">
                      <select className="input" value={form.giver_id} onChange={(e) => setForm({ ...form, giver_id: e.target.value })}>
                        <option value="">Giver…</option>
                        {(s.givers ?? []).map((g) => (
                          <option key={g.giver_id} value={g.giver_id}>
                            {g.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Max sessions">
                      <input className="input" type="number" min={1} max={plan.length} value={form.max_sessions} onChange={(e) => setForm({ ...form, max_sessions: e.target.value })} />
                    </Field>
                  </div>
                  <Field label="Anything else (free text)" hint="Handled by the refine_plan AI step when no control above is used.">
                    <textarea className="input" rows={2} value={form.change_request} onChange={(e) => setForm({ ...form, change_request: e.target.value })} placeholder="e.g. More hands-on time for the claims rules" />
                  </Field>
                  <div className="actions">
                    <button type="button" className="btn" disabled={!hasChange} onClick={() => submitChanges(false)}>
                      Apply changes
                    </button>
                    <button type="button" className="btn primary" onClick={() => submitChanges(true)}>
                      <Check size={15} aria-hidden="true" /> Approve plan v{version}
                    </button>
                  </div>
                </Card>
              ) : reviewing ? (
                <WaitingFor run={run} who="lead" />
              ) : null}
              <Card title="KT givers" sub="Picked from the pool by skill, then by lowest load.">
                {[...new Map(plan.map((d) => [d.giver_id, d])).values()].map((d) => (
                  <Who key={d.giver_id} name={d.giver_name} sub={`${plan.filter((x) => x.giver_id === d.giver_id).length} session(s)`} />
                ))}
              </Card>
            </div>
          </div>
        </>
      )}
      {reject !== null && (
        <Modal title="Reject this plan?" onClose={() => setReject(null)}>
          <Field label="Reason (kept in the audit trail)">
            <textarea className="input" rows={3} value={reject} onChange={(e) => setReject(e.target.value)} />
          </Field>
          <div className="actions">
            <button
              type="button"
              className="btn bad"
              disabled={!reject.trim()}
              onClick={() => {
                void decide(run.id, () => decideGate("orch", run.id, "h3_plan_approval", "rejected", { notes: reject, reviewer: viewAs === "giver" ? expert.email : PEOPLE.lead.email }), "Plan rejected.");
                setReject(null);
              }}
            >
              Reject plan
            </button>
            <button type="button" className="btn" onClick={() => setReject(null)}>
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
