# 云端采集（Cloud Capture）设计决定

日期：2026-11-13 · 状态：**已实施（客户端 + Worker）**；待作者真机验收。原型存档在分支 `prototype/cloud-inbox`。本文只记录已确认的决策与实现事实。

## 要解决的问题

从遇到生词到进入 Mnemo 的路径太长：

- Vocably 能从网页摘词，但内置词典、不能自定义释义与例句，且要手动导出文件再导入；
- iOS 非 Safari App（无分享选中文字的入口之外的场景）完全没有采集方式。

## 方案总览

```text
Mac 任意 App ─── 选中文字 → 快捷键(Shortcuts 快速操作) ─┐
iPhone Safari ── 分享/复制 → 快捷指令 ────────────────┼→ Cloudflare Worker + D1
iPhone 其他 App ─ 分享/复制 → 快捷指令 ────────────────┘      ├ /lookup 词典查询（29k ECDICT 子集）
                                                             └ /inbox  收集（带 token）
Mnemo（打开/回到前台联网时自动拉取 + 收集箱手动刷新） ← 写入本地成功才从云端删除
```

云端只存**未送达的待收录内容**；复习数据、词库、进度仍全在本地 IndexedDB，备份流程不变。

## 实施现状（2026-11-13）

| 模块 | 位置 | 状态 |
|---|---|---|
| 拉取与分流 | `src/cloud/pull.ts` | ✅ 8 条测试：分流、自动挖空、幂等、401/网络错、删云端失败不回滚、lastCloudPullAt、脏条目 |
| Worker | `worker/index.ts` | ✅ 6 条测试：认证、lookup 含变形反查、inbox 读写、字段截断、空内容拒收 |
| D1 适配器 | `worker/d1.ts` + `worker/schema.sql` | 已写，未真实连接过 D1 |
| 自动拉取 | `src/app/useCloudPull.ts` | ✅ 挂载/回前台/回在线，60 秒内不重复联网，失败静默 |
| 设置页 | `src/screens/Settings.tsx` 云端收集分组 | ✅ 3 条测试：保存、单边清空报错、非 http(s) 拒收 |
| 收集箱 B 变体 | `src/screens/Inbox.tsx` | ✅ 3 条测试：未配置态、分组+手动同步、401 出口 |
| 词典导入 | `scripts/sync-dict.ts` | ✅ 4 条测试：转义、空变形、分批 |
| 部署 | `.github/workflows/worker.yml` | 已写，未跑过（待填 D1 database_id 与三个 secret） |

实施时对原计划的两处调整：

1. **设置保存语义**：不是"填完即生效"，而是显式点「保存云端收集」；单边清空报错（`令牌不能为空`），两边都清空才等于关闭——避免误清掉配置。
2. **自动拉取节流**：60 秒内不重复联网（回前台很频繁）；`online` 事件强制拉一次。

## 待作者验收（真机）

- iOS 快捷指令：`GET {地址}/lookup?word=…` 与 `POST {地址}/inbox`，看释义弹窗与手输释义的实际顺手程度；
- 常用网络访问 Worker 的连通性；
- Mac Shortcuts 快速操作在 Safari/Books/PDF 取选中文字；
- PWA 冷启动/后台恢复时自动拉取是否可靠；
- D1 实际导入 29k 条词典后的 `/lookup` 延迟。

## 已确认的决策

