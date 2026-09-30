import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiTarget = process.env.DAHONMD_TEST_API_TARGET || 'http://127.0.0.1:8001';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/sanctum': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/privacy': { target: apiTarget, changeOrigin: true },
      '/account-deletion': { target: apiTarget, changeOrigin: true },
      '/reset-password': { target: apiTarget, changeOrigin: true },
      '/email/verify': { target: apiTarget, changeOrigin: true },
    },
  },
});
