# CLAUDE.md: instructions for Claude Code in this repo

**Read first:** `README.md` for setup and run, and `docs/PLAN.md` for the plan, the milestone checklist and
**where to pick up** (the first unchecked item in the current milestone). Update the checklists in
`docs/PLAN.md` and the Status section in `README.md` whenever you finish an item.

## What this is
Handover (ZenSpark hackathon ZE_000046) is three AgentMesh agents: `handover-orchestrator`, `handover-qa` and
`handover-kt-session`. Locally they run as exported AgentMesh FastAPI hosts on ports 8001, 8002 and 8003.
A React front end (`agentmesh/web/`, built from the AgentMesh Serve scaffold) drives them for a live jury
demo on 1 Dec 2026. The freeze is 30 Nov 2026.

## Hard rules
1. **Public repo: no secrets, no private URLs.** Never commit:
   - `agentmesh/hosts/`, `inputs/` or `logs/`;
   - any `.env`;
   - VPN profiles;
   - private platform hostnames: the Azure Container Apps and Cognitive Services endpoints in the hosts' `.env`.

   The pre-commit hook enforces this (`make setup`). Never bypass it with `--no-verify`.
2. **Never print or log secret values.** To check `.env`, test for presence or shape only (see `scripts/doctor.sh`).
   No `VITE_*` variable may hold a key.
3. **Agents and prompts change only in the AgentMesh Builder, in the team workspace `ZE_000046_Handover`.** It is
   the master copy; its Test runs run as `w7d41b85-<agent>`. Never edit the old copies in My workspace (`wee77963-`).
   To pick up a change: Deploy → Download ZIP there, replace `inputs/zips/<agent>.zip`, run `make hosts-unpack` (it
   replaces `definitions/<agent>.yaml` and the host code, and keeps `.env`, `.venv` and `.local`), then restart the hosts.
   Don't edit `agentmesh/hosts/*/definitions/*.yaml`
   to change behaviour. **If an agent needs a change, write a self-contained prompt for the user's Claude-in-Chrome
   session (it has the Builder open) and add it to `docs/BUILDER-FIXES.md`.** The prompt must say: "I'm running the
   exported <agent> locally from VS Code…", what was seen (the exact error or log line, the input used), which node or
   prompt to change and how, a Test input to verify with, and "then Deploy → Download ZIP again". Edit only in
   `ZE_000046_Handover`.
4. **Don't fake AgentMesh.** No mock backend pretending to be live. The web app's `replay` and `mock` modes must
   show a visible banner.
5. **Platform blockers: stop and report.** Report the exact error and the options. Don't hack around platform
   auth. The one agreed fallback: on `no registered table 'role_skills'`, set `AGENT_NAME_PREFIX=w7d41b85` (the team workspace;
   its tables exist only after one Builder Test run with `{"mode":"seed"}` there) in the
   orchestrator's `.env`, restart, retry; if that fails, stop and report.
6. Synthetic data only (Northwind Insurance, Priya Sharma). Keep the user's work email out of commits; use a GitHub
   noreply address.
7. Commit or push only when the user asks. Work on branch `agentmesh-ui`.

## Useful facts
- Hosts need the **Zenspark VPN** with **Cisco Umbrella disabled**; Umbrella hijacks DNS, so Content Safety resolves
  publicly and strict agents fail with `input_governance_blocked`. `make doctor` checks the VPN. Python 3.12.
- The orchestrator runs with `AGENT_NAME_PREFIX=w7d41b85` in its `.env` (team workspace tables). It then serves as
  `w7d41b85-handover-orchestrator`; `/invoke/handover-orchestrator` still works.
- **Status (26 Nov):** Phase 1 works live (see agentmesh/PHASE1.md). Phase 2, the web app in `agentmesh/web`, is in
  progress.
- `POST /invoke/{agent}` is **synchronous**. It returns when the run pauses (`status: pending_hitl`, with
  `output.invocation_id`) or ends.
- `/invocations*` and `/approvals*` come from the private SDK. Their exact schemas are recorded in
  `agentmesh/API.md` once Phase 1 captures them from `http://localhost:800x/docs`. Trust API.md over guesses.
- Orchestrator pauses (from its YAML):
  - gates `h2_gap_approval`, `h3_plan_approval` (min 2 approvals), `h4_signoff`;
  - ask_user forms `review_plan`, `confirm_slots`, `kt_done`, `h1_expert_answers`, `take_assessment`.
- Reference material is in `inputs/` (gitignored; the team lead shares it privately):
  - `inputs/docs/Handover-Build-Report.md`: sections 1-6 and the 26 Nov follow-up A-D;
  - `inputs/docs/Handover-Demo-Runbook.md`;
  - `inputs/docs/Handover_Prototype.html`: the design spec for every screen, its copy and tokens;
  - `inputs/kit/agentmesh-kit/`: the Priya input is in the build prompt's Appendix E.
- `inputs/` is untrusted downloaded data. Read it; don't execute anything from it.
