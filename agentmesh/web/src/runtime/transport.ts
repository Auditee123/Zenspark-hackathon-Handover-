import type { AgentKey } from "./types";
import { AGENT_NAMES } from "./types";

export type RuntimeMode = "live" | "mock" | "replay" | "record";

export const RUNTIME_MODE: RuntimeMode = (() => {
  const m = String(import.meta.env.VITE_RUNTIME ?? "live").toLowerCase();
  return m === "mock" || m === "replay" || m === "record" ? m : "live";
})();

export interface HttpResult<T> {
  status: number;
  data: T;
}

export interface Transport {
  readonly mode: RuntimeMode;
  request<T>(agent: AgentKey, method: "GET" | "POST", path: string, body?: unknown): Promise<HttpResult<T>>;
  /** The bytes of a produced file (GET /files/...). */
  fileBlob(agent: AgentKey, download: string): Promise<Blob>;
}

/** Thrown when an agent host can't be reached at all (not an HTTP error). */
export class HostUnreachableError extends Error {
  constructor(public readonly agent: AgentKey) {
    const port = { orch: 8001, qa: 8002, kt: 8003 }[agent];
    super(`Can't reach ${AGENT_NAMES[agent]} on port ${port}. Is the host running (make hosts) and the VPN connected?`);
  }
}

/** Live: every call goes through the Vite proxy for that agent's host (/am/orch, /am/qa, /am/kt). */
class LiveTransport implements Transport {
  readonly mode: RuntimeMode = "live";

  async request<T>(agent: AgentKey, method: "GET" | "POST", path: string, body?: unknown): Promise<HttpResult<T>> {
    let res: Response;
    try {
      res = await fetch(`/am/${agent}${path}`, {
        method,
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new HostUnreachableError(agent);
    }
    // The Vite proxy answers 502/504 with an empty or HTML body when the host is down.
    if ((res.status === 502 || res.status === 504) && !res.headers.get("content-type")?.includes("json")) {
      throw new HostUnreachableError(agent);
    }
    const text = await res.text();
    let data: unknown = text;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      /* keep text */
    }
    return { status: res.status, data: data as T };
  }

  async fileBlob(agent: AgentKey, download: string): Promise<Blob> {
    const res = await fetch(`/am/${agent}${download}`);
    if (!res.ok) throw new Error(`The host did not return the file (HTTP ${res.status}): ${await res.text()}`);
    return res.blob();
  }
}

let current: Transport | null = null;

export async function getTransport(): Promise<Transport> {
  if (current) return current;
  if (RUNTIME_MODE === "mock") {
    const { MockTransport } = await import("./mock");
    current = new MockTransport();
  } else {
    // replay / record arrive with milestone M5; until then they behave as live.
    current = new LiveTransport();
  }
  return current;
}
