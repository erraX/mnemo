# Mnemo 地基（Plan 1 / 2）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭起 Mnemo 的全部"看不见的部分"——工程脚手架、GitHub Pages 部署、PWA 壳、三个 iOS spike 页面、Dexie 数据层、ts-fsrs 调度、今日队列、挖空识别、ECDICT 词典、收集箱拆行、备份序列化——并以一个能显示真实"待复习 / 新卡"数字的今日页收尾。

**Architecture:** 纯前端 PWA，无后端。所有业务逻辑写成不依赖 React 的纯函数或以 `MnemoDB` 实例为参数的仓储函数，放在 `src/lib` 与 `src/db`，用 Vitest + fake-indexeddb 做单元测试；React 只负责渲染。ts-fsrs 的所有调用收口在 `src/lib/scheduler.ts`。

**Tech Stack:** pnpm 11 · Node 24 · Vite 8 · React 19 · TypeScript 7 · Tailwind CSS 4 · Dexie 4 + dexie-react-hooks · ts-fsrs 5.4 · vite-plugin-pwa 2 · react-router 7（HashRouter）· Vitest 5 · fake-indexeddb · csv-parse

**Spec:** `docs/superpowers/specs/2026-10-30-mnemo-design.md`（下文"规范"）。Mockup：`docs/mockups/mnemo-mockups.html`。

## Global Constraints

- 仓库名 `mnemo`，Vite `base: '/mnemo/'`，manifest `scope`/`start_url` = `/mnemo/`（规范 5.10）
- Dexie 数据库名固定 `mnemo`，Cache 名前缀 `mnemo-`（规范 5.10 共享 origin）
- `ts-fsrs` 锁 `^5.4.2`，**不要**升到 6.x；所有 ts-fsrs 调用只出现在 `src/lib/scheduler.ts`（规范 5.3）
- FSRS 参数：`enable_fuzz: true, learning_steps: ['1m','10m'], relearning_steps: ['10m']`，其余默认（规范 5.3）
- 学习日边界：本地时间 04:00（规范 5.3）
- 到期判定：Learning/Relearning 按 `due <= now`；Review 按 `due < 下一个 04:00`（规范 5.3）
- 卡型：`'zh2en' | 'cloze' | 'en2zh'`；前提分别是 释义非空 / 至少一条例句有挖空 / 总是（规范 5.2）
- 同记录卡片同一学习日只出一张；打分时埋其余卡到下一个 04:00（规范 5.2）
- 所有 id 用 `crypto.randomUUID()`，时间戳用 epoch ms `number`（规范 5.1）
- 词典子集筛选：`tag` 非空 **或** `1 <= frq <= 30000`（规范 5.8）
- UI 文案中文；输入框字号 ≥ 16px；`100dvh`；safe-area（规范 5.10）
- 提交信息用 Conventional Commits，英文，不加 Co-Authored-By
- 每个任务结束时 `pnpm test` 与 `pnpm build` 都必须通过

## 文件结构

```
.github/workflows/deploy.yml      GitHub Pages 构建发布
index.html                        iOS meta、viewport-fit
vite.config.ts                    base、react、tailwind、PWA、vitest
package.json / tsconfig*.json
public/icon.svg + 生成的 PNG      PWA 图标
public/dict/ecdict.<hash>.json    词典子集（构建脚本产物，提交）
scripts/dict-transform.ts         词典行→条目 的纯函数（可测）
scripts/build-dict.ts             下载 CSV、筛选、写 JSON 与版本文件
src/main.tsx                      挂载
src/index.css                     Tailwind + 设计 token
src/vite-env.d.ts                 env 类型
src/generated/dict-version.ts     词典版本常量（脚本生成）
src/domain/types.ts               领域类型
src/db/db.ts                      Dexie schema
src/db/repo.ts                    仓储：建/改/删记录、打分、撤销、队列、设置
src/lib/env.ts                    生产 origin 判断
src/lib/day.ts                    学习日边界
src/lib/scheduler.ts              ts-fsrs 封装
src/lib/cardTypes.ts              卡型前提与差异
src/lib/queue.ts                  今日队列（纯函数）
src/lib/cloze.ts                  分词、挖空识别/切换/分段
src/lib/dict.ts                   词典查询
src/lib/dictLoader.ts             词典灌库
src/lib/inbox.ts                  粘贴拆行
src/lib/backup.ts                 备份导出/导入
src/app/App.tsx                   HashRouter + 路由
src/app/UpdatePrompt.tsx          新版本提示
src/app/useDictLoader.ts          词典加载 hook
src/components/TabBar.tsx
src/components/OriginBanner.tsx
src/screens/Today.tsx
src/screens/Placeholder.tsx       第二阶段屏幕占位
src/spikes/AudioSpike.tsx         spike 1
src/spikes/TtsSpike.tsx           spike 2
src/test/setup.ts                 fake-indexeddb
docs/superpowers/spikes/2026-10-30-spike-results.md
README.md
```

---

### Task 1: 脚手架与工具链

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/index.css`, `src/vite-env.d.ts`, `src/app/App.tsx`, `src/lib/env.ts`, `src/test/setup.ts`
- Modify: `.gitignore`
- Test: `src/lib/env.test.ts`

**Interfaces:**
- Produces: `isProductionOrigin(current: string, production: string | undefined): boolean`；`PRODUCTION_ORIGIN: string | undefined`；路径别名 `@/` → `src/`；`pnpm test` / `pnpm build` 脚本

- [ ] **Step 1: 写 package.json**

```json
{
  "name": "mnemo",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "packageManager": "pnpm@11.0.9",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -b --noEmit",
    "build:dict": "tsx scripts/build-dict.ts"
  },
  "dependencies": {
    "dexie": "^4.4.7",
    "dexie-react-hooks": "^4.4.0",
    "react": "^19.3.1",
    "react-dom": "^19.3.1",
    "react-router": "^7.11.0",
    "ts-fsrs": "^5.4.2"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.3.3",
    "@types/node": "^24.0.0",
    "@types/react": "^19.3.0",
    "@types/react-dom": "^19.3.0",
    "@vitejs/plugin-react": "^6.1.2",
    "csv-parse": "^7.0.3",
    "fake-indexeddb": "^6.2.6",
    "jsdom": "^30.1.3",
    "tailwindcss": "^4.3.3",
    "tsx": "^4.23.15",
    "typescript": "~7.0.2",
    "vite": "^8.3.5",
    "vite-plugin-pwa": "^2.0.0",
    "vitest": "^5.0.5"
  }
}
```

- [ ] **Step 2: 写 tsconfig 三件套**

`tsconfig.json`:
```json
{
  "files": [],
  "references": [{ "path": "./tsconfig.app.json" }, { "path": "./tsconfig.node.json" }]
}
```

`tsconfig.app.json`:
```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "target": "ES2022",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "types": ["vite/client"],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src"]
}
```

`tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["vite.config.ts", "scripts"]
}
```

- [ ] **Step 3: 写 vite.config.ts（含 vitest 配置）**

```ts
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '/mnemo/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'scripts/**/*.test.ts'],
    setupFiles: ['./src/test/setup.ts'],
  },
})
```

- [ ] **Step 4: 写入口文件**

`index.html`:
```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>Mnemo</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/main.tsx`:
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './app/App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

`src/index.css`（设计 token 来自 mockup 第 4 节）:
```css
@import "tailwindcss";

@theme {
  --font-sans: -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", sans-serif;
  --color-accent: #0071e3;
  --color-bg: #f5f5f7;
  --color-panel: #ffffff;
  --color-ink: #1d1d1f;
  --color-muted: #86868b;
  --color-line: #e5e5e7;
  --color-cloze: #fff3bf;
  --color-again-bg: #ffe5e3;
  --color-again-fg: #c0392b;
  --color-hard-bg: #fff0d6;
  --color-hard-fg: #b7791f;
  --color-good-bg: #e3f6e8;
  --color-good-fg: #1e8449;
  --color-easy-bg: #e8f4fd;
  --color-easy-fg: #0071e3;
  --color-notice-bg: #fff8e6;
  --color-notice-line: #ffe2a8;
  --color-notice-fg: #8a5a00;
  --radius-card: 14px;
  --radius-field: 12px;
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-accent: #0a84ff;
    --color-bg: #000000;
    --color-panel: #1c1c1e;
    --color-ink: #f5f5f7;
    --color-muted: #8e8e93;
    --color-line: #2c2c2e;
    --color-easy-fg: #0a84ff;
  }
}

html, body {
  background: var(--color-bg);
  color: var(--color-ink);
  overscroll-behavior: none;
  -webkit-text-size-adjust: 100%;
  -webkit-tap-highlight-color: transparent;
}
body { font-family: var(--font-sans); touch-action: manipulation; }
input, textarea, select, button { font: inherit; }
```

`src/vite-env.d.ts`:
```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PRODUCTION_ORIGIN?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

`src/app/App.tsx`（临时）:
```tsx
export function App() {
  return <main className="grid min-h-dvh place-items-center text-xl">Mnemo</main>
}
```

`src/test/setup.ts`:
```ts
import 'fake-indexeddb/auto'
```

- [ ] **Step 5: 补 .gitignore**

在现有 `.superpowers/` 下追加：
```
node_modules/
dist/
dev-dist/
.cache/
*.local
```

- [ ] **Step 6: 写第一个失败测试**

`src/lib/env.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { isProductionOrigin } from './env'

describe('isProductionOrigin', () => {
  it('matches exact origin', () => {
    expect(isProductionOrigin('https://mni.github.io', 'https://mni.github.io')).toBe(true)
  })
  it('ignores trailing slash and case', () => {
    expect(isProductionOrigin('https://MNI.github.io/', 'https://mni.github.io')).toBe(true)
  })
  it('is false for localhost or missing production origin', () => {
    expect(isProductionOrigin('http://localhost:5173', 'https://mni.github.io')).toBe(false)
    expect(isProductionOrigin('https://mni.github.io', undefined)).toBe(false)
  })
})
```

- [ ] **Step 7: 安装依赖并确认测试失败**

Run: `pnpm install && pnpm test`
Expected: FAIL，报 `Failed to resolve import "./env"`

- [ ] **Step 8: 实现 env.ts**

```ts
export const PRODUCTION_ORIGIN: string | undefined = import.meta.env.VITE_PRODUCTION_ORIGIN

function normalize(origin: string): string {
  return origin.trim().replace(/\/+$/, '').toLowerCase()
}

export function isProductionOrigin(current: string, production: string | undefined): boolean {
  if (!production) return false
  return normalize(current) === normalize(production)
}
```

- [ ] **Step 9: 测试与构建通过**

Run: `pnpm test && pnpm build`
Expected: 测试 3 passed；`dist/` 生成，无类型错误

- [ ] **Step 10: 提交**

```bash
git add package.json pnpm-lock.yaml tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts index.html src .gitignore
git commit -m "chore: scaffold Vite + React + TS + Tailwind with Vitest"
```

---

### Task 2: GitHub Pages 部署流水线与 README

**Files:**
- Create: `.github/workflows/deploy.yml`, `README.md`

**Interfaces:**
- Produces: 推 `main` 自动发布到 `https://<user>.github.io/mnemo/`；构建时注入 `VITE_PRODUCTION_ORIGIN=https://<user小写>.github.io`

- [ ] **Step 1: 写工作流**

`.github/workflows/deploy.yml`:
```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 11
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm test
      - name: Compute production origin
        id: origin
        run: echo "value=https://$(echo '${{ github.repository_owner }}' | tr '[:upper:]' '[:lower:]').github.io" >> "$GITHUB_OUTPUT"
      - run: pnpm build
        env:
          VITE_PRODUCTION_ORIGIN: ${{ steps.origin.outputs.value }}
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: 写 README**

`README.md`:
```markdown
# Mnemo

自用的英语记忆卡片 PWA（Anki 式间隔重复，FSRS 排期）。手机优先，离线可用。

设计文档：`docs/superpowers/specs/2026-10-30-mnemo-design.md`
Mockup：`docs/mockups/mnemo-mockups.html`

## 地址就是数据的身份证

数据存在浏览器 IndexedDB，按 origin 隔离。生产地址是
`https://<github-username>.github.io/mnemo/`。

- 不要改 GitHub 用户名，不要绑自定义域名——都会换 origin，旧数据留在旧地址里。
- 改仓库名只改路径，数据不丢，但需要同步改 `vite.config.ts` 里的 `base` 和 manifest。
- 本地开发（`pnpm dev`）和局域网预览的数据是一次性的，首页会有提示条。
- 真要换地址：先在设置里导出备份，再到新地址恢复。

## 开发

```bash
pnpm install
pnpm dev          # http://localhost:5173/mnemo/
pnpm test
pnpm build
pnpm build:dict   # 重新生成词典子集（需要网络，下载 66 MB 的 ECDICT CSV）
```

## 部署

推 `main` 触发 `.github/workflows/deploy.yml`。GitHub 仓库 Settings → Pages → Source 选 **GitHub Actions**（只需做一次）。

## 致谢

