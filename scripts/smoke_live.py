"""Live smoke test of the three local AgentMesh hosts. Safe: it stops every orchestrator run at review_plan (before
H3), so no email step can run, and it only uses @zensar.example test addresses.

    python3.12 -I scripts/smoke_live.py          (or: make smoke)

Checks:
  qa         cited answer (Fatima Khan, Project documents) and the privacy-wall refusal (trust Blocked)
  kt         end_session notes are plain text (start with "Session:", no backticks or JSON)
  orch       Priya run without contacts: H2 → approve → review_plan; all KT-giver emails are placeholders
  contacts   Priya run with per-run contacts (keyed by giver id and by name): overrides in this run's state only
  table      a later run without contacts still gets placeholders (the givers table is untouched)
"""
from __future__ import annotations

import concurrent.futures as cf
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HOST = {"orch": "http://127.0.0.1:8001", "qa": "http://127.0.0.1:8002", "kt": "http://127.0.0.1:8003"}
KIT = ROOT / "inputs/kit/agentmesh-kit/Handover_AgentMesh_Build_Prompt_ClaudeInChrome.md"
TEST_CONTACTS = {"rahul": "prakhar.smoketest@zensar.example", "Murali": "murali.smoketest@zensar.example"}
results: list[tuple[str, bool, str]] = []


def call(agent: str, method: str, path: str, body: dict | None = None, timeout: int = 600):
    req = urllib.request.Request(HOST[agent] + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json"} if body is not None else {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"null")


def check(name: str, ok: bool, detail: str) -> bool:
    results.append((name, ok, detail))
    return ok


def run_read(agent: str, inp: dict) -> dict:
    st, r = call(agent, "POST", f"/invoke/{ {'qa': 'handover-qa', 'kt': 'handover-kt-session'}[agent] }", {"input": inp})
    if st != 200 or r.get("status") == "error":
        raise RuntimeError(f"{agent} failed: HTTP {st} {r.get('error') if isinstance(r, dict) else r}")
    return call(agent, "GET", f"/invocations/{r['output']['invocation_id']}")[1]["latest_state"]


def test_qa():
    s = run_read("qa", {"question": "Who approves a production release?"})
    check("qa: cited answer", "Fatima" in str(s.get("answer")) and s.get("trust") == "Project documents",
          f"trust={s.get('trust')} citations={s.get('citations')}")
    s = run_read("qa", {"question": "What did the panel say about Priya?"})
    check("qa: privacy wall", s.get("trust") == "Blocked", f"trust={s.get('trust')}")


def test_kt():
    s = run_read("kt", {"candidate_id": "smoke", "session_title": "Day 2 Kafka", "skill_id": "kafka", "giver_name": "Prakhar",
                        "speaker": "Prakhar", "end_session": True, "message": "That's all for today.",
                        "history": [{"speaker": "Joiner", "text": "How are claim events partitioned?"},
                                    {"speaker": "Handover agent", "text": "By policy number."}]})
    n = str(s.get("notes") or "")
    check("kt: plain-text notes", n.startswith("Session:") and "`" not in n and '"key_points"' not in n, n[:60].replace("\n", " / "))


def orch_to_review(contacts: dict | None) -> tuple[str, dict]:
    text = KIT.read_text(encoding="utf-8")
    data = json.loads(re.search(r"```json\n(.*?)```", text[text.index("# Appendix E"):], re.S).group(1))
    data["candidate_id"] = f"smoke-{int(time.time() * 1000) % 10**8}"
    if contacts:
        data["contacts"] = contacts
    st, r = call("orch", "POST", "/invoke/handover-orchestrator", {"input": data})
    if r.get("status") != "pending_hitl":
        raise RuntimeError(f"orchestrator did not pause at H2: {r.get('status')} {r.get('error')}")
    inv = r["output"]["invocation_id"]
    st, d = call("orch", "POST", f"/approvals/{inv}", {"gate": "h2_gap_approval", "decision": "approved", "reviewer": "ricky@zensar.example", "notes": "smoke"})
    gate = (d.get("pending") or {}).get("gate") if isinstance(d, dict) else None
    if gate != "review_plan":
        raise RuntimeError(f"after H2 expected review_plan, got {gate}: {d}")
    return inv, call("orch", "GET", f"/invocations/{inv}")[1]


def emails(state: dict) -> dict[str, str]:
    return {g.get("giver_id"): g.get("email") for g in state.get("givers") or []}


def test_orch_plain():
    inv, row = orch_to_review(None)
    s = row["latest_state"]
    e = emails(s)
    check("orch: run to review_plan", bool(s.get("plan")), f"{inv[:8]} plan v{s.get('plan_version')}, {len(s.get('plan') or [])} sessions")
    check("orch: no real addresses", all(str(v).endswith(".example") for v in e.values()), json.dumps(e))
    check("orch: givers", [g.get("name") for g in s.get("givers") or []][:3] == ["Murali", "Prakhar", "Auditee"], str([g.get("name") for g in s.get("givers") or []]))
    check("orch: apply_contacts ran", "apply_contacts" in (row.get("completed_nodes") or []), "")
    return inv


def test_orch_contacts():
    inv, row = orch_to_review(TEST_CONTACTS)
    s = row["latest_state"]
    e = emails(s)
    check("contacts: by giver id (rahul)", e.get("rahul") == TEST_CONTACTS["rahul"], f"rahul={e.get('rahul')}")
    check("contacts: by name (Murali)", e.get("ananya") == TEST_CONTACTS["Murali"], f"ananya={e.get('ananya')}")
    check("contacts: others untouched", e.get("sneha") == "auditee@zensar.example", f"sneha={e.get('sneha')}")
    plan_mail = {d.get("giver_name"): d.get("giver_email") for d in s.get("plan") or []}
    check("contacts: reach the plan", plan_mail.get("Prakhar") == TEST_CONTACTS["rahul"], json.dumps(plan_mail))
    check("contacts: not in plan_table", "@" not in str(s.get("plan_table") or ""), "plan_table is what save_plan stores")
    return inv


def main():
    for a in HOST:
        if call(a, "GET", "/health", timeout=10)[0] != 200:
            sys.exit(f"{a} host is not healthy: run make hosts / make health")
    with cf.ThreadPoolExecutor(4) as pool:
        futures = {pool.submit(f): f.__name__ for f in (test_qa, test_kt, test_orch_plain, test_orch_contacts)}
        for fut in cf.as_completed(futures):
            try:
                fut.result()
            except Exception as exc:  # noqa: BLE001 - reported as a failure
                check(futures[fut], False, str(exc)[:200])
    # After the contacts run: a fresh run must still see the placeholders (nothing was written back).
    try:
        inv, row = orch_to_review(None)
        e = emails(row["latest_state"])
        check("table: placeholders after a contacts run", all(str(v).endswith(".example") and "smoketest" not in str(v) for v in e.values()), json.dumps(e))
    except Exception as exc:  # noqa: BLE001
        check("table: placeholders after a contacts run", False, str(exc)[:200])
    width = max(len(n) for n, _, _ in results)
    for n, ok, d in results:
        print(f"{'PASS' if ok else 'FAIL'}  {n:<{width}}  {d}")
    failed = sum(not ok for _, ok, _ in results)
    print(f"\n{len(results) - failed} passed, {failed} failed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
