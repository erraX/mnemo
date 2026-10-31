# Mnemo — 英语记忆卡片 PWA 设计文档

日期：2026-10-30
状态：待批准
范围：MVP
名字：**Mnemo**（取自 mnemonic）。仓库名 `mnemo`，主屏图标名 "Mnemo"。

---

## 1. 意图

一个自用的、Anki 式的间隔重复卡片应用，MVP 用来背英语单词、固定搭配和短句。长远可以记任何东西，但 MVP 只服务英语。

做成 PWA 而不是原生 app，因为作者没有 iOS 付费开发者账号，自签名 app 每 7 天要重装。PWA 加到 iOS 主屏幕后可以离线使用、常驻，不受这个限制。

**成功的样子**：作者能在手机上每天加卡、离线复习，一周后数据还在。能先用起来比功能全重要。

## 2. 目标 / 非目标 / 反目标

### 目标

- 手机优先（iPhone，Safari 主屏 PWA），离线可用
- 建卡快：输入词/短语，音标和中文释义自动补全；原文例句粘进去就能挖空
- 一条记录可生成多张卡（中→英、例句挖空、英→中），建卡时多选
- FSRS 排期（ts-fsrs）
- 发音：单词和短语都能播
- 数据不丢：一键备份到 iCloud Drive（经系统分享面板）、可恢复
- 简洁、好看、iOS 系统感

### 非目标（MVP 不做，但数据结构为其留路）

- 多设备同步 / 服务器
- 牌组（deck）
- LLM 补全释义和例句
- 真人发音源（Merriam-Webster、Forvo 等）
- Anki `.apkg` / 通用 TSV 导入导出（后续新增 Vocably CSV/TSV 专用追加导入，见 `2026-10-31-vocabulary-import-design.md`）
- 统计图表
- 推送提醒
- 桌面端布局优化
- 界面多语言（UI 固定中文）

### 反目标（做出来也算失败）

- 为了"以后可能用到"把 MVP 做重（Ionic、同步引擎、SQLite-wasm 等）
- 建卡要填一堆字段才能保存
- 换个部署地址数据就没了却没有提醒用户

## 3. 约束

- 技术栈：React + Vite + TypeScript，PWA，无 SSR（作者指定）
- 运行环境：iOS Safari 主屏 PWA 为第一目标；Mac 浏览器能用即可
- 没有后端。所有数据在设备本地（IndexedDB + Cache Storage）
- Service Worker 只在 HTTPS 下工作，所以必须有 HTTPS 的固定部署地址
- IndexedDB 按 origin 隔离：**部署地址一旦开始攒卡就不能换**（GitHub Pages 下具体指：不换 GitHub 用户名、不绑自定义域名；仓库改名只改路径，数据不丢）
- GitHub 免费账号发 Pages 要求仓库公开；因此仓库里不能有任何密钥或个人数据（本来也没有）
- 词典数据只能用可再分发的开源数据（ECDICT，MIT）
- 发音依赖的有道接口是非官方的，随时可能失效，必须有降级

## 4. 方案比较

| 方案 | 要点 | 取舍 | 结论 |
|---|---|---|---|
| **一：Dexie + ts-fsrs + Vite PWA** | IndexedDB（Dexie 封装）存数据，ECDICT 子集灌进 IndexedDB，vite-plugin-pwa 做离线，Tailwind 自写组件 | 最薄、最快能用。查询能力只有 IndexedDB 索引，几千张卡的规模够用。以后加同步可升级 Dexie Cloud 或自推 JSON 到 GitHub | **选定** |
| 二：浏览器内 SQLite（sqlite-wasm + OPFS） | 数据存真 SQLite 文件，词典可全文索引，备份即导出 `.sqlite`，以后 Anki 互转顺手 | 多 1 MB wasm；OPFS 需 Worker + COOP/COEP 头，管道代码多；iOS 上 OPFS 细节坑多。对 MVP 过度设计 | 放弃 |
| 三：一开始上同步引擎（Dexie Cloud / PowerSync） | 同步白送 | 要登录、依赖第三方服务，和"MVP 不要服务器"相悖 | 放弃，方案一的数据结构为它留路 |

**部署**：GitHub Pages（公开仓库，GitHub Actions 构建，免费 HTTPS，Mac 不用常开）。选它而不是 Cloudflare Pages 的原因：少一个账号；且 origin 是 `<用户名>.github.io`、仓库名只在路径里，以后改仓库名数据不丢。代价是仓库必须公开、不能设自定义响应头（方案一用不上）。局域网 HTTPS（mkcert）和 Tailscale 都可行但每次更新要 Mac 在线，放弃。

