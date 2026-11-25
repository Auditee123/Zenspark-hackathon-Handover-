# Handover front end

React app for the Handover hackathon project. It follows the reviewed wireframe:
Onboarding → Processing → Gaps and KT plan → KT Scheduler → KT Session → Assessment and report.

Only two kinds of clicks are manual: adding candidates (ingestion) and human approvals.
Everything else is agents handing off to each other.

## Run it

Needs Node.js 18 or later.

```bash
npm install
cp .env.example .env      # already done if .env exists
npm run dev
```

Open http://localhost:5173.

## Two modes

| `.env` setting | What happens |
|---|---|
| `VITE_USE_MOCK=true` (default) | Sample data. No backend needed. Use this for the wireframe demo. |
| `VITE_USE_MOCK=false` | Calls the exported AgentMesh agents. |

## Connecting to AgentMesh

1. In the Agent Builder, export each agent (Deploy → Download ZIP) and start its host with `startup.sh`.
   It listens on port 8000. Set `AUTH_MODE=dev` in its `.env` if calls return 401.
2. Put the agent names you saved in the Builder into `.env` (`VITE_AGENT_*`).
3. Set `VITE_AGENTMESH_URL` to the host, and `VITE_USE_MOCK=false`. Restart `npm run dev`.

The app calls, through the Vite proxy at `/agentmesh`:

- `POST /invoke/{agent}` with `{"input": {...}, "config": null}`
- `POST /intake/{agent}` (multipart) for the JD and L1–L3 files
- `POST /approvals/{invocation_id}` to approve a paused run

## What each agent should return

The front end reads these fields from `output`. The sample versions are in `src/mock/agents.js`.

| Agent | Input | Output |
|---|---|---|
| Ingestion | candidate fields + files | `partitions: [{name, chunks}]` |
| Gap Finder | `candidate_id`, `role` | `skills: [{name, score, target, evidence, source}]`, `partitions_read: [...]` |
| KT Planner | previous results | `plan: [{day, topic, why}]` |
| KT Scheduler | previous results | `slots: [{day, topic, options: [..]}]` |
| KT Scheduler (confirm) | `confirmed: [{day, topic, when}]` | `booked: [...]`, `invites_sent`, `channel` |
| KT Session | `day`, `topic`, `message` | `reply`, `escalated` |
| Assessment | previous results | `questions: [{id, skill, text}]`, `total` |
| Assessment (score) | `answers: {id: text}` | `results: [{id, correct}]`, `score`, `total` |
| Report | previous results | `summary`, `skills: [{name, before, after, evidence}]` |

If an agent returns different field names, change the mapping in `src/state/pipeline.jsx`.

## Where things are

- `src/state/pipeline.jsx`: the agent pipeline and hand-offs
- `src/api/client.js`: AgentMesh calls
- `src/mock/`: sample data
- `src/pages/`: one file per screen
