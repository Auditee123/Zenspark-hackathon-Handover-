// Runs the Handover pipeline for each candidate.
// Agents hand off to each other automatically; the run only pauses where a
// person has to act: the plan approval, the candidate's slot choice, the KT
// sessions, the assessment answers, and the final sign-off.
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AGENTS } from '../api/agents.js';
import { invokeAgent, intakeFiles, decideApproval } from '../api/client.js';
import { SAMPLE_CANDIDATES } from '../mock/candidates.js';

export const STAGES = [
  { key: 'ingestion', label: 'Ingestion agent', text: 'Stores the JD and L1–L3 feedback in separate partitions.' },
  { key: 'gapFinder', label: 'Gap Finder agent', text: 'Compares the feedback with the JD and scores every skill.' },
  { key: 'ktPlanner', label: 'KT Planner agent', text: 'Turns the gaps into a day-wise KT plan.' },
  { key: 'approval', label: 'Approval', text: 'The expert and you review the gaps and the plan.', human: true },
  { key: 'ktScheduler', label: 'KT Scheduler agent', text: 'Offers free slots; the candidate confirms; Outlook invites go out.', human: true },
  { key: 'ktSession', label: 'KT Session agent', text: 'Runs each day’s session; notes enrich the knowledge base.', human: true },
  { key: 'assessment', label: 'Assessment agent', text: 'Asks questions on the KT topics and scores the answers.', human: true },
  { key: 'report', label: 'Report agent', text: 'Writes the readiness report with before/after evidence.' },
  { key: 'signoff', label: 'Sign-off', text: 'You approve the report and issue the certificate.', human: true }
];

const indexOf = (key) => STAGES.findIndex((s) => s.key === key);
const now = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const PipelineContext = createContext(null);

