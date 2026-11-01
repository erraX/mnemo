import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

export default defineConfig({
  base: '/mnemo/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      // globPatterns 已覆盖 manifest 图标，关掉自动追加避免预缓存重复条目
      includeManifestIcons: false,
      manifest: {
        name: 'Mnemo',
        short_name: 'Mnemo',
        description: '英语记忆卡片',
        lang: 'zh-CN',
        start_url: '/mnemo/',
        scope: '/mnemo/',
        display: 'standalone',
        background_color: '#f5f5f7',
        theme_color: '#f5f5f7',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        cacheId: 'mnemo',
        globPatterns: ['**/*.{js,css,html,svg,png,ico,json,woff2}'],
        // 词典文件名已含内容 hash，不加 __WB_REVISION__，让预缓存复用页面自己的 HTTP 缓存
        dontCacheBustURLsMatching: /ecdict\.[0-9a-f]{8}\.json$/,
        maximumFileSizeToCacheInBytes: 15 * 1024 * 1024,
        navigateFallback: '/mnemo/index.html',
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.hostname === 'dict.youdao.com' && url.pathname === '/dictvoice',
            handler: 'CacheFirst',
            options: {
              cacheName: 'mnemo-audio',
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 2000, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
  define: { __APP_VERSION__: JSON.stringify(`${pkg.version}+${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`) },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'scripts/**/*.test.ts'],
    setupFiles: ['./src/test/setup.ts'],
    // CI 的 2 核 runner 单核性能比本机慢 2–3 倍：断言不变，只把单测与 hook 的超时上限放宽
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
})
