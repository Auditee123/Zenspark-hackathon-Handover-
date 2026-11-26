/** App shell: stage rail, top bar, mode banner, agent-trace pane, AgentMesh lens and the inbox drawer. */
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { Bell, Moon, PanelRightClose, PanelRightOpen, Sun, Waypoints } from "lucide-react";
import { useStore } from "../state/store";
import { AGENT_DEFINITIONS } from "../runtime/agents.generated";
import { PAUSES, PEOPLE, nameOf } from "../runtime/pauses";
import type { Role } from "../runtime/pauses";
import { AGENT_NAMES } from "../runtime/types";
import type { AgentKey, TraceRow } from "../runtime/types";
import { Drawer, Logo, Pill, Seg, fmtMs, fmtTime } from "./ui";

interface NavItem {
  to: string;
  n: string;
  label: string;
  sub: string;
}
const NAV: Record<Role, { group: string; items: NavItem[] }[]> = {
  lead: [
    { group: "Overview", items: [{ to: "/", n: "⌂", label: "Command centre", sub: "Pipeline and actions" }] },
    {
      group: "Onboarding journey",
      items: [
        { to: "/onboard", n: "1", label: "Onboard joiners", sub: "Form or bulk import" },
        { to: "/analysis", n: "2", label: "Gap analysis", sub: "Findings · H2" },
        { to: "/review", n: "3", label: "KT plan", sub: "Review · H3" },
        { to: "/schedule", n: "4", label: "KT scheduler", sub: "Proposals and bookings" },
        { to: "/session", n: "5", label: "KT sessions", sub: "Agent-assisted · H1" },
        { to: "/assessment", n: "6", label: "Assessment", sub: "Per skill" },
        { to: "/readiness", n: "7", label: "Readiness", sub: "H4 sign-off or round 2" },
      ],
    },
    {
      group: "Tools",
      items: [
        { to: "/ask", n: "?", label: "Ask Handover", sub: "Cited Q&A" },
        { to: "/runs", n: "≡", label: "Agent runs", sub: "AgentMesh traces" },
      ],
    },
  ],
  joiner: [
    {
      group: "My onboarding",
      items: [
        { to: "/me", n: "⌂", label: "My onboarding", sub: "Where I am" },
        { to: "/review", n: "1", label: "My KT plan", sub: "Approved plan" },
        { to: "/schedule", n: "2", label: "My schedule", sub: "Confirm times" },
        { to: "/session", n: "3", label: "My sessions", sub: "Join and review" },
        { to: "/assessment", n: "4", label: "Assessment", sub: "Take the test" },
        { to: "/ask", n: "?", label: "Ask Handover", sub: "Cited Q&A" },
      ],
    },
  ],
  giver: [
    {
      group: "KT giver",
      items: [
        { to: "/giver", n: "⌂", label: "My KT requests", sub: "Sessions and approvals" },
        { to: "/review", n: "1", label: "KT plan", sub: "Expert sign-off · H3" },
        { to: "/session", n: "2", label: "Sessions", sub: "Run and approve notes" },
        { to: "/ask", n: "?", label: "Ask Handover", sub: "Cited Q&A" },
      ],
    },
  ],
};

/** Pauses that need this role, by route. H3 needs both the lead and the KT giver. */
function useInbox() {
  const { runs, viewAs } = useStore();
  return useMemo(() => {
    const items: { run: (typeof runs)[number]; route: string; tag: string; text: string }[] = [];
    for (const r of runs) {
      if (!r.pause) continue;
      const p = PAUSES[r.pause.gate];
      const who = r.pause.gate === "h3_plan_approval" ? ["lead", "giver"] : [p?.role ?? "lead"];
      if (viewAs !== "lead" && !who.includes(viewAs)) continue;
      items.push({ run: r, route: p?.route ?? "/pause", tag: p?.tag ?? r.pause.gate, text: p ? p.text(nameOf(r), r) : `${nameOf(r)} is waiting at ${r.pause.gate}` });
    }
    return items;
  }, [runs, viewAs]);
}

