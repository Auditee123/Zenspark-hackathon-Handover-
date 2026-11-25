// One AgentMesh agent per step. Names come from .env so the team can rename
// agents in the Builder without touching code.
const env = import.meta.env;

export const AGENTS = {
  ingestion: env.VITE_AGENT_INGESTION || 'handover-ingestion',
  gapFinder: env.VITE_AGENT_GAP_FINDER || 'handover-gap-finder',
  ktPlanner: env.VITE_AGENT_KT_PLANNER || 'handover-kt-planner',
  ktScheduler: env.VITE_AGENT_KT_SCHEDULER || 'handover-kt-scheduler',
  ktSession: env.VITE_AGENT_KT_SESSION || 'handover-kt-session',
  assessment: env.VITE_AGENT_ASSESSMENT || 'handover-assessment',
  report: env.VITE_AGENT_REPORT || 'handover-report'
};

export const USE_MOCK = (env.VITE_USE_MOCK ?? 'true') !== 'false';
