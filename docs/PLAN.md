# Plan: Handover on AgentMesh, local hosts plus the React front end

**Pick up at:** the first unchecked box of the current phase. Tick boxes and update README → Status as you go.
Freeze **Mon 30 Nov 2026**; jury demo **Tue 1 Dec 2026** on localhost.

---

## Phase 1: run the exported hosts (owner: team lead; in progress)

- [x] Workspace on branch `agentmesh-ui` (no history from the old branches), `.gitignore`, secret pre-commit hook
- [x] `scripts/unpack-hosts.sh`: hosts in `agentmesh/hosts/<agent>/`, `.env` with PORT 8001/8002/8003, `AUTH_MODE=dev`
- [x] Python 3.12 installed. Service principal checked: Entra sign-in, package feed (agentzoo-sdk 1.58.16,
      agentzoo-agent-horizontal 1.6.17), content-safety scope
- [x] Zenspark VPN reaches the AgentMesh platform services
- [ ] First start of all three hosts (SDK and spaCy install), then `/health` 200 on 8001, 8002 and 8003
- [ ] `agentmesh/API.md`, the confirmed runtime contract from `/docs` and `openapi.json`. Pin down:
  - [ ] `POST /approvals/{invocation_id}`: the gate body (`gate`, `decision` approved|rejected, `notes`, `reviewer`?)
  - [ ] `POST /approvals/{invocation_id}`: the ask_user body (likely `{gate, decision:"submitted", input:{…}}`)
  - [ ] `GET /approvals/pending`, `GET /invocations`, `GET /invocations/{id}` (state, timeline, pending gate,
        `input_schema`?) and `/invocations/stats`
  - [ ] whether `POST /invoke/{agent}/stream` (SSE) exists, and its event names and payloads
  - [ ] the SDK version. If a body is an untyped dict, read the installed SDK source to confirm it (read-only)
- [ ] Smoke-test `handover-qa` with curl, using the runbook questions:
  - "Who approves a production release?" → Fatima Khan, trust Project documents
  - "Where do failed claim events go?" → claims-events.DLQ after three retries
  - "What did the panel say about Priya?" → refusal, trust **Blocked**
- [ ] Smoke-test `handover-kt-session`: one turn, then one `end_session: true` turn (notes stored)
- [ ] Smoke-test the orchestrator with the Priya input (kit Appendix E):
  - [ ] `pending_hitl` at `h2_gap_approval`. Expected gaps: Spring 4.0 Met, Kafka 2.5 Not met, Claims 1.0 Not met
  - [ ] approve H2 via `/approvals/{id}` → paused at `review_plan`
  - [ ] submit `{move_skill_id:"kafka", to_day:2}` → plan v2, "Moved … to day 2"
  - [ ] on `no registered table`: set `AGENT_NAME_PREFIX=wee77963`, restart, retry. If it still fails, stop and report
  - [ ] watch `integrity.write_refused`; `ACTION_APPROVAL_SIM_SECRET` may be needed from the mentor
- [ ] `agentmesh/PHASE1.md`: what works, what is blocked, exact errors, decisions needed

## Phase 2: the front end (starts after Phase 1 reports and the team lead approves)

Base it on the **AgentMesh Serve scaffold** (`inputs/scaffolds/agentzoo-serving-handover-orchestrator/`), moved
to `agentmesh/web/`, so the jury sees an AgentMesh-served app. Vite, React 18, TypeScript (strict), Tailwind,
ESLint. Keep `PROTOCOL.md`, `route-config.json`, `auth.tsx` (MSAL, dev bypass) and `ErrorBoundary`.

**Design.** Follow `inputs/docs/Handover_Prototype.html` exactly: screens, copy and tokens.

- Light tokens: `--bg #F6F6F3`, `--accent #3346A8`, rail `--side #14161C`.
- Dark tokens: `--bg #101217`, `--accent #8C9BF0`.
- Fonts: Inter, Space Grotesk, IBM Plex Mono.
- Additions the prototype lacks: a theme toggle, a standalone **agent-trace pane** with an
  "Open in AgentMesh · <agent>" label, and a lens toggle that shows the agent's YAML node list.
