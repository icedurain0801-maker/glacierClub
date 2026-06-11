import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  define: {
    'process.env': {},
    'process.env.CONFIG_ENV': '"development"',
  },
  resolve: {
    alias: [
      // @/pages/... must come before @/ to avoid @/ eating the match
      { find: '@/pages/club/board/hooks', replacement: path.resolve(__dirname, './club/board/hooks') },
      { find: '@/pages/club/board', replacement: path.resolve(__dirname, './club/board') },
      { find: '@/pages/club/content/post/list', replacement: path.resolve(__dirname, './club/content/post/list') },
      { find: '@/pages/club/content/post', replacement: path.resolve(__dirname, './club/content/post') },
      { find: '@/pages/club/content', replacement: path.resolve(__dirname, './club/content') },
      { find: '@/pages/club/appearance', replacement: path.resolve(__dirname, './club/appearance') },
      { find: '@/pages/club', replacement: path.resolve(__dirname, './club') },
      // specific @ts aliases before @ts
      { find: '@ts/club', replacement: path.resolve(__dirname, './src/types/club') },
      { find: '@ts/clubBadge', replacement: path.resolve(__dirname, './src/types/clubBadge') },
      { find: '@ts/clubTag', replacement: path.resolve(__dirname, './src/types/clubTag') },
      { find: '@ts/clubTopic', replacement: path.resolve(__dirname, './src/types/clubTopic') },
      { find: '@ts/clubQuality', replacement: path.resolve(__dirname, './src/types/clubQuality') },
      { find: '@ts/gameContext', replacement: path.resolve(__dirname, './src/types/gameContext') },
      { find: '@ts/common', replacement: path.resolve(__dirname, './src/types/common') },
      { find: '@ts/appearance', replacement: path.resolve(__dirname, './src/types/appearance') },
      { find: '@ts/enum', replacement: path.resolve(__dirname, './src/types/enum') },
      { find: '@ts/creator', replacement: path.resolve(__dirname, './src/types/creator') },
      { find: '@ts/exchange', replacement: path.resolve(__dirname, './src/types/exchange') },
      { find: '@ts/lib', replacement: path.resolve(__dirname, './src/types/lib') },
      { find: '@ts', replacement: path.resolve(__dirname, './src/types') },
      // specific @/ aliases before @/
      { find: '@/api', replacement: path.resolve(__dirname, './src/api') },
      { find: '@/context', replacement: path.resolve(__dirname, './src/context') },
      { find: '@/', replacement: path.resolve(__dirname, './src/') },
      { find: '@', replacement: path.resolve(__dirname, './src') },
      { find: 'q1-antd', replacement: path.resolve(__dirname, './src/q1-antd') },
      { find: '@q1/hooks', replacement: path.resolve(__dirname, './src/hooks') },
    ],
  },
  optimizeDeps: {
    exclude: ['xlsx-style', 'array-move'],
    // 强制以 esm 模式直接处理，跳过预构建的静态 export 检查
    force: true,
  },
  esbuild: {
    // 忽略 missing named export 错误，允许运行时动态解析
    logLevel: 'silent',
  },
  server: {
    port: 5173,
    open: true,
  },
})
