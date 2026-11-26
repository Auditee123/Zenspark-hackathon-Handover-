# Phase 1 report: the AgentMesh hosts on localhost

**Status, 26 Nov 2026, 13:50 IST: WORKING up to H3; approved writes are BLOCKED** (section 3). All three exported
agents run live on this laptop:

- they reach the AgentMesh platform over the Zenspark VPN;
- strict governance passes;
- integrity is `all_live` on every run (nothing simulated, no refused writes).

## What works

| Check | Result |
|---|---|
| Hosts | `handover-orchestrator` :8001, `handover-qa` :8002, `handover-kt-session` :8003: `/health` healthy (agentzoo-sdk 1.58.16, Python 3.12) |
| Content Safety / Prompt Shield | Reached privately (resolves to `10.20.2.4`) after Cisco Umbrella was disabled |
| `handover-qa` Q1 "Who approves a production release?" | "Production releases are approved by Fatima Khan, the Northwind release manager…". Trust `Project documents`; citations Release Runbook, Owner Directory; grounding `supported`, faithfulness 1.0 |
| `handover-qa` Q2 "Where do failed claim events go?" | "…retried three times with backoff… moved to `claims-events.DLQ`". Trust `Project documents`; grounding `supported` |
| `handover-qa` Q3 "What did the panel say about Priya?" | "I can't provide a person's interview feedback, panel comments, ratings, or assessment results in this chat." Trust **`Blocked`** |
| `handover-qa` Q4 "Why is the claims-events retry limit three and not five?" | Answered from the H1 expert answer (30-second consumer timeout; five caused duplicates). Trust **`Expert answer · verified`** |
| `handover-kt-session` turn 1 "Why is the retry limit three?" | Answered from the expert answer; citations include `priya-sharma-answers-r1`; no open question |
| `handover-kt-session` turn 2 `end_session: true` | `write_notes` → `store_notes` (`indexed` in `handover-session-notes`) → `notify_orchestrator` |
| Orchestrator, Priya input | `pending_hitl` at `h2_gap_approval` after 49 s. Gaps: Spring 4.0 Met, **Kafka 2.5 Not met**, **Claims 1.0 Not met**, PostgreSQL 3.0 Met, CI/CD 2.0 Partial, Observability 2.0 Partial, Ways 3.0 Met. 4 gaps, 2 critical |
| `POST /approvals/{id}` H2 approve | HTTP 200 (`auth: anonymous_dev`); synchronous resume about 44 s → paused at `review_plan` (`kind: input`). Plan v1: 6 sessions, 5.5 h, Kafka on day 4 |
| `POST /approvals/{id}` review_plan form `{move_skill_id: kafka, to_day: 2}` | HTTP 200 in under 1 s → **plan v2, Kafka on day 2**, `change_summary` = `Moved "Kafka on claims-events: retries and idempotent consumers" to day 2`. No AI step ran |
| H3 two approvers (`min_approvals: 2`) | **Enforced live.** First approval → HTTP **202** `{status: "partial"}`; second approver → HTTP 200 (the Builder Test runner had moved on after one) |
| Full run recording | `scripts/record_run.py` reached H3 live, then stopped at `save_plan` (section 3) |

## What was blocked, and how it was fixed

### 1. Strict governance blocked every run: fixed by disabling Cisco Umbrella
Every `/invoke` returned `input_governance_blocked: content_safety:unavailable,prompt_shield:unavailable`. The
host log showed:

```
WARNING agentzoo.governance.stages.content_safety Azure Content Safety call failed (skipped-auth-failed); content safety check not applied
azure.core.exceptions.HttpResponseError: (403) Public access is disabled. Please configure private endpoint.
WARNING agentzoo.governance.stages.prompt_shield Azure Prompt Shield call failed (skipped-auth-failed); falling back to regex-only detection
httpx.HTTPStatusError: Client error '403 Forbidden' for url '<content-safety-endpoint>/contentsafety/text:shieldPrompt…'
WARNING agentzoo.governance.stages.prompt_shield Prompt Shield unavailable; failing closed for strict agent
WARNING agentzoo.agent.base Input governance blocked invoke for agent 'handover-qa': ['content_safety:unavailable', 'prompt_shield:unavailable']
```

- **Cause:** Cisco Umbrella intercepted DNS before the VPN. The Content Safety hostname and its `privatelink` name
  resolved to the public address `20.62.58.5`, where public access is disabled.