export function Rail() {
  const { viewAs, selected } = useStore();
  const inbox = useInbox();
  const badge = (route: string) => inbox.filter((i) => i.route === route).length;
  const who = viewAs === "lead" ? PEOPLE.lead : viewAs === "giver" ? PEOPLE.giver : { name: selected ? nameOf(selected) : "New joiner", title: "New joiner · Java backend engineer" };
  return (
    <nav className="side" aria-label="Handover">
      <div className="brand">
        <Logo />
        <div>
          <b>Handover</b>
          <small>Onboarding and KT, run by agents</small>
        </div>
      </div>
      {NAV[viewAs].map((g) => (
        <div className="navgroup" key={g.group}>
          <div className="navlabel">{g.group}</div>
          {g.items.map((i) => (
            <NavLink key={i.to} to={i.to} end className={({ isActive }) => `nav${isActive ? " on" : ""}`}>
              <span className="n" aria-hidden="true">
                {i.n}
              </span>
              <span className="lbl">
                <span>{i.label}</span>
                <small>{i.sub}</small>
              </span>
              {badge(i.to) > 0 && (
                <span className="badge" aria-label={`${badge(i.to)} waiting`}>
                  {badge(i.to)}
                </span>
              )}
            </NavLink>
          ))}
        </div>
      ))}
      {selected && viewAs === "lead" && <p className="tiny" style={{ color: "var(--side-mute)", padding: "0 10px" }}>Following {nameOf(selected)}</p>}
      <div className="whoami">
        <span>Signed in as</span>
        <b>{who.name}</b>
        <span>{who.title}</span>
      </div>
    </nav>
  );
}

const JOURNEY_ROUTES = ["/analysis", "/review", "/schedule", "/session", "/assessment", "/readiness"];

export function TopBar() {
  const { runs, selected, select, viewAs, setViewAs, lens, setLens, theme, setTheme, traceOpen, setTraceOpen, toast } = useStore();
  const [inboxOpen, setInboxOpen] = useState(false);
  const inbox = useInbox();
  const loc = useLocation();
  const navigate = useNavigate();
  const showJoiner = JOURNEY_ROUTES.includes(loc.pathname) || viewAs === "joiner";
  const active = runs.filter((r) => r.status !== "completed" || r.state.ready);
  const changeRole = (r: Role) => {
    setViewAs(r);
    toast(r === "lead" ? `Viewing as ${PEOPLE.lead.name}, the transition lead` : r === "giver" ? `Viewing as ${PEOPLE.giver.name}, a KT giver` : `Viewing as ${selected ? nameOf(selected) : "the joiner"}, the new joiner`);
    if (r === "joiner" && !["/me", "/review", "/schedule", "/session", "/assessment", "/ask"].includes(loc.pathname)) navigate("/me");
    if (r === "giver" && !["/giver", "/review", "/session", "/ask"].includes(loc.pathname)) navigate("/giver");
    if (r === "lead" && ["/me", "/giver"].includes(loc.pathname)) navigate("/");
  };
  return (
    <header className="topbar">
      <div className="crumb">
        <b>Claims Platform Modernisation</b>
        <span>Northwind Insurance · {runs.filter((r) => !(r.status === "completed" && r.state.ready)).length} joiners in flight</span>
      </div>
      {showJoiner && active.length > 0 && (
        <select className="input" style={{ width: "auto", minWidth: 200 }} aria-label="Joiner" value={selected?.id ?? ""} onChange={(e) => select(e.target.value)}>
          {active.map((r) => (
            <option key={r.id} value={r.id}>
              {nameOf(r)} · {r.pause ? (PAUSES[r.pause.gate]?.tag ?? r.pause.gate) : r.status === "running" ? "running" : r.status === "error" ? "failed" : "done"}
            </option>
          ))}
        </select>
      )}
      <Seg<Role> label="View as" value={viewAs} onChange={changeRole} items={[{ key: "lead", label: "Lead" }, { key: "joiner", label: "Joiner" }, { key: "giver", label: "KT giver" }]} />
      <button type="button" className={`toggle${lens ? " on" : ""}`} aria-pressed={lens} aria-label="AgentMesh lens" onClick={() => setLens(!lens)} title="Show which AgentMesh agent and steps power this screen">
        <i aria-hidden="true" />
        <span className="lbl" aria-hidden="true">AgentMesh lens</span>
      </button>
      <button type="button" className="iconbtn" onClick={() => setTraceOpen(!traceOpen)} aria-pressed={traceOpen} title={traceOpen ? "Hide agent trace" : "Show agent trace"}>
        {traceOpen ? <PanelRightClose size={16} aria-hidden="true" /> : <PanelRightOpen size={16} aria-hidden="true" />}
        <span className="sr-only">Agent trace</span>
      </button>
      <button type="button" className="iconbtn" onClick={() => setTheme(theme === "light" ? "dark" : "light")} title={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}>
        {theme === "light" ? <Moon size={16} aria-hidden="true" /> : <Sun size={16} aria-hidden="true" />}
        <span className="sr-only">Toggle theme</span>
      </button>
      <button type="button" className="bell" onClick={() => setInboxOpen(true)} aria-label={`Needs your action: ${inbox.length}`}>
        <Bell size={16} aria-hidden="true" />
        {inbox.length > 0 && <span className="dot">{inbox.length}</span>}
      </button>
      {inboxOpen && <InboxDrawer onClose={() => setInboxOpen(false)} />}
    </header>
  );
}