## 5. 已定的设计

### 5.1 领域模型

术语：

- **记录（Note）**：一个词 / 短语 / 短句及其释义、例句。用户编辑的对象。
- **卡片（Card）**：从记录按**卡型**生成的、独立排期的复习单元。用户复习的对象。
- **卡型（CardType）**：`zh2en`（中→英）、`cloze`（例句挖空）、`en2zh`（英→中）。
- **例句（Example）**：原文句子 + 可选来源 + 挖空位置。
- **草稿（Draft）**：收集箱里还没变成记录的一行文本。
- **复习日志（ReviewLog）**：每次打分追加一条，永不修改（撤销 = 删除最后一条并回滚卡片状态）。

Dexie 表（字段名供参考，实现者可微调；所有 id 用 `crypto.randomUUID()`，时间用 epoch ms）：

```ts
interface Note {
  id: string;
  headword: string;          // 单词 / 短语 / 短句
  phonetic?: string;         // 音标，可为空（短语通常为空）
  meaning: string;           // 多行文本，词典原样填入，可编辑
  examples: Example[];       // 可为空；cloze 卡用第一条带挖空的例句
  tags: string[];
  enabledTypes: CardType[];  // 当前勾选的卡型
  createdAt: number;
  updatedAt: number;
}

interface Example {
  text: string;
  source?: string;           // 文章名 / 剧名 / URL，自由文本
  blanks: Array<{ start: number; end: number }>;  // 字符偏移，可多个
}

interface Card {
  id: string;
  noteId: string;
  type: CardType;
  // 以下为 ts-fsrs Card 字段原样持久化
  due: number; stability: number; difficulty: number;
  elapsed_days: number; scheduled_days: number;
  reps: number; lapses: number; state: 0 | 1 | 2 | 3;  // New/Learning/Review/Relearning
  learning_steps: number;    // ts-fsrs 5.x 字段，原样保存
  last_review?: number;
  buriedUntil?: number;      // 同记录其他卡当天被埋到的时刻（学习日边界）
  createdAt: number;
}

interface ReviewLog {
  id: string;
  cardId: string;
  noteId: string;
  rating: 1 | 2 | 3 | 4;     // Again/Hard/Good/Easy
  reviewedAt: number;
  // ts-fsrs ReviewLog 其余字段原样持久化，用于 rollback 与将来参数优化
  state: number; due: number; stability: number; difficulty: number;
  elapsed_days: number; last_elapsed_days: number; scheduled_days: number;
  learning_steps: number;
  buriedSiblingIds: string[]; // 这次打分埋掉的同记录卡片 id，撤销时解除
  prevDue?: number;          // 打分前的 due，用于精确撤销（ts-fsrs 的 rollback 对非 New 状态会把 due 设成复习时刻）
}

interface Draft {
  id: string;
  raw: string;               // 粘贴进来的原始一行
  kind: 'headword' | 'sentence';
  createdAt: number;
}

interface DictEntry {        // ECDICT 子集
  word: string;              // 主键，小写
  phonetic: string;
  translation: string;       // 中文释义，多行，形如 "n. 担忧, 顾虑\nv. 涉及"
  pos?: string;
  tag?: string;              // "cet4 cet6 ky toefl ielts gre" 之类
  frq?: number;
  forms: string[];           // 由 exchange 展开的变形，multiEntry 索引，用于 concerns → concern
}

interface Settings {         // 单例
  newCardsPerDay: number;    // 默认 20
  accent: 'us' | 'uk';       // 默认 us
  autoPlayOnReveal: boolean; // 默认 true
  lastEnabledTypes: CardType[];
  lastBackupAt?: number;
  dictVersion?: string;
}
```

索引：`cards` 按 `due`、`state`、`noteId`；`review_logs` 按 `reviewedAt`、`cardId`；`dict` 主键 `word` + multiEntry `*forms`；`notes` 按 `headword`（小写副本）用于查重和搜索。

### 5.2 卡型规则

| 卡型 | 正面 | 背面 | 生成前提 |
|---|---|---|---|
| `zh2en` | 释义全文（多行）+ "说出英文"提示 | 完整记录 | `meaning` 非空 |
| `cloze` | 第一条带挖空的例句，挖空处显示下划线空格；来源小字 | 完整记录 | 至少一条例句有挖空 |
| `en2zh` | `headword` + 音标 + 发音按钮 | 完整记录 | 总是可以 |