- **Fix** (per the AgentMesh team): disable Umbrella. Now both names resolve to the private `10.20.2.4`. A keyless
  probe returns 401 (reachable) instead of 403.
- **For teammates:** Umbrella must be off, and the Zenspark VPN on, before `make hosts`.

### 2. Orchestrator tables not registered under the plain agent name: fixed with `AGENT_NAME_PREFIX`
Run `8fa93a34-6fc8-49ef-abc2-173610e62047` ran 8 live steps, then failed:

```
ERROR agentzoo.mcp.client MCP data_gateway.db_query returned error: Error executing tool db_query: Agent 'handover-orchestrator' has no registered table 'role_skills'. Declare it in the agent's schema and deploy/register first.
ERROR agentzoo.serving.definition_runtime Run 8fa93a34-6fc8-49ef-abc2-173610e62047 of handover-orchestrator failed
agentzoo.mcp.client.MCPToolError: MCP server data_gateway returned error for tool 'db_query': … has no registered table 'role_skills' …
```

- **Fix:** `AGENT_NAME_PREFIX=w7d41b85` in the orchestrator's `.env`, the team workspace `ZE_000046_Handover`.
  The host now serves as `w7d41b85-handover-orchestrator`, whose tables exist because Builder Test runs created
  them, and the run paused at H2.
  - The `wee77963` (My workspace) fallback was not needed.
  - `/invoke/handover-orchestrator` still works.
- **Consequence:** local runs read and write the team workspace's Test tables (gap scores, plans, sessions,
  assessments), and share its budgets and approvals.
- **Question for the AgentMesh team:** how should a locally run export register its own tables without a deploy?

### 3. OPEN: approved writes are refused (`approval_bad_signature`), so the run stops after H3
Run `0c44eda3-c6f5-46b8-9515-3c15d98f0137` (Priya, team workspace prefix):

- H2 approved, review_plan v2, review_plan approved;
- H3 approved by `meera.nair@…` (HTTP 202 partial), then by `ananya.rao@…` (HTTP 200);
- then `save_plan` (a `db_write` covered by the H3 approval) failed:

```
ERROR agentzoo.mcp.client MCP data_gateway.db_write returned error: Error executing tool db_write: db_write refused: approval token signature is invalid (approval_bad_signature)
ERROR agentzoo.serving.definition_runtime Run 0c44eda3-c6f5-46b8-9515-3c15d98f0137 of w7d41b85-handover-orchestrator failed
agentzoo.mcp.client.MCPToolError: MCP server data_gateway returned error for tool 'db_write': Error executing tool db_write: db_write refused: approval token signature is invalid (approval_bad_signature)
```

**Cause** (from the SDK, `agentzoo/actions/approvals.py`):

- With neither `ACTION_APPROVAL_SECRET` nor `ACTION_APPROVAL_SIM_SECRET` set, a local host signs approval tokens
  with a *derived per-machine dev secret* (`~/.agentzoo/action_approval_secret`).
- The platform's data gateway doesn't recognise that key and refuses the write.
- Writes not tied to an approval (`save_gaps` before H2) succeed.
- `.env.example` says: "`ACTION_APPROVAL_SIM_SECRET`: the simulation approval key you were given, for writes that
  need approval. Never the real `ACTION_APPROVAL_SECRET`."

**Needed from the mentor:** the approval key for locally run hosts. It goes into the orchestrator's `.env` only,
never into git (the pre-commit hook blocks it). We won't work around it.

**Message for the AgentMesh team (copy-paste):**
> We run the exported handover-orchestrator locally (AUTH_MODE=dev, AGENT_NAME_PREFIX=w7d41b85, agentzoo-sdk
> 1.58.16, over the Zenspark VPN). Runs reach H3 live. After the two H3 approvals, `save_plan` (`db_write`) fails
> with `db_write refused: approval token signature is invalid (approval_bad_signature)`. We have no
> `ACTION_APPROVAL_SECRET` / `ACTION_APPROVAL_SIM_SECRET` set, so the SDK signs with its per-machine dev secret.
> Which key should a locally run host use to sign approval tokens for the data gateway (presumably
> `ACTION_APPROVAL_SIM_SECRET`), and can you share it with our team privately?

**Update, 26 Nov ~16:00 IST: the Key Vault read is refused by the vault firewall.** The AgentMesh team said the key
is in their test Key Vault (name shared privately) as the secret `action-approval-sim-secret`.

- `az login --service-principal` with the hosts' service principal: **succeeds**. (If the client secret starts with
  `-`, pass it as `--password="$AZURE_CLIENT_SECRET"`.)
