import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 3800,
    proxy: {
      '/api': 'http://localhost:3700',
      '/download': 'http://localhost:3700',
      '/win': 'http://localhost:3700',
      '/mac': 'http://localhost:3700',
      '/linux': 'http://localhost:3700'
    }
  }
});
