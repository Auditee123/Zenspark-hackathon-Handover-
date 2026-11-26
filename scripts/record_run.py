"""Record a full live Handover run against the local AgentMesh hosts, for the web app's replay mode.

    python3.12 -I scripts/record_run.py [--out agentmesh/web/fixtures/priya-full-run.json]

Drives the orchestrator through every pause on the short path (H2, review_plan x2, H3, confirm_slots, kt_done,
H1, take_assessment, H4) with the kit's synthetic Priya data, plus four handover-qa questions and two
handover-kt-session turns. Every request and response is saved with its time offset. While a call is in flight,
a poller records GET /invocations, /invocations/{id} and /invocations/{id}/pending every 1.5 s, so replay can
show live progress. Needs the three hosts running (make hosts) and the VPN. Synthetic data only.
"""
from __future__ import annotations

import argparse
import json
import re
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

HOSTS = {"orch": "http://127.0.0.1:8001", "qa": "http://127.0.0.1:8002", "kt": "http://127.0.0.1:8003"}
NAMES = {"orch": "handover-orchestrator", "qa": "handover-qa", "kt": "handover-kt-session"}
ROOT = Path(__file__).resolve().parent.parent
KIT_PROMPT = ROOT / "inputs/kit/agentmesh-kit/Handover_AgentMesh_Build_Prompt_ClaudeInChrome.md"
LEAD = "meera.nair@zensar.example"
EXPERT = "ananya.rao@zensar.example"
H1_ANSWER = ("The retry limit is three because three retries with backoff fit inside the 30-second consumer timeout "
             "agreed with StreamOps; five retries caused duplicate-processing alerts.")
QA_QUESTIONS = ["Who approves a production release?", "Where do failed claim events go?",
                "What did the panel say about Priya?", "Why is the claims-events retry limit three and not five?"]

T0 = time.monotonic()
EVENTS: list[dict] = []
LOCK = threading.Lock()


def http(agent: str, method: str, path: str, body: dict | None = None, *, record: bool = True, timeout: int = 900):
    url = HOSTS[agent] + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={"Content-Type": "application/json"} if data else {})
    start = time.monotonic()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            status, raw = r.status, r.read()
    except urllib.error.HTTPError as e:
        status, raw = e.code, e.read()
    try:
        payload = json.loads(raw) if raw else None
    except ValueError:
        payload = raw.decode(errors="replace")
    if record:
        with LOCK:
            EVENTS.append({"t_ms": round((start - T0) * 1000), "duration_ms": round((time.monotonic() - start) * 1000),
                           "agent": agent, "method": method, "path": path, "body": body, "status": status, "response": payload})
    return status, payload


class Poller:
    """Records progress polls while a long synchronous call is in flight."""

    def __init__(self, agent: str, inv_id: str | None):
        self.agent, self.inv_id, self.stop = agent, inv_id, threading.Event()
        self.t = threading.Thread(target=self.run, daemon=True)

    def run(self):
        while not self.stop.wait(1.5):
            http(self.agent, "GET", f"/invocations?agent={NAMES[self.agent]}&limit=50")
            if self.inv_id:
                http(self.agent, "GET", f"/invocations/{self.inv_id}")

    def __enter__(self):
        self.t.start()
        return self

    def __exit__(self, *exc):
        self.stop.set()
        self.t.join()


def snapshot(agent: str, inv_id: str):
    """What the UI reads at a pause: the run row, its pending pause, and the inbox."""
    _, row = http(agent, "GET", f"/invocations/{inv_id}")
    _, pending = http(agent, "GET", f"/invocations/{inv_id}/pending")
    http(agent, "GET", f"/approvals/pending?agent={NAMES[agent]}")
    http(agent, "GET", f"/invocations?agent={NAMES[agent]}&limit=50")
    return (row or {}).get("latest_state") or {}, pending if isinstance(pending, dict) else {}


def decide(inv_id: str, body: dict) -> dict:
    with Poller("orch", inv_id):
        status, res = http("orch", "POST", f"/approvals/{inv_id}", body)
    print(f"  {body.get('gate')}: {body['decision']} -> HTTP {status} {res.get('status') if isinstance(res, dict) else res}")
    if status >= 400:
        raise SystemExit(f"decision failed: {res}")
    return res


