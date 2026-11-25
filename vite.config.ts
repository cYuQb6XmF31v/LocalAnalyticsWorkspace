/// <reference types="node" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Base path matches the GitHub Pages repository subpath (/LocalAnalyticsWorkspace/).
// Override with VITE_BASE_PATH if deploying to a different root or relative path.
const basePath = process.env.VITE_BASE_PATH || '/LocalAnalyticsWorkspace/';

export default defineConfig({
  plugins: [react()],
  base: basePath,
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
