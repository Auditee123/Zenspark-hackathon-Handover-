import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useStore } from "../state/store";
import { PAUSES, PEOPLE, ROLE_LABEL, nameOf } from "../runtime/pauses";
import type { Role } from "../runtime/pauses";
import type { RunView } from "../runtime/types";
import { Card, Empty, ErrorState, Loading, Note } from "../components/ui";

export function NoRun({ what = "this step" }: { what?: string }) {
  const { loaded, hostError, refresh } = useStore();
  if (!loaded) return <Card><Loading /></Card>;
  if (hostError) return <ErrorState title="The orchestrator host isn't answering" error={hostError} onRetry={() => void refresh()} />;
  return (
    <Card>
      <Empty
        title="No joiner yet"
        action={
          <Link className="btn primary" to="/onboard">
            Onboard a joiner
          </Link>
        }
      >
        Add a joiner and the agents take over. {what[0].toUpperCase() + what.slice(1)} appears here when their run reaches it.
      </Empty>
    </Card>
  );
}

/** Running / applying / failed banners for the selected run. */
export function RunStatus({ run }: { run: RunView }) {
  const { runErrors } = useStore();
  const current = run.trace.find((t) => t.status === "run")?.node;
  if (run.busy)
    return (
      <Note role="status">
        <span className="row">
          <Loader2 size={15} className="spin" aria-hidden="true" /> Applying the decision. The agent continues to its next step; this can take up to a minute.
        </span>
      </Note>
    );
  if (run.status === "running")
    return (
      <Note role="status">
        <span className="row">
          <Loader2 size={15} className="spin" aria-hidden="true" /> Agents are working on {nameOf(run)}
          {current ? (
            <>
              : <span className="mono">{current}</span>
            </>
          ) : (
            "."
          )}{" "}
          Follow each step in the agent trace.
        </span>
      </Note>
    );
  if (run.status === "error")
    return (
      <ErrorState
        title={`The run for ${nameOf(run)} stopped with an error`}
        error={runErrors[run.id] ?? run.error ?? `It stopped after step "${[...run.trace].reverse().find((t) => t.status === "done")?.node ?? "?"}". See the agent trace and the host log (logs/handover-orchestrator.log).`}
      />
    );
  return null;
}

/** Shown when the run waits for someone the current "View as" isn't. */
export function WaitingFor({ run, who: role }: { run: RunView; who: Role }) {
  const { setViewAs } = useStore();
  const person = role === "lead" ? PEOPLE.lead.name : role === "giver" ? PEOPLE.giver.name : nameOf(run);
  return (
    <Note tone="human">
      <div className="row between">
        <span>
          Waiting for <b>{person}</b> ({ROLE_LABEL[role].toLowerCase()}): {PAUSES[run.pause?.gate ?? ""]?.text(nameOf(run), run) ?? run.pause?.gate}.
        </span>
        <button type="button" className="btn sm" onClick={() => setViewAs(role)}>
          View as {ROLE_LABEL[role].toLowerCase()}
        </button>
      </div>
    </Note>
  );
}

/** True when the selected run waits at one of these gates and the viewer may act on it. */
export function canAct(run: RunView | null, gates: string[], viewAs: Role): boolean {
  if (!run?.pause || run.busy || !gates.includes(run.pause.gate)) return false;
  const role = PAUSES[run.pause.gate]?.role ?? "lead";
  if (run.pause.gate === "h3_plan_approval") return viewAs === "lead" || viewAs === "giver";
  return viewAs === role || viewAs === "lead";
}