| 主题 | 决策 |
|---|---|
| 场景 | Mac 网页、iPhone 网页、iPhone 任意 App 三者统一；**不做截图识字**，无法选字就手动输入 |
| 云端 | Cloudflare Workers + D1（个人用量落在免费额度内），不碰 NAS、不暴露公网 IP |
| 查词 | **查词优先**：快捷指令里先看词典释义，确认值得记再收藏；释义为词典义项（可当场修改），不接 AI |
| 词典源 | 同一份 ECDICT 子集（`public/dict/ecdict.*.json`，29,008 条 / 4.2 MB）导入 D1，复用 `src/lib/dict.ts` 变形匹配；收藏时与复习时看到的释义是同一份 |
| 交互 | 快捷指令内完成查词与收藏；复杂编辑回 Mnemo |
| 原句 | 可选：能带上就带，带不上不阻断（只复制一个词拿不到它所在的原句） |
| 词典 miss | 弹「未收录」仍可收藏：可当场手敲释义，或留空降级为草稿 |
| 认证 | 长随机静态 token（快捷指令 URL 与 Mnemo 设置各存一份，泄露即换）；仓库公开，token 不得提交 |
| 拉取 | 打开/回到 Mnemo 联网时自动拉 + 收集箱手动刷新；**写入本地成功才删云端**；断网重拉由现有草稿去重（按 `raw` 忽略大小写）兜底 |
| 落库分流 | 单词+已确认释义 → **直接建卡**（卡型沿用上次勾选，重复词跳过）；无释义单词 → 收集箱等补释义；整句 → 收集箱点词定词头。现有 `Draft` 模型无需扩展 |
| Mac 入口 | Shortcuts 快速操作 + 全局快捷键，与 iOS 共用同一 Worker 接口 |
| Mnemo 配置 | 设置页新增「云端收集」区块：粘贴 Worker 地址 + token 一次即启用（按既有设置分组样式，未做变体对比） |

## 收集箱 UI：原型结论（2026-11-13）

**问题**：云端同步状态、拉取动作、云端来源草稿在收集箱怎么呈现？

**变体**（完整代码与场景模拟存档在分支 `prototype/cloud-inbox`，一次性存档、勿合并）：

- A 状态行——同步是页面里的一行事实，草稿单列混排，来源只作小字前缀；
- **B 同步卡（胜出）**——云端是一等公民；
- C 无痕——无常驻状态 UI，只有 toast 与失败提醒条。

**B 的构成**（实施时按此折进正式代码，需重写而非照搬原型代码）：

- 顶部一张专属同步卡（`rounded-(--radius-card) bg-panel p-3.5`）：标题「云端收集」+ 连接态/域名（`已连接 · errax.workers.dev`，失败 `again-fg`「连接失败」）、上次同步与收货摘要（`上次同步 14:32 · 刚收了 5 条，3 个词已直接建卡`）、`立即同步` 按钮（**secondary 变体**——同步不是本页主操作）；
- 失败态：卡内嵌提醒纸便签（`notice-bg/line/fg`）说明原因与去向（`到 设置 → 云端收集 更新令牌`），并给出「上次成功时间 · 云端还有 N 条没收进来」——数据在等你要看得见；
- 同步中/离线：按钮禁用（`同步中…`），不给持久错误视觉；
- 草稿列表分两组：`来自云端 · N`（在前，沿用现行行视觉与徽标）与 `本机粘贴 · N`；云端组**不再**逐行标来源（分组已表达）。

## 实施要点（给施工方）

- Worker 放本仓库 `worker/`，D1 两张表：`dict`（word/phonetic/translation/forms，29k 行）+ `inbox`（word/meaning/sentence/kind/createdAt）；
- 部署：GitHub Actions + wrangler（与现有 Pages deploy 并行两个 workflow），token 走 secret；改 `.github/workflows/**` 推送需用 gh 凭据绕法（见交接文档）；
- `build:dict` 产出后加 `sync-dict` 脚本把 JSON 导入 D1；词典版本 hash 沿用 `Settings.dictVersion` 同款机制；
- Mnemo 侧复用 `addDrafts` / `importNotes` / `createNote`，新增：设置字段、拉取函数、分流落库、收集箱同步卡与分组；
- 测试照 Vitest + fake-indexeddb 模式：分流规则、词典 miss 降级、拉取-写入-删除时序、token 缺失/失效报错。

## 真机验证清单（作者本人执行）

1. iOS 快捷指令：分享菜单触发 + 释义弹窗 + 手输释义的实际顺手程度；
2. 常用网络下访问 Cloudflare Worker 的连通性与延迟；
3. Mac Shortcuts 快速操作在 Safari/Books/PDF 阅读器里获取选中文字；
4. PWA 从后台恢复/冷启动时自动拉取的可靠性。

## 明确不做

- 双向同步、云端历史、云端内容预览；
- 截图识字、AI 语境释义；
- 浏览器扩展/油猴（自动带原句）——留作后续增强，接口不变即可插入。