- 词典数据：[ECDICT](https://github.com/skywind3000/ECDICT)（MIT）
- 排期算法：[ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs)
```

- [ ] **Step 3: 本地验证构建命令与 CI 一致**

Run: `VITE_PRODUCTION_ORIGIN=https://example.github.io pnpm build && ls dist/index.html`
Expected: 成功，`dist/index.html` 存在

- [ ] **Step 4: 提交**

```bash
git add .github/workflows/deploy.yml README.md
git commit -m "ci: deploy to GitHub Pages on push to main"
```

- [ ] **Step 5: 人工交接（作者操作）**

作者创建公开仓库 `mnemo`，`git remote add origin ...`，`git push -u origin main`，然后在 Settings → Pages 把 Source 设为 GitHub Actions。首次 workflow 成功后，把 README 与规范 5.10 里的 `<github-username>` 替换成真实用户名并提交。

---

### Task 3: PWA 基础配置（manifest、Service Worker、图标、iOS meta、更新提示）

**Files:**
- Create: `public/icon.svg`, `src/app/UpdatePrompt.tsx`
- Modify: `vite.config.ts`, `index.html`, `tsconfig.app.json`, `src/app/App.tsx`
- Generated: `public/pwa-64x64.png`, `public/pwa-192x192.png`, `public/pwa-512x512.png`, `public/maskable-icon-512x512.png`, `public/apple-touch-icon-180x180.png`, `public/favicon.ico`

**Interfaces:**
- Produces: 名为 `mnemo-audio` 的运行时缓存（CacheFirst，允许 status 0）；`registerType: 'prompt'`；`<UpdatePrompt />` 组件

- [ ] **Step 1: 写图标 SVG**

`public/icon.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#0071e3"/>
  <path d="M128 368V144h44l84 128 84-128h44v224h-44V228l-84 124-84-124v140z" fill="#fff"/>
</svg>
```

- [ ] **Step 2: 生成 PNG 图标**

Run: `pnpm dlx @vite-pwa/assets-generator --preset minimal-2023 public/icon.svg`
Expected: `public/` 下出现 `pwa-64x64.png pwa-192x192.png pwa-512x512.png maskable-icon-512x512.png apple-touch-icon-180x180.png favicon.ico`

- [ ] **Step 3: 配置 vite-plugin-pwa**

`vite.config.ts` 全文替换为：
```ts
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/mnemo/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'icon.svg'],
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
        globPatterns: ['**/*.{js,css,html,svg,png,ico,json,woff2}'],
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
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'scripts/**/*.test.ts'],
    setupFiles: ['./src/test/setup.ts'],
  },
})
```

- [ ] **Step 4: iOS meta**

`index.html` 的 `<head>` 替换为：
```html
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#f5f5f7" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="apple-mobile-web-app-title" content="Mnemo" />
    <link rel="icon" href="/mnemo/favicon.ico" sizes="48x48" />
    <link rel="icon" href="/mnemo/icon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="/mnemo/apple-touch-icon-180x180.png" />
    <title>Mnemo</title>
  </head>
```

- [ ] **Step 5: 虚拟模块类型**

`tsconfig.app.json` 的 `"types": ["vite/client"]` 改为 `"types": ["vite/client", "vite-plugin-pwa/react"]`。

- [ ] **Step 6: 更新提示组件**

`src/app/UpdatePrompt.tsx`:
```tsx
import { useRegisterSW } from 'virtual:pwa-register/react'

export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null
  return (
    <div
      role="status"
      className="fixed inset-x-4 z-50 flex items-center justify-between rounded-(--radius-card) bg-ink px-4 py-3 text-sm text-bg shadow-lg"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 76px)' }}
    >
      <span>有新版本</span>
      <div className="flex gap-3">
        <button className="text-muted" onClick={() => setNeedRefresh(false)}>稍后</button>
        <button className="font-semibold" onClick={() => void updateServiceWorker(true)}>刷新</button>
      </div>
    </div>
  )
}
```

`src/app/App.tsx`:
```tsx
import { UpdatePrompt } from './UpdatePrompt'

export function App() {
  return (
    <>
      <main className="grid min-h-dvh place-items-center text-xl">Mnemo</main>
      <UpdatePrompt />
    </>
  )
}
```

- [ ] **Step 7: 构建并检查产物**

Run: `pnpm build && ls dist/sw.js dist/manifest.webmanifest && grep -c "mnemo-audio" dist/sw.js`
Expected: 两个文件存在；grep 输出 ≥ 1

- [ ] **Step 8: 提交**

```bash
git add public vite.config.ts index.html tsconfig.app.json src/app
git commit -m "feat: PWA manifest, service worker with Youdao audio cache, iOS meta"
```

---

### Task 4: Spike 页面（音频离线缓存、系统 TTS）与结果记录

**Files:**
- Create: `src/spikes/AudioSpike.tsx`, `src/spikes/TtsSpike.tsx`, `src/screens/Placeholder.tsx`, `docs/superpowers/spikes/2026-10-30-spike-results.md`
- Modify: `src/app/App.tsx`

**Interfaces:**
- Produces: 路由 `#/spike/audio`、`#/spike/tts`；`youdaoUrl(text, accent)` 临时放在 AudioSpike 内（第二阶段 `audio.ts` 会接管）

- [ ] **Step 1: 音频 spike 页面**

`src/spikes/AudioSpike.tsx`:
```tsx
import { useRef, useState } from 'react'

type Accent = 'us' | 'uk'

export function youdaoUrl(text: string, accent: Accent): string {
  const type = accent === 'uk' ? 1 : 2
  return `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(text)}&type=${type}`
}

export function AudioSpike() {
  const [text, setText] = useState('concern')
  const [accent, setAccent] = useState<Accent>('us')
  const [log, setLog] = useState<string[]>([])
  const audioRef = useRef<HTMLAudioElement>(null)
  const url = youdaoUrl(text, accent)

  const append = (line: string) => setLog((l) => [`${new Date().toLocaleTimeString()} ${line}`, ...l].slice(0, 30))

  async function prefetch() {
    try {
      const res = await fetch(url, { mode: 'no-cors' })
      append(`prefetch 完成 type=${res.type} status=${res.status}`)
    } catch (e) {
      append(`prefetch 失败 ${(e as Error).message}`)
    }
  }

  async function checkCache() {
    const cache = await caches.open('mnemo-audio')
    const hit = await cache.match(url)
    append(hit ? `缓存命中 type=${hit.type}` : '缓存未命中')
  }

  function play() {
    const el = audioRef.current
    if (!el) return
    el.src = url
    el.play().then(() => append('play() resolved'), (e: Error) => append(`play() 失败 ${e.name}: ${e.message}`))
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-3 p-4">
      <h1 className="text-2xl font-bold">Spike 1 · 有道音频离线缓存</h1>
      <ol className="list-decimal pl-5 text-sm text-muted">
        <li>从主屏图标打开本页（不是 Safari 标签）</li>
        <li>联网状态下点「预热缓存」，再点「检查缓存」应命中</li>
        <li>开飞行模式，杀掉应用重开本页，点「播放」</li>
        <li>把日志抄到 docs/superpowers/spikes 的结果文件</li>
      </ol>
      <input className="rounded-(--radius-field) border border-line bg-panel p-3 text-base" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="flex gap-2">
        {(['us', 'uk'] as const).map((a) => (
          <button key={a} onClick={() => setAccent(a)} className={`rounded-full border px-3 py-1 ${accent === a ? 'bg-ink text-bg' : 'border-line'}`}>
            {a === 'us' ? '美音' : '英音'}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <button className="rounded-(--radius-card) bg-accent p-3 text-white" onClick={() => void prefetch()}>预热缓存</button>
        <button className="rounded-(--radius-card) bg-accent p-3 text-white" onClick={() => void checkCache()}>检查缓存</button>
        <button className="rounded-(--radius-card) bg-accent p-3 text-white" onClick={play}>播放</button>
      </div>
      <audio ref={audioRef} preload="none" />
      <p className="text-xs text-muted">在线：{String(navigator.onLine)} · SW：{String('serviceWorker' in navigator && !!navigator.serviceWorker.controller)}</p>
      <pre className="whitespace-pre-wrap rounded-(--radius-card) bg-panel p-3 text-xs">{log.join('\n')}</pre>
    </div>
  )
}
```

- [ ] **Step 2: TTS spike 页面**

`src/spikes/TtsSpike.tsx`:
```tsx
import { useEffect, useState } from 'react'

export function TtsSpike() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [voiceURI, setVoiceURI] = useState<string>('')
  const [text, setText] = useState('I have some concerns about the proposed timeline.')
  const [log, setLog] = useState<string[]>([])
  const append = (line: string) => setLog((l) => [line, ...l].slice(0, 20))

  useEffect(() => {
    const load = () => {
      const en = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('en'))
      setVoices(en)
      if (!voiceURI && en[0]) setVoiceURI(en[0].voiceURI)
    }
    load()
    speechSynthesis.addEventListener('voiceschanged', load)
    return () => speechSynthesis.removeEventListener('voiceschanged', load)
  }, [voiceURI])

  function speak() {
    speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    const v = voices.find((x) => x.voiceURI === voiceURI)
    if (v) u.voice = v
    u.lang = v?.lang ?? 'en-US'
    u.onstart = () => append(`onstart ${v?.name ?? 'default'}`)
    u.onend = () => append('onend')
    u.onerror = (e) => append(`onerror ${e.error}`)
    speechSynthesis.speak(u)
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-3 p-4">
      <h1 className="text-2xl font-bold">Spike 2 · 系统 TTS</h1>
      <p className="text-sm text-muted">分别在铃声模式和静音拨片下点「朗读」，记录是否出声；也记一下可用的英文语音列表。</p>
      <select className="rounded-(--radius-field) border border-line bg-panel p-3 text-base" value={voiceURI} onChange={(e) => setVoiceURI(e.target.value)}>
        {voices.map((v) => (
          <option key={v.voiceURI} value={v.voiceURI}>{v.name} · {v.lang}{v.localService ? '' : ' · 在线'}</option>
        ))}
      </select>
      <textarea className="rounded-(--radius-field) border border-line bg-panel p-3 text-base" rows={3} value={text} onChange={(e) => setText(e.target.value)} />
      <button className="rounded-(--radius-card) bg-accent p-3 text-white" onClick={speak}>朗读</button>
      <p className="text-xs text-muted">英文语音数：{voices.length}</p>
      <pre className="whitespace-pre-wrap rounded-(--radius-card) bg-panel p-3 text-xs">{log.join('\n')}</pre>
    </div>
  )
}
```

- [ ] **Step 3: 占位屏与路由**

`src/screens/Placeholder.tsx`:
```tsx
export function Placeholder({ title }: { title: string }) {
  return (
    <div className="grid min-h-dvh place-items-center p-6 text-center text-muted">
      <div>
        <div className="text-xl font-semibold text-ink">{title}</div>
        <div className="mt-1 text-sm">第二阶段实现</div>
      </div>
    </div>
  )
}
```

`src/app/App.tsx`:
```tsx
import { HashRouter, Route, Routes } from 'react-router'
import { UpdatePrompt } from './UpdatePrompt'
import { Placeholder } from '@/screens/Placeholder'
import { AudioSpike } from '@/spikes/AudioSpike'
import { TtsSpike } from '@/spikes/TtsSpike'

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Placeholder title="今日" />} />
        <Route path="/spike/audio" element={<AudioSpike />} />
        <Route path="/spike/tts" element={<TtsSpike />} />
        <Route path="*" element={<Placeholder title="未找到" />} />
      </Routes>
      <UpdatePrompt />
    </HashRouter>
  )
}
```

- [ ] **Step 4: 结果记录模板**

`docs/superpowers/spikes/2026-10-30-spike-results.md`:
```markdown
# Spike 结果

设备 / iOS 版本：
测试地址：https://<user>.github.io/mnemo/#/spike/audio 与 #/spike/tts

## Spike 1 · 有道音频离线缓存（规范 5.7）

- [ ] 联网预热后「检查缓存」命中
- [ ] 飞行模式 + 杀掉重开后「播放」出声
- 日志摘录：

结论：方案 A 可行 / 不可行 → 切方案 B（Cloudflare Worker 反代 + IndexedDB Blob）

## Spike 2 · 系统 TTS

- 英文语音列表：
- 铃声模式出声：是 / 否
- 静音拨片出声：是 / 否
- 主屏 PWA 下首次点击能出声：是 / 否

结论与 README 需要写的已知限制：

## Spike 3 · 词典灌库（Task 13 完成后在今日页读取耗时）

- 条目数：
- 耗时（iPhone）：
- 结论：一次性 bulkPut 够用 / 需要分片后台灌入
```

- [ ] **Step 5: 构建通过并提交**

Run: `pnpm test && pnpm build`
Expected: PASS

```bash
git add src docs/superpowers/spikes
git commit -m "feat: spike pages for Youdao audio caching and system TTS"
```

- [ ] **Step 6: 人工交接（作者操作，不阻塞后续任务）**

推送后在 iPhone 上按两个页面的说明测试，填写结果文件。Spike 1 的结论决定第二阶段 `audio.ts` 选方案 A 还是 B。

---

### Task 5: 领域类型与 Dexie schema

**Files:**
- Create: `src/domain/types.ts`, `src/db/db.ts`
- Test: `src/db/db.test.ts`

**Interfaces:**
- Produces: 类型 `CardType, Blank, Example, Note, Card, ReviewLog, Draft, DictEntry, Settings, Rating, FsrsState, Accent`；常量 `CARD_TYPES, DEFAULT_SETTINGS`；类 `MnemoDB`（表 `notes, cards, reviewLogs, drafts, dict, settings`）；单例 `db`；测试工具 `createTestDb()`

- [ ] **Step 1: 写测试工具与失败测试**

`src/test/db.ts`（每个测试一个独立数据库，用完删除）:
```ts
import { afterEach } from 'vitest'
import { MnemoDB } from '@/db/db'

let created: MnemoDB[] = []

export function createTestDb(): MnemoDB {
  const d = new MnemoDB(`test-${crypto.randomUUID()}`)
  created.push(d)
  return d
}

afterEach(async () => {
  await Promise.all(created.map((d) => d.delete()))
  created = []
})
```

`src/db/db.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { MnemoDB } from './db'
import { createTestDb } from '@/test/db'
import type { Note } from '@/domain/types'

const note: Note = {
  id: 'n1',
  headword: 'Concern',
  headwordKey: 'concern',
  meaning: 'n. 担忧',
  examples: [],
  tags: ['cet4'],
  enabledTypes: ['zh2en', 'en2zh'],
  createdAt: 1,
  updatedAt: 1,
}

describe('MnemoDB', () => {
  it('stores and indexes notes by headwordKey and tags', async () => {
    const d = createTestDb()
    await d.notes.add(note)
    expect(await d.notes.where('headwordKey').equals('concern').first()).toMatchObject({ id: 'n1' })
    expect(await d.notes.where('tags').equals('cet4').count()).toBe(1)
  })

  it('indexes dict by word and by forms (multiEntry)', async () => {
    const d = createTestDb()
    await d.dict.put({ word: 'concern', phonetic: '', translation: 'n. 担忧', forms: ['concerns', 'concerned'] })
    expect(await d.dict.where('forms').equals('concerned').first()).toMatchObject({ word: 'concern' })
  })

  it('uses the production database name "mnemo" by default', () => {
    expect(new MnemoDB().name).toBe('mnemo')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm vitest run src/db/db.test.ts`
Expected: FAIL，`Failed to resolve import "./db"`

- [ ] **Step 3: 写领域类型**

