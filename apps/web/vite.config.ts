import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev the SPA runs on Vite and proxies the API and the socket to the Cayrnx server.
const target = `http://127.0.0.1:${process.env.CAYRNX_PORT || 4718}`;

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.WEB_PORT || 5173),
    host: process.env.WEB_HOST || '127.0.0.1',
    strictPort: true,
    proxy: {
      '/api': { target },
      '/ws': { target, ws: true },
    },
  },
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 2000 },
});
