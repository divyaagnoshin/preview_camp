import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/v1/sessions/ready':     { target: 'http://localhost:3002', changeOrigin: true },
      '/v1/sessions/heartbeat': { target: 'http://localhost:3002', changeOrigin: true },
      '/v1/sessions/offline':   { target: 'http://localhost:3002', changeOrigin: true },
      '/v1/workspace':          { target: 'http://localhost:3002', changeOrigin: true },
      '/v1': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
});