---
name: Mnemo
description: 一个口袋卡盒式的英语记忆卡应用，iOS 系统感、离线、单手可用。
colors:
  # 强调
  primary: "#0071e3"
  primary-night: "#0a84ff"
  on-accent: "#ffffff"
  # 中性（浅色）
  neutral-bg: "#f5f5f7"
  neutral-panel: "#ffffff"
  neutral-ink: "#1d1d1f"
  neutral-muted: "#86868b"
  neutral-line: "#e5e5e7"
  # 中性（深色）
  midnight: "#000000"
  night-card: "#1c1c1e"
  ink-night: "#f5f5f7"
  fog-grey-night: "#8e8e93"
  hairline-night: "#2c2c2e"
  # 挖空与提醒
  cloze-marker: "#fff3bf"
  signal-yellow: "#ffd60a"
  notice-bg: "#fff8e6"
  notice-line: "#ffe2a8"
  notice-fg: "#8a5a00"
  # 四档打分（记忆薄涂）
  again-bg: "#ffe5e3"
  again-fg: "#c0392b"
  hard-bg: "#fff0d6"
  hard-fg: "#b7791f"
  good-bg: "#e3f6e8"
  good-fg: "#1e8449"
  easy-bg: "#e8f4fd"
  easy-fg: "#0071e3"
  again-fg-night: "#ff6961"
  hard-fg-night: "#ffb340"
  good-fg-night: "#30d158"
  again-bg-night: "color-mix(in srgb, #ff6961 18%, transparent)"
  hard-bg-night: "color-mix(in srgb, #ffb340 18%, transparent)"
  good-bg-night: "color-mix(in srgb, #30d158 18%, transparent)"
  easy-bg-night: "color-mix(in srgb, #0a84ff 18%, transparent)"
typography:
  numeric:
    fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", sans-serif'
    fontSize: "34px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.02em"
  display:
    fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", sans-serif'
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  headline:
    fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", sans-serif'
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.3
  meaning:
    fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", sans-serif'
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.4
  sentence:
    fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", sans-serif'
    fontSize: "19px"
    fontWeight: 400
    lineHeight: 1.5
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", sans-serif'
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.6
  body-sm:
    fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", sans-serif'
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  small:
    fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", sans-serif'
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  caption:
    fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", sans-serif'
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", sans-serif'
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.08em"
  micro:
    fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", sans-serif'
    fontSize: "10px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0.05em"
rounded:
  card: "14px"
  field: "12px"
  search: "10px"
  grade: "12px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "24px"
  3xl: "28px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.card}"
    height: "50px"
    padding: "0 20px"
    typography: "{typography.body}"
  button-primary-md:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.card}"
    height: "44px"
    padding: "0 16px"
    typography: "{typography.body-sm}"
  button-secondary:
    backgroundColor: "{colors.easy-bg}"
    textColor: "{colors.primary}"
    rounded: "{rounded.card}"
    height: "50px"
    padding: "0 20px"
    typography: "{typography.body}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.primary}"
    rounded: "{rounded.card}"
    height: "44px"
    padding: "0 16px"
    typography: "{typography.body-sm}"
  chip:
    backgroundColor: "{colors.neutral-panel}"
    textColor: "{colors.neutral-ink}"
    rounded: "{rounded.pill}"
    padding: "6px 12px"
    typography: "{typography.small}"
  chip-selected:
    backgroundColor: "{colors.neutral-ink}"
    textColor: "{colors.neutral-bg}"
    rounded: "{rounded.pill}"
    padding: "6px 12px"
    typography: "{typography.small}"
  field:
    backgroundColor: "{colors.neutral-panel}"
    rounded: "{rounded.field}"
    padding: "8px 12px"
  card:
    backgroundColor: "{colors.neutral-panel}"
    rounded: "{rounded.card}"
    padding: "14px"
  list-row:
    backgroundColor: "{colors.neutral-panel}"
    height: "56px"
    padding: "12px 16px"
  search-field:
    backgroundColor: "{colors.neutral-panel}"
    textColor: "{colors.neutral-ink}"
    rounded: "{rounded.search}"
    height: "40px"
    padding: "8px 12px"
    typography: "{typography.body}"
  grade-button:
    rounded: "{rounded.grade}"
    height: "52px"
    padding: "9px 4px"
    typography: "{typography.small}"
  fab:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.pill}"
    size: "52px"
  tab-bar:
    backgroundColor: "{colors.neutral-panel}"
    textColor: "{colors.neutral-muted}"
    height: "49px"
---

# Design System: Mnemo