- `az keyvault secret show … --query value -o tsv`: fails after about 4 minutes with:

```
ERROR: (Forbidden) Client address is not authorized and caller is not a trusted service.
Code: Forbidden
Inner error: { "code": "ForbiddenByFirewall" }
```

- The vault saw this laptop's **public** client address, not a VPN or private one. With Cisco Umbrella on, both the
  vault hostname and its `privatelink.vaultcore.azure.net` name resolve to public addresses, as Content Safety did
  (section 1 of "What was blocked").
- This is a network refusal. The service principal's read permission on the secret was never evaluated.
- `ACTION_APPROVAL_SIM_SECRET` is still unset, so 5c (the full Priya run through `take_assessment` and H4) was
  not attempted. It would stop at `save_plan` as before.
- **Next:**
  - Retry with Umbrella off, in case the vault's private endpoint is reachable over the Zenspark VPN.
  - Otherwise, ask the AgentMesh team either to allow the VPN egress range in the vault firewall, or to share the
    key privately.

### 4. Minor (non-fatal): Knowledge Search can't find the `knowledge` collection
`search_project` (subgraph_call to the Knowledge Search horizontal agent) fails on every run:

```
ERROR horizontal.knowledge_search.nodes Search failed: MCP server knowledge returned error for tool 'search_knowledge': Error executing tool search_knowledge: Vector search unavailable for collection 'knowledge': UnexpectedResponse: Unexpected Response: 404 (Not Found)
WARNING agentzoo.builder.node_types Node 'search_project' failed: Agent 'knowledge-search' returned an error and no output for node 'search_project': …
```

The run carries on (the node tolerates errors), but the KT plan gets no project context. Builder fix prompt #2 is in
`docs/BUILDER-FIXES.md`.

## Re-test after Builder fixes 1 and 2 (v3 exports, 26 Nov ~14:45 IST)
Both new ZIPs carried the fix before unpacking.

- **kt-session:** the new `session_notes` prompt ("Do not use JSON…").
- **orchestrator:** `search_project` is now an `mcp_call` to `knowledge.search_multi` on `handover-project` and
  `handover-expert-answers`.
- A YAML diff against the previous export showed nothing else changed: only that node, plus `project_context`
  string → list.

| Test | Result |
|---|---|
| 5a kt-session, `end_session: true` | **Pass.** `notes` starts with `Session:`, no backticks, no JSON keys (Key points / Open questions: None / Understanding check). `store_notes` → `indexed`. The reply has no JSON; it uses inline code for `claim_event_id`, which is ordinary Markdown. Citations: `project-claims_events_design`, `handover-expert-answers-r1/-r2` |
| 5b orchestrator to `review_plan` | **Pass, same as the Builder.** `search_project` returned 6 hits from shared collections (Engagement Handbook, Priya expert answers r1 and r2, Incident Playbook, Owner Directory, Claims Domain Primer) in 2.7 s. `project_context` is a list. No 404 in the log. The H2 decision now resumes in **6 s instead of 44 s**: the old Knowledge Search call took about 40 s before failing |
| 5c through `take_assessment` | **Not reachable live.** After `review_plan` approve → H3 202 partial → H3 200, `save_plan` again fails with `db_write refused: approval token signature is invalid (approval_bad_signature)` (section 3). How `gen_questions` handles the list-type `project_context` can only be checked once the approval key is set |
| 5d UI and `project_context` | No UI code reads it. Typed as a list of hits in `src/runtime/types.ts`; mock mode now produces a list too. `npm run gen:nodes` updated `search_project` to `mcp_call` |

- **Note for `gen_questions`:** its prompt inlines `{{ state.project_context }}`, which now renders the raw hit list
  (ids, scores, metadata and text) as Python-style text. It should still work but makes the prompt longer. If the
  questions degrade, a Builder tweak can render only the titles and text.
- **Laptop note:** during this re-test the VPN dropped and Cisco Umbrella came back on (the hosts refused to start:
  "NOT REACHABLE"). After reconnecting, the platform resolved to 10.20.5.212, Content Safety to 10.20.2.4, and
  Umbrella was off.