"完整记录" = headword、音标 + 发音按钮、释义、全部例句（目标词高亮而不是挖空）、来源、标签。

- 建卡时卡型 chip 多选，默认勾选 = 上一次保存时的勾选（`lastEnabledTypes`）。前提不满足的 chip 置灰并说明原因（"先给例句挖一个空"）。
- 保存时为每个勾选卡型生成一张 `state = New`、`due = now` 的卡。
- 编辑记录时勾上新卡型 → 新生成一张卡；取消勾选 → 删除该卡及其复习日志，需二次确认。
- 同一记录的多张卡**同一学习日只出一张**，两层保证：(1) 队列构建时按记录去重——学习中 → 到期复习 → 新卡的优先顺序下，同一记录只保留第一张进入今日队列（新卡上限因此实际按记录计数）；(2) 某张卡**被打分时**（新卡也是在第一次打分时），同记录其他卡的 `buriedUntil` 设为下一个学习日边界。被埋的卡不改 `due`，第二天照常出现。撤销该次打分时同步清除这次设置的埋卡。
- 编辑记录导致已有卡型的前提失效（删掉了所有挖空、清空了释义）：视同取消勾选该卡型，走同样的二次确认删除流程；用户取消则阻止保存。
- 删除记录 → 级联删除卡片和日志。

### 5.3 排期（ts-fsrs）

- 依赖 `ts-fsrs` **5.4.x**（当前 stable；v6 处于 beta，API 大改）。所有对 ts-fsrs 的调用收口在 `src/lib/scheduler.ts` 一个模块里，方便以后升级 v6。
- 参数：`generatorParameters({ enable_fuzz: true, learning_steps: ['1m', '10m'], relearning_steps: ['10m'] })`，其余默认（`request_retention` 0.9）。
- 打分四档 Again / Hard / Good / Easy，界面文案"忘了 / 困难 / 记得 / 简单"，每个按钮下方显示预计间隔（用 `repeat()` 预览四个结果；格式：<1 小时显示"N 分钟"，<1 天"N 小时"，否则"N 天"，≥ 60 天"N 个月"）。
- 撤销：复习界面提供"撤销上一步"，用 ts-fsrs `rollback(card, log)` 恢复卡片状态并删除该条日志。MVP 只需支持撤销最近一次；会话内多级撤销由实现者决定。
- **学习日边界：本地时间 04:00**（Anki 惯例，照顾熬夜）。"今天"的新卡计数、埋卡到期都按这个边界。
- **到期的判定（跟 Anki 一致）**：Learning / Relearning 卡按精确时间戳 `due <= now`；Review 卡按学习日，`due < 下一个 04:00 边界` 即算今日待复习（昨晚 23:00 打分、间隔 1 天的卡，今天早上 8 点就会出现）。首页"待复习 N"同理。
- 今日队列的构成与顺序：
  1. 到期的 Learning / Relearning 卡（按 `due` 升序）
  2. 今日到期的 Review 卡（按 `due` 升序）
  3. New 卡，数量 = `newCardsPerDay` − 今日已出现过的新卡数（从日志统计），按 `createdAt` 升序
  - 排除 `buriedUntil > now` 的卡
  - 学习步骤中的卡到期后要能在同一会话里回到队首（Learning 卡 1 分钟后再出），实现者决定刷新策略
- 今日清空后显示完成页，提供"再学 10 张新卡"按钮（突破当日上限，不占用明天的额度）。

### 5.4 建卡

入口：首页的 "+" 按钮，以及收集箱草稿点开。表单为全屏 sheet。

字段与行为：

