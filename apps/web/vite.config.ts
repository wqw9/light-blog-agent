import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [vue()],
  server: {
    host: '127.0.0.1', // 显式绑定 IPv4，避免仅监听 ::1 导致部分客户端无法访问
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:3000', changeOrigin: true },
      '/uploads': { target: 'http://127.0.0.1:3000', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    // StatsPage 的 echarts 与 Mascot 的 oh-my-live2d/PixiJS 均为懒加载大分包，属预期范围
    chunkSizeWarningLimit: 2000,
  },
});
