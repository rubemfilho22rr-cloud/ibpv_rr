import { defineConfig } from 'vite';

export default defineConfig({
  root: 'app',
  envDir: '..',
  base: './',
  publicDir: 'vendor',
  build: {
    outDir: '../web-dist',
    emptyOutDir: true,
    target: 'es2022'
  }
});
