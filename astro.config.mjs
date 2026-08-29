import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import node from '@astrojs/node';
import vercel from '@astrojs/vercel';

export default defineConfig({
  output: 'server',
  vite: {
    plugins: [tailwindcss()]
  },
  adapter: vercel() 
});