import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // appType defaults to 'spa', so all unknown paths serve index.html automatically
  server: {
    port: 5175,
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
});
