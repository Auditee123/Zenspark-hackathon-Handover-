/** Synthetic sample data from the Handover kit (Appendix E, fictional client Northwind Insurance).
 * The joiner is shown by first name only (Auditee); the resume and interview feedback are fictional. */
export const SAMPLE_JOINER: Record<string, unknown> = {
  "mode": "run",
  "candidate_id": "auditee",
  "name": "Auditee",
  "email": "auditee@zensar.example",
  "role_id": "java",
  "start_date": "2026-11-30",
  "round": 1,
  "l1_panelist": "Vikram Joshi",
  "l2_panelist": "Lakshmi Nair",
  "l3_panelist": "Suresh Menon",
  "resume_text": "AUDITEE - Java backend engineer, 4 years. All content is synthetic demo data.\nExperience: 4 years building REST services with Spring Boot, JPA and PostgreSQL at a retail bank (synthetic).\nSkills: Spring Boot (core skill, used daily), REST APIs, JUnit, PostgreSQL (one project), Kafka (used on one project for notifications), Jenkins pipelines, basic Grafana dashboards.\nDomain: retail banking payments. No insurance or claims experience.",
  "l1_text": "L1 technical interview feedback - Auditee - panelist: Vikram Joshi, senior engineer - 28 Oct 2026 - verdict: Proceed.\nSpring Boot services: 4/5. Clearly explained layered design, testing and error handling.\nKafka event streaming: 3/5. Knows producers and consumers; unsure about retries and dead-letter topics.\nPostgreSQL and data model: 3/5. Writes joins comfortably; new to our schema.\nCI/CD and release process: 2/5. Has not worked with release approvals.",
  "l2_text": "L2 technical interview feedback - Auditee - panelist: Lakshmi Nair, architect - 4 Nov 2026 - verdict: Proceed with reservations.\nSpring Boot services: 4/5. Strong on REST controllers and configuration.\nKafka event streaming: 2/5. Could not explain how consumers stay idempotent when a message is retried.\nClaims domain and rules: 1/5. Limited insurance exposure; could not describe a claim lifecycle.\nPostgreSQL and data model: 3/5. Comfortable with indexes and transactions.\nObservability and incidents: 2/5. Has read dashboards; has not handled a P1.\nClient ways of working: 3/5. Communicates clearly; new to client-facing work.",
  "l3_text": "L3 hiring manager feedback - Auditee - panelist: Suresh Menon, hiring manager - 11 Nov 2026 - verdict: Proceed.\nSpring Boot services: 4/5. Delivered two services end to end at her last project.\nKafka event streaming: 2/5. Needs ramp-up on event-driven design before owning claims-events.\nClaims domain and rules: 1/5. No insurance background; needs a domain primer early.\nCI/CD and release process: 2/5. Used Jenkins but never a change advisory board.\nClient ways of working: 3/5. Good attitude; will need help with Northwind contacts at first."
};

/** Notes to paste at the kt_done pause (kit Appendix E). */
export const PRIYA_KT_NOTES = "Day 1 orientation: Anil Rao owns adjudication rules; Fatima Khan approves releases; stand-up 18:30 IST. Day 2 Kafka: claim events partitioned by policy number; three retries then claims-events.DLQ; payments consumer checks claim_event_id in processed_events. Open question: why is the retry limit three and not five? Days 3-4 claims: FNOL to settlement; claims above INR 5 lakh go to a senior adjuster. Day 5: CAB request by Tuesday noon for Thursday releases; P1 means page on-call and open the bridge.";

/** The KT giver's answer to the open question at H1 (demo runbook). */
export const H1_SAMPLE_ANSWER =
  "The retry limit is three because three retries with backoff fit inside the 30-second consumer timeout agreed with StreamOps; five retries caused duplicate-processing alerts.";

/** KT givers by id, as named in the AgentMesh givers table (names only: real addresses are typed per run). */
export const GIVERS_BY_ID: { id: string; name: string }[] = [
  { id: "ananya", name: "Murali" },
  { id: "rahul", name: "Prakhar" },
  { id: "sneha", name: "Auditee" },
  { id: "karan", name: "Karan Shah" },
  { id: "divya", name: "Divya Menon" },
];

export const ASK_SUGGESTIONS = [
  "Who approves a production release?",
  "Where do failed claim events go?",
  "Why is the claims-events retry limit three and not five?",
  "What did the panel say about Auditee?",
  "Which claims go to a senior adjuster?",
];

/** Columns of the bulk-import CSV (one row per joiner; the text columns hold the documents' text). */
export const CSV_COLUMNS = ["name", "email", "role_id", "start_date", "l1_panelist", "l2_panelist", "l3_panelist", "resume_text", "l1_text", "l2_text", "l3_text"];
