import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Download, Play, Upload } from "lucide-react";
import { useStore } from "../state/store";
import { CSV_COLUMNS, SAMPLE_JOINER } from "../runtime/samples";
import { Card, ErrorState, Field, Note, PageHead, Pill, Tabs } from "../components/ui";

type Form = Record<string, string>;
const EMPTY: Form = { name: "", email: "", role_id: "java", start_date: "2026-11-30", l1_panelist: "", l2_panelist: "", l3_panelist: "", resume_text: "", l1_text: "", l2_text: "", l3_text: "" };
const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Minimal CSV parser with quoted fields (one row per joiner). */
function parseCsv(text: string): Form[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) rows.push([...row, cell]);
  const [head, ...body] = rows.filter((r) => r.some((x) => x.trim()));
  if (!head) return [];
  const keys = head.map((k) => k.trim());
  return body.map((r) => ({ ...EMPTY, ...Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])) }));
}

export default function Onboard() {
  const { startJoiner, starting } = useStore();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"one" | "bulk" | "hr">("one");
  const [f, setF] = useState<Form>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Form[]>([]);
  const [bulkDone, setBulkDone] = useState<string[]>([]);
  const set = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const useSample = () => setF(Object.fromEntries(Object.keys(EMPTY).map((k) => [k, String(SAMPLE_JOINER[k] ?? EMPTY[k])])));
  const toInput = (x: Form) => ({ ...x, mode: "run", round: 1, candidate_id: slug(x.name) || `joiner-${Date.now()}` });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    navigate("/analysis");
    const r = await startJoiner(toInput(f));
    if (!r.ok) setError(r.error ?? "The run failed");
  };

  const template = () => {
    const blob = new Blob([`${CSV_COLUMNS.join(",")}\n`], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "handover-joiners-template.csv";
    a.click();
  };
  const importAll = async () => {
    setBulkDone([]);
    for (const r of rows) {
      const res = await startJoiner(toInput(r));
      setBulkDone((d) => [...d, `${r.name}: ${res.ok ? "started, paused for H2" : `failed: ${res.error}`}`]);
    }
  };

  const ready = f.name && f.email && f.resume_text && f.l1_text;
  return (
    <div className="content page">
      <PageHead eyebrow="Step 1 · Onboard joiners" title="Add the engineers joining the project" lead="This is the only place you enter data. After you save, the agents take over: they mask personal data, index each document in its own partition, and run the gap analysis." agent="orch" />
      {error && <ErrorState title="The orchestrator didn't start the run" error={error} />}
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { key: "one", label: "Add one joiner" },
          { key: "bulk", label: "Bulk import" },
          {
            key: "hr",
            label: (
              <>
                Sync from HR system <Pill>Roadmap</Pill>
              </>
            ),
          },
        ]}
      />
      {tab === "one" && (
        <div className="split">
          <Card title="Joiner details" actions={<button type="button" className="btn sm" onClick={useSample}>Use sample: Auditee</button>}>
            <form className="stack" style={{ gap: 14 }} onSubmit={submit}>
              <div className="grid g2">
                <Field label="Full name">
                  <input className="input" required value={f.name} onChange={set("name")} />
                </Field>
                <Field label="Work email" hint="Use a real mailbox: the agent emails the KT time proposals and invites here.">
                  <input className="input" type="email" required value={f.email} onChange={set("email")} />
                </Field>
                <Field label="Role profile">
                  <select className="input" value={f.role_id} onChange={set("role_id")}>
                    <option value="java">Java backend engineer</option>
                  </select>
                </Field>
                <Field label="Start date">
                  <input className="input" type="date" value={f.start_date} onChange={set("start_date")} />
                </Field>
              </div>
              <Field label="Resume" hint="Masked by the PII Detector agent before it is indexed.">
                <textarea className="input" required value={f.resume_text} onChange={set("resume_text")} rows={3} />
              </Field>
              {(["l1", "l2", "l3"] as const).map((l) => (
                <div key={l} className="grid" style={{ gridTemplateColumns: "180px minmax(0,1fr)" }}>
                  <Field label={`${l.toUpperCase()} panelist`}>
                    <input className="input" value={f[`${l}_panelist`]} onChange={set(`${l}_panelist`)} />
                  </Field>
                  <Field label={`${l.toUpperCase()} interview feedback`} hint="Private partition: never searchable from the Q&A chat.">
                    <textarea className="input" required={l === "l1"} value={f[`${l}_text`]} onChange={set(`${l}_text`)} rows={2} />
                  </Field>
                </div>
              ))}
              <div className="actions">
                <button className="btn primary" type="submit" disabled={!ready || starting}>
                  <Play size={14} aria-hidden="true" /> {starting ? "Starting…" : "Save and start the agents"}
                </button>
                <span className="small muted">The first pause (gap findings, H2) takes about a minute.</span>
              </div>
            </form>
          </Card>
          <div className="stack" style={{ gap: 16 }}>
            <Card title="What happens next">
              <ol className="small" style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
                <li>The PII Detector agent masks the resume and the three panels.</li>
                <li>Each document is stored in its own private collection (the privacy wall).</li>
                <li>Evidence is extracted per skill and scored against the role profile.</li>
                <li>You review the gap findings (H2). Everything after that is agents plus four human checkpoints.</li>
              </ol>
            </Card>
            <Note>All data in this demo is synthetic (Northwind Insurance).</Note>
          </div>
        </div>
      )}
      {tab === "bulk" && (
        <Card title="Bulk import" sub="One row per joiner. The text columns hold each document's text.">
          <div className="actions">
            <button type="button" className="btn" onClick={template}>
              <Download size={14} aria-hidden="true" /> Download template (.csv)
            </button>
            <label className="btn">
              <Upload size={14} aria-hidden="true" /> Upload filled template
              <input className="sr-only" type="file" accept=".csv" onChange={async (e) => setRows(parseCsv((await e.target.files?.[0]?.text()) ?? ""))} />
            </label>
          </div>
          {rows.length > 0 && (
            <>
              <div className="tbl">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Documents</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.email || r.name}>
                        <td>{r.name}</td>
                        <td>{r.email || <Pill tone="bad">Missing email</Pill>}</td>
                        <td>{r.role_id}</td>
                        <td className="row" style={{ gap: 4 }}>
                          {(["resume_text", "l1_text", "l2_text", "l3_text"] as const).map((k) => (
                            <Pill key={k} tone={r[k] ? "good" : "warn"}>
                              {k.replace("_text", "").toUpperCase()}
                            </Pill>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="actions">
                <button type="button" className="btn primary" disabled={starting || rows.some((r) => !r.email || !r.name)} onClick={importAll}>
                  Import {rows.length} joiners
                </button>
                <span className="small muted">Runs start one at a time; each pauses at H2.</span>
              </div>
              {bulkDone.map((d) => (
                <span key={d} className="small">
                  {d}
                </span>
              ))}
            </>
          )}
        </Card>
      )}
      {tab === "hr" && (
        <Card>
          <p className="muted">Pulling joiners from the HR system is on the roadmap. For the demo, add joiners with the form or a CSV.</p>
        </Card>
      )}
    </div>
  );
}
