import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * One proxy per AgentMesh agent host, so the browser only ever talks to this origin (no CORS).
 *   /am/orch/* -> handover-orchestrator :8001
 *   /am/qa/*   -> handover-qa           :8002
 *   /am/kt/*   -> handover-kt-session   :8003
 * POST /invoke is synchronous (it returns when the run pauses or ends), so the timeout is long.
 */
const host = (port: number, prefix: string) => ({
  target: `http://127.0.0.1:${port}`,
  changeOrigin: true,
  timeout: 600_000,
  proxyTimeout: 600_000,
  rewrite: (path: string) => path.replace(new RegExp(`^${prefix}`), ""),
});

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    strictPort: true,
    proxy: {
      "/am/orch": host(8001, "/am/orch"),
      "/am/qa": host(8002, "/am/qa"),
      "/am/kt": host(8003, "/am/kt"),
    },
  },
});
