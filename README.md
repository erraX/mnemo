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

## 功能

- 建卡：输入单词或短语，自动补音标和中文释义（ECDICT）；粘原句自动挖空，点词可改；一条记录可生成「中→英」「例句挖空」「英→中」三种卡
- 复习：FSRS 排期（ts-fsrs），四档打分带预计间隔，撤销，翻面自动朗读；每 20 张一个歇脚页
- 收集笱：多行粘贴 → 草稿 → 逐条建卡；整句草稿点词选要记的词
- 发音：有道在线 TTS + Service Worker 离线缓存，失败降级系统 TTS
- 备份：导出 JSON 到系统分享面板（存 iCloud Drive），从文件恢复
- 离线：PWA，加到主屏后无网可用

## 已知限制

- 有道发音是非官方接口，随时可能失效（会自动降级系统 TTS）
- 数据只在当前地址的浏览器里；换设备靠备份文件
- 没有多设备同步、牌组、统计

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