function InboxDrawer({ onClose }: { onClose: () => void }) {
  const inbox = useInbox();
  const { select, runs } = useStore();
  const navigate = useNavigate();
  const recent = runs
    .flatMap((r) => r.trace.filter((t) => t.status === "hitl" || t.node.startsWith("h")).map((t) => ({ t, r })))
    .slice(-8)
    .reverse();
  return (
    <Drawer title="Needs your action" onClose={onClose}>
      {inbox.length === 0 ? (
        <p className="muted">Nothing is waiting on you right now.</p>
      ) : (
        inbox.map((i) => (
          <button
            key={i.run.id}
            type="button"
            className="card"
            style={{ textAlign: "left", cursor: "pointer" }}
            onClick={() => {
              select(i.run.id);
              navigate(i.route);
              onClose();
            }}
          >
            <div className="row">
              <Pill tone="human">{i.tag}</Pill>
              <span className="tiny muted">{fmtTime(i.run.pause?.waiting_since ?? undefined)}</span>
            </div>
            <b>{i.text}</b>
          </button>
        ))
      )}
      <h3>Recent activity</h3>
      {recent.length === 0 ? (
        <p className="small muted">No activity yet in this session.</p>
      ) : (
        <div className="stack small">
          {recent.map(({ t, r }, k) => (
            <div key={k} className="row">
              <span className="mono tiny faint">{fmtTime(t.at)}</span>
              <span>
                {nameOf(r)}: {t.node} {t.status === "hitl" ? "waiting" : "done"}
              </span>
            </div>
          ))}
        </div>
      )}
    </Drawer>
  );
}

export function ModeBar() {
  const { mode, hostError } = useStore();
  if (mode === "mock")
    return (
      <div className="modebar" role="status">
        MOCK DATA: a UI preview with synthetic runs. Nothing on this screen comes from AgentMesh. Start with <span className="mono">npm run dev</span> for the live agents.
      </div>
    );
  if (hostError)
    return (
      <div className="modebar" role="alert" style={{ background: "var(--bad)", color: "#fff" }}>
        {hostError}
      </div>
    );
  return null;
}

const typeLabel = (agent: AgentKey, node: string) => {
  if (node.startsWith("__")) return node.includes("input") ? "governance · input" : "governance · output";
  return AGENT_DEFINITIONS[AGENT_NAMES[agent]]?.nodes.find((n) => n.id === node)?.type ?? "";
};

