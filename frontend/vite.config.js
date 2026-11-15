import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// `npm run dev:phone` serves over HTTPS on the LAN: Android Chrome only exposes motion
// sensors (used by the Horizon View) in a secure context. Accept the self-signed cert once.
export default defineConfig(({ mode }) => ({
  plugins: [react(), mode === 'phone' && basicSsl()].filter(Boolean),
  // allowedHosts: lets a Cloudflare quick tunnel (https://….trycloudflare.com) reach the dev/preview
  // server. For phone demos over a tunnel prefer `npm run build && npm run preview` (few bundled files).
  server: { host: mode === 'phone' ? true : undefined, allowedHosts: ['.trycloudflare.com'] },
  preview: { allowedHosts: ['.trycloudflare.com'] },
}));
