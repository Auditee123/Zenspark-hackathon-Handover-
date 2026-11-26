# Handover on AgentMesh (ZenSpark ZE_000046)

Handover onboards a new joiner to an IT service transition. It runs a gap analysis, a KT plan with reviews,
scheduling, KT sessions, an assessment and a readiness sign-off, with humans approving at each step.

It runs as three **AgentMesh** agents, built in the AgentMesh Builder:

| Agent | What it does | Local port |
|---|---|---|
| `handover-orchestrator` | The whole journey; pauses 9+ times for people (H2, plan review, H3, slots, KT done, H1, test, H4) | 8001 |
| `handover-qa` | Cited project Q&A with a privacy wall (never reads interview feedback) | 8002 |
| `handover-kt-session` | Sits in a KT session: answers with sources, logs open questions, writes notes | 8003 |

Locally, each agent runs as its **exported AgentMesh host**, a FastAPI app from Builder → Deploy → Download ZIP.
A React front end in `agentmesh/web/` (Phase 2, from the AgentMesh Serve scaffold) drives them.
The jury demo runs on localhost on **1 Dec 2026**; the freeze is **30 Nov**. All data is synthetic
(Northwind Insurance, Priya Sharma).

**Where the work stands and what's next:** see [Status](#status) below and [docs/PLAN.md](docs/PLAN.md).

---

## Rules (read before committing)

- **This repo is public.** The exported hosts and the kit contain private AgentMesh platform URLs, so
  `agentmesh/hosts/` and `inputs/` are gitignored. Never commit an `.env` file or a VPN profile.
- Run `make setup` once per clone. It enables `.githooks/pre-commit`, which blocks secrets
  (a filled-in client secret, PATs, keys in `VITE_*` variables) and private platform hostnames.
- **Agents and prompts change only in the AgentMesh Builder, in the team workspace `ZE_000046_Handover`.** That is
  the master copy (`handover-orchestrator` 63 nodes, `handover-qa` 4, `handover-kt-session` 6); its Test runs run as
  `w7d41b85-<agent>`. **Never edit the old copies in My workspace.** Don't edit `definitions/*.yaml` locally.
  To pick up a change:
  1. In `ZE_000046_Handover`, open the agent and use Deploy → Download ZIP.
  2. Replace `inputs/zips/<agent>.zip` with it.
  3. Run `make hosts-unpack`. It replaces `definitions/<agent>.yaml` and the host code, and keeps `.env`, `.venv`
     and `.local`.
  4. Restart the hosts: `make stop && make hosts`.
- Don't fake AgentMesh. The only exception is the clearly labelled replay/mock modes of the web app (Phase 2).
- Synthetic data only.

---

## 1. One-time setup on your laptop (macOS)

### 1.1 Install the tools

```bash
brew install python@3.12        # the AgentMesh SDK needs Python 3.11-3.13 (3.14 is too new)
brew install git gh             # if you don't have them
# Node 20+ for the web app (Phase 2): use nvm or https://nodejs.org
```

You do **not** need the Azure CLI or Docker. The service principal below covers sign-in.

### 1.2 Connect the Zenspark VPN

The AgentMesh Builder website works without a VPN, because its backend runs inside Azure. **Local hosts call
the AgentMesh platform services directly, and those are on a private network.** Without the VPN, every call
times out.

1. Install **Azure VPN Client** from the Mac App Store.
2. Import the **Zenspark** VPN profile shared by the hackathon organisers. VPN profiles are never committed here.
3. Connect **Zenspark** and sign in with your Zensar Microsoft (Entra ID) account.
4. **Disable Cisco Umbrella** on your Mac while you work. Otherwise it intercepts DNS, the private Azure Content
   Safety endpoint resolves to its public address, and every agent run fails with `input_governance_blocked`.
5. Later, `make doctor` confirms the platform is reachable.

### 1.3 Get the credentials and inputs (never in git)

Ask the team lead (privately: Teams or OneDrive, not GitHub) for:

- **The service principal** from the organisers: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`.
  It signs in for the private package feed and for content safety.
- **The three host ZIPs**, exported from the Builder (Deploy → Download ZIP). Put them here:
  ```
  inputs/zips/handover-orchestrator.zip
  inputs/zips/handover-qa.zip
  inputs/zips/handover-kt-session.zip
  ```
- Optional, for the web app and reference:
  - `inputs/scaffolds/agentzoo-serving-handover-*`: the Serve scaffolds;
  - `inputs/docs/`: the build report, the demo runbook, `Handover_Prototype.html` (the design spec) and the AgentMesh manuals;
  - `inputs/kit/agentmesh-kit/`: the synthetic seed data, prompts and the Priya documents.

**Team lead: how to share the inputs.** Nothing in this repo reads your Downloads folder; everything the
project uses is copied into `inputs/` (about 8 MB, no secrets). To hand it over:

```bash
make inputs-bundle     # creates handover-inputs-<date>.zip (gitignored)
```

Share that ZIP in a private Teams chat or OneDrive folder. The teammate unzips it at the repo root, which gives
them `inputs/`. Send the three `AZURE_*` values **separately**, for example in a direct message, never in the
same file or in GitHub. The VPN profile comes from the organisers.

| Share? | What | Why |
|---|---|---|
| Required | `inputs/zips/handover-*.zip` (3 host ZIPs) | Without them there are no agent hosts |
| Required, separately | `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` | Feed and content-safety sign-in |
| Required for UI work | `inputs/docs/Handover_Prototype.html` | The design and product spec |
| Required for UI work | `inputs/scaffolds/` | AgentMesh Serve scaffolds the web app starts from |
| Useful | `inputs/docs/Handover-Build-Report.md`, `Handover-Demo-Runbook.md` | What the agents do, the API findings, the demo script |
| Useful | `inputs/kit/agentmesh-kit/` | Priya's synthetic test input, KT notes and seed data |
| Optional | `inputs/docs/AgentMesh-*` manuals, `inputs/yaml/` | Platform reference; YAML copies of the agents |

### 1.4 Clone and set up

```bash
git clone https://github.com/Auditee123/Zenspark-hackathon-Handover-.git handover
cd handover
git checkout agentmesh-ui
git config user.name "<your GitHub login>"
git config user.email "<id>+<login>@users.noreply.github.com"   # keeps your work email out of a public repo
make setup                      # enable the secret-blocking hook
# copy the ZIPs into inputs/zips/ (see 1.3), then:
make hosts-unpack               # creates agentmesh/hosts/<agent>/ and each .env (port, AUTH_MODE=dev)
```

### 1.5 Fill in the three `.env` files

Paste the service principal into each of:
`agentmesh/hosts/handover-orchestrator/.env`, `agentmesh/hosts/handover-qa/.env` and
`agentmesh/hosts/handover-kt-session/.env`:

```
AZURE_TENANT_ID=<guid>
AZURE_CLIENT_ID=<guid>
AZURE_CLIENT_SECRET=<secret>
```

- Paste the bare value: **no quotes and no spaces**. Values copied from Outlook, Teams or Word often bring
  curly quotes `“ ”` along, and the start script reads the file literally.
- Keep `AUTH_MODE=dev`. With a tenant id but no dev mode, the platform answers 403.
- Leave the platform URLs in `.env` as exported.

Then check everything (no secret is printed):

```bash
make doctor
```

---

## 2. Run it

```bash
make hosts        # starts the 3 hosts in the background; logs in logs/<agent>.log
make logs         # follow progress
make health       # 8001, 8002 and 8003 should answer
make stop         # stop all three
```

- **The first start takes several minutes.** Each host creates `.venv`, installs the AgentMesh SDK
  (`agentzoo-sdk`, `agentzoo-agent-horizontal`) from the private Azure Artifacts feed using the service
  principal, and downloads a spaCy model (about 400 MB). Later starts are quick.
- Each host serves FastAPI docs at `http://localhost:800x/docs`.
- Paused runs survive a restart; their state lives in `agentmesh/hosts/<agent>/.local/`.

Quick check that the agents answer (with the VPN on):

```bash
curl -s -X POST localhost:8002/invoke/handover-qa -H 'Content-Type: application/json' \
  -d '{"input":{"question":"Who approves a production release?"}}'
# expect: Fatima Khan …, trust "Project documents"
```

## 3. The web app (`agentmesh/web`)

Built from the AgentMesh Serve scaffold (Vite, React, TypeScript, Tailwind). It follows `Handover_Prototype.html`:
light theme by default with a dark toggle, a stage rail, "View as" Lead / Joiner / KT giver, an agent-trace pane, and
an AgentMesh lens. It talks only to the three local hosts, through one Vite proxy per host.

```bash
make setup        # once: hook + npm install
make web          # live, against the running hosts: http://localhost:5180
make mock         # labelled MOCK data, no hosts or VPN needed: http://localhost:5181
make demo         # start the 3 hosts, wait for /health, then the web app
make check        # TypeScript strict + ESLint
cd agentmesh/web && npm run e2e   # Playwright: full journey in mock mode
```

- **Ports:** 5180 (live) and 5181 (mock). 5173 is avoided because the older `handover-frontend` uses it.
- **What runs live today:** everything up to H3 (see Status), plus Ask (handover-qa) and the session room
  (handover-kt-session).
- **Mock mode** runs the same routes with TypeScript ports of the orchestrator's code steps. It always shows a
  MOCK DATA banner.
- **After a Builder re-export:** run `npm run gen:nodes` in `agentmesh/web` to refresh the node list used by the
  trace and the lens.

### Troubleshooting