## Overview

**Creative North Star: "The Pocket Card Box"**

Mnemo 是一叠随身带着、每天抽几张的卡。这个隐喻决定了系统的重心：卡片是主角，翻面是唯一需要被看见的动作，卡盒本身要安静到可以被忽略。所以界面几乎没有装饰——没有渐变、没有插画、没有第二强调色，深度靠背景色层级而不是阴影，层级靠字号与字重而不是色彩。留白与间距承担了大部分"设计"，剩下的交给内容：一个单词、一条释义、一句带挖空的例句。

它是 iOS 原生应用的外壳里装着一个私人工具：系统字体栈、发丝分隔线、14 的卡片圆角、单一信号蓝。中文用 PingFang SC，英文用系统 SF，字体本身不参与表达。这套克制是为了让每天重复 20 次的动作不产生摩擦——复习屏不抢戏，建卡屏不提问，设置页不解释自己。

密度上偏松：一屏只做一件事，复习屏整屏只有一张卡，设置页按分组堆叠，卡片列表一次只给一行一条记录。颜色总量刻意压低，唯一的彩色事件是四档打分（记忆薄涂）与挖空高亮；它们一出现，用户就知道自己在"评分"或"看答案"。

**Key Characteristics:**
- 卡片优先：卡片是唯一有边界的容器，其他内容靠留白与发丝线归组。
- 扁平但有层次：`bg` / `panel` 两档底色 + 1px 发丝线，不用卡片阴影。
- 单强调色：信号蓝只出现在可操作项与"新"的地方；语义四色只属于打分。
- 系统字体栈，层级靠字号与字重（400 / 600 / 700）拉开。
- 手机单手：单列 448px 上限、可点目标 ≥ 44pt、安全区内边距。
- 动效近乎为零：只有颜色过渡与开关滑动，翻面是瞬时的。

## Colors

一套"纸与墨"的中性底，加一个信号蓝、四档记忆薄涂、一个荧光笔黄。

### Primary
- **Signal Blue 信号蓝** (`#0071e3`，深色 `#0a84ff`): 唯一的强调色。只用于可操作项（主按钮、链接、`+` FAB、保存、翻面按钮）、"新卡"数字、以及当前选中的 tab。它是"下一步在这里"的信号，不是装饰。

### Neutral
- **Cool Paper 冷纸白** (`#f5f5f7`，深色 `#000000`): 页面底色，也是卡盒的"内衬"。所有屏幕的 `bg`。
- **Card White 卡面白** (`#ffffff`，深色 `#1c1c1e`): 卡片、分组、列表、输入字段、sticky 头部与 tab bar 的底色。与 Cool Paper 的差值就是系统的全部深度。
- **Ink 墨黑** (`#1d1d1f`，深色 `#f5f5f7`): 正文与标题。选中态 chip 反色成 Ink 底 + Cool Paper 字。
- **Fog Grey 雾灰** (`#86868b`，深色 `#8e8e93`): 次要信息——日期、计数说明、来源署名、标签、占位符、非当前 tab。
- **Hairline 发丝灰** (`#e5e5e7`，深色 `#2c2c2e`): 1px 分隔线与列表行下边框。只做分隔，不做强调。

### Tertiary
- **Marker Yellow 荧光笔黄** (`#fff3bf`，深色 `color-mix(in srgb, #ffd60a 28%, transparent)`): 背面例句里被挖空的目标词高亮。只出现在 `CardBack` 的 `mark` 上。
- **Caution Paper 提醒纸** (`#fff8e6` / 边框 `#ffe2a8` / 文字 `#8a5a00`，深色 `#ffd60a` 系): 两类温和提醒——非正式地址提示条、备份提醒条、重复词提示。它必须看起来像便签，不像错误。
- **Memory Tints 记忆薄涂**: 四档打分的成套底色与前景——Faded Coral 褪色珊瑚 (`#ffe5e3` / `#c0392b`)、Amber Wash 琥珀薄涂 (`#fff0d6` / `#b7791f`)、Moss Wash 苔绿薄涂 (`#e3f6e8` / `#1e8449`)、Sky Wash 天蓝薄涂 (`#e8f4fd` / `#0071e3`)。深色模式换成同色相 18% 透明底 + 亮一档前景。它们是低饱和的"薄涂"，不是纯色大块。

### Named Rules
**The One Blue Rule.** 信号蓝在任一屏上的覆盖面积不超过 10%，且只允许出现在可操作项、"新"数据、当前选中态三处。它的稀有就是它的力量。