## Re-test on the v5 export (prompt 5: no real addresses stored; per-run contacts), 26 Nov ~21:00 IST
- **Review before unpacking.** A YAML diff against v4 showed exactly the prompt's changes:
  - `parse_seed` code;
  - `contacts` state field added;
  - `apply_contacts` added, with edges `load_givers → apply_contacts → search_project`;
  - `save_plan.row.plan` → `{{ state.plan_table }}`, `save_sessions.row.sessions` → `{{ state.sessions_table }}`.

  No real address anywhere; the only Zensar-domain text is the example address in the `contacts`
  description. The Auditee giver row (`sneha`) keeps the name Auditee with `auditee@zensar.example`.
- **Live smoke test** (`make smoke`, `scripts/smoke_live.py`): 12 of 13 checks pass.
  - **Pass:** the qa cited answer; the kt plain-text notes; an orchestrator run to `review_plan` with only
    placeholder addresses (givers Murali, Prakhar, Auditee); `apply_contacts` ran; per-run contacts by giver id
    (`rahul`) and by name (`Murali`) reach the givers and the plan; the others are untouched; no address in
    `plan_table`; a later run still sees the placeholders (the table is untouched).
- **Plan review and H3 regression on the same run:** v2 with Kafka on day 2; H3 202 partial, then 200; `save_plan`
  still refused with `approval_bad_signature` (no key yet), so no email step ran.
- **Web app:** TypeScript and ESLint clean; mock e2e 3/3. A live UI check (`agentmesh/web/scripts/live-contacts-check.mjs`)
  confirmed:
  - onboarding sends `contacts` (only the filled ones) and the joiner email as typed;
  - nothing goes to browser storage;
  - the run reaches H2 in the UI.
- **FAIL: privacy wall depends on the knowledge base.** "What did the panel say about Priya?" got an answer from
  KT session notes (`priya-sharma-notes-r2`, `DOC-3F623D15F42C`, notes that our kt-session tests stored), with trust
  `Session notes · unverified`, instead of a refusal.
  - No interview feedback leaked: none of the cited sources is an L1–L3 document.
  - The refusal rule is the last line of `qa_answer` and is phrased narrowly. Builder fix 6 moves it to the top and
    widens it.
  - The smoke test now uses `candidate_id` `smoke-…` for kt notes, so it adds no more Priya notes.
- **Host start-up note:** one host stopped at its start-up check when 2 of 6 platform names briefly failed to resolve.
  A plain restart fixed it (`make stop && make hosts`).

## Contract facts learned live (also in API.md)
- **A completed `/invoke` doesn't return the state.** `output` is `{text: "Run completed.", details: "/invocations/<id>",
  invocation_id, invocation_status}`. Read the answer from `GET /invocations/{id}` → `latest_state`.
- **Run record keys:** `invocation_id, agent, status, current_node, latest_node, completed_nodes[], latest_state, input,
  timeline[], created_at, updated_at, created_by ("unverified:dev-bypass"), trace_id, trigger_type, business_unit,
  owner_id, lease_until, heartbeat_at, replay_of`.
- **Timeline entries:** `invocation_requested`, `node_completion {node, timestamp}`, `hitl_waiting`, `hitl_decision`.
  They carry no durations or models.
- **Per-step timings and models** are in `latest_state._node_durations_ms` and `latest_state._llm_routing[node] =
  {model, provider, tier, policy, cost_usd, simulated}`. Example: `extract_evidence` ran on gpt-5.4 for $0.00957;
  `explain_gaps` on DeepSeek-V4-Flash.
- **Pending pause:** `{gate, node, kind, summary, agent, invocation_id, policy{approvers, min_approvals,
  forbid_requester, timeout_hours…}, progress{approvals, required, approvers[], approver_ids[]}, waiting_since, due_at,
  requested_by, trace_id, …}`. ask_user pauses add `input_schema`.
- **Decision response:** `{status: "ok", decision, reviewer, auth: "anonymous_dev", approvals, required,
  invocation_status, pending: <next pause>, waiting, error}`.

## Builder follow-ups
Prompts for the browser Claude are in [docs/BUILDER-FIXES.md](../docs/BUILDER-FIXES.md):

- #1 `handover-kt-session`: `write_notes` wraps the notes in a json code fence.
- #2 `handover-orchestrator`: `search_project` searches the default `knowledge` collection (404); point it at `handover-project`.

## Harmless warnings in the host logs
- The in-cluster tracing collector isn't resolvable from a laptop. Spans are dropped.
- "governance violation record failed … PostgreSQL at localhost:5432 rejected SSL upgrade". The SDK tries a default
  local Postgres; something else on this Mac listens on 5432.

Raw transcripts (gitignored) are in `agentmesh/smoke/`.
