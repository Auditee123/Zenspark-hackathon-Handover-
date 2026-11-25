import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePipeline } from '../state/pipeline.jsx';
import { PageHead, StagePill } from '../components/ui.jsx';

const ROLES = ['Java backend engineer', 'QA automation engineer'];
const DOCS = [
  ['jd', 'Job / role description', 'JD'],
  ['l1', 'L1 interview feedback', 'L1 feedback'],
  ['l2', 'L2 interview feedback', 'L2 feedback'],
  ['l3', 'L3 interview feedback', 'L3 feedback']
];
const TEMPLATE = 'first_name,last_name,email,role\nPriya,Nair,priya.nair@example.com,Java backend engineer\n';

function parseCsv(text) {
  const [head, ...rows] = text.trim().split(/\r?\n/);
  const keys = head.split(',').map((k) => k.trim());
  return rows.filter(Boolean).map((r) => {
    const v = r.split(',').map((x) => x.trim());
    const o = Object.fromEntries(keys.map((k, i) => [k, v[i] || '']));
    return { firstName: o.first_name, lastName: o.last_name, email: o.email, role: o.role || ROLES[0] };
  });
}

export default function Onboarding() {
  const { candidates, addCandidate } = usePipeline();
  const navigate = useNavigate();
  const [tab, setTab] = useState('manual');
  const [form, setForm] = useState({ firstName: 'Priya', lastName: 'Nair', email: 'priya.nair@example.com', role: ROLES[0] });
  const [files, setFiles] = useState({});
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    const id = await addCandidate(form, files);
    navigate(`/processing/${id}`);
  };

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([TEMPLATE], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'handover-candidates-template.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const readBulk = async (e) => {
    const f = e.target.files?.[0];
    if (f) setRows(parseCsv(await f.text()));
  };

  const importAll = async () => {
    setBusy(true);
    let first;
    for (const r of rows) { const id = await addCandidate(r, {}); first = first || id; }
    navigate(`/processing/${first}`);
  };

  return (
    <>
      <PageHead step="Step 1 of 6: Onboarding" title="Add the engineers joining the project">
        This is the only place you enter data. After you save, the agents take over.
      </PageHead>

      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'manual'} onClick={() => setTab('manual')}>Add one candidate</button>
        <button type="button" role="tab" aria-selected={tab === 'bulk'} onClick={() => setTab('bulk')}>Bulk import</button>
      </div>

      <div className="split">
        <section className="card wide">
          {tab === 'manual' ? (
            <form onSubmit={save} className="stack">
              <h2>Candidate details</h2>
              <div className="grid2">
                <label className="field">First name<input required value={form.firstName} onChange={set('firstName')} /></label>
                <label className="field">Last name<input required value={form.lastName} onChange={set('lastName')} /></label>
                <label className="field">Email<input required type="email" value={form.email} onChange={set('email')} /></label>
                <label className="field">Role
                  <select value={form.role} onChange={set('role')}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select>
                </label>
              </div>
              <h3>Documents</h3>
              <div className="grid2">
                {DOCS.map(([k, label, part]) => (
                  <label key={k} className="field drop">
                    {label}
                    <span className="hint">Stored in the {part} partition</span>
                    <input type="file" accept=".pdf,.docx,.txt,.md" onChange={(e) => setFiles({ ...files, [k]: e.target.files?.[0] })} />
                  </label>
                ))}
              </div>
              <div className="actions">
                <button className="btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save and start processing'}</button>
                <span className="hint">Personal data is masked before anything is indexed.</span>
              </div>
            </form>
          ) : (
            <div className="stack">
              <h2>Bulk import</h2>
              <p className="muted">Download the template, add one row per candidate, then upload it. Attach each person’s JD and feedback later from their profile.</p>
              <div className="actions">
                <button type="button" className="btn btn-secondary" onClick={downloadTemplate}>Download template (.csv)</button>
                <label className="field inline">Upload filled template<input type="file" accept=".csv" onChange={readBulk} /></label>
              </div>
              {rows.length > 0 && (
                <>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead>
                      <tbody>{rows.map((r) => <tr key={r.email}><td>{r.firstName} {r.lastName}</td><td>{r.email}</td><td>{r.role}</td></tr>)}</tbody>
                    </table>
                  </div>
                  <button type="button" className="btn" onClick={importAll} disabled={busy}>Import {rows.length} candidates</button>
                </>
              )}
            </div>
          )}
        </section>

        <section className="card">
          <h2>Candidates</h2>
          <ul className="list">
            {candidates.map((c) => (
              <li key={c.id}>
                <Link to={`/processing/${c.id}`}><strong>{c.firstName} {c.lastName}</strong></Link>
                <span className="muted">{c.role}</span>
                <StagePill candidate={c} />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