1. **单词 / 短语**（必填）。输入停顿 300 ms 后查本地词典：先按小写精确匹配 `word`，再按 `forms` 匹配变形（输入 `concerns` 命中 `concern`，并把 headword 建议改为原形，用户可拒绝）。命中则自动填音标和释义，标记"已从词典补全"；未命中标记"词典没有，手动填写"。短语先按整体查（ECDICT 含部分短语），未命中不拆词。
2. **查重**：headword（忽略大小写、首尾空白）已存在时提示并给出跳转到已有记录的入口，不阻止保存。
3. **音标**：自动填，可编辑。
4. **释义**：自动填（词典原样、多行），可编辑。这是用户选定的"照单全收"策略，不做义项点选。
5. **例句**：多条，每条有文本 + 来源。文本粘入或编辑后自动识别挖空：按 token 匹配 headword 及其变形（来自 `forms`），忽略大小写；多词 headword 按词序逐词匹配，每个词允许变形。识别结果高亮；**点击任意 token 切换是否挖空**，可多处。例句文本改动后重新识别，保留用户手动改过的 token（实现者决定具体合并策略，或简单重算也可接受）。
6. **来源**：自由文本，可空。
7. **标签**：可空，输入时提示已有标签。（实现：标签字段下显示最多 8 个已有标签供点选）
8. **卡型 chip**：见 5.2。
9. **保存**按钮文案带数量："保存 · 生成 3 张卡"。

音标和释义自动填后不覆盖用户已手动改过的内容。

### 5.5 收集箱

解决"遇到词的时候手边不是这个应用"：Mac 上复制（通用剪贴板直达 iPhone）或先记备忘录，回到手机批量粘。

- 一个多行文本框 + "粘贴"按钮（`navigator.clipboard.readText()`，失败则让用户手动粘贴）。
- 提交后按行拆分，去空行、trim、去重，每行一条草稿。启发式：≥ 4 个词或以句号/问号/感叹号结尾 → `sentence`，否则 `headword`。
- 草稿列表每条显示状态：`headword` 类在后台查词典，显示"词典已补全 · 缺例句"或"词典没有 · 需要自己写释义"；`sentence` 类显示"点一个词作为要记的词"。
- 点开草稿 → 进入建卡表单：`headword` 类预填 headword；`sentence` 类预填例句，用户在句子里点一个词设为 headword（点选单个词；短语请手动输入），随即触发词典查询。保存后草稿删除。
- 草稿用行尾「✕」按钮删除（二次确认），不做左滑手势。首页显示收集箱待处理数量。
- iOS Safari 不支持 Web Share Target，所以没有"分享到本应用"入口；明确不做。

### 5.6 复习界面

- 全屏，隐藏 tab bar。顶部：剩余数量、关闭、更多（撤销、编辑当前记录）。
- 正面：按卡型渲染（5.2）。点击"看答案"或卡片任意位置翻面。
- 背面：完整记录 + 底部四个打分按钮（带预计间隔），按钮区在拇指可达范围、高度 ≥ 44 pt。
- 发音：背面出现时若 `autoPlayOnReveal` 自动播放 headword（翻面是用户手势，iOS 允许）；`en2zh` 正面不自动播，但有发音按钮。任何时候点发音按钮都可重播。
- 编辑当前记录：打开建卡表单（编辑模式），保存后用新内容重渲染当前卡，不改排期。
- **歇脚页**：每打分 20 张插入一页"已复习 20 张，还剩 N 张"，按钮"继续" / "今天到这"。不改排期，只是给自然停顿点。每次打分都立即落库，任何时候关掉应用都不丢进度。
- 复习量不在复习时选：新卡上限在设置里，到期复习不设上限（跟 Anki/FSRS 的建议一致，设上限只是把卡推到明天）。
- 会话结束页：今日完成数、"再学 10 张新卡"、返回首页。

### 5.7 发音

两级：

1. **有道 TTS**：`https://dict.youdao.com/dictvoice?audio=<encodeURIComponent(text)>&type=<1=英音 | 2=美音>`，用 `<audio>` 播放。单词、短语、整句都可用。
2. **系统 TTS 降级**：`speechSynthesis`，按 `accent` 选 `en-US` / `en-GB` 语音；`speak` 前先 `cancel()`；首次必须由用户手势触发。有道请求失败、离线且无缓存、或超时 3 秒即降级。

**离线缓存方案 A（默认）**：Service Worker 对 `dict.youdao.com/dictvoice` 做 `CacheFirst` 运行时缓存，`cacheableResponse.statuses: [0, 200]`（允许不透明响应），`maxEntries` 2000。保存记录时用 `fetch(url, { mode: 'no-cors' })` 预热缓存，这样复习时离线也有声。

**已知风险**：iOS Safari 播放 `<audio>` 时会发 Range 请求，而不透明响应无法被 Service Worker 切片返回 206，可能导致离线时播放失败。这是**第一个 spike**（见第 7 节）。若验证失败，切换到：

