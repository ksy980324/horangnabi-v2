import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { pwaBuild } from './scripts/pwa-build';
export default defineConfig({ plugins: [react(), pwaBuild()], base: process.env.PAGES_BASE_PATH || './' });