export function TraceList({ agent, rows }: { agent: AgentKey; rows: TraceRow[] }) {
  if (rows.length === 0) return <p className="small muted">No steps yet.</p>;
  return (
    <div className="trace" aria-label="Agent trace">
      {rows.map((r, i) => (
        <div key={i} className={`l ${r.status}`}>
          <span className="s" aria-hidden="true" />
          <div style={{ minWidth: 0 }}>
            <div className="nm">{r.node}</div>
            <div className="meta">
              <span>{r.status === "hitl" ? "human in the loop" : typeLabel(agent, r.node)}</span>
              {r.model && <span>· {r.model}</span>}
              {r.cost !== undefined && <span>· ${r.cost.toFixed(4)}</span>}
            </div>
          </div>
          <small>{r.status === "run" ? "running" : r.status === "hitl" ? "waiting" : fmtMs(r.ms)}</small>
        </div>
      ))}
    </div>
  );
}

export function TracePane() {
  const { selected, sideTrace, mode } = useStore();
  const loc = useLocation();
  const useSide = sideTrace && (loc.pathname === "/ask" || (loc.pathname === "/session" && sideTrace.agent === "kt"));
  const agent: AgentKey = useSide ? sideTrace.agent : "orch";
  const rows = useSide ? sideTrace.rows : (selected?.trace ?? []);
  const total = rows.reduce((n, r) => n + (r.ms ?? 0), 0);
  const cost = rows.reduce((n, r) => n + (r.cost ?? 0), 0);
  return (
    <aside className="tracepane" aria-label="Agent trace">
      <div className="th">
        <span className="eyebrow">Agent trace</span>
        <span className="open" title="This screen is powered by this AgentMesh agent">
          <Waypoints size={13} aria-hidden="true" /> Open in AgentMesh · {AGENT_NAMES[agent]}
        </span>
        <span className="small muted">
          {useSide ? sideTrace.title : selected ? `${nameOf(selected)} · ${selected.id.slice(0, 8)}` : "No run selected"}
          {mode === "mock" && " · mock"}
        </span>
        {rows.length > 0 && (
          <span className="tiny muted">
            {rows.filter((r) => r.status === "done").length} steps · {fmtMs(total)}
            {cost > 0 && ` · $${cost.toFixed(4)}`}
          </span>
        )}
      </div>
      <TraceList agent={agent} rows={rows} />
      <p className="tiny faint">Each step is an AgentMesh node. Governance checks run at both ends; models are chosen by the LLM router per step.</p>
    </aside>
  );
}

/** The AgentMesh lens: which agent powers this screen, and its steps from the YAML definition. */
export function Lens({ agent }: { agent: AgentKey }): ReactNode {
  const { selected, sideTrace } = useStore();
  const def = AGENT_DEFINITIONS[AGENT_NAMES[agent]];
  if (!def) return null;
  const ran = new Set((agent === "orch" ? selected?.trace : sideTrace?.agent === agent ? sideTrace.rows : [])?.map((r) => r.node) ?? []);
  const nodes = def.nodes.filter((n) => !n.id.startsWith("seed_") && n.id !== "parse_seed");
  return (
    <section className="lens" aria-label="AgentMesh lens">
      <div className="lt">
        <Pill tone="agent">AgentMesh</Pill>
        <b>{def.name}</b>
        <span className="small muted">
          {def.nodes.length} nodes · governance {def.governance}
        </span>
      </div>
      <div className="steps">
        {nodes.map((n, i) => (
          <span key={n.id} style={{ display: "contents" }}>
            {i > 0 && <em aria-hidden="true">→</em>}
            <span className={n.human ? "h" : ""} title={`${n.type}${n.description ? `: ${n.description}` : ""}`} style={ran.has(n.id) ? { borderColor: "var(--good)", color: "var(--good)" } : undefined}>
              {n.id}
            </span>
          </span>
        ))}
      </div>
      <p className="tiny muted">Purple = a person decides. Green = ran in the selected run. Hover a step for its node type.</p>
    </section>
  );
}
