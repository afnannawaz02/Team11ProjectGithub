import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // In dev, proxy /chat, /send-otp, /verify-otp to the local Node proxy
    proxy: {
      '/chat':       'http://127.0.0.1:3001',
      '/send-otp':   'http://127.0.0.1:3001',
      '/verify-otp': 'http://127.0.0.1:3001',
    },
  },
});
