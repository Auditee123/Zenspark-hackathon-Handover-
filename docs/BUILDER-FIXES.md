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

## ☑ 3. `handover-orchestrator`: team names in the demo data (lead Ricky, KT givers Prakhar and Murali)

**Done in the Builder on 26 Nov (09:20-09:35 UTC), export `handover-orchestrator_v4.zip`.** The givers are now
Murali (`ananya`), Prakhar (`rahul`) and Auditee (`sneha`), plus Karan Shah and Divya Menon. Ricky is the escalation
contact. Verified locally: seed OK, and Priya's plan uses Murali, Prakhar and Auditee. Auditee's row briefly held a
real address; prompt 5 removes it.

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
>    For a live demo with real invites, use their **real Zensar email addresses** instead of `@zensar.example`
>    (with their agreement), so the agent's emails reach their inboxes. These addresses live only in the Builder,
>    never in our repo.
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

---

## ☐ 4. `handover-orchestrator`: real invites, and a reschedule loop after booking

**Why:** for the live demo, invites must reach real inboxes, and a KT giver or the joiner must be able to say "I can't
make Day 2". The agent then proposes new times, the joiner picks one, and the agent re-books and re-sends the invite.
Today, booking only writes an `.ics` file, and nothing handles a change. Reading people's Outlook calendars stays
roadmap (it needs Zensar tenant-admin consent), so busy times still come from the `calendar` table.

The web app uses these exact names. Please keep them:

- **state fields:** `kt_done.reschedule_day`, `kt_done.requested_by`, `kt_done.reschedule_reason`, `reproposal`,
  `reproposal_text`, `reschedule_answer`, `schedule_changes`, `invitees`, `invites_delivery`, `reproposal_delivery`;
- **pause:** `confirm_reschedule`.

**Prompt to paste:**

