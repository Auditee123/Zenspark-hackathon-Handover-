import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// In real mode the browser calls /agentmesh/... and Vite forwards it to the
// exported AgentMesh agent host (FastAPI), so there are no CORS problems locally.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/agentmesh': {
          target: env.VITE_AGENTMESH_URL || 'http://localhost:8000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/agentmesh/, '')
        }
      }
    }
  };
});