| Symptom | Fix |
|---|---|
| `Not reachable: MCP_…` at start | Connect the Zenspark VPN; the first call can take a minute while services wake |
| `Service principal sign-in failed` | Check the 3 `AZURE_*` values: no quotes, no spaces (`make doctor`) |
| `No read access to the AgentMesh package feed` | The service principal or your account lacks feed access; ask the organisers |
| `Need Python 3.11 or later`, or build errors on 3.14 | `brew install python@3.12`, delete the host's `.venv`, start again |
| `/invoke` answers 401, or tools fail with `mcp_auth_failed` | `AUTH_MODE=dev` in that host's `.env` |
| `/invoke` returns `input_governance_blocked: content_safety:unavailable,prompt_shield:unavailable` | **Disable Cisco Umbrella** (it hijacks DNS, so Azure Content Safety resolves to its public address), keep the Zenspark VPN on, then `make stop && make hosts` |
| Orchestrator: `no registered table 'role_skills'` | Known platform issue; see Status below (we retry with `AGENT_NAME_PREFIX=w7d41b85`, after a seed Test run in the team workspace) |

---

## Repository layout

```
.githooks/pre-commit     blocks secrets and private hostnames (enable with make setup)
scripts/unpack-hosts.sh  recreates agentmesh/hosts/* from inputs/zips (keeps .env, .venv, .local)
scripts/doctor.sh        readiness check (make doctor)
Makefile                 setup, doctor, hosts-unpack, hosts, stop, health, logs
docs/PLAN.md             plan, milestones, checklist: where to pick up
CLAUDE.md                instructions for Claude Code sessions
agentmesh/API.md         confirmed host runtime contract
agentmesh/PHASE1.md      Phase 1 report: what works, what is blocked, options
agentmesh/api/           openapi.json of each host
agentmesh/hosts/         gitignored: the exported hosts (make hosts-unpack)
inputs/                  gitignored: host ZIPs, scaffolds, docs, kit
logs/                    gitignored: host logs
```

---

## Status

Last updated **26 Nov 2026**. Details and the milestone checklist are in [docs/PLAN.md](docs/PLAN.md).

**Phase 1: run the hosts locally. DONE, works live.** Report in [agentmesh/PHASE1.md](agentmesh/PHASE1.md);
contract in [agentmesh/API.md](agentmesh/API.md).

- [x] Workspace, `.gitignore`, secret hook, unpack script, `make doctor`
- [x] Service principal: Entra sign-in, private package feed, content-safety scope
- [x] All three hosts healthy on 8001-8003 (agentzoo-sdk 1.58.16)
- [x] Governance block fixed: Cisco Umbrella disabled, so Content Safety resolves privately
- [x] Orchestrator tables: `AGENT_NAME_PREFIX=w7d41b85` (team workspace)
- [x] `handover-qa` live:
  - Fatima Khan / claims-events.DLQ / refusal with trust `Blocked`;
  - the retry-limit question answers from the expert answer (`Expert answer · verified`).
- [x] `handover-kt-session` live: one turn, then `end_session` (notes stored)
- [x] Orchestrator live with Priya: H2 (Kafka 2.5 and Claims 1.0 Not met) → approve → `review_plan` →
  `{move_skill_id:"kafka", to_day:2}` → v2 with Kafka on day 2
- [x] H3 two-approver gate enforced live (202 `partial`, then 200)
- [ ] **BLOCKED after H3:** `save_plan` fails with `db_write refused: approval token signature is invalid
  (approval_bad_signature)`. Needs the approval key (`ACTION_APPROVAL_SIM_SECRET`) from the mentor; see
  agentmesh/PHASE1.md section 3
- [ ] Full Priya run recorded as fixtures (recorded live up to H3; the rest waits for the key)

**Phase 2: the React front end. In progress** in `agentmesh/web/` (milestones in docs/PLAN.md).

- [x] M1 shell: design tokens light/dark, rail, top bar, View as, trace pane, lens, runtime client, proxies, strict TS + ESLint
- [x] M2-M4 screens:
  - command centre, onboarding (form + CSV bulk import), gap analysis (H2) and cohort heatmap;
  - KT plan review with diff and H3 two-approver card, scheduler with calendar and .ics;
  - session room (live kt agent) and H1, assessment player, readiness and certificate;
  - Ask (live qa), Agent runs, generic pause form.
- [x] Playwright journey test (mock mode): 3/3 pass
- [ ] Live journey past H3, once the approval key arrives
- [ ] M5: record a full live run, replay mode, `make demo` rehearsal

**Open issues and decisions**

- **Publish isn't available in the Builder yet.** The team lead is checking with the organisers. The host ZIPs
  (26 Nov, 11:03-11:05 IST) match the latest agent YAML.
- **Orchestrator tables.** Outside the Builder, the orchestrator may fail with
  `no registered table 'role_skills' … deploy/register first`. Agreed fallback: set
  `AGENT_NAME_PREFIX=w7d41b85` in its `.env` (the team workspace `ZE_000046_Handover`'s agent name) and retry.
  **Prerequisite:** run one Builder Test with `{"mode":"seed"}` on `handover-orchestrator` in `ZE_000046_Handover`
  (about 17 s). Its tables are created and filled only by a Test run there.
  If that fails too, the mentor must register the tables or deploy the agent.
- **Approved writes.** The orchestrator's `db_write` steps may need `ACTION_APPROVAL_SIM_SECRET` from the
  mentor (watch for `integrity.write_refused` in `/invoke` responses).
