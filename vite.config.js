
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/Prismata-UI/', // Set base for GitHub Pages subfolder
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false
  }
});
