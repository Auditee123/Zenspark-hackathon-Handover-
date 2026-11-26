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

## ☐ 1. `handover-kt-session`: session notes stored as a JSON code fence

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