def priya_input() -> tuple[dict, str]:
    text = KIT_PROMPT.read_text(encoding="utf-8")
    sec = text[text.index("# Appendix E"):]
    data = json.loads(re.search(r"```json\n(.*?)```", sec, re.S).group(1))
    notes = re.search(r"```text\n(.*?)```", sec, re.S).group(1).strip()
    return data, notes


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(ROOT / "agentmesh/web/fixtures/priya-full-run.json"))
    args = ap.parse_args()
    for a in HOSTS:
        st, h = http(a, "GET", "/health")
        if st != 200:
            raise SystemExit(f"{NAMES[a]} is not healthy: {st} {h}")

    data, notes = priya_input()
    print("orchestrator: start Priya")
    with Poller("orch", None):
        _, res = http("orch", "POST", "/invoke/handover-orchestrator", {"input": data})
    inv = res["output"]["invocation_id"]
    print(f"  run {inv}: {res['status']} {res.get('error') or ''}")
    if res["status"] != "pending_hitl":
        raise SystemExit("orchestrator did not pause")

    state, pend = snapshot("orch", inv)
    for _ in range(20):  # walk every pause on the short path
        gate = pend.get("gate")
        if not gate:
            break
        if gate == "h2_gap_approval":
            decide(inv, {"gate": gate, "decision": "approved", "notes": "Findings match the panels.", "reviewer": LEAD})
        elif gate == "review_plan":
            if state.get("plan_version", 1) < 2 and (state.get("round") or 1) == 1:
                decide(inv, {"gate": gate, "decision": "submitted", "input": {"move_skill_id": "kafka", "to_day": 2}, "reviewer": LEAD})
            else:
                decide(inv, {"gate": gate, "decision": "submitted", "input": {"approve": True}, "reviewer": LEAD})
        elif gate == "h3_plan_approval":
            r = decide(inv, {"gate": gate, "decision": "approved", "notes": "Plan covers every gap.", "reviewer": LEAD})
            if r.get("status") == "partial":
                decide(inv, {"gate": gate, "decision": "approved", "notes": "Content checked.", "reviewer": EXPERT})
        elif gate == "confirm_slots":
            codes = ",".join(p["options"][0]["code"] for p in state.get("proposals") or [] if p.get("options"))
            decide(inv, {"gate": gate, "decision": "submitted", "input": {"slot_choices": codes}, "reviewer": "priya.sharma@zensar.example"})
        elif gate == "kt_done":
            decide(inv, {"gate": gate, "decision": "submitted", "input": {"sessions_completed": True, "session_notes": notes}, "reviewer": EXPERT})
        elif gate == "h1_expert_answers":
            qs = state.get("open_questions") or []
            answers = "\n".join(f"Q: {q}\nA: {H1_ANSWER}" for q in qs) or H1_ANSWER
            decide(inv, {"gate": gate, "decision": "submitted", "input": {"answers": answers, "approve_notes": True}, "reviewer": "rahul.verma@zensar.example"})
        elif gate == "take_assessment":
            qs = state.get("questions") or []
            ans = {f"a{i + 1}": str(q.get("correct") or "A")[:1] for i, q in enumerate(qs[:5])}
            decide(inv, {"gate": gate, "decision": "submitted", "input": ans, "reviewer": "priya.sharma@zensar.example"})
        elif gate == "h4_signoff":
            decide(inv, {"gate": gate, "decision": "approved", "notes": "Signed off.", "reviewer": LEAD})
        else:
            raise SystemExit(f"unexpected pause {gate}")
        state, pend = snapshot("orch", inv)
    _, row = http("orch", "GET", f"/invocations/{inv}")
    final = (row or {}).get("latest_state") or {}
    print(f"  final status {row.get('status')}, ready={final.get('ready')}, overall={final.get('overall')}")
    for f in ("certificate_file", "ics_file"):
        ref = final.get(f) or {}
        if isinstance(ref, dict) and ref.get("path"):
            st, _ = http("orch", "GET", f"/files/{ref['path']}", record=False)
            print(f"  {f}: GET /files -> HTTP {st}")

    print("handover-qa: 4 questions")
    for q in QA_QUESTIONS:
        with Poller("qa", None):
            _, r = http("qa", "POST", "/invoke/handover-qa", {"input": {"question": q, "asker": "priya.sharma@zensar.example"}})
        http("qa", "GET", f"/invocations/{r['output']['invocation_id']}")
    http("qa", "GET", "/invocations?agent=handover-qa&limit=50")

    print("handover-kt-session: 2 turns")
    base = {"candidate_id": "priya-sharma", "session_title": "Day 2 Kafka on claims-events", "skill_id": "kafka", "giver_name": "Rahul Verma"}
    turns = [{**base, "speaker": "Priya Sharma", "message": "How are claim events partitioned?", "history": []}]
    with Poller("kt", None):
        _, r = http("kt", "POST", "/invoke/handover-kt-session", {"input": turns[0]})
    _, row = http("kt", "GET", f"/invocations/{r['output']['invocation_id']}")
    reply = ((row or {}).get("latest_state") or {}).get("reply", "")
    end = {**base, "speaker": "Rahul Verma", "message": "That's all for today.", "end_session": True,
           "history": [{"speaker": "Priya Sharma", "text": turns[0]["message"]}, {"speaker": "Handover agent", "text": reply}]}
    with Poller("kt", None):
        _, r = http("kt", "POST", "/invoke/handover-kt-session", {"input": end})
    http("kt", "GET", f"/invocations/{r['output']['invocation_id']}")
    http("kt", "GET", "/invocations?agent=handover-kt-session&limit=50")

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"recorded_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "invocation_id": inv,
                               "events": EVENTS}, indent=1), encoding="utf-8")
    print(f"wrote {out} ({len(EVENTS)} events)")


if __name__ == "__main__":
    main()
