import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In local development the Vite dev server proxies /api/* to the two services
// running on the host, mirroring what nginx does inside Docker.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api/restaurant': {
        target: 'http://localhost:8081',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/restaurant/, ''),
      },
      '/api/order': {
        target: 'http://localhost:8082',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/order/, ''),
      },
    },
  },
});