> I'm running the exported **handover-orchestrator** locally from VS Code (Deploy → Download ZIP, run with startup.sh)
> against AgentMesh. For our demo, the scheduling part must send real invites and handle a reschedule request. Please
> make these changes in the Builder, in the team workspace **ZE_000046_Handover** only. Don't touch the copies in My
> workspace. Keep every other node, prompt and edge as it is.
>
> **Today:** `book_sessions → write_invites → save_sessions → kt_done`. Booking only writes an `.ics` file; no invite
> is emailed; nothing handles "I can't make this time".
>
> **1. State.** Add these fields (all optional): `reproposal` (dict), `reproposal_text` (string), `reschedule_answer`
> (dict), `schedule_changes` (list), `invitees` (list), `invites_delivery` (list), `reproposal_delivery` (dict).
>
> **2. `kt_done` (Ask a person).**
> - In its input schema, make `sessions_completed` **not required**, and add three optional fields:
>   - `reschedule_day` (integer, title "Move the session on day");
>   - `requested_by` (string, title "Who asked");
>   - `reschedule_reason` (string, title "Reason").
> - Add one line to its question text: "To move a session, enter its day number, who asked and why, and leave
>   Sessions completed unticked."
>
> **3. `book_sessions` (Custom code).** Keep the code. Add one more key to the returned dict: `invitees` = the joiner
> plus each distinct KT giver, as `[{"name": ..., "email": ...}]`. Compute it just before `return`:
> ```python
> seen, invitees = set(), []
> for name, email in [(state.get('name'), state.get('email'))] + [(s.get('giver_name'), s.get('giver_email')) for s in sessions]:
>     if email and email not in seen:
>         seen.add(email); invitees.append({'name': name, 'email': email})
> ```
>
> **4. New step `send_invites`.** Add it between `save_sessions` and `kt_done`:
> - remove the edge `save_sessions → kt_done`;
> - add `save_sessions → send_invites` and `send_invites → kt_done`.
>
> Make it a **For each item** step over `invitees` (item variable `item`, concurrency 1, on item failure: continue,
> store_as `invites_delivery`). Its body is a sub-agent call to **notification-router**, exactly like `send_proposals`:
> - `recipient_id: "{{ item.email }}"`, `notification_type: "kt_invite"`;
> - `payload: {subject: "KT sessions for {{ state.name }}", body: "Hi {{ item.name }}, the KT sessions for {{ state.name }} are booked:\n{{ state.sessions_table }}\nThe calendar invite (.ics) is in the Handover app."}`;
> - `on_error: log_warning`.
>
> If a For-each body can't hold a sub-agent call, make `send_invites` a single sub-agent call to the joiner
> (`recipient_id: "{{ state.email }}"`) with `map_output: {delivery_status: invites_delivery}`, and tell me.
>
> **5. The reschedule branch from `kt_done`.** Replace the edge `kt_done → store_notes` with two conditional edges:
> - `kt_done → store_notes` when `state.get('kt_done', {}).get('reschedule_day') in (None, '', 0, '0')`;
> - `kt_done → repropose_slot` when `state.get('kt_done', {}).get('reschedule_day') not in (None, '', 0, '0')`.
>
> Then add these steps, chained:
> `repropose_slot → send_reproposal → confirm_reschedule → apply_reschedule → write_invites` (the existing node, which
> already continues to `save_sessions → send_invites → kt_done`, so the loop closes).
>
> - **`repropose_slot`**: Custom code. Use exactly this code:
> ```python
> import json
> from datetime import date, timedelta
>
> def _rows(v):
>     if isinstance(v, str):
>         try:
>             v = json.loads(v)
>         except ValueError:
>             return []
>     if isinstance(v, dict):
>         v = v.get('rows') or v.get('result') or v.get('data') or []
>     return v or []
>
> def _obj(v):
>     if isinstance(v, str):
>         try:
>             return json.loads(v)
>         except ValueError:
>             return {}
>     return v or {}
>
> def _mins(t):
>     h, m = [int(x) for x in str(t).split(':')[:2]]
>     return h * 60 + m
>
> def _fmt(n):
>     return '%02d:%02d' % (n // 60, n % 60)
>
> def _next_weekday(d):
>     d = d + timedelta(days=1)
>     while d.weekday() >= 5:
>         d += timedelta(days=1)
>     return d
>
> def handler(state, **inputs):
>     req = _obj(state.get('kt_done'))
>     try:
>         day = int(float(req.get('reschedule_day') or 0))
>     except (TypeError, ValueError):
>         day = 0
>     sessions = _rows(state.get('sessions'))
>     s = next((x for x in sessions if int(x.get('day') or 0) == day), None)
>     if not s:
>         return {'reproposal': {}, 'reproposal_text': 'There is no session on day %s, so nothing was moved.' % day}
>     length = max(15, _mins(s.get('end', '11:00')) - _mins(s.get('start', '10:00')))
>     g = next((x for x in _rows(state.get('givers')) if x.get('name') == s.get('giver_name')), {})
>     cal = _rows(state.get('calendar'))
>     first = date.fromisoformat(str(s.get('date'))[:10])
>     options = []
>     for d in (first, _next_weekday(first)):
>         iso = d.isoformat()
>         busy = {str(c.get('start'))[:5] for c in cal if c.get('giver_id') == g.get('giver_id')
>                 and str(c.get('date'))[:10] == iso and str(c.get('status', 'busy')).lower() == 'busy'}
>         taken = {x.get('start') for x in sessions if str(x.get('date'))[:10] == iso}
>         for t in (g.get('slot_a'), g.get('slot_b'), '11:00', '16:00', '14:00', '10:00'):
>             t = str(t or '')[:5]
>             if not t or t in busy or t in taken or any(o['date'] == iso and o['start'] == t for o in options):
>                 continue
>             options.append({'code': 'AB'[len(options)], 'date': iso, 'start': t, 'end': _fmt(_mins(t) + length)})
>             if len(options) == 2:
>                 break
>         if len(options) == 2:
>             break
>     rp = {'day': day, 'title': s.get('title'), 'giver_name': s.get('giver_name'), 'giver_email': s.get('giver_email'),
>           'current': {'date': s.get('date'), 'start': s.get('start'), 'end': s.get('end')},
>           'requested_by': req.get('requested_by') or 'someone', 'reason': req.get('reschedule_reason') or '',
>           'options': options}
>     text = 'Day %d, %s with %s: %s asked to move it from %s %s%s. New options: %s.' % (
>         day, s.get('title'), s.get('giver_name'), rp['requested_by'], s.get('date'), s.get('start'),
>         (' (' + rp['reason'] + ')') if rp['reason'] else '',
>         ', '.join('%s = %s %s to %s' % (o['code'], o['date'], o['start'], o['end']) for o in options) or 'none found')
>     return {'reproposal': rp, 'reproposal_text': text}
> ```
> - **`send_reproposal`**: a sub-agent call to **notification-router**, like `send_proposals`:
>   - `recipient_id: "{{ state.email }}"`, `notification_type: "kt_reschedule"`;
>   - `payload: {subject: "New time needed for KT day {{ state.reproposal.day }}", body: "Hi {{ state.name }}, {{ state.reproposal_text }} Reply in the Handover app with A or B."}`;
>   - `map_output: {delivery_status: reproposal_delivery}`, `on_error: log_warning`.
> - **`confirm_reschedule`**: Ask a person.
>   - Question: `{{ state.name }}, {{ state.reproposal_text }} Pick A or B.`
>   - Input schema: one **required** string field `choice` (title "New time (A or B)").
>   - `store_as: reschedule_answer`, timeout 24 h.
> - **`apply_reschedule`**: Custom code. Use exactly this code:
> ```python
> import json
>
> def _rows(v):
>     if isinstance(v, str):
>         try:
>             v = json.loads(v)
>         except ValueError:
>             return []
>     return v or []
>
> def _obj(v):
>     if isinstance(v, str):
>         try:
>             return json.loads(v)
>         except ValueError:
>             return {}
>     return v or {}
>
> def _stamp(day, t):
>     return str(day).replace('-', '') + 'T' + str(t).replace(':', '') + '00'
>
> def handler(state, **inputs):
>     rp = _obj(state.get('reproposal'))
>     choice = str(_obj(state.get('reschedule_answer')).get('choice') or 'A').strip().upper()[:1]
>     opts = rp.get('options') or []
>     opt = next((o for o in opts if o.get('code') == choice), opts[0] if opts else None)
>     sessions = [dict(x) for x in _rows(state.get('sessions'))]
>     changes = list(_rows(state.get('schedule_changes')))
>     for s in sessions:
>         if opt and int(s.get('day') or 0) == int(rp.get('day') or -1):
>             changes.append({'day': s.get('day'), 'title': s.get('title'), 'from': '%s %s' % (s.get('date'), s.get('start')),
>                             'to': '%s %s' % (opt['date'], opt['start']), 'requested_by': rp.get('requested_by'),
>                             'reason': rp.get('reason')})
>             s.update({'date': opt['date'], 'start': opt['start'], 'end': opt['end'], 'status': 'rescheduled',
>                       'sequence': int(s.get('sequence') or 0) + 1})
>     ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Zensar Handover//KT//EN', 'METHOD:REQUEST']
>     lines = ['| Day | Date | Time | Session | KT giver |', '|---|---|---|---|---|']
>     for s in sessions:
>         ics += ['BEGIN:VEVENT', 'UID:' + str(s.get('uid') or ''), 'SEQUENCE:' + str(s.get('sequence') or 0),
>                 'DTSTAMP:20261125T090000Z',
>                 'DTSTART;TZID=Asia/Kolkata:' + _stamp(s.get('date'), s.get('start')),
>                 'DTEND;TZID=Asia/Kolkata:' + _stamp(s.get('date'), s.get('end')),
>                 'SUMMARY:KT Day %s: %s' % (s.get('day'), s.get('title')),
>                 'DESCRIPTION:Handover KT session. The Handover agent joins to take notes.',
>                 'ORGANIZER;CN=Handover:mailto:handover@zensar.example',
>                 'ATTENDEE;CN=%s;RSVP=TRUE:mailto:%s' % (state.get('name', 'Joiner'), state.get('email', '')),
>                 'ATTENDEE;CN=%s;RSVP=TRUE:mailto:%s' % (s.get('giver_name'), s.get('giver_email')),
>                 'END:VEVENT']
>         lines.append('| %s | %s | %s to %s | %s | %s |' % (s.get('day'), s.get('date'), s.get('start'), s.get('end'),
>                                                           s.get('title'), s.get('giver_name')))
>     ics.append('END:VCALENDAR')
>     seen, invitees = set(), []
>     for name, email in [(state.get('name'), state.get('email'))] + [(s.get('giver_name'), s.get('giver_email')) for s in sessions]:
>         if email and email not in seen:
>             seen.add(email)
>             invitees.append({'name': name, 'email': email})
>     return {'sessions': sessions, 'ics_text': '\r\n'.join(ics), 'sessions_table': '\n'.join(lines),
>             'schedule_changes': changes, 'invitees': invitees}
> ```
>
> **6. Test in the Builder** with the Priya input (Appendix E). Use **your own Zensar email** as `email`, so you can
> see whether the emails really arrive.
> 1. Go through H2, review, H3 and `confirm_slots` as usual.
> 2. At `kt_done`, leave **Sessions completed** unticked and enter `reschedule_day: 2`, `requested_by: Prakhar`,
>    `reschedule_reason: Clashes with a release call`. Submit.
> 3. **Expect:** a pause at `confirm_reschedule` showing two new options for day 2 (A and B), and `reproposal_delivery`
>    in the trace.
> 4. Submit `choice: B`. **Expect:** the run goes back to `kt_done`; `sessions` day 2 has the new time and status
>    `rescheduled`; `schedule_changes` has one entry; `invites_delivery` lists a delivery per invitee.
> 5. Finish as usual: tick **Sessions completed**, paste the notes, then H1, assessment, H4.
>
> Tell me whether the emails reached your inbox, and paste the `delivery_status` values from `proposal_delivery`,
> `invites_delivery` and `reproposal_delivery`. Then download the ZIP again (Deploy → Download ZIP) and tell me the file
> name.

