// Talks to the exported AgentMesh agent host (FastAPI), per the exploration report:
//   POST /invoke/{agent}   body {input, config}  -> {status, output, error, ...}
//   POST /intake/{agent}   multipart upload       -> same, plus files
//   POST /approvals/{invocation_id}               -> decides a paused (HITL) run
// In mock mode every call returns sample data after a short delay.
import { USE_MOCK } from './agents.js';
import { mockInvoke } from '../mock/agents.js';

const BASE = '/agentmesh';

async function readJson(res) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body.detail || body.error || `Agent call failed with HTTP ${res.status}`;
    throw new Error(res.status === 401 ? `${msg}. Set AUTH_MODE=dev in the agent host .env.` : msg);
  }
  if (body.status === 'error') throw new Error(body.error || 'The agent returned an error.');
  return body;
}

export async function invokeAgent(agent, input) {
  if (USE_MOCK) return mockInvoke(agent, input);
  const res = await fetch(`${BASE}/invoke/${agent}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input, config: null })
  });
  return readJson(res);
}

export async function intakeFiles(agent, fields, files) {
  if (USE_MOCK) return mockInvoke(agent, { ...fields, files: Object.keys(files) });
  const form = new FormData();
  Object.entries(fields).forEach(([k, v]) => form.append(k, v));
  Object.entries(files).forEach(([k, f]) => f && form.append('files', f, `${k}__${f.name}`));
  const res = await fetch(`${BASE}/intake/${agent}`, { method: 'POST', body: form });
  return readJson(res);
}

export async function decideApproval(invocationId, approved, comment = '') {
  if (USE_MOCK || !invocationId) return { status: 'success' };
  const res = await fetch(`${BASE}/approvals/${invocationId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision: approved ? 'approve' : 'reject', comment })
  });
  return readJson(res);
}
