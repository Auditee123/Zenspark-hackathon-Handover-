# AgentMesh host runtime contract (confirmed 26 Nov 2026)

**Source.** Each host was run locally with `agentzoo-sdk` **1.58.16**. The routes come from its live `/openapi.json`,
saved in `agentmesh/api/`. Behaviour comes from the installed SDK source (`agentzoo/serving/definition_runtime.py`)
and from live calls. Every host (`:8001` orchestrator, `:8002` qa, `:8003` kt-session) serves the same routes.

Status markers:

- ✅ confirmed live;
- 📄 confirmed from OpenAPI and SDK source, but not yet exercised on a real paused run (blocked; see PHASE1.md).

## Answers to the open questions

| Question | Answer |
|---|---|
| Does `POST /invoke/{agent}/stream` (SSE) exist? | ✅ **No.** It isn't in any host's OpenAPI. The UI must **poll**. |
| Body of `POST /approvals/{id}` for an Approval (`hitl_gate`) | 📄 `{gate, decision: "approved" \| "rejected", notes, reviewer}` |
| Body of `POST /approvals/{id}` for Ask a person (`ask_user`) | 📄 `{gate, decision: "submitted", input: {…form fields…}}`, or `decision: "rejected"` to decline |
| Is a decision synchronous? | 📄 **Yes.** It resumes the run "to its end (or next gate)" before returning |
| Two approvers (`min_approvals: 2`, H3) | 📄 The first approval returns **HTTP 202** `{status: "partial", approvals, required}`; the run waits for the next approver |

## Routes

### Run
| Method | Path | Notes |
|---|---|---|
| POST | `/invoke/{agent}` | ✅ Body `{input: {…}, config?: {…}}`. **Synchronous**: returns when the run pauses, ends or fails. Response `{agent_name, status: "success" \| "error" \| "pending_hitl", output, error, integrity, files_produced[]}`. When paused: `output.invocation_id`, and `output.invocation_status == "pending_hitl"` |
| POST | `/invoke/{agent}/versions/{version}` | Same, for a pinned definition version |
| POST | `/intake/{agent}` | Multipart upload plus `input` JSON; same response plus `files` |
| GET | `/files/{path}` | Download a file listed in `files_produced[].download`. Only files produced since the host started |

### Runs (invocation store; local file `.local/invocations.json`)
| Method | Path | Notes |
|---|---|---|
| GET | `/invocations` | ✅ `{invocations: [...], total, limit, offset}`. Query: `status` (comma list), `agent`, `limit` (50), `offset`, `requester`, `trigger_type`, `since`, `until`, `q` (search) |
| GET | `/invocations/stats` | ✅ `{total, running, completed, pending_hitl, error, queued, interrupted, cancelled}` |
| GET | `/invocations/{id}` | 📄 The stored run row as-is (404 if unknown). It includes `timeline` (with `hitl_waiting` entries) and the integrity summary. Exact keys to pin on the first real run |
| GET | `/invocations/{id}/pending` | 📄 The pause the run waits at (404 if not paused); shape below |
| POST | `/invocations/{id}/cancel` | Cancel (needs an authorised actor) |
| POST | `/invocations/{id}/resume` | Re-queue an `interrupted` / `failed_recoverable` run from its checkpoint. **Not** for approvals |

### Decisions
| Method | Path | Notes |
|---|---|---|
| GET | `/approvals/pending?agent=&limit=50` | ✅ `{pending: [PendingPause & {created_at}], total}` |
| POST | `/approvals/{id}` | 📄 `DecisionBody`, below |

**`DecisionBody`.** Only `decision` is required.

```json
{
  "gate": "review_plan",
  "decision": "submitted",
  "input": {"move_skill_id": "kafka", "to_day": 2},
  "notes": "",
  "reviewer": "",
  "plan_revision": null,
  "token": null
}
```

- `decision` must be `approved`, `rejected` or `submitted`. Anything else is a 422.
- `gate`, if sent, must match the pause, or the call fails with 422 "waiting at 'X', not 'Y'".
- `plan_revision` is only for plan-review gates. It defaults to the revision the gate paused on. A plan revised
  since the review gives a 409.
- **Auth.** Locally (`AUTH_MODE=dev`) the development bypass applies (`auth: "anonymous_dev"`). `reviewer` is
  taken from the body. In production, a bearer token or a signed link `token` is required.

**Decision responses:**

- **200**:
  ```
  {status: "ok", invocation_id, decision, reviewer, auth, approvals, required, override,
   invocation_status, pending, waiting, error}
  ```
  `invocation_status` is the run's new status. `pending` is the next pause, if any.
- **202**: `{status: "partial", …, approvals, required, invocation_status: "pending_hitl"}`. More approvers are needed.
- **401**: no auth (not expected in dev mode). **403**: an approver rule refused it (e.g. requester ≠ approver).
- **409**: not waiting, or the plan was revised. **422**: bad decision, or wrong gate.

**`PendingPause`** (`GET /invocations/{id}/pending`, and the items of `/approvals/pending`):

```
{ gate, node, kind: "gate" | "input", summary (rendered summary_prompt), agent, invocation_id,
  input_schema (ask_user only: JSON schema of the form), policy {min_approvals, approvers, …},
  progress (approvals so far), business_unit, requested_by, requester_identities[], trigger_type,
  trace_id, waiting_since, due_at, …plan-review / agent-write details when relevant }
```

### Other
| Method | Path | Notes |
|---|---|---|
| GET | `/health` | ✅ `{status: "healthy", service, agents: [name], build}` |
| GET | `/ready` | Readiness with dependency checks |
| POST | `/events/{key}` | Wake runs at a durable `wait` (event mode). Not used: `kt_done` is an ask_user step |
| * | `/triggers…` | Triggers declared by the definition (none used) |
| GET | `/definitions/{agent}/nodes/{node}/inline-copy` | Builder support |

## What this means for the web app
- **No SSE.** `startRun` = `POST /invoke` (a long request). While it's in flight, poll
  `GET /invocations?agent=<name>&limit=1` (and then `/invocations/{id}`) every 1.5 s for progress.
- **Detect a pause.** Look for `status == "pending_hitl"`, then `GET /invocations/{id}/pending` → `{gate, kind, summary,
  input_schema}`. Route to a screen by `gate`; unknown gates fall back to a form built from `input_schema`.
- **`decideGate(id, gate, "approved"|"rejected", notes, reviewer)`** and **`submitForm(id, gate, input)`** call
  `POST /approvals/{id}`. Both are synchronous, so show a "running…" state and keep polling until the call returns.
- **H3:** send two approvals with different `reviewer` values. Handle the 202 `partial` response.
- **The node trace** comes from the run row (`timeline`, and `_node_durations_ms` in the final state). To pin on
  the first real run.

## Error seen on this laptop (see PHASE1.md)
Every `/invoke` currently returns:

```
status: "error", error: "input_governance_blocked: content_safety:unavailable,prompt_shield:unavailable"
```

All three agents are `governance_level: strict`. Azure Content Safety refuses the calls with
`403 Public access is disabled. Please configure private endpoint.`, and over the Zenspark VPN its hostname resolves
to the public address, not a private endpoint.
