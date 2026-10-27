import { defineConfig } from 'vite';

/**
 * 浏览器脚本打包：client/main.ts → public/static/app.js（单个文件，立即执行）。
 * wrangler dev / wrangler deploy 会先自动运行这一步（见 wrangler.toml 的 [build]）。
 */
export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'public/static',
    emptyOutDir: true,
    target: 'es2019',
    minify: 'esbuild',
    sourcemap: false,
    lib: {
      entry: 'client/main.ts',
      formats: ['iife'],
      name: 'WeatherApp',
      fileName: () => 'app.js',
    },
  },
});
