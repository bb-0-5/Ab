import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

// Standalone static frontend: no Express proxy, AWS, Docker, WebSockets or
// remote computation. Web Workers are bundled as local static assets.
export default defineConfig({
  base: './',
  plugins:[react(),tailwindcss()],
  resolve:{alias:{'@':path.resolve(__dirname,'.')}},
  build:{target:'es2022'},
});