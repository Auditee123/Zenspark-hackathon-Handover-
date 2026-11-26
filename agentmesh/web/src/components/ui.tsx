/** Design-system primitives, mirroring the prototype's classes (index.css). */
import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { AlertTriangle, X } from "lucide-react";
import { useStore } from "../state/store";
import { Lens } from "./Shell";

export function Logo() {
  return (
    <svg className="logo" viewBox="0 0 40 40" aria-hidden="true">
      <rect width="40" height="40" rx="10" fill="#3346A8" />
      <path d="M11 10v20M11 20c6-6 13-6 19-1" stroke="#fff" strokeWidth="3.2" fill="none" strokeLinecap="round" />
      <path d="M26 15l4 4-4 4" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="31" cy="29" r="5" fill="#2FB67C" />
      <path d="M28.6 29l1.6 1.6 3-3.2" stroke="#fff" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export type Tone = "" | "good" | "warn" | "bad" | "info" | "human" | "agent";

export function Pill({ tone = "", dot, children, title }: { tone?: Tone; dot?: boolean; children: ReactNode; title?: string }) {
  return (
    <span className={`pill ${tone}`} title={title}>
      {dot && <span className="d" />}
      {children}
    </span>
  );
}

export function Card({ title, sub, actions, flat, children, className = "" }: { title?: ReactNode; sub?: ReactNode; actions?: ReactNode; flat?: boolean; children?: ReactNode; className?: string }) {
  return (
    <section className={`card${flat ? " flat" : ""} ${className}`}>
      {(title || actions) && (
        <div className="cardhead">
          <div className="stack" style={{ gap: 2 }}>
            {title && <h2>{title}</h2>}
            {sub && <span className="small muted">{sub}</span>}
          </div>
          {actions && <div className="actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Kpi({ value, label, tone }: { value: ReactNode; label: string; tone?: "good" | "bad" }) {
  return (
    <div className="kpi">
      <b style={tone ? { color: `var(--${tone})` } : undefined}>{value}</b>
      <span>{label}</span>
    </div>
  );
}

const AVC = ["#3346A8", "#0F6B5C", "#7A3E9D", "#9A5B0E", "#B3261E", "#2F6FB0", "#5B6170"];
export function Avatar({ name, size = 30 }: { name: string; size?: number }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
  const color = AVC[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % AVC.length];
  return (
    <span className="av" style={{ background: color, width: size, height: size, fontSize: size < 28 ? 10 : 11.5 }} aria-hidden="true">
      {initials}
    </span>
  );
}

export function Who({ name, sub }: { name: string; sub?: ReactNode }) {
  return (
    <div className="who">
      <Avatar name={name} />
      <div className="nm">
        <b>{name}</b>
        {sub && <span>{sub}</span>}
      </div>
    </div>
  );
}

export function Note({ tone = "", children, role }: { tone?: "" | "warn" | "good" | "bad" | "human"; children: ReactNode; role?: "alert" | "status" }) {
  return (
    <div className={`note ${tone}`} role={role}>
      {children}
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <p className="small">{children}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", error, onRetry }: { title?: string; error: string; onRetry?: () => void }) {
  return (
    <div className="note bad stack" role="alert">
      <div className="row">
        <AlertTriangle size={16} aria-hidden="true" />
        <b>{title}</b>
      </div>
      <span className="small mono" style={{ wordBreak: "break-word" }}>
        {error}
      </span>
      {onRetry && (
        <div>
          <button type="button" className="btn sm" onClick={onRetry}>
            Try again
          </button>
        </div>
      )}
    </div>
  );
}

export function Skeleton({ h = 14, w = "100%" }: { h?: number; w?: number | string }) {
  return <div className="skel" style={{ height: h, width: w }} aria-hidden="true" />;
}

export function Loading({ lines = 4, label = "Loading" }: { lines?: number; label?: string }) {
  return (
    <div className="stack" aria-busy="true" aria-label={label}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} h={i === 0 ? 20 : 14} w={i === 0 ? "40%" : `${90 - i * 9}%`} />
      ))}
    </div>
  );
}

/** Page heading (eyebrow, h1, lead, actions) plus the AgentMesh lens when it is on. */
export function PageHead({ eyebrow, title, lead, actions, agent }: { eyebrow: string; title: ReactNode; lead?: ReactNode; actions?: ReactNode; agent?: "orch" | "qa" | "kt" }) {
  const { lens } = useStore();
  return (
    <>
      <div className="pagehead">
        <div className="t">
          <span className="eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
          {lead && <p className="lead">{lead}</p>}
        </div>
        {actions && <div className="actions">{actions}</div>}
      </div>
      {lens && agent && <Lens agent={agent} />}
    </>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>{label}</span>
      {children}
      {hint && <span className="tiny faint">{hint}</span>}
    </label>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { key: T; label: ReactNode }[] }) {
  return (
    <div className="tabs" role="tablist">
      {items.map((i) => (
        <button key={i.key} type="button" role="tab" aria-selected={value === i.key} className={value === i.key ? "on" : ""} onClick={() => onChange(i.key)}>
          {i.label}
        </button>
      ))}
    </div>
  );
}

export function Seg<T extends string>({ value, onChange, items, label }: { value: T; onChange: (v: T) => void; items: { key: T; label: string }[]; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {items.map((i) => (
        <button key={i.key} type="button" className={value === i.key ? "on" : ""} aria-pressed={value === i.key} onClick={() => onChange(i.key)}>
          {i.label}
        </button>
      ))}
    </div>
  );
}

export function Progress({ value, tone }: { value: number; tone?: "good" }) {
  return (
    <div className={`progress ${tone ?? ""}`} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

function useEscape(onClose: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEscape(onClose);
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="modalwrap" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1} ref={ref}>
        <div className="row between">
          <h2 id={id}>{title}</h2>
          <button type="button" className="iconbtn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Drawer({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  useEscape(onClose);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="scrim" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="drawer" role="dialog" aria-modal="true" tabIndex={-1} ref={ref}>
        <div className="row between">
          <h2>{title}</h2>
          <button type="button" className="iconbtn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Toasts() {
  const { toasts } = useStore();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast" style={t.tone === "bad" ? { background: "var(--bad)", color: "#fff" } : undefined}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

export const fmtDate = (iso: string) => {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
};
export const fmtTime = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "");
export const fmtMs = (ms?: number) => (ms === undefined ? "" : ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`);
