import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({root:'render/client',plugins:[react()],define:{'process.env.NEXT_PUBLIC_HOSTING':JSON.stringify('render')},build:{outDir:'../../render-dist/public',emptyOutDir:true},css:{postcss:{plugins:[]}}});