- The prototype names 11 agents. Only the **3 real agents** appear in our UI.
- Prototype features with no agent behind them are filled from real run state, or marked "Roadmap". They are
  never simulated.

**Runtime client (`src/runtime/`):**

- Functions: `startRun`, `getInvocation`, `listPending`, `decideGate`, `submitForm`, `streamRun`.
- Uses SSE if the stream route exists. Otherwise it polls `/invocations/{id}` every 1.5 s.
- A Vite proxy per host: `/am/orch` → 8001, `/am/qa` → 8002, `/am/kt` → 8003.
- A typed map from pause name to screen. Unknown pauses fall back to a generic form built from `input_schema`.
- Modes: `VITE_RUNTIME=live|record|replay|mock`. Replay and mock always show a banner.

**Pause → screen:**

| Pause | Screen |
|---|---|
| `h2_gap_approval` | Gap analysis: bullet gap bars, evidence, confidence; Approve / Reject |
| `review_plan` | Plan vN with diff from the previous version; skill / to-day / max sessions / giver controls, free text, approve |
| `h3_plan_approval` | Two-approver card |
| `confirm_slots` | Joiner slot buttons building `1A,2B…`, calendar, .ics download |
| `kt_done` | Session room: live chat with `handover-kt-session` (one `/invoke` per turn, with history); End session → notes; paste-transcript fallback |
| `h1_expert_answers` | KT-giver view: open questions with answer boxes; approve notes |
| `take_assessment` | Test player with A–D answers (never show `correct`) |
| `h4_signoff` | Readiness before/after per skill; sign off; certificate PDF via `/files` |
| — | Ask: chat with `handover-qa`, with citations, trust badge and privacy refusal |
| — | Command centre: joiners pipeline (`/invocations`), needs-my-action (`/approvals/pending`), agent activity |

### Milestones
- [ ] **M1, Fri 27 am. Shell.**
  - Scaffold moved to `agentmesh/web`.
  - Design tokens in light and dark; rail, top bar with joiner selector and "View as" (Lead / Joiner / KT giver).
  - Trace pane and lens.
  - Runtime client with mock mode, proxies, strict TS and ESLint.
  - *Check:* `make mock` renders in both themes at 1280 px; typecheck and lint are clean.
- [ ] **M2, Fri 27 pm. Live basics.**
  - Ask (handover-qa live), command centre (live), Agent runs, generic pause form, live trace.
  - *Check:* the three runbook questions work in the UI; real pauses appear in "Needs your action".
- [ ] **M3, Sat 28. First half of the journey.**
  - Start a joiner (Priya sample), Gap analysis (H2) and cohort heatmap, Review with diff, H3, Scheduler with
    calendar and .ics.
  - *Check:* Priya runs live through `confirm_slots`.
- [ ] **M4, Sun 29. Second half.**
  - Session room (kt agent), H1, assessment player, readiness and certificate, the round-2 loop.
  - *Check:* a full live Priya run, end to end.
- [ ] **M5, Mon 30. Demo safety and freeze.**
  - Record a full Priya run to `fixtures/`; replay mode; Playwright e2e of the short path in replay mode.
  - `make demo` starts the 3 hosts and the web app.
  - README; a11y, focus and 1280 px polish; optional presenter story bar; rehearsal.
  - *Check:* a cold `make demo` works; replay works with the VPN off; e2e is green. **Freeze.**

If the orchestrator stays blocked on tables or writes, build M3–M4 against labelled mock fixtures, and switch to
live once unblocked. Replay needs at least one real recorded run before the freeze.

## Open questions (team lead and mentor)
- Publish isn't available in the Builder; the team lead is checking with the organisers. The host ZIPs from 26 Nov
  match the latest agent YAML.
- Table registration for locally run agents (see the Phase 1 fallback above).
- `ACTION_APPROVAL_SIM_SECRET` for approved writes, if `write_refused` appears.
- `h3_plan_approval` has `min_approvals: 2`, but Builder test runs moved on after one approval. Check this on the
  local host.
