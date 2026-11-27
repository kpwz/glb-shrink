import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  build: {
    outDir: 'dist',
    // 多语言独立页面（各自独立 URL，利于各语言 SEO）
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        ja: resolve(__dirname, 'ja/index.html'),
        ko: resolve(__dirname, 'ko/index.html'),
        'zh-cn': resolve(__dirname, 'zh-cn/index.html'),
        'zh-tw': resolve(__dirname, 'zh-tw/index.html'),
      },
    },
  },
});