**After the re-export:** follow the usual steps at the top of this file, then re-test the loop locally (it needs the
approval key, because it runs after H3).

---

## ☑ 5. `handover-orchestrator`: no real addresses stored in AgentMesh; addresses come from the app per run

**Done in the Builder on 26 Nov (15:20 UTC), export `handover-orchestrator_v5.zip`. Verified locally** (PHASE1.md, v5
re-test). The `sneha` row stayed Auditee, with `auditee@zensar.example`.

**Apply this before prompt 4.** The full prompt was handed over in chat on 26 Nov. What it does:

1. Replaces the real address on the `sneha` (Auditee) givers row with `auditee@zensar.example`. No `@zensar.com`
   address may remain anywhere in the definition.
2. Adds an optional run input `contacts` (giver id → real address) and a custom-code step `apply_contacts` between
   `load_givers` and `search_project`. It overrides the givers' emails **in memory** for that run.
3. Keeps addresses out of the saved rows: `save_plan` stores `plan_table` and `save_sessions` stores `sessions_table`
   (names only), instead of the plan and sessions objects, which carry emails.
4. Re-runs the seed, so the stored givers row is overwritten with the placeholder. Then a Priya Test with
   `"contacts": {"sneha": "<own address>"}` up to `review_plan`, and a re-export.

The web app already sends `contacts` from **Onboard joiners → KT giver contacts for this run**, only when filled.

---

## ☐ 6. `handover-qa`: make the privacy-wall refusal a first-check rule

The full prompt was handed over in chat on 26 Nov.
- **Why:** "What did the panel say about Priya?" was answered from KT session notes instead of being refused. The
  refusal rule is the last rule in `qa_answer`, and it's phrased narrowly.
- **Fix:** make it the first check, covering panels, interviewers, L1/L2/L3, hiring and assessment results about any
  named person, and applying even when the search results mention that person.
- **Then:** re-run the Golden Set (3 samples) and a few paraphrases of the question.