**The Memory Tint Rule.** 四档打分色只属于打分按钮与它的徽标（草稿状态徽标、卡型小标签、完成/歇脚图标）。两处既有例外要保留：`good-fg` 也用于开关打开态，`easy-bg` 也用于发音按钮与次要按钮。除此之外，打分色不得外溢到卡片、列表行或正文。

**The No-Gradient Rule.** 不用渐变、不用第二强调色、不用彩色插画。需要区分层级时，用底色两档差 + 发丝线，不用色彩。

## Typography

**Display Font:** 系统字体栈（`-apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", sans-serif`）
**Body Font:** 同上（同一栈，中文 PingFang SC，英文 SF）

**Character:** 一种字体走完所有场景，表达全部交给字号与字重。字重只用 400 / 600 / 700 三档，没有斜体、没有细体、没有字距游戏。这让界面像系统应用而不像品牌页，也让中英混排（释义、例句）保持稳定。

### Hierarchy
- **Numeric** (700, 34px, 1): 首页的待复习/新卡数字。全系统最大的东西，因为"今天要做什么"是首页唯一的答案。
- **Display** (700, 30px, -0.01em): 页面标题（今日、卡片）、复习正面的词头、背面的词头。
- **Meaning** (600, 24px, 1.4): 中→英正面的释义全文，多行保留换行。
- **Headline** (700, 22px): 完成页与歇脚页的标题，一屏只有一句。
- **Sentence** (400, 19px, 1.5): 例句挖空正面的原句。挖空处的下划线用信号蓝 2px。
- **Body** (400, 16px, 1.6): 背面释义与例句、搜索框、输入框正文。输入框字号不得小于 16px（iOS 聚焦缩放）。
- **Body Small** (400, 15px, 1.5): 设置行、sheet 头部的取消/保存、编辑器的音标行。
- **Small** (400, 14px, 1.5): 说明性副标题、chip 文字、评分按钮主标签。
- **Caption** (400, 12px, 1.5): 例句来源、标签、列表副行、提醒条、toast。
- **Label** (500, 11px, 0.08em, 大写): 复习卡面上的提示词（"说出英文"、"填上这个词"、"这个词什么意思"）。
- **Micro** (400, 10px, 0.05em, 大写): 表单字段标签、tab bar 文字、评分按钮的间隔预览。

### Named Rules
**The Size-Not-Color Rule.** 层级由字号与字重建立；颜色只表达状态（可操作、次要、警示、评分档位）。把一段正文变灰只能因为它确实次要，不能为了让标题更突出。

**The 16px Input Rule.** 所有输入框、文本域、搜索框的字号 ≥ 16px。低于这个值 iOS Safari 会在聚焦时缩放页面，任何"更精致的小字输入框"都不成立。

## Layout

单列、手机优先。内容容器 `max-w-md`（448px）水平居中，屏幕左右内边距 16px，卡片之间 12px，卡片内部 14px。所有间距落在 4pt 网格上（4 / 8 / 12 / 16 / 20 / 24 / 28）。

页面骨架：`min-h-dvh` + `paddingTop: calc(env(safe-area-inset-top) + 12px)` + 底部 `pb-28`（112px，让内容避开 tab bar 加安全区）。tab bar 固定底部、`bg-panel/95` 加背景模糊、`paddingBottom: calc(env(safe-area-inset-bottom) + 8px)`；内容高名义 49px（24 图标 + 4 间距 + 10px 文字 + 上下 8px 内边距，实测约 58px）。建卡 FAB 固定 `right: 20px`、`bottom: calc(env(safe-area-inset-bottom) + 76px)`、52×52。

复习屏是唯一的例外：全屏、无 tab bar、卡片垂直居中于剩余空间，顶部一条轻量状态栏（关闭 / 剩余数 / 撤销 / 编辑），底部评分区贴安全区。建卡与编辑是全屏 sheet：sticky 头部（取消 / 标题 / 保存）加单列字段流，字段之间 8px，比列表页更紧，因为这是一次性填完的表单。

桌面不做专属布局：窗口变宽时内容仍是 448px 居中，不放大字号、不加双栏、不加侧边栏。列表页一次展示 300 条，超出用次要按钮"显示更多（还有 N 个）"继续追加，不做虚拟滚动。

### Named Rules
**The One Column Rule.** 任何屏幕都是一列。不允许为了利用桌面宽度引入双栏或侧边栏；宽度只影响留白，不影响结构。

**The Thumb Zone Rule.** 主操作永远在底部：翻面、四档打分、保存、继续/今天到这。顶部只放低频或退出的动作（关闭、撤销、编辑、设置）。