`src/domain/types.ts`:
```ts
export type CardType = 'zh2en' | 'cloze' | 'en2zh'
export const CARD_TYPES: readonly CardType[] = ['zh2en', 'cloze', 'en2zh']

export const CARD_TYPE_LABEL: Record<CardType, string> = {
  zh2en: '中 → 英',
  cloze: '例句挖空',
  en2zh: '英 → 中',
}

/** 字符偏移区间，[start, end) */
export interface Blank {
  start: number
  end: number
}

export interface Example {
  text: string
  source?: string
  blanks: Blank[]
}

export interface Note {
  id: string
  headword: string
  /** headword.trim().toLowerCase()，用于查重与搜索 */
  headwordKey: string
  phonetic?: string
  meaning: string
  examples: Example[]
  tags: string[]
  enabledTypes: CardType[]
  createdAt: number
  updatedAt: number
}

/** ts-fsrs State：0 New · 1 Learning · 2 Review · 3 Relearning */
export type FsrsState = 0 | 1 | 2 | 3
/** ts-fsrs Rating：1 Again · 2 Hard · 3 Good · 4 Easy */
export type Rating = 1 | 2 | 3 | 4

export interface Card {
  id: string
  noteId: string
  type: CardType
  due: number
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  learning_steps: number
  reps: number
  lapses: number
  state: FsrsState
  last_review?: number
  /** 被同记录其他卡"埋"到的时刻（下一个学习日 04:00） */
  buriedUntil?: number
  createdAt: number
}

export interface ReviewLog {
  id: string
  cardId: string
  noteId: string
  rating: Rating
  reviewedAt: number
  /** 以下为 ts-fsrs ReviewLog 字段（打分前的卡片状态） */
  state: FsrsState
  due: number
  stability: number
  difficulty: number
  elapsed_days: number
  last_elapsed_days: number
  scheduled_days: number
  learning_steps: number
  /** 这次打分埋掉的同记录卡片 id，撤销时解除 */
  buriedSiblingIds: string[]
}

export interface Draft {
  id: string
  raw: string
  kind: 'headword' | 'sentence'
  createdAt: number
}

export interface DictEntry {
  /** 小写 */
  word: string
  phonetic: string
  /** 中文释义，多行 */
  translation: string
  pos?: string
  tag?: string
  frq?: number
  /** 变形，小写，用于 concerns → concern */
  forms: string[]
}

export type Accent = 'us' | 'uk'

export interface Settings {
  id: 'settings'
  newCardsPerDay: number
  accent: Accent
  autoPlayOnReveal: boolean
  lastEnabledTypes: CardType[]
  lastBackupAt?: number
  dictVersion?: string
  /** "再学 10 张新卡"：某学习日的额外新卡额度 */
  extraNew?: { dayStart: number; count: number }
}

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  newCardsPerDay: 20,
  accent: 'us',
  autoPlayOnReveal: true,
  lastEnabledTypes: ['zh2en', 'cloze', 'en2zh'],
}
```

- [ ] **Step 4: 写 Dexie schema**

`src/db/db.ts`:
```ts
import Dexie, { type EntityTable } from 'dexie'
import type { Card, DictEntry, Draft, Note, ReviewLog, Settings } from '@/domain/types'

export class MnemoDB extends Dexie {
  notes!: EntityTable<Note, 'id'>
  cards!: EntityTable<Card, 'id'>
  reviewLogs!: EntityTable<ReviewLog, 'id'>
  drafts!: EntityTable<Draft, 'id'>
  dict!: EntityTable<DictEntry, 'word'>
  settings!: EntityTable<Settings, 'id'>

  constructor(name = 'mnemo') {
    super(name)
    this.version(1).stores({
      notes: 'id, headwordKey, updatedAt, *tags',
      cards: 'id, noteId, due, state',
      reviewLogs: 'id, cardId, noteId, reviewedAt',
      drafts: 'id, createdAt',
      dict: 'word, *forms',
      settings: 'id',
    })
  }
}

export const db = new MnemoDB()
```

- [ ] **Step 5: 运行测试**

Run: `pnpm vitest run src/db/db.test.ts`
Expected: 3 passed

- [ ] **Step 6: 提交**

```bash
git add src/domain src/db src/test
git commit -m "feat: domain types and Dexie schema"
```

---

### Task 6: 学习日边界 `day.ts`

**Files:**
- Create: `src/lib/day.ts`
- Test: `src/lib/day.test.ts`

**Interfaces:**
- Produces: `DAY_BOUNDARY_HOUR = 4`；`learningDayStart(now: number): number`；`nextLearningDayStart(now: number): number`；`isSameLearningDay(a: number, b: number): boolean`

- [ ] **Step 1: 写失败测试**

`src/lib/day.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { isSameLearningDay, learningDayStart, nextLearningDayStart } from './day'

const local = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m - 1, d, h, min).getTime()

describe('learning day (04:00 boundary)', () => {
  it('03:59 belongs to the previous day', () => {
    expect(learningDayStart(local(2026, 10, 30, 3, 59))).toBe(local(2026, 10, 29, 4))
  })
  it('04:00 starts a new day', () => {
    expect(learningDayStart(local(2026, 10, 30, 4, 0))).toBe(local(2026, 10, 30, 4))
  })
  it('23:00 is still the same day', () => {
    expect(learningDayStart(local(2026, 10, 30, 23))).toBe(local(2026, 10, 30, 4))
  })
  it('next boundary is the following 04:00', () => {
    expect(nextLearningDayStart(local(2026, 10, 30, 23))).toBe(local(2026, 10, 31, 4))
    expect(nextLearningDayStart(local(2026, 10, 30, 2))).toBe(local(2026, 10, 30, 4))
  })
  it('23:00 and next 08:00 are different days; 23:00 and 03:00 are the same', () => {
    expect(isSameLearningDay(local(2026, 10, 30, 23), local(2026, 10, 31, 8))).toBe(false)
    expect(isSameLearningDay(local(2026, 10, 30, 23), local(2026, 10, 31, 3))).toBe(true)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm vitest run src/lib/day.test.ts`
Expected: FAIL，模块不存在

- [ ] **Step 3: 实现**

`src/lib/day.ts`:
```ts
export const DAY_BOUNDARY_HOUR = 4

/** 当前时刻所属学习日的开始（本地 04:00）的 epoch ms */
export function learningDayStart(now: number): number {
  const d = new Date(now)
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), DAY_BOUNDARY_HOUR, 0, 0, 0)
  if (now < start.getTime()) start.setDate(start.getDate() - 1)
  return start.getTime()
}

/** 下一个学习日的开始 */
export function nextLearningDayStart(now: number): number {
  const s = new Date(learningDayStart(now))
  s.setDate(s.getDate() + 1)
  return s.getTime()
}

export function isSameLearningDay(a: number, b: number): boolean {
  return learningDayStart(a) === learningDayStart(b)
}
```

- [ ] **Step 4: 运行测试**

Run: `pnpm vitest run src/lib/day.test.ts`
Expected: 5 passed

- [ ] **Step 5: 提交**

```bash
git add src/lib/day.ts src/lib/day.test.ts
git commit -m "feat: learning-day boundary helpers (04:00 local)"
```

---

### Task 7: ts-fsrs 封装 `scheduler.ts`

**Files:**
- Create: `src/lib/scheduler.ts`
- Test: `src/lib/scheduler.test.ts`

**Interfaces:**
- Consumes: `Card, CardType, Rating, ReviewLog, FsrsState` from `@/domain/types`
- Produces:
  - `createScheduler(overrides?: { enable_fuzz?: boolean }): Scheduler`；默认实例 `scheduler`
  - `Scheduler.newCard(noteId: string, type: CardType, now: number): Card`
  - `Scheduler.grade(card: Card, rating: Rating, now: number): { card: Card; log: PendingLog }`，其中 `PendingLog = Omit<ReviewLog, 'id' | 'buriedSiblingIds'>`
  - `Scheduler.rollback(card: Card, log: ReviewLog | PendingLog): Card`
  - `Scheduler.previewIntervals(card: Card, now: number): Record<Rating, string>`
  - `formatInterval(ms: number): string`

- [ ] **Step 1: 写失败测试**

`src/lib/scheduler.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { createScheduler, formatInterval } from './scheduler'

const T0 = new Date(2026, 9, 30, 10, 0, 0).getTime()
const MIN = 60_000
const DAY = 24 * 60 * MIN

describe('formatInterval', () => {
  it('formats minutes, hours, days, months', () => {
    expect(formatInterval(30_000)).toBe('1 分钟')
    expect(formatInterval(10 * MIN)).toBe('10 分钟')
    expect(formatInterval(3 * 60 * MIN)).toBe('3 小时')
    expect(formatInterval(5 * DAY)).toBe('5 天')
    expect(formatInterval(90 * DAY)).toBe('3 个月')
  })
})

describe('scheduler (fuzz off for determinism)', () => {
  const s = createScheduler({ enable_fuzz: false })

  it('creates a New card due now', () => {
    const c = s.newCard('n1', 'zh2en', T0)
    expect(c).toMatchObject({ noteId: 'n1', type: 'zh2en', state: 0, reps: 0, lapses: 0, due: T0, createdAt: T0 })
    expect(c.id).toMatch(/[0-9a-f-]{36}/)
  })

  it('Good on a New card enters Learning with the 10m step', () => {
    const c = s.newCard('n1', 'zh2en', T0)
    const { card, log } = s.grade(c, 3, T0)
    expect(card.state).toBe(1)
    expect(card.due).toBe(T0 + 10 * MIN)
    expect(card.reps).toBe(1)
    expect(log).toMatchObject({ cardId: c.id, noteId: 'n1', rating: 3, reviewedAt: T0, state: 0 })
  })

  it('Good again after the step graduates to Review with a multi-day interval', () => {
    const c = s.newCard('n1', 'zh2en', T0)
    const first = s.grade(c, 3, T0).card
    const second = s.grade(first, 3, T0 + DAY).card
    expect(second.state).toBe(2)
    expect(second.scheduled_days).toBeGreaterThanOrEqual(1)
  })

  it('rollback restores the previous card exactly', () => {
    const c = s.newCard('n1', 'zh2en', T0)
    const { card, log } = s.grade(c, 4, T0)
    const back = s.rollback(card, { ...log, id: 'l1', buriedSiblingIds: [] })
    expect(back).toEqual({ ...c, last_review: undefined })
  })

  it('previewIntervals returns four labels ordered by rating', () => {
    const c = s.newCard('n1', 'zh2en', T0)
    const p = s.previewIntervals(c, T0)
    expect(p[1]).toBe('1 分钟')
    expect(p[2]).toMatch(/分钟/)
    expect(p[3]).toBe('10 分钟')
    expect(p[4]).toMatch(/天/)
  })

  it('clears buriedUntil when the card itself is graded', () => {
    const c = { ...s.newCard('n1', 'zh2en', T0), buriedUntil: T0 + DAY }
    expect(s.grade(c, 3, T0).card.buriedUntil).toBeUndefined()
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm vitest run src/lib/scheduler.test.ts`
Expected: FAIL，模块不存在

- [ ] **Step 3: 实现**

`src/lib/scheduler.ts`:
```ts
import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  type Card as FsrsCard,
  type Grade,
  type ReviewLog as FsrsLog,
} from 'ts-fsrs'
import type { Card, CardType, FsrsState, Rating, ReviewLog } from '@/domain/types'

export type PendingLog = Omit<ReviewLog, 'id' | 'buriedSiblingIds'>

export interface Scheduler {
  newCard(noteId: string, type: CardType, now: number): Card
  grade(card: Card, rating: Rating, now: number): { card: Card; log: PendingLog }
  rollback(card: Card, log: ReviewLog | PendingLog): Card
  previewIntervals(card: Card, now: number): Record<Rating, string>
}

type StoredFsrsFields = Pick<
  Card,
  'due' | 'stability' | 'difficulty' | 'elapsed_days' | 'scheduled_days' | 'learning_steps' | 'reps' | 'lapses' | 'state' | 'last_review'
>

function toStored(c: FsrsCard): StoredFsrsFields {
  return {
    due: c.due.getTime(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state as FsrsState,
    last_review: c.last_review ? c.last_review.getTime() : undefined,
  }
}

function toFsrs(c: Card): FsrsCard {
  return {
    due: new Date(c.due),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    last_review: c.last_review === undefined ? undefined : new Date(c.last_review),
  }
}

function toFsrsLog(log: ReviewLog | PendingLog): FsrsLog {
  return {
    rating: log.rating,
    state: log.state,
    due: new Date(log.due),
    stability: log.stability,
    difficulty: log.difficulty,
    elapsed_days: log.elapsed_days,
    last_elapsed_days: log.last_elapsed_days,
    scheduled_days: log.scheduled_days,
    learning_steps: log.learning_steps,
    review: new Date(log.reviewedAt),
  }
}

export function formatInterval(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000))
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} 小时`
  const days = Math.round(hours / 24)
  if (days < 60) return `${days} 天`
  return `${Math.round(days / 30)} 个月`
}

export function createScheduler(overrides: { enable_fuzz?: boolean } = {}): Scheduler {
  const f = fsrs(
    generatorParameters({
      enable_fuzz: overrides.enable_fuzz ?? true,
      learning_steps: ['1m', '10m'],
      relearning_steps: ['10m'],
    }),
  )

  return {
    newCard(noteId, type, now) {
      return { id: crypto.randomUUID(), noteId, type, createdAt: now, ...toStored(createEmptyCard(new Date(now))) }
    },

    grade(card, rating, now) {
      const { card: next, log } = f.next(toFsrs(card), new Date(now), rating as Grade)
      const { buriedUntil: _dropped, ...rest } = card
      void _dropped
      return {
        card: { ...rest, ...toStored(next) },
        log: {
          cardId: card.id,
          noteId: card.noteId,
          rating,
          reviewedAt: now,
          state: log.state as FsrsState,
          due: log.due.getTime(),
          stability: log.stability,
          difficulty: log.difficulty,
          elapsed_days: log.elapsed_days,
          last_elapsed_days: log.last_elapsed_days,
          scheduled_days: log.scheduled_days,
          learning_steps: log.learning_steps,
        },
      }
    },

    rollback(card, log) {
      const prev = f.rollback(toFsrs(card), toFsrsLog(log))
      return { ...card, ...toStored(prev) }
    },

    previewIntervals(card, now) {
      const rec = f.repeat(toFsrs(card), new Date(now))
      const label = (r: Rating) => formatInterval(rec[r as Grade].card.due.getTime() - now)
      return { 1: label(1), 2: label(2), 3: label(3), 4: label(4) }
    },
  }
}

