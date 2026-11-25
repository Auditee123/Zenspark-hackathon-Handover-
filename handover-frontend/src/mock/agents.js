// Sample answers for every agent, so the whole flow works without a backend.
// The output shapes here are the contract the real AgentMesh agents should return.
import { AGENTS } from '../api/agents.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let counter = 1000;

const SKILLS = [
  { name: 'Spring Boot and REST', score: 4, target: 4, evidence: 'L1: strong on REST APIs and JPA.', source: 'L1 + JD' },
  { name: 'Kafka event handling', score: 2, target: 4, evidence: 'L2: unsure about idempotent consumers and retries.', source: 'L2 + JD' },
  { name: 'Project domain rules', score: 1, target: 4, evidence: 'The JD asks for domain knowledge; L1 and L2 show no prior exposure.', source: 'JD + L1 + L2' },
  { name: 'Client release process', score: 2, target: 3, evidence: 'L3: has not worked with change-approval releases.', source: 'L3 only' }
];

const PLAN = [
  { day: 'Day 1', topic: 'Project domain and business rules', why: 'Biggest gap (1 of 4)' },
  { day: 'Day 2', topic: 'Kafka retries and idempotent consumers', why: 'Gap from L2' },
  { day: 'Day 3', topic: 'Who owns what, and the release process', why: 'Gap from L3' },
  { day: 'Day 4', topic: 'Hands-on: a past incident, start to finish', why: 'Applies days 1 to 3' }
];

const SLOTS = [
  ['Mon 1 Dec, 10:00', 'Mon 1 Dec, 15:00'],
  ['Tue 2 Dec, 10:00', 'Tue 2 Dec, 14:00'],
  ['Wed 3 Dec, 11:00', 'Wed 3 Dec, 15:00'],
  ['Thu 4 Dec, 10:00', 'Thu 4 Dec, 16:00']
];

const QUESTIONS = [
  { id: 'q1', skill: 'Domain rules', text: 'Which business rule decides whether a request needs manual review?' },
  { id: 'q2', skill: 'Kafka', text: 'The same event arrives twice. What should the consumer do?' },
  { id: 'q3', skill: 'Kafka', text: 'Why are failed events retried three times before the dead-letter topic?' },
  { id: 'q4', skill: 'Release process', text: 'Who approves a production release, and by when must the change request go in?' }
];

const SESSION_REPLIES = [
  { reply: 'Good question. In this project the consumer checks the event ID in the processed-events table and skips duplicates. That is what makes it idempotent.', escalated: false },
  { reply: 'The documents don’t say why. I’ve sent your question to the outgoing expert and will add the answer to your notes.', escalated: true }
];

export async function mockInvoke(agent, input = {}) {
  await wait(700);
  const ok = (output) => ({ agent_name: agent, status: 'success', invocation_id: `mock-${counter++}`, output });
  switch (agent) {
    case AGENTS.ingestion:
      return ok({ partitions: [
        { name: 'JD', chunks: 6 }, { name: 'L1 feedback', chunks: 3 },
        { name: 'L2 feedback', chunks: 4 }, { name: 'L3 feedback', chunks: 2 }
      ] });
    case AGENTS.gapFinder:
      return ok({ skills: SKILLS, partitions_read: ['JD', 'L1 feedback', 'L2 feedback', 'L3 feedback (client processes only)'] });
    case AGENTS.ktPlanner:
      return ok({ plan: PLAN });
    case AGENTS.ktScheduler:
      if (input.confirmed) {
        return ok({ booked: input.confirmed, invites_sent: input.confirmed.length, channel: 'Outlook (Microsoft Graph)' });
      }
      return ok({ slots: PLAN.map((p, i) => ({ day: p.day, topic: p.topic, options: SLOTS[i] })) });
    case AGENTS.ktSession: {
      const asksWhy = /why/i.test(input.message || '');
      return ok(SESSION_REPLIES[asksWhy ? 1 : 0]);
    }
    case AGENTS.assessment:
      if (input.answers) {
        const results = QUESTIONS.map((q) => ({ id: q.id, correct: q.id !== 'q3' }));
        return ok({ results, score: 9, total: 10 });
      }
      return ok({ questions: QUESTIONS, total: 10 });
    case AGENTS.report:
      return ok({
        summary: 'All four skills now meet the JD after 4 KT days.',
        skills: [
          { name: 'Spring Boot and REST', before: 4, after: 4, evidence: 'Already strong at L1; no KT day spent on it.' },
          { name: 'Project domain rules', before: 1, after: 4, evidence: 'Explained the main business rules correctly.' },
          { name: 'Kafka event handling', before: 2, after: 4, evidence: 'Described idempotent consumers and the retry window.' },
          { name: 'Client release process', before: 2, after: 3, evidence: 'Named the release approver and the change deadline.' }
        ]
      });
    default:
      throw new Error(`No mock for agent "${agent}". Check the agent names in .env.`);
  }
}