## Elevation & Depth

系统默认扁平。深度只由两件事表达：`Cool Paper` 与 `Card White` 之间的底色差，以及 1px 的 `Hairline` 分隔线。卡片、分组、列表、输入字段全部无阴影、无描边（列表用行间下边框，不用外框）。

阴影只属于"浮在界面之上、且会消失"的元素，共三处：建卡 FAB（带信号蓝色调的大阴影，让它看起来像被按起来）、更新提示条（中性大阴影）、复习屏的 toast（反色胶囊，无阴影但反色到 Ink 底）。第三层深度技术是半透明加背景模糊，只用于两个 sticky 表面：sheet 头部与 tab bar（`bg-panel/95` + `backdrop-blur`），让内容从它们下面滑过时仍有归属。

深色模式下不额外加阴影：纯黑底 + `#1c1c1e` 面板 + `#2c2c2e` 发丝线已经提供足够分层；在纯黑上投影几乎不可见，加了只是噪声。

### Shadow Vocabulary
- **FAB Lift** (`0 10px 15px -3px rgba(0,113,227,0.35), 0 4px 6px -4px rgba(0,113,227,0.35)`): 只给建卡 FAB。色调阴影，不是中性阴影。
- **Floating Notice** (`0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)`): 只给"有新版本"提示条。

### Named Rules
**The Flat-By-Default Rule.** 静止状态下的表面一律扁平。阴影是"浮起来"的证据，不是"重要"的装饰；除 FAB 与浮动提示外，任何卡片、按钮、输入框出现阴影都算错误。

## Shapes

圆角只有三个值，各司其职：卡片/分组/主按钮 14px（`card`），输入字段/提醒条/打分按钮 12px（`field` / `grade`），搜索框 10px（`search`）。全圆（`pill`）留给 chip、徽标、圆形图标与 FAB。除此之外不发明第四个半径。

边界语言是"一圈发丝线"：1px `Hairline` 只用于列表行之间、sticky 头部与 tab bar 的分隔，以及 chip 的描边。卡片没有外框——它们靠底色与圆角被认出。焦点态不画外框，靠原生 `outline` 的移除加背景/文字变化表达。

圆形是这个系统里唯一的"软形状"，只给三类东西：可点的小圆按钮（发音 ▶，44×44）、状态图标（完成页 ✓、歇脚页 ☕，72×72）、FAB。挖空渲染是另一套几何：例句里被挖掉的部分是 2px 信号蓝下划线 + 一个 `min-width` 按原词长度撑开的空白，背面则变成荧光笔黄的高亮块。

### Named Rules
**The Three-Radius Rule.** 14 / 12 / 10，加一个 pill。新组件必须选其中一个，不允许出现 8、16、20 或任意中间值。

## Components

状态过渡刻意压到最小：只有颜色过渡（`transition-colors`，150ms）与开关滑块的位移。翻面是瞬时的，页面切换没有过渡动画，不做 3D 翻转、不做弹跳、不做骨架屏闪烁。任何新增动效必须先通过"它是否帮助判断状态"这一关。

### Buttons
- **Shape:** 卡片圆角 14px（`14px`），无阴影、无描边。
- **Primary:** Signal Blue 底 + 纯白字，`lg` 高 50px / 内边距 `0 20px` / 16px 600，`md` 高 44px / `0 16px` / 15px 600。用于"开始复习"、"看答案"、"继续"、"回到首页"。
- **Secondary:** Sky Wash 底 + Signal Blue 字，尺寸同 primary。用于"再学 10 张新卡"、"重试"、"全选搜索结果"、"编辑卡片类型"。它是"另一个可选动作"，不是"取消"。
- **Ghost:** 透明底 + Signal Blue 字，高 44px。用于设置页入口、sheet 头部的取消/保存、批量管理里的低频动作。
- **Destructive:** 不新增颜色，用 ghost 变体加 `again-fg` 文字（"删除单词"）。
- **Disabled:** `opacity: 0.4`，不改颜色、不改形状。
- **Hover / Focus:** 手机优先，没有 hover 态；键盘焦点保留浏览器原生可见性，不用自定义焦点环。

### Chips
- **Style:** 全圆，1px `Hairline` 描边，Card White 底 + Ink 字，内边距 `6px 12px`，14px。
- **State:** 选中时反色——Ink 底 + Cool Paper 字 + Ink 描边（`aria-pressed`）。不可用态 `opacity: 0.4` 并用 `title` 说明原因（"先给例句挖一个空"）。
- **Known deviation:** 命中高度约 33px，是系统里唯一低于 44pt 的可点目标。它们总是成组出现在同一行，作为可接受的例外记录在此，不推广到其他组件。

