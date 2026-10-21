import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const backendTarget = env.VITE_DEV_PROXY_TARGET || 'http://127.0.0.1:4000';
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: { '/api': { target: backendTarget, changeOrigin: true, ws: true } },
    },
  };
});
