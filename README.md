# Mnemo

自用的英语记忆卡片 PWA（Anki 式间隔重复，FSRS 排期）。手机优先，离线可用。

设计文档：`docs/superpowers/specs/2026-10-30-mnemo-design.md`
Mockup：`docs/mockups/mnemo-mockups.html`

## 地址就是数据的身份证

数据存在浏览器 IndexedDB，按 origin 隔离。生产地址是
`https://errax.github.io/mnemo/`。

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