### Cards / Containers
- **Corner Style:** 14px。
- **Background:** Card White（深色 `#1c1c1e`）；页面底色 Cool Paper（深色纯黑）。
- **Shadow Strategy:** 无。见 Elevation & Depth。
- **Border:** 无外框；列表行之间用 1px `Hairline` 下边框，最后一行去掉。
- **Internal Padding:** 14px（内容卡）/ 12–16px（列表行、设置行）。

### Inputs / Fields
- **Style:** 字段容器是 Card White + 12px 圆角 + `8px 12px` 内边距；输入本身透明背景、无边框、16px 起。字段标签是 10px 大写雾灰，右侧可挂提示（"已从词典补全"用 Moss Wash 前景，"词典没有，手动填写"用 Signal Blue）。
- **Focus:** 不画自定义焦点环，去掉默认 `outline` 后靠光标与键盘表达。iOS 上依赖 ≥16px 字号阻止缩放。
- **Error / Disabled:** 错误用 `again-fg` 文字一行（`role="alert"`），不染红整个字段；禁用靠整体 `opacity`。

### Navigation
- **Tab Bar:** 三项（今日 / 卡片 / 设置），固定底部，Card White 95% + 背景模糊，顶部 1px `Hairline`，内容高名义 49px（实测约 58px）加安全区。图标是 24×24 的圆角方块色块（当前项 Signal Blue，其余 `Hairline`），文字 10px；当前项整组变蓝。
- **Sheet Header:** sticky 顶部，取消（左，15px 蓝）/ 标题（中，15px 600）/ 保存（右，15px 600 蓝，禁用时 40% 透明），底部 1px 发丝线，`bg-panel/95` + 模糊。
- **Review Top Bar:** 无底色无边框的一条 14px 行：关闭 ✕（雾灰）、剩余数（600）、撤销上一步与编辑（蓝）。

### Signature: 复习卡面与评分条
系统最独特的组件，值得单独描述。正面按卡型分三种：`zh2en` 是 24px/600 的释义全文加 11px 大写提示"说出英文"；`cloze` 是 19px 原句，挖空处为蓝色下划线空白，下挂 12px 来源；`en2zh` 是 30px/700 词头 + 雾灰音标 + 44px 圆形发音按钮，整体居中。背面是完整记录：30px 词头、音标与发音、16px 释义、全部例句（目标词为荧光笔黄高亮）、标签。

评分条是四等分的网格（gap 8px），每个按钮高 52px、圆角 12px、主标签 14px/600、下方 10px 的预计间隔（`opacity: 0.75`）。四档颜色即 Memory Tints，顺序固定：忘了 / 困难 / 记得 / 简单。翻面前只给一个"看答案"主按钮加一行 12px 雾灰提示"想好了再翻"。

## Do's and Don'ts

### Do:
- **Do** 用 Cool Paper / Card White 两档底色差加 1px `Hairline` 建立分组，这是系统的唯一深度手段。
- **Do** 把主操作放在底部拇指区（翻面、评分、保存、继续），并保证高度 ≥ 44pt。
- **Do** 用 30px/700 或 34px/700 承载"现在该做什么"，一屏只留一个这样的焦点。
- **Do** 给所有输入框 16px 以上字号，所有页面加 `min-h-dvh` 与 `env(safe-area-inset-*)`。
- **Do** 用 Signal Blue 只标记可操作项、"新"数据与当前选中态；其余状态用雾灰与发丝线。
- **Do** 保留四档打分与挖空高亮作为界面里唯一的彩色事件。

### Don't:
- **Don't** 给卡片、按钮、输入框加阴影——阴影只属于 FAB 与浮动提示条。
- **Don't** 引入第二强调色、渐变、彩色插画或图标字体；需要区分时用底色层级与字号。
- **Don't** 用纯色大块做评分按钮，也不要让 Memory Tints 溢出到卡片或正文。
- **Don't** 发明第四个圆角值（只用 14 / 12 / 10 / pill）。
- **Don't** 加 3D 翻面、弹跳、骨架屏或页面切换动画；状态过渡只有 150ms 的颜色变化与开关滑动。
- **Don't** 为桌面加双栏、侧边栏或放大字号——窗口变宽只增加留白。
- **Don't** 把提醒条做成错误：温和提醒用 Caution Paper（便签感），只有真正的失败才用 `again-fg` 文字。