export function PipelineProvider({ children }) {
  const initial = () =>
    SAMPLE_CANDIDATES.map((c) => ({ ...c, sample: true, stageIndex: c.stage === 'done' ? STAGES.length : indexOf(c.stage), status: 'waiting', results: {}, log: [], chat: [] }));
  const [candidates, setCandidates] = useState(initial);
  // The ref is the source of truth so async agent calls always see the latest state.
  const ref = useRef(null);
  if (ref.current === null) ref.current = candidates;

  const commit = (next) => { ref.current = next; setCandidates(next); };
  const update = useCallback((id, fn) => {
    commit(ref.current.map((c) => (c.id === id ? { ...c, ...fn(c) } : c)));
  }, []);
  const get = (id) => ref.current.find((c) => c.id === id);
  const log = (id, text) => update(id, (c) => ({ log: [...c.log, { t: now(), text }] }));
  const setStage = (id, stageIndex, status) => update(id, () => ({ stageIndex, status, error: null }));
  const save = (id, patch) => update(id, (c) => ({ results: { ...c.results, ...patch } }));

  const fail = (id, err) => update(id, () => ({ status: 'error', error: err.message }));

  // Runs automatic stages until the next one that needs a person.
  const runFrom = useCallback(async (id) => {
    try {
      for (;;) {
        const c = get(id);
        const stage = STAGES[c.stageIndex];
        if (!stage) return;
        const input = { candidate_id: c.id, role: c.role, ...c.results };
        setStage(id, c.stageIndex, 'running');

        if (stage.key === 'gapFinder') {
          const r = await invokeAgent(AGENTS.gapFinder, input);
          save(id, { skills: r.output.skills });
          log(id, `Gap Finder read ${(r.output.partitions_read || []).join(', ')} and scored ${r.output.skills.length} skills.`);
        } else if (stage.key === 'ktPlanner') {
          const r = await invokeAgent(AGENTS.ktPlanner, input);
          save(id, { plan: r.output.plan, planInvocation: r.invocation_id });
          log(id, `KT Planner drafted a ${r.output.plan.length}-day plan and sent it for approval.`);
        } else if (stage.key === 'ktScheduler') {
          const r = await invokeAgent(AGENTS.ktScheduler, input);
          save(id, { slots: r.output.slots });
          log(id, 'KT Scheduler offered two free slots per session and is waiting for the candidate.');
          setStage(id, c.stageIndex, 'waiting');
          return;
        } else if (stage.key === 'assessment') {
          const r = await invokeAgent(AGENTS.assessment, input);
          save(id, { questions: r.output.questions, totalQuestions: r.output.total });
          log(id, `Assessment agent prepared ${r.output.total} questions from the KT topics.`);
          setStage(id, c.stageIndex, 'waiting');
          return;
        } else if (stage.key === 'report') {
          const r = await invokeAgent(AGENTS.report, input);
          save(id, { report: r.output });
          log(id, 'Report agent wrote the readiness report and sent it for sign-off.');
        } else if (stage.human) {
          setStage(id, c.stageIndex, 'waiting');
          return;
        }
        setStage(id, c.stageIndex + 1, 'running');
      }
    } catch (err) {
      fail(id, err);
    }
  }, []);

  const addCandidate = useCallback(async (fields, files) => {
    const id = `c-${Date.now()}`;
    const c = { id, ...fields, stageIndex: 0, status: 'running', results: {}, log: [], chat: [] };
    commit([c, ...ref.current]);
    try {
      const r = await intakeFiles(AGENTS.ingestion, { candidate_id: id, ...fields }, files);
      save(id, { partitions: r.output.partitions });
      log(id, `Ingestion stored ${r.output.partitions.length} documents in separate partitions.`);
      setStage(id, 1, 'running');
      runFrom(id);
    } catch (err) {
      fail(id, err);
    }
    return id;
  }, [runFrom]);

  const approvePlan = useCallback(async (id) => {
    const c = get(id);
    await decideApproval(c.results.planInvocation, true);
    log(id, 'Expert and you approved the gaps and the plan.');
    setStage(id, indexOf('ktScheduler'), 'running');
    runFrom(id);
  }, [runFrom]);

  const confirmSlots = useCallback(async (id, booked) => {
    try {
      setStage(id, indexOf('ktScheduler'), 'running');
      const r = await invokeAgent(AGENTS.ktScheduler, { candidate_id: id, confirmed: booked });
      save(id, { booked: r.output.booked });
      log(id, `KT Scheduler sent ${r.output.invites_sent} invites through ${r.output.channel}.`);
      setStage(id, indexOf('ktSession'), 'waiting');
    } catch (err) { fail(id, err); }
  }, []);

  const sendSessionMessage = useCallback(async (id, day, text) => {
    update(id, (c) => ({ chat: [...c.chat, { who: 'candidate', text }] }));
    try {
      const r = await invokeAgent(AGENTS.ktSession, { candidate_id: id, day: day.day, topic: day.topic, message: text });
      update(id, (c) => ({ chat: [...c.chat, { who: 'agent', text: r.output.reply, escalated: r.output.escalated }] }));
      if (r.output.escalated) log(id, 'KT Session agent sent a question to the outgoing expert.');
    } catch (err) { fail(id, err); }
  }, []);

  const finishSessions = useCallback(async (id) => {
    log(id, 'KT sessions finished; notes added to the knowledge base.');
    setStage(id, indexOf('assessment'), 'running');
    runFrom(id);
  }, [runFrom]);

  const submitAnswers = useCallback(async (id, answers) => {
    try {
      setStage(id, indexOf('assessment'), 'running');
      const r = await invokeAgent(AGENTS.assessment, { candidate_id: id, answers });
      save(id, { assessment: r.output });
      log(id, `Assessment agent scored ${r.output.score} of ${r.output.total}.`);
      setStage(id, indexOf('report'), 'running');
      runFrom(id);
    } catch (err) { fail(id, err); }
  }, [runFrom]);

  const signOff = useCallback((id) => {
    log(id, 'You signed off the report. Certificate issued.');
    setStage(id, STAGES.length, 'done');
  }, []);

  const retry = useCallback((id) => runFrom(id), [runFrom]);

  const value = useMemo(() => ({
    candidates, addCandidate, approvePlan, confirmSlots, sendSessionMessage, finishSessions, submitAnswers, signOff, retry
  }), [candidates, addCandidate, approvePlan, confirmSlots, sendSessionMessage, finishSessions, submitAnswers, signOff, retry]);

  return <PipelineContext.Provider value={value}>{children}</PipelineContext.Provider>;
}

export const usePipeline = () => useContext(PipelineContext);

export function stageOf(c) {
  if (c.stageIndex >= STAGES.length) return { label: 'Certified ready', tone: 'ok' };
  const s = STAGES[c.stageIndex];
  if (c.status === 'error') return { label: `${s.label} failed`, tone: 'bad' };
  if (c.status === 'running') return { label: `${s.label} running`, tone: 'info' };
  return { label: s.human ? `Waiting: ${s.label}` : s.label, tone: s.human ? 'warn' : 'idle' };
}