/** 生产用实例：fuzz 开启 */
export const scheduler: Scheduler = createScheduler()
```

- [ ] **Step 4: 运行测试**

Run: `pnpm vitest run src/lib/scheduler.test.ts`
Expected: 7 passed。若 `rollback` 用例因 `last_review` 键存在与否而失败（`toEqual` 把 `undefined` 属性视为相等，正常应通过），检查 `toStored` 是否始终写 `last_review` 键。

- [ ] **Step 5: 提交**

```bash
git add src/lib/scheduler.ts src/lib/scheduler.test.ts
git commit -m "feat: ts-fsrs scheduler wrapper with preview, grade, rollback"
```

---

### Task 8: 卡型规则 `cardTypes.ts`

**Files:**
- Create: `src/lib/cardTypes.ts`
- Test: `src/lib/cardTypes.test.ts`

**Interfaces:**
- Consumes: `Note, CardType, Example` from `@/domain/types`
- Produces:
  - `availableTypes(note: Pick<Note, 'headword' | 'meaning' | 'examples'>): Record<CardType, { ok: boolean; reason?: string }>`
  - `filterEnabled(note, wanted: CardType[]): CardType[]` — 去掉前提不满足的
  - `diffTypes(existing: readonly CardType[], wanted: readonly CardType[]): { toCreate: CardType[]; toDelete: CardType[] }`
  - `primaryClozeExample(examples: Example[]): Example | undefined`

- [ ] **Step 1: 写失败测试**

`src/lib/cardTypes.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { availableTypes, diffTypes, filterEnabled, primaryClozeExample } from './cardTypes'

const base = { headword: 'concern', meaning: 'n. 担忧', examples: [] }
const withCloze = { ...base, examples: [{ text: 'I have concerns.', blanks: [{ start: 7, end: 15 }] }] }

describe('availableTypes', () => {
  it('en2zh always ok; zh2en needs meaning; cloze needs a blank', () => {
    const a = availableTypes(base)
    expect(a.en2zh.ok).toBe(true)
    expect(a.zh2en.ok).toBe(true)
    expect(a.cloze).toEqual({ ok: false, reason: '先给一条例句并挖一个空' })
  })
  it('zh2en fails on blank meaning; cloze ok with a blank', () => {
    const a = availableTypes({ ...withCloze, meaning: '  ' })
    expect(a.zh2en).toEqual({ ok: false, reason: '先填写释义' })
    expect(a.cloze.ok).toBe(true)
  })
  it('example with no blanks does not count', () => {
    expect(availableTypes({ ...base, examples: [{ text: 'x', blanks: [] }] }).cloze.ok).toBe(false)
  })
})