**方案 B**：一个 Cloudflare Worker 反代有道并加 CORS 头（十几行、无状态、免费额度内）；前端 `fetch` 到 Blob 存进 IndexedDB 一张 `audio` 表，播放用 `URL.createObjectURL`。此方案在 iOS 上确定可行，代价是多一个部署单元。

无论 A/B，发音文本 = `headword`；有道按口音生成，切换口音后旧缓存失效、重新获取。

口音切换后后台对全部记录重新预热；应用启动时在线、以及回到在线状态时，补预热最近 7 天改动过的记录。

### 5.8 词典（ECDICT 子集）

- 来源：[skywind3000/ECDICT](https://github.com/skywind3000/ECDICT)，MIT。设置页"关于"里署名。
- 构建脚本 `scripts/build-dict.ts`（Node，构建时或手动运行，产物提交到仓库）：
  - 读取 `ecdict.csv`（约 63 MB，不入库，脚本按需下载到 `.cache/`）
  - 筛选：`tag` 非空（zk/gk/cet4/cet6/ky/toefl/ielts/gre 任一）**或** `frq` 在 1–30000 之间。预计 4–6 万条。
  - 保留字段：word、phonetic、translation、pos、tag、frq、exchange（解析成 `forms`：取 `p/d/i/3/s/r/t` 各形式）
  - 输出 `public/dict/ecdict.<contenthash>.json`（未压缩约 8 MB 以内，CDN 传输时自动压缩），并把版本号写进 `src/generated/dict-version.ts`
- 运行时：首次启动（或 `dictVersion` 变化）时下载/从预缓存读取 JSON，`bulkPut` 进 `dict` 表，带进度提示。词典 JSON 列入 Service Worker 预缓存（提高 `maximumFileSizeToCacheInBytes`）。
- 查询：精确 `word` → `forms` multiEntry → 未命中。

### 5.9 备份与恢复

- **导出**：生成 JSON `{ app: 'mnemo', version: 1, exportedAt, notes, cards, reviewLogs, drafts, settings }`（`app` 字段用于识别本应用的备份），文件名 `mnemo-backup-YYYYMMDD-HHmm.json`。优先 `navigator.share({ files })`（iOS 15+，可直接"存储到文件"→ iCloud Drive），不支持则退化为下载链接。
- **恢复**：`<input type="file" accept=".json">`，校验 `version`，弹出确认"将覆盖当前全部数据"，清空各表后 `bulkAdd`。**MVP 只做整体覆盖，不做合并。**
- `exportBackup` 只读；`lastBackupAt` 在分享成功后（`navigator.share` resolve 或下载触发后）由 `markBackedUp` 写入，取消分享不算备份。首页在距上次备份超过 7 天时显示温和提醒条；从未备份过且已有记录时也显示（“还没有备份过”）。
- 不备份音频缓存（可重新获取）和词典（可重新灌入）。

### 5.10 PWA、离线、部署

- `vite-plugin-pwa` 2.x，`generateSW` 模式，`registerType: 'prompt'`：有新版本时显示"有更新，点击刷新"，**不**在复习中途自动刷新。
- 预缓存：应用壳 + 词典 JSON + 字体（如有）。运行时缓存：有道音频（5.7）。
- manifest：`display: standalone`、`name`/`short_name`、`theme_color`、`background_color`、192/512 图标；`<link rel="apple-touch-icon">` 180；`<meta name="viewport" content="... viewport-fit=cover">`；`apple-mobile-web-app-status-bar-style`。
- iOS 适配清单：safe-area insets（`env(safe-area-inset-*)`）、用 `100dvh` 不用 `100vh`、所有输入框字号 ≥ 16px 防止聚焦缩放、`touch-action: manipulation` 防双击缩放、`overscroll-behavior: none` 防橡皮筋、底部按钮避开 home indicator。
- 部署：GitHub Pages。公开仓库 `mnemo`，`.github/workflows/deploy.yml` 在 `main` 推送时用 `actions/upload-pages-artifact` + `actions/deploy-pages` 发布 `dist/`。GitHub 仓库创建与 Pages 开启（Source = GitHub Actions）由作者完成。
- 生产地址：`https://errax.github.io/mnemo/`（GitHub 用户 erraX，Pages 主机名小写）。**生产地址是数据的身份证**，README 里写明：不换用户名、不绑自定义域名；非要换时先导出再导入。
- 子路径配置：Vite `base: '/mnemo/'`；manifest `scope` 和 `start_url` 都是 `/mnemo/`；Service Worker 注册在 `/mnemo/` 作用域下；路由用相应 basename。
- 共享 origin：`<用户名>.github.io` 下所有 Pages 项目共用 IndexedDB / Cache Storage 命名空间。Dexie 数据库名固定为 `mnemo`，Cache 名前缀 `mnemo-`，避免和作者其他项目撞名。
- 非生产地址提示：构建时注入 `VITE_PRODUCTION_ORIGIN`（即 `https://errax.github.io`）；运行时 `location.origin` 不一致（本地开发、预览）就在首页顶部常驻一条"这不是正式地址，这里的数据不会保留"的提示条。
- GitHub Pages 对所有文件设 `Cache-Control: max-age=600`：Vite 产物带 hash 不受影响；`sw.js` 最多延迟 10 分钟发现新版，可接受。
- 本地开发：`vite --host` 在 Mac 浏览器或手机上看效果，但 `http://192.168.x.x` 下没有 Service Worker，那里的数据视为一次性。

### 5.11 屏幕与导航

底部 tab bar 三项：**今日**、**卡片**、**设置**。建卡是今日页的悬浮 "+"，收集箱从今日页进入。

| 屏幕 | 内容 |
|---|---|
| 今日 | 待复习 N、新卡 M、"开始复习"大按钮；收集箱入口（带待处理数）；备份提醒条（条件显示）；"+" 建卡 |
| 复习 | 5.6 |
| 建卡 / 编辑 | 5.4，全屏 sheet |
| 收集箱 | 5.5 |
| 卡片 | 记录列表（按更新时间倒序），顶部搜索（匹配 headword / 释义 / 例句），点开编辑；删除在编辑页底部；每条显示 headword、释义首行、已启用卡型小图标、下次到期 |
| 设置 | 每日新卡上限、口音、翻面自动朗读、导入词库、备份 / 恢复、关于（版本、ECDICT 署名、ts-fsrs 署名） |
| 导入词库 | 独立页面，设置进入；识别 Vocably CSV/TSV → 预览 → 确认追加；已有词跳过，不改旧排期。规则见 `2026-10-31-vocabulary-import-design.md` |

### 5.12 视觉

- iOS 系统感：系统字体栈（`-apple-system, PingFang SC`），大量留白，圆角 12–16，卡片式分组，单一强调色（蓝 `#0071e3` 系），跟随系统深色模式（`prefers-color-scheme`）。
- 复习正面文字大（单词 30px+，句子 19px），信息克制；背面信息密度可以高一点。
- 四个打分按钮用低饱和底色区分（红/橙/绿/蓝），不用纯色大块。
- 动效仅限翻面和页面切换，不做花哨动画。
- Mockup 与设计规范（颜色、字号、圆角、组件）：`docs/mockups/mnemo-mockups.html`，自包含，浏览器直接打开。包含复习三种正面与背面、建卡表单（词典命中 / 未命中）、收集箱、今日、卡片列表、设置、歇脚页、完成页、深色模式。

### 5.13 技术栈与项目结构

- pnpm；React 19；Vite 8；TypeScript strict；Tailwind CSS 4；Dexie 4 + dexie-react-hooks；ts-fsrs 5.4.x；vite-plugin-pwa 2.x
- 路由：react-router 7（或 wouter，实现者定）
- 状态：Dexie `useLiveQuery` 为主；复习会话用一个轻量 store（Zustand 或 useReducer，实现者定）
- 测试：Vitest + fake-indexeddb；组件测试可选；iOS 真机手动清单（5.10 + 第 8 节）
- 建议目录：

```
src/
  app/            路由与 tab 布局
  screens/        today, review, note-editor, inbox, cards, settings
  components/     通用 UI
  db/             Dexie schema、迁移、repository 函数
  lib/            scheduler.ts(ts-fsrs 收口) cloze.ts dict.ts audio.ts backup.ts day.ts
  generated/      dict-version.ts
scripts/
  build-dict.ts
public/
  dict/           ecdict.<hash>.json
```

### 5.14 测试重点

单元测试必须覆盖（纯函数，易测）：

- `scheduler`：今日队列构成与顺序、每日新卡上限按 04:00 边界统计、同记录埋卡、四档预览间隔格式化、rollback 撤销
- `cloze`：自动识别（含变形、多词 headword、大小写）、token 切换、编辑后重算
- `dict`：精确 / 变形查询、`exchange` 解析
- `backup`：导出 → 导入往返一致
- 收集箱拆行与 `headword`/`sentence` 启发式

## 6. 留给实现者的

- 例句挖空的内部表示（字符偏移 vs token 索引）与编辑后合并策略
- 复习会话内 Learning 卡再次到期的刷新策略
- 多级撤销
- 路由 / 状态库的具体选择
- 列表的虚拟滚动（几千条内可以不做）
- 词典 JSON 是否分片加载
- 组件层面的所有细节（间距、字号、过渡）
- 错误与空状态文案

## 7. 先做的 spike（各 ≤ 半天，结果决定上面的分支）

真机只有作者有：spike 和所有 iOS 验收由实现者准备好可部署的最小页面、作者在 iPhone 上跑并回报结果。为了不让 spike 1 卡住主线，`audio.ts` 从一开始就按可插拔接口写（`prefetch(text, accent)` / `play(text, accent)`），方案 A/B 只是两个实现；主线先用 A 开发，spike 结论出来再定。

1. **iOS 离线播放 SW 缓存的有道音频**：主屏 PWA、飞行模式、`<audio>` 播放 Cache Storage 里的不透明响应。通过 → 5.7 方案 A；失败 → 方案 B。
2. **iOS `speechSynthesis`**：主屏 PWA 下可用性、可选英文语音、静音拨片状态下是否出声。结果写进 README 的已知限制。
3. **词典灌库**：5 万条 `bulkPut` 在 iPhone 上的耗时与占用；超过 5 秒则改分片 + 后台灌入。

## 8. 验收标准

- [ ] `https://errax.github.io/mnemo/` 可访问，iPhone Safari "添加到主屏幕"，图标名 "Mnemo"，启动无地址栏
- [ ] 飞行模式下从主屏打开，能复习、能建卡、能查词典
- [ ] 输入 `concerns` 自动补全为 `concern` 的音标与释义；粘贴含 `concerns` 的句子自动挖空；点词可改
- [ ] 勾选三个卡型保存，卡片列表显示 3 张；取消一个卡型对应卡消失
- [ ] 同一记录的卡同一学习日只出现一张
- [ ] 四个按钮显示预计间隔，打分后下次到期符合 ts-fsrs 结果；撤销可回退
- [ ] 每日新卡上限生效，04:00 后重置
- [ ] 有声：在线、离线（方案 A 或 B）、有道不可用时系统 TTS 三种情况都出声
- [ ] 备份文件能经分享面板存到 iCloud Drive；在清空数据后恢复，卡片与排期一致
- [ ] 收集箱粘贴多行 → 草稿 → 逐条建卡
- [ ] 深色模式、安全区、输入不缩放、无橡皮筋
- [ ] 单元测试覆盖 5.14 列出的项

### 验收记录

| 日期 | 设备 | 项 | 结果 |
|---|---|---|---|
| | | 1 · PWA 安装：可访问、图标名、无地址栏 | |
| | | 2 · 飞行模式：复习、建卡、查词典 | |
| 2026-10-31 | 自动化（Vitest） | 3 · dict 变形查询（concerns→concern）、cloze 自动挖空、点词可改 | ✓ |
| 2026-10-31 | 自动化（Vitest） | 4 · 三种卡型建卡保存；取消卡型后对应卡删除 | ✓ |
| 2026-10-31 | 自动化（Vitest） | 5 · 同记录埋卡（同学习日只出一张） | ✓ |
| 2026-10-31 | 自动化（Vitest） | 6 · 排期预览间隔、打分落库、撤销回退 | ✓ |
| 2026-10-31 | 自动化（Vitest） | 7 · 每日新卡上限、04:00 边界重置 | ✓ |
| | | 8 · 在线 / 离线 / 系统 TTS 三种发音 | |
| 2026-10-31 | 自动化（Vitest） | 9 · 备份 JSON 导出→导入往返一致（分享逻辑含 share/download 分支） | ✓ 自动化部分（往返一致、share/download/cancel/failed 分支）；真机分享到 iCloud Drive 与恢复待作者验证 |
| 2026-10-31 | 自动化（Vitest） | 10 · 收集箱多行拆分、草稿预填建卡（headword / sentence 两类） | ✓ |
| | | 11 · 深色模式、安全区、输入不缩放、无橡皮筋 | |
| 2026-10-31 | 自动化（Vitest） | 12 · 单元测试覆盖 5.14 列出的项 | ✓ 186 tests |
