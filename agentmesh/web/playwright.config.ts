import { defineConfig } from "@playwright/test";

/** End-to-end tests. They run the web app on labelled mock data (no AgentMesh hosts needed). */
export default defineConfig({
  testDir: "tests",
  timeout: 180_000,
  expect: { timeout: 30_000 },
  use: { baseURL: "http://localhost:5181", viewport: { width: 1280, height: 860 }, trace: "retain-on-failure" },
  webServer: { command: "VITE_RUNTIME=mock npx vite --port 5181 --strictPort", url: "http://localhost:5181", reuseExistingServer: true, timeout: 60_000 },
});
