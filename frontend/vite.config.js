import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// `npm run dev:phone` serves HTTPS on the LAN: Android Chrome only exposes motion sensors
// (used by Lunarium) in a secure context. Accept the self-signed certificate once.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiProxy = {
    '/api': {
      target: env.BACKEND_URL || 'http://127.0.0.1:8000',
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/api/, ''),
    },
  };
  return {
    plugins: [react(), mode === 'phone' && basicSsl()].filter(Boolean),
    // allowedHosts lets a Cloudflare quick tunnel (https://….trycloudflare.com) reach the server.
    server: { host: mode === 'phone' ? true : undefined, allowedHosts: ['.trycloudflare.com'], proxy: apiProxy },
    preview: { allowedHosts: ['.trycloudflare.com'], proxy: apiProxy },
  };
});
