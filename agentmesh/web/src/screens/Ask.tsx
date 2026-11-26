import { useState } from "react";
import type { FormEvent } from "react";
import { Loader2, Lock, Send } from "lucide-react";
import { errorText, useStore } from "../state/store";
import { runAndRead, toRunView } from "../runtime/client";
import { nameOf } from "../runtime/pauses";
import { ASK_SUGGESTIONS } from "../runtime/samples";
import type { QaOutput } from "../runtime/types";
import { Card, ErrorState, PageHead, Pill } from "../components/ui";
import type { Tone } from "../components/ui";
import { Bubble } from "../components/viz";

const TRUST: Record<string, Tone> = {
  "Expert answer · verified": "good",
  "Owner directory": "good",
  "Project documents": "info",
  "Session notes · unverified": "warn",
  "No answer · logged": "warn",
  Blocked: "bad",
};

interface QA {
  q: string;
  a?: QaOutput;
  error?: string;
}

export default function Ask() {
  const { selected, viewAs, setSideTrace } = useStore();
  const [items, setItems] = useState<QA[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const asker = viewAs === "joiner" && selected ? String(selected.state.email ?? nameOf(selected)) : viewAs === "giver" ? "rahul.verma@zensar.example" : "meera.nair@zensar.example";

  const ask = async (question: string, e?: FormEvent) => {
    e?.preventDefault();
    if (!question.trim() || busy) return;
    setQ("");
    setBusy(true);
    setItems((x) => [...x, { q: question }]);
    try {
      const r = await runAndRead<QaOutput>("qa", { question, asker });
      if (r.row) setSideTrace({ agent: "qa", title: `Q&A · ${question.slice(0, 40)}`, rows: toRunView("qa", r.row, null).trace });
      if (!r.ok) throw new Error(r.error ?? "handover-qa failed");
      setItems((x) => x.map((it, i) => (i === x.length - 1 ? { q: question, a: r.state } : it)));
    } catch (err) {
      setItems((x) => x.map((it, i) => (i === x.length - 1 ? { q: question, error: errorText(err) } : it)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="content page">
      <PageHead
        eyebrow="Ask Handover"
        title="Ask anything about the project"
        lead="Answers come from the project documents, approved expert answers and session notes, with sources and a trust label. It never searches interview feedback or assessment results."
        agent="qa"
      />
      <div className="split">
        <Card title="Conversation" actions={<Pill tone="agent">handover-qa · live</Pill>}>
          <div className="chat" style={{ minHeight: 300 }} aria-live="polite">
            {items.length === 0 && <p className="small muted">Try one of the questions on the right.</p>}
            {items.map((it, i) => (
              <div key={i} className="stack">
                <Bubble who="me" by="You">
                  {it.q}
                </Bubble>
                {it.error ? (
                  <ErrorState title="handover-qa didn't answer" error={it.error} />
                ) : it.a ? (
                  it.a.trust === "Blocked" ? (
                    <div className="msg ai refusal">
                      <span className="by row" style={{ gap: 5 }}>
                        <Lock size={12} aria-hidden="true" /> Handover · privacy wall
                      </span>
                      <div>{it.a.answer}</div>
                      <span className="tiny muted">Interview feedback and assessment results live in partitions this chat can't read. The transition lead sees them in the gap analysis.</span>
                      <Pill tone="bad">Blocked by partition rules</Pill>
                    </div>
                  ) : (
                    <Bubble
                      who="ai"
                      by="Handover"
                      cites={it.a.citations}
                      extra={
                        <div className="row">
                          <Pill tone={TRUST[it.a.trust ?? ""] ?? ""}>{it.a.trust ?? "Unlabelled"}</Pill>
                          {it.a.grounded?.verdict && (
                            <Pill tone={it.a.grounded.verdict === "supported" ? "good" : "warn"} title="check_grounding">
                              Grounding: {it.a.grounded.verdict}
                              {typeof it.a.grounded.faithfulness === "number" ? ` · ${it.a.grounded.faithfulness}` : ""}
                            </Pill>
                          )}
                        </div>
                      }
                    >
                      {it.a.answer}
                    </Bubble>
                  )
                ) : (
                  <Bubble who="ai" by="Handover">
                    <span className="row muted">
                      <Loader2 size={14} className="spin" aria-hidden="true" /> Searching the allowed collections…
                    </span>
                  </Bubble>
                )}
              </div>
            ))}
          </div>
          <form className="composer" onSubmit={(e) => void ask(q, e)}>
            <label className="sr-only" htmlFor="ask">
              Question
            </label>
            <input id="ask" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about the project, a process or who owns what…" disabled={busy} />
            <button type="submit" className="btn primary" disabled={busy || !q.trim()}>
              <Send size={14} aria-hidden="true" /> Ask
            </button>
          </form>
        </Card>
        <Card title="Try asking">
          <div className="stack">
            {ASK_SUGGESTIONS.map((s) => (
              <button key={s} type="button" className="chip" style={{ justifyContent: "flex-start", textAlign: "left" }} disabled={busy} onClick={() => void ask(s)}>
                {s}
              </button>
            ))}
          </div>
          <p className="tiny muted">Each question is one live run of handover-qa: search_multi on the allowed collections, an answer with citations, then a grounding check. Typical time: 15 to 25 seconds.</p>
        </Card>
      </div>
    </div>
  );
}
