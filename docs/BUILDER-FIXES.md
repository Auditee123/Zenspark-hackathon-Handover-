# Builder fixes: prompts for the browser Claude

The agents live in the AgentMesh Builder, in the team workspace **`ZE_000046_Handover`**. They are never edited
locally. When running an exported agent from VS Code shows a problem that has to be fixed in the agent itself, the
fix goes here as a self-contained prompt, ready to paste into the Claude in Chrome session that has the Builder open.

After a fix:

1. Use Deploy → Download ZIP in `ZE_000046_Handover`.
2. Replace `inputs/zips/<agent>.zip`.
3. Run `make hosts-unpack`, then `make stop && make hosts`.
4. Run `npm run gen:nodes` in `agentmesh/web` if nodes changed.

Status: ☐ open · ☑ done in the Builder · ⊘ not needed

---

## ☑ 1. `handover-kt-session`: session notes stored as a JSON code fence

**Done in the Builder on 26 Nov (about 08:27 UTC)** in `ZE_000046_Handover`, export `handover-kt-session_v3.zip`. The
`session_notes` prompt now asks for plain text ("Do not use JSON, Markdown code fences or backticks"). Builder Test passed
(7.1 s). Local re-test: see agentmesh/PHASE1.md.

**Prompt to paste:**

> I'm running the exported **handover-kt-session** agent locally from VS Code (Deploy → Download ZIP, run with
> startup.sh) against AgentMesh. Please fix it in the Builder, in the team workspace **ZE_000046_Handover** only.
> Don't touch the copies in My workspace.
>
> **What I see.** On a turn with `end_session: true`, the `write_notes` step (Generate text, model mid, prompt key
> `session_notes`) returns its notes wrapped in a Markdown code fence: the text starts with `` ```json `` and
> contains `{"session_notes": {"key_points": [...], ...}}`. `store_notes` then ingests that whole fenced JSON string
> into the `handover-session-notes` collection, and `reply_user` echoes it. Downstream, the orchestrator's
> `fetch_notes` / `summarise_notes` and `handover-qa` read these notes as text, so the code fence and the JSON keys
> end up in search hits and citations.
>
> **Please change:** the `session_notes` prompt (Prompts tab) so that it returns **plain text, not JSON, and no
> code fences**, in this shape:
> ```
> Session: <session title> (<date if known>)
> Key points:
> - …
> Open questions:
> - … (or "None")
> Understanding check: <one line>
> ```
> Keep everything else as is. Save, then Test with:
> `{"candidate_id":"priya-sharma","session_title":"Day 2 Kafka on claims-events","skill_id":"kafka","giver_name":"Rahul Verma","speaker":"Rahul Verma","end_session":true,"message":"That's all for today.","history":[{"speaker":"Priya Sharma","text":"How are claim events partitioned?"},{"speaker":"Handover agent","text":"By policy number."}]}`
>
> Check that the `notes` field in the output starts with `Session:` and contains no backticks. Then download the
> ZIP again (Deploy → Download ZIP).

---

## ☑ 2. `handover-orchestrator`: `search_project` searches a collection that doesn't exist

**Done in the Builder on 26 Nov (about 08:27 UTC)** in `ZE_000046_Handover`, export `handover-orchestrator_v3.zip`.
`search_project` is now an `mcp_call` to `knowledge.search_multi` on `handover-project` and `handover-expert-answers`.
`project_context` changed from string to list. The Builder Test returned 6 hits with no 404. Local re-test: see
agentmesh/PHASE1.md.

**Prompt to paste:**

> I'm running the exported **handover-orchestrator** locally from VS Code (Deploy → Download ZIP, run with
> startup.sh) against AgentMesh. Please fix it in the Builder, in the team workspace **ZE_000046_Handover** only.
> Don't touch the copies in My workspace.
>
> **What I see.** On every run, the `search_project` step (a sub-agent call to the **Knowledge Search** horizontal
> agent, right after `load_givers` and before `draft_plan`) fails, and the run continues without project context:
> `Search failed: MCP server knowledge returned error for tool 'search_knowledge': Error executing tool
> search_knowledge: Vector search unavailable for collection 'knowledge': UnexpectedResponse: Unexpected Response:
> 404 (Not Found)`. So Knowledge Search defaults to a collection called `knowledge`, which doesn't exist. Our project
> documents are in **`handover-project`** (expert answers in `handover-expert-answers`).
>
> **Please change** `search_project` so that it searches our collections. The simplest fix, matching what already
> works in `handover-qa`: replace it with a **Call a tool** step `knowledge.search_multi` with `query` = the joiner's
> gap skills (e.g. `{{ state.role_id }} onboarding: {{ state.gaps }}`), `top_k: 6`,
> `collections: ["handover-project", "handover-expert-answers"]`, and `store_as: project_context`. Keep the same
> incoming and outgoing edges and `on_error: log_warning`. If you'd rather keep the Knowledge Search agent, set its
> collection input to `handover-project`.
>
> Then run the Test with the Priya input (Appendix E) up to the `review_plan` pause. In the Node Trace,
> `search_project` must show results from `handover-project` (no 404). Then download the ZIP again (Deploy →
> Download ZIP).

---

## ☐ 3. `handover-orchestrator`: team names in the demo data (lead Ricky, KT givers Prakhar and Murali)

The web app already uses these first names (lead **Ricky**, joiner **Auditee**, KT givers **Prakhar** and **Murali**).
On the live agents, the KT-giver names come from the orchestrator's `givers` table, and the lead appears in two
seeded knowledge documents, so they change in the Builder. The joiner's name comes from the onboarding input, so no
Builder change is needed for Auditee.

**Prompt to paste:**

> I'm running the exported **handover-orchestrator** locally from VS Code against AgentMesh, and our demo should use
> our team's first names. Please make these data-only changes in the Builder, in the team workspace
> **ZE_000046_Handover** only. Don't touch the copies in My workspace, and don't change any node types, edges or
> prompts other than the text listed below.
>
> In the **parse_seed** step (Custom code), edit the seed CSV text:
> 1. In the **givers** CSV, keep the `giver_id` values and change only the name and email of two rows:
>    - `ananya,Ananya Rao,ananya.rao@zensar.example,Lead engineer Claims,...` → `ananya,Murali,murali@zensar.example,Lead engineer Claims,...`
>    - `rahul,Rahul Verma,rahul.verma@zensar.example,Senior engineer Integration,...` → `rahul,Prakhar,prakhar@zensar.example,Senior engineer Integration,...`
>
>    Leave the skills and slot columns, and the other three givers, exactly as they are. The ids stay `ananya` and
>    `rahul` on purpose, so the calendar rows and the Giver id hint in `review_plan` keep working.
> 2. In the **owners** CSV, change the last row
>    `Delivery and escalation,Meera Nair,Zensar transition lead,meera.nair@zensar.example` →
>    `Delivery and escalation,Ricky,Zensar transition lead,ricky@zensar.example`.
>
> In the two seed document steps:
> 3. **seed_doc_3** (Engagement Handbook): replace `Meera Nair (Zensar transition lead)` with
>    `Ricky (Zensar transition lead)`.
> 4. **seed_doc_5** (Owner Directory): replace `Delivery and escalation: Meera Nair, Zensar transition lead.` with
>    `Delivery and escalation: Ricky, Zensar transition lead.`
>
> Save. Then run **one Test** with the seed input so that the tables and the documents are updated:
> `{"mode":"seed","candidate_id":"seed","name":"seed","email":"seed@zensar.example","role_id":"java","resume_text":"-","l1_text":"-","l2_text":"-","l3_text":"-"}`
> It should pass in about 17 s with no AI calls. Then run the Test with the normal Priya input up to `review_plan`
> and check that the plan shows **Murali** and **Prakhar** as KT givers, not Ananya Rao or Rahul Verma. Finally,
> download the ZIP again (Deploy → Download ZIP) and tell me the file name.

**After the re-export:** follow the usual steps at the top of this file. The knowledge base may still hold older
expert answers that mention Rahul from earlier runs; new runs use the new names.