describe('filterEnabled / diffTypes / primaryClozeExample', () => {
  it('drops types whose prerequisites fail', () => {
    expect(filterEnabled(base, ['zh2en', 'cloze', 'en2zh'])).toEqual(['zh2en', 'en2zh'])
  })
  it('diffs existing vs wanted', () => {
    expect(diffTypes(['zh2en', 'en2zh'], ['cloze', 'en2zh'])).toEqual({ toCreate: ['cloze'], toDelete: ['zh2en'] })
  })
  it('picks the first example that has blanks', () => {
    const ex = [{ text: 'a', blanks: [] }, { text: 'b', blanks: [{ start: 0, end: 1 }] }]
    expect(primaryClozeExample(ex)?.text).toBe('b')
    expect(primaryClozeExample([])).toBeUndefined()
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm vitest run src/lib/cardTypes.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

`src/lib/cardTypes.ts`:
```ts
import type { CardType, Example, Note } from '@/domain/types'

type NoteLike = Pick<Note, 'headword' | 'meaning' | 'examples'>
export type TypeAvailability = Record<CardType, { ok: boolean; reason?: string }>

export function primaryClozeExample(examples: Example[]): Example | undefined {
  return examples.find((e) => e.text.trim().length > 0 && e.blanks.length > 0)
}

export function availableTypes(note: NoteLike): TypeAvailability {
  const hasHeadword = note.headword.trim().length > 0
  const hasMeaning = note.meaning.trim().length > 0
  const hasCloze = primaryClozeExample(note.examples) !== undefined
  return {
    zh2en: hasMeaning ? { ok: true } : { ok: false, reason: '先填写释义' },
    cloze: hasCloze ? { ok: true } : { ok: false, reason: '先给一条例句并挖一个空' },
    en2zh: hasHeadword ? { ok: true } : { ok: false, reason: '先填写单词或短语' },
  }
}

export function filterEnabled(note: NoteLike, wanted: readonly CardType[]): CardType[] {
  const a = availableTypes(note)
  return wanted.filter((t) => a[t].ok)
}

export function diffTypes(existing: readonly CardType[], wanted: readonly CardType[]) {
  return {
    toCreate: wanted.filter((t) => !existing.includes(t)),
    toDelete: existing.filter((t) => !wanted.includes(t)),
  }
}
```

- [ ] **Step 4: 运行测试**

Run: `pnpm vitest run src/lib/cardTypes.test.ts`
Expected: 6 passed

- [ ] **Step 5: 提交**

```bash
git add src/lib/cardTypes.ts src/lib/cardTypes.test.ts
git commit -m "feat: card type prerequisites and diffing"
```

---

### Task 9: 今日队列 `queue.ts`（纯函数）

**Files:**
- Create: `src/lib/queue.ts`
- Test: `src/lib/queue.test.ts`

**Interfaces:**
- Consumes: `Card, ReviewLog` ；`learningDayStart, nextLearningDayStart` from `./day`
- Produces:
  - `LEARN_AHEAD_MS = 20 * 60_000`
  - `countNewIntroduced(logs: ReviewLog[], now: number): number`
  - `buildQueueParts(input: QueueInput): { learning: Card[]; review: Card[]; fresh: Card[] }`
  - `buildQueue(input: QueueInput): Card[]`
  - `interface QueueInput { cards: Card[]; newIntroducedToday: number; newCardsPerDay: number; extraNewToday: number; now: number }`

- [ ] **Step 1: 写失败测试**

`src/lib/queue.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import type { Card, ReviewLog } from '@/domain/types'
import { buildQueue, buildQueueParts, countNewIntroduced } from './queue'

const local = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m - 1, d, h, min).getTime()
const NOW = local(2026, 10, 30, 8) // 08:00
const MIN = 60_000

let seq = 0
function card(p: Partial<Card>): Card {
  seq += 1
  return {
    id: `c${seq}`, noteId: `n${seq}`, type: 'zh2en', due: NOW, stability: 0, difficulty: 0,
    elapsed_days: 0, scheduled_days: 0, learning_steps: 0, reps: 0, lapses: 0, state: 0, createdAt: NOW - seq, ...p,
  }
}
const input = (cards: Card[], extra: Partial<Parameters<typeof buildQueue>[0]> = {}) => ({
  cards, newIntroducedToday: 0, newCardsPerDay: 20, extraNewToday: 0, now: NOW, ...extra,
})

describe('buildQueueParts', () => {
  it('learning cards are due by exact timestamp', () => {
    const due = card({ state: 1, due: NOW - MIN })
    const later = card({ state: 1, due: NOW + 30 * MIN })
    const { learning } = buildQueueParts(input([due, later]))
    expect(learning.map((c) => c.id)).toEqual([due.id])
  })

  it('review cards are due by learning day (graded 23:00 yesterday, interval 1 day, shows at 08:00)', () => {
    const r = card({ state: 2, due: local(2026, 10, 30, 23) })
    const tomorrow = card({ state: 2, due: local(2026, 10, 31, 5) })
    const { review } = buildQueueParts(input([r, tomorrow]))
    expect(review.map((c) => c.id)).toEqual([r.id])
  })

  it('new cards respect the daily limit minus already introduced, plus extra', () => {
    const fresh = [card({}), card({}), card({}), card({})]
    expect(buildQueueParts(input(fresh, { newCardsPerDay: 2 })).fresh).toHaveLength(2)
    expect(buildQueueParts(input(fresh, { newCardsPerDay: 2, newIntroducedToday: 1 })).fresh).toHaveLength(1)
    expect(buildQueueParts(input(fresh, { newCardsPerDay: 2, newIntroducedToday: 2, extraNewToday: 10 })).fresh).toHaveLength(4)
  })

  it('new cards come oldest first', () => {
    const older = card({ createdAt: NOW - 1000 })
    const newer = card({ createdAt: NOW - 10 })
    expect(buildQueueParts(input([newer, older])).fresh.map((c) => c.id)).toEqual([older.id, newer.id])
  })

  it('buried cards are excluded until buriedUntil passes', () => {
    const buried = card({ state: 2, due: NOW - MIN, buriedUntil: NOW + MIN })
    const unburied = card({ state: 2, due: NOW - MIN, buriedUntil: NOW - 1 })
    expect(buildQueue(input([buried, unburied])).map((c) => c.id)).toEqual([unburied.id])
  })

  it('order is learning → review → new, each by due / createdAt', () => {
    const n = card({})
    const r = card({ state: 2, due: NOW - 3 * MIN })
    const l = card({ state: 3, due: NOW - MIN })
    expect(buildQueue(input([n, r, l])).map((c) => c.id)).toEqual([l.id, r.id, n.id])
  })

  it('when nothing else is due, learning cards within 20 minutes are pulled forward', () => {
    const soon = card({ state: 1, due: NOW + 5 * MIN })
    const far = card({ state: 1, due: NOW + 25 * MIN })
    expect(buildQueue(input([soon, far])).map((c) => c.id)).toEqual([soon.id])
  })
})

describe('countNewIntroduced', () => {
  const log = (p: Partial<ReviewLog>): ReviewLog => ({
    id: 'l', cardId: 'c', noteId: 'n', rating: 3, reviewedAt: NOW, state: 0, due: 0, stability: 0, difficulty: 0,
    elapsed_days: 0, last_elapsed_days: 0, scheduled_days: 0, learning_steps: 0, buriedSiblingIds: [], ...p,
  })
  it('counts logs from today whose pre-state was New', () => {
    const logs = [
      log({ state: 0, reviewedAt: NOW - MIN }),
      log({ state: 1, reviewedAt: NOW - MIN }),
      log({ state: 0, reviewedAt: local(2026, 10, 30, 3) }), // 昨天（04:00 前）
    ]
    expect(countNewIntroduced(logs, NOW)).toBe(1)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm vitest run src/lib/queue.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

`src/lib/queue.ts`:
```ts
import type { Card, ReviewLog } from '@/domain/types'
import { learningDayStart, nextLearningDayStart } from './day'

export const LEARN_AHEAD_MS = 20 * 60_000

export interface QueueInput {
  cards: Card[]
  newIntroducedToday: number
  newCardsPerDay: number
  extraNewToday: number
  now: number
}

export interface QueueParts {
  learning: Card[]
  review: Card[]
  fresh: Card[]
}

const byDue = (a: Card, b: Card) => a.due - b.due
const isLearning = (c: Card) => c.state === 1 || c.state === 3

export function countNewIntroduced(logs: ReviewLog[], now: number): number {
  const start = learningDayStart(now)
  return logs.filter((l) => l.reviewedAt >= start && l.state === 0).length
}

export function buildQueueParts(i: QueueInput): QueueParts {
  const dayEnd = nextLearningDayStart(i.now)
  const visible = i.cards.filter((c) => !(c.buriedUntil !== undefined && c.buriedUntil > i.now))

  const learning = visible.filter((c) => isLearning(c) && c.due <= i.now).sort(byDue)
  const review = visible.filter((c) => c.state === 2 && c.due < dayEnd).sort(byDue)

  const limit = Math.max(0, i.newCardsPerDay + i.extraNewToday - i.newIntroducedToday)
  const fresh = visible
    .filter((c) => c.state === 0)
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(0, limit)

  if (learning.length === 0 && review.length === 0 && fresh.length === 0) {
    const ahead = visible.filter((c) => isLearning(c) && c.due > i.now && c.due <= i.now + LEARN_AHEAD_MS).sort(byDue)
    return { learning: ahead, review, fresh }
  }
  return { learning, review, fresh }
}

export function buildQueue(i: QueueInput): Card[] {
  const p = buildQueueParts(i)
  return [...p.learning, ...p.review, ...p.fresh]
}
```

- [ ] **Step 4: 运行测试**

Run: `pnpm vitest run src/lib/queue.test.ts`
Expected: 8 passed

- [ ] **Step 5: 提交**

```bash
git add src/lib/queue.ts src/lib/queue.test.ts
git commit -m "feat: today queue builder with day-based review due, limits, bury, learn-ahead"
```

---

### Task 10: 仓储 `repo.ts`（建/改/删记录、打分、撤销、队列、设置）

**Files:**
- Create: `src/db/repo.ts`
- Test: `src/db/repo.test.ts`

**Interfaces:**
- Consumes: `MnemoDB`；`scheduler` 接口；`filterEnabled, diffTypes`；`buildQueueParts, countNewIntroduced`；`learningDayStart, nextLearningDayStart`
- Produces（全部以 `db: MnemoDB` 为第一个参数，`now` 默认 `Date.now()`，`sched` 默认生产 `scheduler`）：
  - `interface NoteInput { headword: string; phonetic?: string; meaning: string; examples: Example[]; tags: string[]; enabledTypes: CardType[] }`
  - `headwordKey(s: string): string`
  - `createNote(db, input, now?, sched?): Promise<Note>`
  - `updateNote(db, id, input, now?, sched?): Promise<{ note: Note; created: CardType[]; deleted: CardType[] }>`
  - `deleteNote(db, id): Promise<void>`
  - `findDuplicate(db, headword, excludeId?): Promise<Note | undefined>`
  - `gradeCard(db, cardId, rating, now?, sched?): Promise<{ card: Card; log: ReviewLog }>`
  - `undoLastReview(db, sched?): Promise<Card | undefined>`
  - `getSettings(db): Promise<Settings>`；`updateSettings(db, patch: Partial<Omit<Settings,'id'>>): Promise<Settings>`
  - `addExtraNewToday(db, count, now?): Promise<Settings>`
  - `getTodayParts(db, now?): Promise<QueueParts>`；`getTodayQueue(db, now?): Promise<Card[]>`
  - `getTodayCounts(db, now?): Promise<{ due: number; fresh: number }>`

- [ ] **Step 1: 写失败测试**

`src/db/repo.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { createTestDb } from '@/test/db'
import { createScheduler } from '@/lib/scheduler'
import {
  addExtraNewToday, createNote, deleteNote, findDuplicate, getSettings, getTodayCounts, getTodayQueue,
  gradeCard, headwordKey, undoLastReview, updateNote, updateSettings,
} from './repo'

const local = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m - 1, d, h, min).getTime()
const NOW = local(2026, 10, 30, 10)
const MIN = 60_000
const sched = createScheduler({ enable_fuzz: false })

const input = {
  headword: 'concern',
  phonetic: '/kənˈsɜːrn/',
  meaning: 'n. 担忧',
  examples: [{ text: 'I have concerns.', source: 'test', blanks: [{ start: 7, end: 15 }] }],
  tags: [],
  enabledTypes: ['zh2en', 'cloze', 'en2zh'] as const,
}

describe('notes and cards', () => {
  it('createNote generates one New card per enabled type', async () => {
    const db = createTestDb()
    const note = await createNote(db, { ...input, enabledTypes: [...input.enabledTypes] }, NOW, sched)
    expect(note.headwordKey).toBe('concern')
    const cards = await db.cards.where('noteId').equals(note.id).toArray()
    expect(cards.map((c) => c.type).sort()).toEqual(['cloze', 'en2zh', 'zh2en'])
    expect(cards.every((c) => c.state === 0 && c.due === NOW)).toBe(true)
    expect((await getSettings(db)).lastEnabledTypes).toEqual(['zh2en', 'cloze', 'en2zh'])
  })

  it('createNote silently drops types whose prerequisites fail', async () => {
    const db = createTestDb()
    const note = await createNote(db, { ...input, examples: [], enabledTypes: ['zh2en', 'cloze'] }, NOW, sched)
    expect(note.enabledTypes).toEqual(['zh2en'])
    expect(await db.cards.where('noteId').equals(note.id).count()).toBe(1)
  })

  it('updateNote adds and removes cards (and their logs) to match types', async () => {
    const db = createTestDb()
    const note = await createNote(db, { ...input, enabledTypes: ['zh2en', 'en2zh'] }, NOW, sched)
    const zh = (await db.cards.where('noteId').equals(note.id).toArray()).find((c) => c.type === 'zh2en')!
    await gradeCard(db, zh.id, 3, NOW, sched)
    const r = await updateNote(db, note.id, { ...input, enabledTypes: ['cloze', 'en2zh'] }, NOW + MIN, sched)
    expect(r.created).toEqual(['cloze'])
    expect(r.deleted).toEqual(['zh2en'])
    expect(await db.cards.where('noteId').equals(note.id).count()).toBe(2)
    expect(await db.reviewLogs.where('cardId').equals(zh.id).count()).toBe(0)
    expect(r.note.updatedAt).toBe(NOW + MIN)
  })

  it('deleteNote cascades to cards and logs', async () => {
    const db = createTestDb()
    const note = await createNote(db, { ...input, enabledTypes: ['en2zh'] }, NOW, sched)
    const [c] = await db.cards.where('noteId').equals(note.id).toArray()
    await gradeCard(db, c!.id, 3, NOW, sched)
    await deleteNote(db, note.id)
    expect(await db.notes.count()).toBe(0)
    expect(await db.cards.count()).toBe(0)
    expect(await db.reviewLogs.count()).toBe(0)
  })

  it('findDuplicate ignores case and surrounding whitespace', async () => {
    const db = createTestDb()
    const note = await createNote(db, { ...input, enabledTypes: ['en2zh'] }, NOW, sched)
    expect((await findDuplicate(db, '  Concern '))?.id).toBe(note.id)
    expect(await findDuplicate(db, 'Concern', note.id)).toBeUndefined()
    expect(headwordKey('  Foo Bar ')).toBe('foo bar')
  })
})

describe('grading, burying, undo', () => {
  it('grading buries siblings until next 04:00 and records their ids on the log', async () => {
    const db = createTestDb()
    const note = await createNote(db, { ...input, enabledTypes: [...input.enabledTypes] }, NOW, sched)
    const cards = await db.cards.where('noteId').equals(note.id).toArray()
    const target = cards.find((c) => c.type === 'zh2en')!
    const { card, log } = await gradeCard(db, target.id, 3, NOW, sched)
    expect(card.state).toBe(1)
    expect(log.buriedSiblingIds.sort()).toEqual(cards.filter((c) => c.id !== target.id).map((c) => c.id).sort())
    const siblings = await db.cards.where('noteId').equals(note.id).filter((c) => c.id !== target.id).toArray()
    expect(siblings.every((c) => c.buriedUntil === local(2026, 10, 31, 4))).toBe(true)
  })

  it('today queue shows only one card per note, then the graded learning card when due', async () => {
    const db = createTestDb()
    const note = await createNote(db, { ...input, enabledTypes: [...input.enabledTypes] }, NOW, sched)
    expect(await getTodayQueue(db, NOW)).toHaveLength(3)
    const [first] = await getTodayQueue(db, NOW)
    await gradeCard(db, first!.id, 3, NOW, sched)
    const q = await getTodayQueue(db, NOW)
    expect(q.map((c) => c.noteId)).toEqual([note.id]) // 学习中的那张在 20 分钟内，被提前拉出
    expect(q[0]!.id).toBe(first!.id)
    expect(await getTodayQueue(db, NOW + 10 * MIN)).toHaveLength(1)
  })

  it('undoLastReview restores the card, unburies siblings, and deletes the log', async () => {
    const db = createTestDb()
    const note = await createNote(db, { ...input, enabledTypes: [...input.enabledTypes] }, NOW, sched)
    const [first] = await getTodayQueue(db, NOW)
    await gradeCard(db, first!.id, 4, NOW, sched)
    const restored = await undoLastReview(db, sched)
    expect(restored?.id).toBe(first!.id)
    expect(restored?.state).toBe(0)
    expect(await db.reviewLogs.count()).toBe(0)
    const all = await db.cards.where('noteId').equals(note.id).toArray()
    expect(all.every((c) => c.buriedUntil === undefined)).toBe(true)
    expect(await undoLastReview(db, sched)).toBeUndefined()
  })
})

describe('settings and counts', () => {
  it('getSettings returns defaults and updateSettings merges', async () => {
    const db = createTestDb()
    expect((await getSettings(db)).newCardsPerDay).toBe(20)
    await updateSettings(db, { newCardsPerDay: 5, accent: 'uk' })
    expect(await getSettings(db)).toMatchObject({ newCardsPerDay: 5, accent: 'uk', autoPlayOnReveal: true })
  })

  it('getTodayCounts applies the new-card limit and extra allowance for today only', async () => {
    const db = createTestDb()
    await updateSettings(db, { newCardsPerDay: 1 })
    await createNote(db, { ...input, headword: 'a', enabledTypes: ['en2zh'] }, NOW, sched)
    await createNote(db, { ...input, headword: 'b', enabledTypes: ['en2zh'] }, NOW, sched)
    expect(await getTodayCounts(db, NOW)).toEqual({ due: 0, fresh: 1 })
    await addExtraNewToday(db, 10, NOW)
    expect(await getTodayCounts(db, NOW)).toEqual({ due: 0, fresh: 2 })
    expect(await getTodayCounts(db, local(2026, 10, 31, 9))).toEqual({ due: 0, fresh: 1 })
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm vitest run src/db/repo.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

`src/db/repo.ts`:
```ts
import type { MnemoDB } from './db'
import { DEFAULT_SETTINGS, type Card, type CardType, type Example, type Note, type Rating, type ReviewLog, type Settings } from '@/domain/types'
import { diffTypes, filterEnabled } from '@/lib/cardTypes'
import { learningDayStart, nextLearningDayStart } from '@/lib/day'
import { buildQueueParts, countNewIntroduced, type QueueParts } from '@/lib/queue'
import { scheduler as defaultScheduler, type Scheduler } from '@/lib/scheduler'

export interface NoteInput {
  headword: string
  phonetic?: string
  meaning: string
  examples: Example[]
  tags: string[]
  enabledTypes: CardType[]
}

export function headwordKey(s: string): string {
  return s.trim().toLowerCase()
}

function normalizeInput(input: NoteInput): NoteInput {
  return {
    ...input,
    headword: input.headword.trim(),
    phonetic: input.phonetic?.trim() || undefined,
    meaning: input.meaning.trim(),
    examples: input.examples.filter((e) => e.text.trim().length > 0),
    tags: Array.from(new Set(input.tags.map((t) => t.trim()).filter(Boolean))),
    enabledTypes: filterEnabled(input, input.enabledTypes),
  }
}

export async function createNote(db: MnemoDB, raw: NoteInput, now = Date.now(), sched: Scheduler = defaultScheduler): Promise<Note> {
  const input = normalizeInput(raw)
  const note: Note = {
    id: crypto.randomUUID(),
    headword: input.headword,
    headwordKey: headwordKey(input.headword),
    phonetic: input.phonetic,
    meaning: input.meaning,
    examples: input.examples,
    tags: input.tags,
    enabledTypes: input.enabledTypes,
    createdAt: now,
    updatedAt: now,
  }
  await db.transaction('rw', db.notes, db.cards, db.settings, async () => {
    await db.notes.add(note)
    await db.cards.bulkAdd(input.enabledTypes.map((t) => sched.newCard(note.id, t, now)))
    await updateSettings(db, { lastEnabledTypes: raw.enabledTypes })
  })
  return note
}

export async function updateNote(
  db: MnemoDB, id: string, raw: NoteInput, now = Date.now(), sched: Scheduler = defaultScheduler,
): Promise<{ note: Note; created: CardType[]; deleted: CardType[] }> {
  const input = normalizeInput(raw)
  return db.transaction('rw', db.notes, db.cards, db.reviewLogs, db.settings, async () => {
    const existing = await db.notes.get(id)
    if (!existing) throw new Error(`note ${id} not found`)
    const cards = await db.cards.where('noteId').equals(id).toArray()
    const { toCreate, toDelete } = diffTypes(cards.map((c) => c.type), input.enabledTypes)

    const doomed = cards.filter((c) => toDelete.includes(c.type)).map((c) => c.id)
    if (doomed.length) {
      await db.reviewLogs.where('cardId').anyOf(doomed).delete()
      await db.cards.bulkDelete(doomed)
    }
    if (toCreate.length) await db.cards.bulkAdd(toCreate.map((t) => sched.newCard(id, t, now)))

    const note: Note = {
      ...existing,
      headword: input.headword,
      headwordKey: headwordKey(input.headword),
      phonetic: input.phonetic,
      meaning: input.meaning,
      examples: input.examples,
      tags: input.tags,
      enabledTypes: input.enabledTypes,
      updatedAt: now,
    }
    await db.notes.put(note)
    await updateSettings(db, { lastEnabledTypes: raw.enabledTypes })
    return { note, created: toCreate, deleted: toDelete }
  })
}

export async function deleteNote(db: MnemoDB, id: string): Promise<void> {
  await db.transaction('rw', db.notes, db.cards, db.reviewLogs, async () => {
    await db.reviewLogs.where('noteId').equals(id).delete()
    await db.cards.where('noteId').equals(id).delete()
    await db.notes.delete(id)
  })
}

export async function findDuplicate(db: MnemoDB, headword: string, excludeId?: string): Promise<Note | undefined> {
  const key = headwordKey(headword)
  if (!key) return undefined
  return db.notes.where('headwordKey').equals(key).filter((n) => n.id !== excludeId).first()
}

export async function gradeCard(
  db: MnemoDB, cardId: string, rating: Rating, now = Date.now(), sched: Scheduler = defaultScheduler,
): Promise<{ card: Card; log: ReviewLog }> {
  return db.transaction('rw', db.cards, db.reviewLogs, async () => {
    const card = await db.cards.get(cardId)
    if (!card) throw new Error(`card ${cardId} not found`)
    const { card: next, log } = sched.grade(card, rating, now)

    const until = nextLearningDayStart(now)
    const siblings = await db.cards.where('noteId').equals(card.noteId).filter((c) => c.id !== card.id).toArray()
    const toBury = siblings.filter((s) => !(s.buriedUntil !== undefined && s.buriedUntil >= until)).map((s) => s.id)
    for (const id of toBury) await db.cards.update(id, { buriedUntil: until })

    const full: ReviewLog = { id: crypto.randomUUID(), ...log, buriedSiblingIds: toBury }
    await db.cards.put(next)
    await db.reviewLogs.add(full)
    return { card: next, log: full }
  })
}

export async function undoLastReview(db: MnemoDB, sched: Scheduler = defaultScheduler): Promise<Card | undefined> {
  return db.transaction('rw', db.cards, db.reviewLogs, async () => {
    const last = await db.reviewLogs.orderBy('reviewedAt').last()
    if (!last) return undefined
    const card = await db.cards.get(last.cardId)
    await db.reviewLogs.delete(last.id)
    if (!card) return undefined
    const prev = sched.rollback(card, last)
    await db.cards.put(prev)
    for (const id of last.buriedSiblingIds) await db.cards.update(id, { buriedUntil: undefined })
    return prev
  })
}

export async function getSettings(db: MnemoDB): Promise<Settings> {
  const s = await db.settings.get('settings')
  return s ? { ...DEFAULT_SETTINGS, ...s } : { ...DEFAULT_SETTINGS }
}

export async function updateSettings(db: MnemoDB, patch: Partial<Omit<Settings, 'id'>>): Promise<Settings> {
  const next: Settings = { ...(await getSettings(db)), ...patch, id: 'settings' }
  await db.settings.put(next)
  return next
}

export async function addExtraNewToday(db: MnemoDB, count: number, now = Date.now()): Promise<Settings> {
  const dayStart = learningDayStart(now)
  const s = await getSettings(db)
  const prev = s.extraNew && s.extraNew.dayStart === dayStart ? s.extraNew.count : 0
  return updateSettings(db, { extraNew: { dayStart, count: prev + count } })
}

export async function getTodayParts(db: MnemoDB, now = Date.now()): Promise<QueueParts> {
  const settings = await getSettings(db)
  const dayStart = learningDayStart(now)
  const horizon = nextLearningDayStart(now) + 60 * 60_000
  const [cards, logs] = await Promise.all([
    db.cards.where('due').below(horizon).toArray(),
    db.reviewLogs.where('reviewedAt').aboveOrEqual(dayStart).toArray(),
  ])
  const extraNewToday = settings.extraNew && settings.extraNew.dayStart === dayStart ? settings.extraNew.count : 0
  return buildQueueParts({
    cards,
    newIntroducedToday: countNewIntroduced(logs, now),
    newCardsPerDay: settings.newCardsPerDay,
    extraNewToday,
    now,
  })
}

export async function getTodayQueue(db: MnemoDB, now = Date.now()): Promise<Card[]> {
  const p = await getTodayParts(db, now)
  return [...p.learning, ...p.review, ...p.fresh]
}

export async function getTodayCounts(db: MnemoDB, now = Date.now()): Promise<{ due: number; fresh: number }> {
  const p = await getTodayParts(db, now)
  return { due: p.learning.length + p.review.length, fresh: p.fresh.length }
}
```

- [ ] **Step 4: 运行测试**

Run: `pnpm vitest run src/db/repo.test.ts`
Expected: 10 passed。常见失败：Dexie 事务里用了未声明的表 → 把表加进 `db.transaction('rw', ...)` 列表。

- [ ] **Step 5: 全量测试与提交**

Run: `pnpm test`
Expected: 全部通过

```bash
git add src/db/repo.ts src/db/repo.test.ts
git commit -m "feat: repository for notes, cards, grading, undo, queue and settings"
```

---

### Task 11: 挖空 `cloze.ts`

**Files:**
- Create: `src/lib/cloze.ts`
- Test: `src/lib/cloze.test.ts`

**Interfaces:**
- Consumes: `Blank` from `@/domain/types`
- Produces:
  - `interface Token { text: string; start: number; end: number; isWord: boolean }`
  - `tokenize(text: string): Token[]`
  - `detectBlanks(text: string, headword: string, forms?: string[]): Blank[]` — 自动识别
  - `toggleBlank(blanks: Blank[], token: Token): Blank[]` — 点词切换，返回排序后的新数组
  - `segments(text: string, blanks: Blank[]): Array<{ text: string; blank: boolean }>` — 渲染用
  - `looseMatch(token: string, word: string): boolean`

- [ ] **Step 1: 写失败测试**

`src/lib/cloze.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { detectBlanks, looseMatch, segments, toggleBlank, tokenize } from './cloze'

describe('tokenize', () => {
  it('splits words and separators with offsets', () => {
    const t = tokenize("I don't know.")
    expect(t.map((x) => x.text)).toEqual(['I', ' ', "don't", ' ', 'know', '.'])
    expect(t[2]).toEqual({ text: "don't", start: 2, end: 7, isWord: true })
    expect(t[5]!.isWord).toBe(false)
  })
})

describe('looseMatch', () => {
  it('accepts exact, simple suffixes, and e-dropping', () => {
    expect(looseMatch('concerns', 'concern')).toBe(true)
    expect(looseMatch('Concerned', 'concern')).toBe(true)
    expect(looseMatch('having', 'have')).toBe(true)
    expect(looseMatch('concerning', 'concern')).toBe(true)
    expect(looseMatch('had', 'have')).toBe(false)
    expect(looseMatch('concert', 'concern')).toBe(false)
  })
})

describe('detectBlanks', () => {
  const sentence = 'I have some concerns about the proposed timeline.'

  it('finds the headword via forms', () => {
    expect(detectBlanks(sentence, 'concern', ['concerns', 'concerned'])).toEqual([{ start: 12, end: 20 }])
  })
  it('falls back to loose matching without forms', () => {
    expect(detectBlanks(sentence, 'concern')).toEqual([{ start: 12, end: 20 }])
  })
  it('matches multi-word headwords token by token, one blank per word', () => {
    expect(detectBlanks(sentence, 'have some concerns about')).toEqual([
      { start: 2, end: 6 }, { start: 7, end: 11 }, { start: 12, end: 20 }, { start: 21, end: 26 },
    ])
  })
  it('returns [] when nothing matches', () => {
    expect(detectBlanks(sentence, 'leverage')).toEqual([])
  })
  it('only blanks the first occurrence', () => {
    expect(detectBlanks('Concern leads to concern.', 'concern')).toEqual([{ start: 0, end: 7 }])
  })
})

describe('toggleBlank / segments', () => {
  const text = 'I have some concerns about it.'
  const tok = tokenize(text)
  const concerns = tok.find((t) => t.text === 'concerns')!
  const have = tok.find((t) => t.text === 'have')!

  it('adds, keeps sorted, and removes', () => {
    const a = toggleBlank([], concerns)
    const b = toggleBlank(a, have)
    expect(b).toEqual([{ start: 2, end: 6 }, { start: 12, end: 20 }])
    expect(toggleBlank(b, concerns)).toEqual([{ start: 2, end: 6 }])
  })
  it('segments text into blank and plain runs', () => {
    expect(segments(text, [{ start: 12, end: 20 }])).toEqual([
      { text: 'I have some ', blank: false },
      { text: 'concerns', blank: true },
      { text: ' about it.', blank: false },
    ])
    expect(segments(text, [])).toEqual([{ text, blank: false }])
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm vitest run src/lib/cloze.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

`src/lib/cloze.ts`:
```ts
import type { Blank } from '@/domain/types'

export interface Token {
  text: string
  start: number
  end: number
  isWord: boolean
}

const WORD = /[A-Za-z0-9\u00C0-\u024F'’-]+/y

export function tokenize(text: string): Token[] {
  const out: Token[] = []
  let i = 0
  while (i < text.length) {
    WORD.lastIndex = i
    const m = WORD.exec(text)
    if (m && m.index === i) {
      out.push({ text: m[0], start: i, end: i + m[0].length, isWord: true })
      i += m[0].length
      continue
    }
    let j = i + 1
    while (j < text.length) {
      WORD.lastIndex = j
      const n = WORD.exec(text)
      if (n && n.index === j) break
      j += 1
    }
    out.push({ text: text.slice(i, j), start: i, end: j, isWord: false })
    i = j
  }
  return out
}

/** 精确、常见后缀（≤3 个字符）、去 e 加后缀 */
export function looseMatch(token: string, word: string): boolean {
  const t = token.toLowerCase()
  const w = word.toLowerCase()
  if (t === w) return true
  if (t.startsWith(w) && t.length - w.length <= 3) return true
  if (w.endsWith('e')) {
    const stem = w.slice(0, -1)
    if (t.startsWith(stem) && t.length - stem.length <= 3 && t !== stem) return true
  }
  return false
}

export function detectBlanks(text: string, headword: string, forms: string[] = []): Blank[] {
  const words = headword.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  const formSet = new Set(forms.map((f) => f.toLowerCase()))
  const tokens = tokenize(text).filter((t) => t.isWord)

  const matches = (token: Token, word: string, single: boolean): boolean => {
    const t = token.text.toLowerCase()
    if (single && formSet.has(t)) return true
    return looseMatch(t, word)
  }

  for (let i = 0; i + words.length <= tokens.length; i += 1) {
    let ok = true
    for (let k = 0; k < words.length; k += 1) {
      if (!matches(tokens[i + k]!, words[k]!, words.length === 1)) { ok = false; break }
    }
    if (ok) return tokens.slice(i, i + words.length).map((t) => ({ start: t.start, end: t.end }))
  }
  return []
}

export function toggleBlank(blanks: Blank[], token: Token): Blank[] {
  const exists = blanks.some((b) => b.start === token.start && b.end === token.end)
  const next = exists
    ? blanks.filter((b) => !(b.start === token.start && b.end === token.end))
    : [...blanks, { start: token.start, end: token.end }]
  return next.sort((a, b) => a.start - b.start)
}

export function segments(text: string, blanks: Blank[]): Array<{ text: string; blank: boolean }> {
  const out: Array<{ text: string; blank: boolean }> = []
  let cursor = 0
  for (const b of [...blanks].sort((x, y) => x.start - y.start)) {
    if (b.start > cursor) out.push({ text: text.slice(cursor, b.start), blank: false })
    out.push({ text: text.slice(b.start, b.end), blank: true })
    cursor = b.end
  }
  if (cursor < text.length || out.length === 0) out.push({ text: text.slice(cursor), blank: false })
  return out
}
```

- [ ] **Step 4: 运行测试**

Run: `pnpm vitest run src/lib/cloze.test.ts`
Expected: 10 passed

- [ ] **Step 5: 提交**

```bash
git add src/lib/cloze.ts src/lib/cloze.test.ts
git commit -m "feat: cloze tokenizer, auto-detection and blank toggling"
```

---

### Task 12: 词典构建脚本（ECDICT 子集）

**Files:**
- Create: `scripts/dict-transform.ts`, `scripts/build-dict.ts`
- Test: `scripts/dict-transform.test.ts`
- Generated（提交）: `public/dict/ecdict.<hash>.json`, `src/generated/dict-version.ts`

**Interfaces:**
- Produces:
  - `interface RawRow { word: string; phonetic: string; translation: string; pos: string; tag: string; frq: string; exchange: string }`（CSV 其余列忽略）
  - `parseExchange(exchange: string): string[]`
  - `shouldInclude(row: RawRow): boolean`
  - `toEntry(row: RawRow): DictEntry`
  - `src/generated/dict-version.ts` 导出 `DICT_VERSION: string` 与 `DICT_FILE: string`（如 `dict/ecdict.ab12cd34.json`，相对 base）
  - 脚本 `pnpm build:dict`

- [ ] **Step 1: 写失败测试**

`scripts/dict-transform.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { parseExchange, shouldInclude, toEntry, type RawRow } from './dict-transform'

const row = (p: Partial<RawRow>): RawRow => ({
  word: 'concern', phonetic: "kәn'sә:n", translation: 'n. 关心, 忧虑\\nvt. 与...有关, 使担心',
  pos: '', tag: 'gk cet4 cet6 ky ielts', frq: '717', exchange: 's:concerns/3:concerns/p:concerned/i:concerning/d:concerned', ...p,
})

describe('parseExchange', () => {
  it('collects unique inflections and skips lemma pointers (0:/1:)', () => {
    expect(parseExchange('s:concerns/3:concerns/p:concerned/i:concerning/d:concerned')).toEqual(['concerns', 'concerned', 'concerning'])
    expect(parseExchange('0:concern/1:s3')).toEqual([])
    expect(parseExchange('')).toEqual([])
  })
})

describe('shouldInclude', () => {
  it('keeps tagged words', () => expect(shouldInclude(row({ frq: '0' }))).toBe(true))
  it('keeps frequent untagged words', () => expect(shouldInclude(row({ tag: '', frq: '29999' }))).toBe(true))
  it('drops rare untagged words and phrases with frq 0', () => {
    expect(shouldInclude(row({ tag: '', frq: '30001' }))).toBe(false)
    expect(shouldInclude(row({ word: 'on the fence', tag: '', frq: '0' }))).toBe(false)
  })
})

describe('toEntry', () => {
  it('lowercases word, unescapes \\n, normalizes ә→ə, parses forms and frq', () => {
    expect(toEntry(row({ word: 'Concern' }))).toEqual({
      word: 'concern',
      phonetic: "kən'sə:n",
      translation: 'n. 关心, 忧虑\nvt. 与...有关, 使担心',
      pos: undefined,
      tag: 'gk cet4 cet6 ky ielts',
      frq: 717,
      forms: ['concerns', 'concerned', 'concerning'],
    })
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm vitest run scripts/dict-transform.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现纯函数**

`scripts/dict-transform.ts`:
```ts
import type { DictEntry } from '../src/domain/types'

export interface RawRow {
  word: string
  phonetic: string
  translation: string
  pos: string
  tag: string
  frq: string
  exchange: string
}

export const FRQ_LIMIT = 30000

export function parseExchange(exchange: string): string[] {
  if (!exchange) return []
  const out: string[] = []
  for (const part of exchange.split('/')) {
    const idx = part.indexOf(':')
    if (idx < 0) continue
    const code = part.slice(0, idx)
    const form = part.slice(idx + 1).trim().toLowerCase()
    if (code === '0' || code === '1' || !form) continue
    if (!out.includes(form)) out.push(form)
  }
  return out
}

export function shouldInclude(row: RawRow): boolean {
  if (row.tag.trim().length > 0) return true
  const frq = Number(row.frq)
  return Number.isFinite(frq) && frq >= 1 && frq <= FRQ_LIMIT
}

export function toEntry(row: RawRow): DictEntry {
  const frq = Number(row.frq)
  return {
    word: row.word.trim().toLowerCase(),
    phonetic: row.phonetic.replace(/ә/g, 'ə').trim(),
    translation: row.translation.replace(/\\n/g, '\n').trim(),
    pos: row.pos.trim() || undefined,
    tag: row.tag.trim() || undefined,
    frq: Number.isFinite(frq) && frq > 0 ? frq : undefined,
    forms: parseExchange(row.exchange),
  }
}
```

- [ ] **Step 4: 运行测试**

Run: `pnpm vitest run scripts/dict-transform.test.ts`
Expected: 6 passed

- [ ] **Step 5: 写构建脚本**

`scripts/build-dict.ts`:
```ts
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync } from 'node:fs'
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { parse } from 'csv-parse'
import { shouldInclude, toEntry, type RawRow } from './dict-transform'
import type { DictEntry } from '../src/domain/types'

const SOURCE = 'https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv'
const CACHE = '.cache/ecdict.csv'
const OUT_DIR = 'public/dict'
const VERSION_FILE = 'src/generated/dict-version.ts'

async function download(): Promise<void> {
  if (existsSync(CACHE)) return
  await mkdir('.cache', { recursive: true })
  console.log(`downloading ${SOURCE} …`)
  const res = await fetch(SOURCE)
  if (!res.ok || !res.body) throw new Error(`download failed: ${res.status}`)
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(CACHE))
}

async function collect(): Promise<DictEntry[]> {
  const byWord = new Map<string, DictEntry>()
  const parser = createReadStream(CACHE).pipe(
    parse({ columns: true, bom: true, relax_quotes: true, relax_column_count: true, skip_empty_lines: true }),
  )
  for await (const record of parser as AsyncIterable<Record<string, string>>) {
    const row: RawRow = {
      word: record.word ?? '', phonetic: record.phonetic ?? '', translation: record.translation ?? '',
      pos: record.pos ?? '', tag: record.tag ?? '', frq: record.frq ?? '', exchange: record.exchange ?? '',
    }
    if (!row.word || !shouldInclude(row)) continue
    const entry = toEntry(row)
    if (!entry.translation) continue
    if (!byWord.has(entry.word)) byWord.set(entry.word, entry)
  }
  return Array.from(byWord.values()).sort((a, b) => (a.word < b.word ? -1 : 1))
}

async function main() {
  await download()
  const entries = await collect()
  const json = JSON.stringify(entries)
  const hash = createHash('sha256').update(json).digest('hex').slice(0, 8)

  await mkdir(OUT_DIR, { recursive: true })
  for (const f of await readdir(OUT_DIR)) if (/^ecdict\.[0-9a-f]{8}\.json$/.test(f)) await rm(`${OUT_DIR}/${f}`)
  const file = `dict/ecdict.${hash}.json`
  await writeFile(`public/${file}`, json)

  await mkdir('src/generated', { recursive: true })
  await writeFile(
    VERSION_FILE,
    `// 由 scripts/build-dict.ts 生成，勿手改\nexport const DICT_VERSION = '${hash}'\nexport const DICT_FILE = '${file}'\n`,
  )
  console.log(`${entries.length} entries → public/${file} (${(json.length / 1024 / 1024).toFixed(1)} MB)`)
}

main().catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 6: 运行脚本并检查产物**

Run: `pnpm build:dict && cat src/generated/dict-version.ts && ls -la public/dict`
Expected: 日志形如 `4xxxx entries → public/dict/ecdict.xxxxxxxx.json (6.x MB)`；条目数在 35,000–60,000 之间，文件 ≤ 10 MB。若超出，调整 `FRQ_LIMIT` 并重新运行。

Run: `node -e "const d=require('./public/dict/'+require('fs').readdirSync('public/dict')[0]); const c=d.find(e=>e.word==='concern'); console.log(c)"`
Expected: 打印 concern 条目，`forms` 含 `concerns`，`translation` 含换行

- [ ] **Step 7: 全量测试、构建并提交**

Run: `pnpm test && pnpm build && ls dist/dict`
Expected: 通过；`dist/dict/` 含词典 JSON

```bash
git add scripts public/dict src/generated
git commit -m "feat: ECDICT subset build script and generated dictionary"
```

---

### Task 13: 词典灌库与查询 `dictLoader.ts` / `dict.ts`

**Files:**
- Create: `src/lib/dict.ts`, `src/lib/dictLoader.ts`
- Test: `src/lib/dict.test.ts`, `src/lib/dictLoader.test.ts`

**Interfaces:**
- Consumes: `MnemoDB`；`getSettings, updateSettings`；`DICT_VERSION, DICT_FILE`
- Produces:
  - `lookupWord(db, raw: string): Promise<{ entry: DictEntry; viaForm: boolean } | undefined>`
  - `ensureDictLoaded(db, opts: { version: string; url: string; fetchImpl?: typeof fetch; onProgress?: (done: number, total: number) => void }): Promise<{ status: 'loaded' | 'skipped'; entries: number; ms: number }>`
  - `dictUrl(): string` — `import.meta.env.BASE_URL + DICT_FILE`

- [ ] **Step 1: 写失败测试**

`src/lib/dict.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { createTestDb } from '@/test/db'
import { lookupWord } from './dict'

describe('lookupWord', () => {
  it('finds exact words, then inflections, else undefined', async () => {
    const db = createTestDb()
    await db.dict.put({ word: 'concern', phonetic: '', translation: 'n. 担忧', forms: ['concerns', 'concerned'] })
    expect(await lookupWord(db, ' Concern ')).toMatchObject({ entry: { word: 'concern' }, viaForm: false })
    expect(await lookupWord(db, 'Concerned')).toMatchObject({ entry: { word: 'concern' }, viaForm: true })
    expect(await lookupWord(db, 'leverage')).toBeUndefined()
    expect(await lookupWord(db, '   ')).toBeUndefined()
  })
})
```

`src/lib/dictLoader.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest'
import { createTestDb } from '@/test/db'
import { getSettings } from '@/db/repo'
import { ensureDictLoaded } from './dictLoader'

const entries = Array.from({ length: 2500 }, (_, i) => ({ word: `w${i}`, phonetic: '', translation: `t${i}`, forms: [] }))
const fetchImpl = vi.fn(async () => new Response(JSON.stringify(entries), { headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch

describe('ensureDictLoaded', () => {
  it('loads once, records the version, reports progress, and skips next time', async () => {
    const db = createTestDb()
    const progress: Array<[number, number]> = []
    const r1 = await ensureDictLoaded(db, { version: 'v1', url: '/x', fetchImpl, onProgress: (d, t) => progress.push([d, t]) })
    expect(r1.status).toBe('loaded')
    expect(r1.entries).toBe(2500)
    expect(await db.dict.count()).toBe(2500)
    expect((await getSettings(db)).dictVersion).toBe('v1')
    expect(progress.at(-1)).toEqual([2500, 2500])

    const r2 = await ensureDictLoaded(db, { version: 'v1', url: '/x', fetchImpl })
    expect(r2.status).toBe('skipped')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('replaces old entries when the version changes', async () => {
    const db = createTestDb()
    await db.dict.put({ word: 'stale', phonetic: '', translation: 'x', forms: [] })
    await ensureDictLoaded(db, { version: 'v2', url: '/x', fetchImpl })
    expect(await db.dict.get('stale')).toBeUndefined()
    expect(await db.dict.count()).toBe(2500)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm vitest run src/lib/dict.test.ts src/lib/dictLoader.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

`src/lib/dict.ts`:
```ts
import type { MnemoDB } from '@/db/db'
import type { DictEntry } from '@/domain/types'
import { DICT_FILE } from '@/generated/dict-version'

export function dictUrl(): string {
  return `${import.meta.env.BASE_URL}${DICT_FILE}`
}

export async function lookupWord(db: MnemoDB, raw: string): Promise<{ entry: DictEntry; viaForm: boolean } | undefined> {
  const key = raw.trim().toLowerCase()
  if (!key) return undefined
  const exact = await db.dict.get(key)
  if (exact) return { entry: exact, viaForm: false }
  const viaForm = await db.dict.where('forms').equals(key).first()
  return viaForm ? { entry: viaForm, viaForm: true } : undefined
}
```

`src/lib/dictLoader.ts`:
```ts
import type { MnemoDB } from '@/db/db'
import type { DictEntry } from '@/domain/types'
import { getSettings, updateSettings } from '@/db/repo'

const CHUNK = 1000

export interface LoadOptions {
  version: string
  url: string
  fetchImpl?: typeof fetch
  onProgress?: (done: number, total: number) => void
}

export async function ensureDictLoaded(db: MnemoDB, opts: LoadOptions): Promise<{ status: 'loaded' | 'skipped'; entries: number; ms: number }> {
  const started = performance.now()
  const settings = await getSettings(db)
  if (settings.dictVersion === opts.version && (await db.dict.count()) > 0) {
    return { status: 'skipped', entries: 0, ms: 0 }
  }
  const doFetch = opts.fetchImpl ?? fetch
  const res = await doFetch(opts.url)
  if (!res.ok) throw new Error(`词典下载失败：${res.status}`)
  const entries = (await res.json()) as DictEntry[]

  await db.dict.clear()
  for (let i = 0; i < entries.length; i += CHUNK) {
    await db.dict.bulkPut(entries.slice(i, i + CHUNK))
    opts.onProgress?.(Math.min(i + CHUNK, entries.length), entries.length)
  }
  await updateSettings(db, { dictVersion: opts.version })
  return { status: 'loaded', entries: entries.length, ms: Math.round(performance.now() - started) }
}
```

- [ ] **Step 4: 运行测试**

Run: `pnpm vitest run src/lib/dict.test.ts src/lib/dictLoader.test.ts`
Expected: 3 passed

- [ ] **Step 5: 提交**

```bash
git add src/lib/dict.ts src/lib/dict.test.ts src/lib/dictLoader.ts src/lib/dictLoader.test.ts
git commit -m "feat: dictionary loader with versioning and word lookup via inflections"
```

---

### Task 14: 收集箱拆行 `inbox.ts`

**Files:**
- Create: `src/lib/inbox.ts`
- Test: `src/lib/inbox.test.ts`

**Interfaces:**
- Produces: `splitPaste(text: string): Array<{ raw: string; kind: 'headword' | 'sentence' }>`；`classifyLine(line: string): 'headword' | 'sentence'`

- [ ] **Step 1: 写失败测试**

`src/lib/inbox.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { classifyLine, splitPaste } from './inbox'

describe('classifyLine', () => {
  it('≥4 words or terminal punctuation → sentence', () => {
    expect(classifyLine('concern')).toBe('headword')
    expect(classifyLine('ticking time bomb')).toBe('headword')
    expect(classifyLine('have some concerns about')).toBe('sentence')
    expect(classifyLine('Stay put.')).toBe('sentence')
    expect(classifyLine('Why me?')).toBe('sentence')
  })
})

describe('splitPaste', () => {
  it('splits lines, trims, drops empties and case-insensitive duplicates, keeps order', () => {
    const out = splitPaste('concern\n\n  Leverage \nI have some concerns about the timeline.\nconcern\nLEVERAGE\r\nticking time bomb')
    expect(out).toEqual([
      { raw: 'concern', kind: 'headword' },
      { raw: 'Leverage', kind: 'headword' },
      { raw: 'I have some concerns about the timeline.', kind: 'sentence' },
      { raw: 'ticking time bomb', kind: 'headword' },
    ])
  })
  it('returns [] for blank input', () => {
    expect(splitPaste('  \n ')).toEqual([])
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm vitest run src/lib/inbox.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

`src/lib/inbox.ts`:
```ts
export type DraftKind = 'headword' | 'sentence'

export function classifyLine(line: string): DraftKind {
  const words = line.trim().split(/\s+/).filter(Boolean)
  if (words.length >= 4) return 'sentence'
  if (/[.!?。！？]$/.test(line.trim())) return 'sentence'
  return 'headword'
}

export function splitPaste(text: string): Array<{ raw: string; kind: DraftKind }> {
  const seen = new Set<string>()
  const out: Array<{ raw: string; kind: DraftKind }> = []
  for (const line of text.split(/\r?\n/)) {
    const raw = line.trim()
    if (!raw) continue
    const key = raw.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ raw, kind: classifyLine(raw) })
  }
  return out
}
```

- [ ] **Step 4: 运行测试并提交**

Run: `pnpm vitest run src/lib/inbox.test.ts`
Expected: 3 passed

```bash
git add src/lib/inbox.ts src/lib/inbox.test.ts
git commit -m "feat: inbox paste splitting and line classification"
```

---

### Task 15: 备份序列化 `backup.ts`

**Files:**
- Create: `src/lib/backup.ts`
- Test: `src/lib/backup.test.ts`

**Interfaces:**
- Consumes: `MnemoDB`；`getSettings, updateSettings`
- Produces:
  - `interface BackupFile { app: 'mnemo'; version: 1; exportedAt: number; notes: Note[]; cards: Card[]; reviewLogs: ReviewLog[]; drafts: Draft[]; settings: Settings }`
  - `exportBackup(db, now?): Promise<BackupFile>` — 同时写 `settings.lastBackupAt`
  - `validateBackup(x: unknown): x is BackupFile`
  - `importBackup(db, data: BackupFile): Promise<void>` — 整体覆盖，保留当前 `dictVersion`
  - `backupFilename(now: number): string` — `mnemo-backup-YYYYMMDD-HHmm.json`

- [ ] **Step 1: 写失败测试**

`src/lib/backup.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { createTestDb } from '@/test/db'
import { createNote, getSettings, gradeCard, updateSettings } from '@/db/repo'
import { createScheduler } from '@/lib/scheduler'
import { backupFilename, exportBackup, importBackup, validateBackup } from './backup'

const NOW = new Date(2026, 9, 30, 9, 5).getTime()
const sched = createScheduler({ enable_fuzz: false })

describe('backup', () => {
  it('round-trips notes, cards, logs, drafts and settings; keeps dictVersion of the target', async () => {
    const src = createTestDb()
    const note = await createNote(src, { headword: 'concern', meaning: 'n. 担忧', examples: [], tags: ['x'], enabledTypes: ['en2zh'] }, NOW, sched)
    const [card] = await src.cards.where('noteId').equals(note.id).toArray()
    await gradeCard(src, card!.id, 3, NOW, sched)
    await src.drafts.add({ id: 'd1', raw: 'leverage', kind: 'headword', createdAt: NOW })
    await updateSettings(src, { newCardsPerDay: 7, dictVersion: 'src-dict' })

    const file = await exportBackup(src, NOW)
    expect(validateBackup(JSON.parse(JSON.stringify(file)))).toBe(true)
    expect((await getSettings(src)).lastBackupAt).toBe(NOW)

    const dst = createTestDb()
    await dst.notes.add({ ...note, id: 'stale', headwordKey: 'stale', headword: 'stale' })
    await updateSettings(dst, { dictVersion: 'dst-dict' })
    await importBackup(dst, file)

    expect(await dst.notes.toArray()).toEqual(await src.notes.toArray())
    expect(await dst.cards.toArray()).toEqual(await src.cards.toArray())
    expect(await dst.reviewLogs.toArray()).toEqual(await src.reviewLogs.toArray())
    expect(await dst.drafts.toArray()).toEqual(await src.drafts.toArray())
    const s = await getSettings(dst)
    expect(s.newCardsPerDay).toBe(7)
    expect(s.dictVersion).toBe('dst-dict')
  })

  it('validateBackup rejects foreign or malformed files', () => {
    expect(validateBackup({ app: 'other', version: 1 })).toBe(false)
    expect(validateBackup({ app: 'mnemo', version: 2, notes: [], cards: [], reviewLogs: [], drafts: [], settings: {} })).toBe(false)
    expect(validateBackup(null)).toBe(false)
  })

  it('names files by local time', () => {
    expect(backupFilename(NOW)).toBe('mnemo-backup-20261030-0905.json')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm vitest run src/lib/backup.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

`src/lib/backup.ts`:
```ts
import type { MnemoDB } from '@/db/db'
import { getSettings, updateSettings } from '@/db/repo'
import type { Card, Draft, Note, ReviewLog, Settings } from '@/domain/types'

export interface BackupFile {
  app: 'mnemo'
  version: 1
  exportedAt: number
  notes: Note[]
  cards: Card[]
  reviewLogs: ReviewLog[]
  drafts: Draft[]
  settings: Settings
}

export async function exportBackup(db: MnemoDB, now = Date.now()): Promise<BackupFile> {
  const [notes, cards, reviewLogs, drafts] = await Promise.all([
    db.notes.toArray(), db.cards.toArray(), db.reviewLogs.toArray(), db.drafts.toArray(),
  ])
  const settings = await updateSettings(db, { lastBackupAt: now })
  return { app: 'mnemo', version: 1, exportedAt: now, notes, cards, reviewLogs, drafts, settings }
}

export function validateBackup(x: unknown): x is BackupFile {
  if (typeof x !== 'object' || x === null) return false
  const o = x as Record<string, unknown>
  return (
    o.app === 'mnemo' &&
    o.version === 1 &&
    Array.isArray(o.notes) &&
    Array.isArray(o.cards) &&
    Array.isArray(o.reviewLogs) &&
    Array.isArray(o.drafts) &&
    typeof o.settings === 'object' && o.settings !== null
  )
}

export async function importBackup(db: MnemoDB, data: BackupFile): Promise<void> {
  await db.transaction('rw', db.notes, db.cards, db.reviewLogs, db.drafts, db.settings, async () => {
    const current = await getSettings(db)
    await Promise.all([db.notes.clear(), db.cards.clear(), db.reviewLogs.clear(), db.drafts.clear()])
    await db.notes.bulkAdd(data.notes)
    await db.cards.bulkAdd(data.cards)
    await db.reviewLogs.bulkAdd(data.reviewLogs)
    await db.drafts.bulkAdd(data.drafts)
    await db.settings.put({ ...data.settings, id: 'settings', dictVersion: current.dictVersion })
  })
}

export function backupFilename(now: number): string {
  const d = new Date(now)
  const p = (n: number) => String(n).padStart(2, '0')
  return `mnemo-backup-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`
}
```

- [ ] **Step 4: 运行测试并提交**

Run: `pnpm vitest run src/lib/backup.test.ts`
Expected: 3 passed

```bash
git add src/lib/backup.ts src/lib/backup.test.ts
git commit -m "feat: backup export/import with validation"
```

---

### Task 16: 应用壳与今日页

**Files:**
- Create: `src/components/TabBar.tsx`, `src/components/OriginBanner.tsx`, `src/app/useDictLoader.ts`, `src/screens/Today.tsx`
- Modify: `src/app/App.tsx`
- Test: `src/components/OriginBanner.test.tsx`（jsdom）

**Interfaces:**
- Consumes: `getTodayCounts, getSettings`；`ensureDictLoaded, dictUrl`；`DICT_VERSION`；`isProductionOrigin, PRODUCTION_ORIGIN`；`db`
- Produces: 路由 `/`（今日）、`/cards`、`/settings`、`/review`、`/inbox`、`/note/new`（后四个为占位）；`useDictLoader(): { state: 'idle' | 'loading' | 'ready' | 'error'; done: number; total: number; ms?: number; entries?: number; error?: string }`

- [ ] **Step 1: 写失败的组件测试**

`src/components/OriginBanner.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { OriginBanner } from './OriginBanner'

describe('OriginBanner', () => {
  it('renders nothing on the production origin', () => {
    expect(renderToStaticMarkup(<OriginBanner current="https://mni.github.io" production="https://mni.github.io" />)).toBe('')
  })
  it('warns elsewhere', () => {
    const html = renderToStaticMarkup(<OriginBanner current="http://localhost:5173" production="https://mni.github.io" />)
    expect(html).toContain('这不是正式地址')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm vitest run src/components/OriginBanner.test.tsx`
Expected: FAIL

- [ ] **Step 3: 组件与 hook**

`src/components/OriginBanner.tsx`:
```tsx
import { isProductionOrigin, PRODUCTION_ORIGIN } from '@/lib/env'

export function OriginBanner({
  current = typeof location === 'undefined' ? '' : location.origin,
  production = PRODUCTION_ORIGIN,
}: { current?: string; production?: string }) {
  if (isProductionOrigin(current, production)) return null
  return (
    <div className="rounded-(--radius-field) border border-notice-line bg-notice-bg px-3 py-2 text-xs text-notice-fg">
      这不是正式地址，这里的数据不会保留。
    </div>
  )
}
```

`src/components/TabBar.tsx`:
```tsx
import { NavLink } from 'react-router'

const tabs = [
  { to: '/', label: '今日' },
  { to: '/cards', label: '卡片' },
  { to: '/settings', label: '设置' },
]

export function TabBar() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 flex justify-around border-t border-line bg-panel/95 pt-2 text-[10px] backdrop-blur"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)' }}
    >
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.to === '/'}
          className={({ isActive }) => `flex w-16 flex-col items-center gap-1 ${isActive ? 'text-accent' : 'text-muted'}`}
        >
          {({ isActive }) => (
            <>
              <span className={`block h-6 w-6 rounded-md ${isActive ? 'bg-accent' : 'bg-line'}`} />
              {t.label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
```

`src/app/useDictLoader.ts`:
```ts
import { useEffect, useState } from 'react'
import { db } from '@/db/db'
import { DICT_VERSION } from '@/generated/dict-version'
import { dictUrl } from '@/lib/dict'
import { ensureDictLoaded } from '@/lib/dictLoader'

export interface DictLoadState {
  state: 'idle' | 'loading' | 'ready' | 'error'
  done: number
  total: number
  ms?: number
  entries?: number
  error?: string
}

export function useDictLoader(): DictLoadState {
  const [s, setS] = useState<DictLoadState>({ state: 'idle', done: 0, total: 0 })
  useEffect(() => {
    let cancelled = false
    setS({ state: 'loading', done: 0, total: 0 })
    ensureDictLoaded(db, {
      version: DICT_VERSION,
      url: dictUrl(),
      onProgress: (done, total) => { if (!cancelled) setS({ state: 'loading', done, total }) },
    })
      .then((r) => { if (!cancelled) setS({ state: 'ready', done: r.entries, total: r.entries, ms: r.ms, entries: r.entries }) })
      .catch((e: Error) => { if (!cancelled) setS({ state: 'error', done: 0, total: 0, error: e.message }) })
    return () => { cancelled = true }
  }, [])
  return s
}
```

- [ ] **Step 4: 今日页**

`src/screens/Today.tsx`:
```tsx
import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate } from 'react-router'
import { db } from '@/db/db'
import { getSettings, getTodayCounts } from '@/db/repo'
import { OriginBanner } from '@/components/OriginBanner'
import type { DictLoadState } from '@/app/useDictLoader'

const WEEKDAY = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function todayLabel(now = new Date()) {
  return `${now.getMonth() + 1} 月 ${now.getDate()} 日 · ${WEEKDAY[now.getDay()]}`
}

function daysSince(ts: number | undefined, now = Date.now()) {
  return ts === undefined ? undefined : Math.floor((now - ts) / 86_400_000)
}

export function Today({ dict }: { dict: DictLoadState }) {
  const navigate = useNavigate()
  const counts = useLiveQuery(() => getTodayCounts(db), [], { due: 0, fresh: 0 })
  const settings = useLiveQuery(() => getSettings(db), [])
  const drafts = useLiveQuery(() => db.drafts.count(), [], 0)
  const noteCount = useLiveQuery(() => db.notes.count(), [], 0)
  const backupAge = daysSince(settings?.lastBackupAt)
  const total = counts.due + counts.fresh

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-3 px-4 pb-28" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}>
      <OriginBanner />
      <header>
        <h1 className="text-[30px] font-bold leading-tight tracking-tight">今日</h1>
        <p className="text-sm text-muted">{todayLabel()}</p>
      </header>

      <section className="rounded-(--radius-card) bg-panel p-4">
        <div className="flex gap-3">
          <div className="flex-1">
            <div className="text-[34px] font-bold leading-none tracking-tight">{counts.due}</div>
            <div className="mt-1 text-xs text-muted">待复习</div>
          </div>
          <div className="flex-1">
            <div className="text-[34px] font-bold leading-none tracking-tight text-accent">{counts.fresh}</div>
            <div className="mt-1 text-xs text-muted">新卡</div>
          </div>
        </div>
        <button
          className="mt-4 h-[50px] w-full rounded-(--radius-card) bg-accent text-base font-semibold text-white disabled:opacity-40"
          disabled={total === 0}
          onClick={() => navigate('/review')}
        >
          {total === 0 ? '今天没有要复习的' : '开始复习'}
        </button>
      </section>

      <Link to="/inbox" className="flex items-center justify-between rounded-(--radius-card) bg-panel px-4 py-3">
        <div>
          <div className="text-[15px]">收集箱</div>
          <div className="text-xs text-muted">{drafts > 0 ? `${drafts} 条待处理` : '没有待处理的'}</div>
        </div>
        <div className="flex items-center gap-2">
          {drafts > 0 && <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] text-white">{drafts}</span>}
          <span className="text-lg text-line">›</span>
        </div>
      </Link>

      {backupAge !== undefined && backupAge >= 7 && (
        <Link to="/settings" className="flex items-center justify-between rounded-(--radius-field) border border-notice-line bg-notice-bg px-3 py-2 text-xs text-notice-fg">
          <span>上次备份是 {backupAge} 天前</span>
          <span className="font-semibold text-accent">立即备份</span>
        </Link>
      )}

      {dict.state === 'loading' && (
        <p className="text-xs text-muted">正在准备词典… {dict.total ? `${dict.done} / ${dict.total}` : ''}</p>
      )}
      {dict.state === 'ready' && dict.entries ? (
        <p className="text-xs text-muted">词典已就绪：{dict.entries} 条，用时 {dict.ms} ms</p>
      ) : null}
      {dict.state === 'error' && <p className="text-xs text-again-fg">词典加载失败：{dict.error}</p>}

      <div className="mt-auto pb-2 text-center text-[11px] text-muted">共 {noteCount} 条记录</div>

      <Link
        to="/note/new"
        aria-label="建卡"
        className="fixed right-5 grid h-[52px] w-[52px] place-items-center rounded-full bg-accent text-3xl leading-none text-white shadow-lg shadow-accent/35"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 76px)' }}
      >
        +
      </Link>
    </div>
  )
}
```

- [ ] **Step 5: 路由与布局**

`src/app/App.tsx`:
```tsx
import { HashRouter, Outlet, Route, Routes } from 'react-router'
import { UpdatePrompt } from './UpdatePrompt'
import { useDictLoader } from './useDictLoader'
import { TabBar } from '@/components/TabBar'
import { Placeholder } from '@/screens/Placeholder'
import { Today } from '@/screens/Today'
import { AudioSpike } from '@/spikes/AudioSpike'
import { TtsSpike } from '@/spikes/TtsSpike'

function WithTabs() {
  return (
    <>
      <Outlet />
      <TabBar />
    </>
  )
}

export function App() {
  const dict = useDictLoader()
  return (
    <HashRouter>
      <Routes>
        <Route element={<WithTabs />}>
          <Route path="/" element={<Today dict={dict} />} />
          <Route path="/cards" element={<Placeholder title="卡片" />} />
          <Route path="/settings" element={<Placeholder title="设置" />} />
        </Route>
        <Route path="/review" element={<Placeholder title="复习" />} />
        <Route path="/inbox" element={<Placeholder title="收集箱" />} />
        <Route path="/note/new" element={<Placeholder title="新卡片" />} />
        <Route path="/spike/audio" element={<AudioSpike />} />
        <Route path="/spike/tts" element={<TtsSpike />} />
        <Route path="*" element={<Placeholder title="未找到" />} />
      </Routes>
      <UpdatePrompt />
    </HashRouter>
  )
}
```

- [ ] **Step 6: 运行测试、构建，本地手动检查**

Run: `pnpm test && pnpm build && pnpm preview --host`
Expected: 测试全通过；在 Mac 浏览器打开 `http://localhost:4173/mnemo/`：
- 顶部出现黄色"这不是正式地址"提示条（本地没有设置 `VITE_PRODUCTION_ORIGIN`）
- 词典加载进度 → "词典已就绪：N 条，用时 X ms"（这个数字就是 Spike 3 的 Mac 参考值）
- 待复习 0 / 新卡 0，按钮置灰
- 底部 tab bar 三项可切换，`/cards` `/settings` 显示占位

- [ ] **Step 7: 提交**

```bash
git add src
git commit -m "feat: app shell with tab bar, origin banner, dictionary bootstrap and Today screen"
```

- [ ] **Step 8: 人工交接（作者操作）**

推送到 `main`，等 Pages 发布后在 iPhone 上：添加到主屏幕 → 打开 → 记录今日页显示的词典加载耗时到 `docs/superpowers/spikes/2026-10-30-spike-results.md` 的 Spike 3 一栏；顺手跑 Spike 1、2。

---

## 自检记录（写计划时完成）

**规范覆盖（本计划负责的部分）**

| 规范条目 | 任务 |
|---|---|
| 5.1 领域模型、索引 | Task 5 |
| 5.2 卡型前提、生成/删除、同日埋卡、删除级联 | Task 8, 10 |
| 5.3 ts-fsrs 参数、四档预览、撤销、04:00 边界、到期判定、队列顺序、新卡上限、再学 10 张 | Task 6, 7, 9, 10 |
| 5.4 查重、词典自动补全（查询部分）、挖空识别/点词 | Task 10, 11, 13 |
| 5.5 拆行与启发式 | Task 14 |
| 5.7 运行时缓存配置、spike | Task 3, 4 |
| 5.8 词典子集构建、灌库、变形查询、署名 | Task 2 (README), 12, 13 |
| 5.9 备份文件格式、覆盖式恢复、`lastBackupAt`、7 天提醒 | Task 15, 16 |
| 5.10 PWA、iOS meta、GitHub Pages、子路径、共享 origin、非生产提示、更新提示 | Task 1, 2, 3, 16 |
| 5.11 今日页、tab bar | Task 16 |
| 5.12 设计 token | Task 1 |
| 5.14 单元测试清单 | Task 6–15 |
| 7 spike | Task 4, 16 |

**留给 Plan 2（界面）**：5.4 建卡表单 UI、5.5 收集箱 UI、5.6 复习界面与歇脚页/完成页、5.7 `audio.ts`（按 spike 结论选 A/B）、5.9 分享面板/文件选择 UI、5.11 卡片列表与设置页、验收清单全部真机项。

**类型一致性**：`Scheduler` 接口（Task 7）被 Task 10 以 `sched` 参数消费；`QueueParts` 由 Task 9 定义、Task 10 `getTodayParts` 返回；`PendingLog` 在 Task 7 定义、Task 10 `gradeCard` 补齐 `id` 与 `buriedSiblingIds` 成 `ReviewLog`；`createTestDb` 在 Task 5 Step 6 落到 `src/test/db.ts`，Task 10/13/15 从那里导入。
