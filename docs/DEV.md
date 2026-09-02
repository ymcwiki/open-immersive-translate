# 双语对照网页翻译插件 开发文档

版本：v0.1 草案，2026-09-02
参照对象：沉浸式翻译 1.32.7（Chrome MV3，闭源）。本文档基于对其本地文件（manifest、default_config.json、locales、模块目录）的分析整理，用于从零开发一个功能对标、可自行定制的替代品。

---

## 1. 目标与边界

### 1.1 目标

做一个自己可控的 Chrome 扩展，核心能力与沉浸式翻译对齐：

1. 网页双语对照翻译（原文下方插入译文，段落级）
2. 接入任意翻译服务，重点是 OpenAI 兼容接口 + 自定义 prompt
3. 按站点的规则系统（哪些元素翻、哪些不翻、怎么排版）
4. 输入框翻译、划词翻译、鼠标悬停翻译
5. 视频字幕双语（YouTube 优先）
6. PDF 翻译

### 1.2 第一版明确不做

- 漫画/图片 OCR 翻译（沉浸式翻译用 tesseract wasm + 服务端，工程量大，收益低）
- 移动端、Safari、油猴脚本版
- 账号系统、Pro 会员、云端配置同步
- 埋点、性能上报、活动运营（沉浸式翻译配置里有大量这类字段，全部不要）

### 1.3 非目标但要预留

- Firefox 支持：代码用 `webextension-polyfill`，不用 Chrome 专有 API 就能顺带兼容
- 多语言界面：文案统一走 `_locales`，第一版只写 zh_CN 和 en

---

## 2. 沉浸式翻译功能清单（对标基线）

从 1.32.7 本地文件提取，标注第一版是否实现。

### 2.1 网页翻译

| 功能 | 说明 | v1 |
|---|---|---|
| 双语对照 / 仅译文 | `translationMode: dual | translation` | ✅ |
| 段落级翻译 | 以块级元素为单位，行内元素合并成一段 | ✅ |
| 懒加载翻译 | 只翻视口内及附近的段落，滚动再翻 | ✅ |
| 动态内容翻译 | MutationObserver 监听新增节点（SPA、无限滚动） | ✅ |
| 富文本保留 | 段落内的 `<a> <b> <code>` 等标签占位后还原 | ✅ |
| 译文样式主题 | 20+ 种：underline / dashed / highlight / mask / blur / opacity / paper / blockquote / marker / bold / italic / wavy / dotted / grey / dividingLine … | v1 做 6 种 |
| 译文字体 | 可选中文字体列表 | ✅ |
| 整页 / 仅正文 | `toggleTranslateTheWholePage` vs `toggleTranslateTheMainPage` | ✅ |
| 翻译标题 | `isTranslateTitle` | ✅ |
| 语言检测 | 页面级 + 段落级，同语言跳过 | ✅ |
| 总是翻译 / 从不翻译 | 按域名、按语言 | ✅ |
| 术语表 | `glossaries: [{k, v}]`，注入 AI prompt | ✅ |
| 遮罩模式 | 译文模糊，悬停显示（用于学外语） | 后续 |
| 编辑译文 | `enableEditTranslation` | 后续 |
| 上下文感知 | 把页面标题/摘要塞进 prompt | 后续 |

### 2.2 交互入口

| 功能 | 说明 | v1 |
|---|---|---|
| 快捷键 | Alt+A 切换翻译，Alt+W 整页，Alt+S 侧边栏，Alt+I 输入框 | ✅ |
| Popup 面板 | 切换翻译、选服务、选目标语言、当前站点规则 | ✅ |
| 悬浮球 | 页面右侧可拖动按钮 | ✅ |
| 右键菜单 | 翻译页面、翻译选中文本 | ✅ |
| 鼠标悬停翻译 | 按住修饰键悬停翻译单段 | ✅ |
| 划词翻译 | 选中弹出迷你面板 | ✅ |
| 输入框翻译 | 输入 `//` 或连按 3 下空格触发，把输入框内容翻成目标语言 | ✅ |
| 侧边栏 | AI 助手、对话式翻译 | 后续 |
| 触屏手势 | 移动端多指切换 | ❌ |

### 2.3 翻译服务（沉浸式翻译共 101 个）

按接入方式归为 5 类，v1 每类做一个代表：

| 类别 | 沉浸式翻译里的例子 | v1 实现 |
|---|---|---|
| OpenAI 兼容 LLM | openai, deepseek, qwen, kimi, zhipu, siliconcloud, groq, openrouter, ollama, custom-ai | ✅ 一个通用适配器，配 baseUrl + model + apiKey |
| 非 OpenAI 格式 LLM | claude, gemini | ✅ claude；gemini 后续 |
| 传统 MT API | google, bing, deepl, deeplx, volc, tencent, baidu, youdao, caiyun, papago, yandex | ✅ google（免费接口）、deeplx |
| 免费接口 | google-free, bing-free, yandex-free | ✅ 合并到上一行 |
| 自定义 HTTP | custom（用户自己写请求/响应模板） | ✅ |

### 2.4 其他模块

| 模块 | 沉浸式翻译实现方式 | v1 |
|---|---|---|
| 视频字幕 | 拦截 YouTube 字幕 xhr，翻译后注入自绘字幕层；支持 50+ 站点 | ✅ 仅 YouTube |
| PDF | 内置 pdf.js 阅读器，段落提取后双语渲染；Pro 版走服务端保排版 | 后续，用 pdf.js |
| EPUB | 内置阅读器 | ❌ |
| 漫画 | tesseract OCR + 服务端 | ❌ |
| 本地字幕文件 | srt/ass 上传翻译 | 后续 |
| 缓存 | 译文按 (service, from, to, text) 哈希缓存到 IndexedDB | ✅ |
| 配置导入导出 | JSON | ✅ |

---

## 3. 技术选型

| 项 | 选择 | 理由 |
|---|---|---|
| Manifest | MV3 | Chrome 已停用 MV2 |
| 语言 | TypeScript | 规则和配置类型多，没类型不好维护 |
| 构建 | Vite + `@crxjs/vite-plugin` | HMR 支持 content script，省调试时间 |
| UI | Preact + 原生 CSS | popup/options 都是小页面，不需要 React 全家桶；沉浸式翻译 options.js 有 3.4 MB，要避免这个方向 |
| 状态存储 | `chrome.storage.local`（配置）+ IndexedDB（译文缓存） | sync 有 100KB 上限，站点规则放不下 |
| 跨浏览器 | `webextension-polyfill` | 顺带兼容 Firefox |
| 测试 | Vitest + jsdom（DOM 提取逻辑）；Playwright（端到端） | DOM 提取是最容易出 bug 的部分，必须有单测 |
| 语言检测 | `franc-min` 或 `tinyld` | 纯前端，不发请求 |

---

## 4. 架构

```
┌──────────────────────────────────────────────────────┐
│ Background Service Worker                            │
│  - 翻译请求调度（并发、限流、重试、缓存）             │
│  - 翻译服务适配器（fetch 到各家 API）                 │
│  - 配置读写、规则匹配                                 │
│  - 右键菜单、快捷键命令、declarativeNetRequest       │
└───────────▲───────────────────────────▲──────────────┘
            │ chrome.runtime 消息        │
┌───────────┴───────────┐   ┌───────────┴──────────────┐
│ Content Script        │   │ Popup / Options / Panel  │
│  - DOM 扫描与段落提取  │   │  - Preact UI             │
│  - 视口观察、变更监听  │   │  - 直接读写 storage      │
│  - 译文渲染与样式      │   └──────────────────────────┘
│  - 悬浮球、划词、输入框│
│  - 字幕注入（YouTube） │
└───────────────────────┘
```

设计要点：

1. **Content script 只做 DOM，不发网络请求。** 所有翻译请求经消息发给 background，统一走调度器。这样限流和缓存只有一份。
2. **Background 无状态化。** MV3 service worker 会被随时杀掉，运行时状态（队列、进行中的请求）要能重建，配置每次从 storage 读，不放内存缓存以外的地方。
3. **规则系统是核心数据结构。** 页面行为几乎全由 `Rule` 决定，content script 启动第一件事是向 background 要当前 URL 匹配后的合并规则。

### 4.1 文件结构

```
src/
  manifest.ts                 # crxjs 用 TS 定义 manifest
  background/
    index.ts                  # 入口，注册监听
    scheduler.ts              # 翻译队列：并发、限流、批处理、重试
    cache.ts                  # IndexedDB 译文缓存
    services/
      base.ts                 # TranslationService 接口
      openai-compatible.ts
      claude.ts
      google.ts
      deeplx.ts
      custom-http.ts
      index.ts                # 注册表
    rules/
      match.ts                # URL → 合并后的 Rule
      defaults.ts             # generalRule 默认值
      builtin-rules.ts        # 内置站点规则（github、twitter、reddit…）
  content/
    index.ts                  # 入口
    extract/
      scanner.ts              # 遍历 DOM，产出 Paragraph[]
      block-detect.ts         # 块/行内判定
      placeholder.ts          # 富文本标签 ↔ 占位符
    render/
      inject.ts               # 把译文插进 DOM
      themes.css              # 译文样式
    observe/
      viewport.ts             # IntersectionObserver
      mutation.ts             # MutationObserver + 防抖
      url-change.ts           # SPA 路由变化
    features/
      float-ball.ts
      hover-translate.ts
      selection-translate.ts
      input-translate.ts
      youtube-subtitle.ts
  ui/
    popup/
    options/
    shared/
  shared/
    config.ts                 # 配置 schema（zod）+ 默认值
    types.ts
    messages.ts               # 消息协议类型
    lang.ts                   # 语言码表、检测
  _locales/
tests/
```

---

## 5. 核心模块设计

### 5.1 DOM 段落提取（最难的部分，先做这个）

目标：把页面变成 `Paragraph[]`，每个 Paragraph 是一个可以独立翻译、独立渲染的单元。

**输入**：`document.body` + 合并后的 Rule
**输出**：

```ts
interface Paragraph {
  id: string;             // 稳定 id，用于缓存和去重
  container: Element;     // 块级容器，译文插在它内部末尾
  nodes: Node[];          // 组成这段的文本节点和行内元素
  text: string;           // 带占位符的纯文本，例如 "Click {1}here{/1} to {2}"
  placeholders: Map<string, Element>;  // "1" → <a>
  lang?: string;          // 检测到的源语言
}
```

**算法**（对应沉浸式翻译 generalRule 里的一堆字段）：

1. 从 body 开始深度优先遍历。
2. 遇到以下情况直接跳过整棵子树：
   - 标签在 `excludeTags`（SCRIPT、STYLE、PRE、CODE、TEXTAREA、SVG、MATH、NOSCRIPT…）
   - 匹配 `excludeSelectors`（规则里指定的，以及扩展自己注入的元素）
   - `contenteditable`、`[translate=no]`、`.notranslate`
   - 不可见（`display:none`，用 `checkVisibility()`）
   - `<iframe>`（沉浸式翻译会向 iframe 单独注入 content script，v1 也这么做，manifest 加 `all_frames: true`）
3. 遇到块级元素（`allBlockTags` 或计算样式 `display` 为 block/flex/grid/list-item/table-cell）：把它当作一个候选容器，收集它的**直接文本节点和行内子元素**。
4. 行内元素（`inlineTags` + `display: inline`）不打断段落，作为占位符纳入。
5. `stayOriginalTags`（CODE、IMG、SUP、SUB、math 系）保留原样，用占位符表示，翻译后原样放回。
6. 一个候选容器的文本去空白后满足 `paragraphMinTextCount`（默认 2 字符）才算段落。
7. `<br>` 分隔的文本按 `lineBreakMaxTextCount` 拆分，避免 `<div>` 里一大坨用 `<br>` 分行的诗歌/歌词被合并成一段。
8. **Shadow DOM**：规则里 `shadowRootSelectors` 指定的元素进入 `shadowRoot` 继续遍历。
9. 每个段落跑一次语言检测；和目标语言相同则跳过（`sameLangCheck`）。

**测试**：用真实网页快照写 fixture（GitHub issue 页、Reddit 帖子、Wikipedia 条目、Twitter 时间线），断言提取出的段落数和文本。这套 fixture 是防止后续改坏的唯一保障。

### 5.2 富文本占位符

沉浸式翻译对不同服务用不同分隔符（`{1}`、`<code>1</code>`、`<b>1</b>`），因为有的 MT 服务会把 `{}` 翻坏。设计：

```ts
interface PlaceholderStyle {
  open: string; close: string;   // 例如 "{" "}"  或 "<b>" "</b>"
}
```

- 编码：行内元素 `<a href>Click</a>` → `{1}Click{/1}`，自闭合 `<img>` → `{2}`
- 解码：正则匹配 `{n}...{/n}` 还原为克隆的原元素，内容替换为译文；找不到的占位符丢弃并在控制台警告
- LLM 服务默认用 `{}`，Google/Bing 用 `<b>`。占位符解码失败率要有统计，超阈值自动切成纯文本模式（沉浸式翻译叫 `enableRichTranslate`）。

### 5.3 翻译服务适配器

```ts
interface TranslationService {
  id: string;
  name: string;
  // 一次请求最多多少段、多少字符
  maxBatchSize: number;
  maxBatchChars: number;
  // 每秒请求数上限、并发数
  rateLimit: { rps: number; concurrency: number };
  placeholder: PlaceholderStyle;
  supportsLangs?(from: string, to: string): boolean;
  translate(req: TranslateRequest, signal: AbortSignal): Promise<TranslateResult>;
}

interface TranslateRequest {
  texts: string[];    // 一批段落
  from: string;       // "auto" 或语言码
  to: string;
  glossary?: Array<{ k: string; v: string }>;
  context?: { title?: string; summary?: string };
}
```

**OpenAI 兼容适配器** 是重点，照沉浸式翻译 `ai` 服务的做法：

- 多段合批时用 YAML 列表格式，每项带 id，让模型按 id 返回，解析后按 id 对齐。这比用换行分隔可靠得多，模型不会合并/丢段。

  ```
  - id: 1
    text: Source one
  - id: 2
    text: Source two
  ```
- System prompt 模板可编辑，变量：`{{from}} {{to}} {{title}} {{glossary}}`。默认模板照它的：只输出译文、保持段落数、保留 HTML 标签位置、专有名词/代码不翻。
- `ignoreResRegexs`：模型返回 "抱歉我无法翻译…" 这类拒答时按失败处理，走 fallback 服务。
- 每个服务可配 `fallbackService`。
- 支持 streaming 可选，v1 不做。

**自定义 HTTP 适配器**：用户填 URL、请求体模板、响应 JSON path。够用就行，不做表达式引擎。

### 5.4 调度器（background）

```
content 请求 N 段
  → 查缓存，命中的直接返回
  → 未命中的按服务的 maxBatchSize/maxBatchChars 分批
  → 进入该服务的队列，按 concurrency 和 rps 出队
  → 失败重试 1 次（指数退避），仍失败走 fallback
  → 结果写缓存，逐批回传 content（不等全部完成）
```

- 优先级：视口内的段落优先，用户悬停的段落插队。
- 页面关闭或用户取消翻译时 `AbortController` 取消该 tab 所有请求。
- 缓存 key：`sha1(serviceId + from + to + text)`，value 存译文和时间戳，默认保留 30 天，启动时清理。

### 5.5 译文渲染

- 在段落容器末尾插入 `<font class="imt-target imt-theme-{theme}">译文</font>`。用 `<font>` 是沉浸式翻译的选择（`targetWrapperTag: "font"`），原因是几乎没有网站会给 `font` 写样式，不容易被站点 CSS 污染。可以沿用。
- 块级容器：译文另起一行（前面插 `<br>`），行内容器：紧跟原文，用 `wrapperPrefix/Suffix: "smart"` 自动判断，规则可覆盖。
- 仅译文模式：原文加 `.imt-source-hidden` 隐藏，不删除，切换时恢复。
- 主题 CSS 全部用 CSS 变量，注入到 `document.head`，规则里 `injectedCss` 可追加站点专属样式。
- 翻译中的段落显示 loading 样式（小圆点动画），失败显示可点击重试的图标。
- 标记已翻译的段落：容器加 `data-imt-id`，避免重复翻译。

### 5.6 动态内容

- `IntersectionObserver` 观察所有候选容器，进入视口前 `rootMargin: 100%`（提前一屏）时发起翻译。
- `MutationObserver` 监听 `childList + characterData`，100ms 防抖后对新增节点重新跑提取。要排除自己插入的译文节点，否则死循环。
- URL 变化（`history.pushState` 打补丁 + `popstate`）后延迟 500ms 重扫，SPA 场景必需。
- 规则里 `mutationExcludeSelectors` 排除高频变动区域（如直播弹幕、时钟）。

### 5.7 规则系统

```ts
interface Rule {
  id?: string;
  matches: string[];               // URL glob，"https://github.com/*"
  excludeMatches?: string[];
  selectorMatches?: string[];      // 页面存在该选择器才匹配

  // 以下都可选，和 generalRule 合并
  selectors?: string[];            // 只翻这些容器（为空则全页）
  excludeSelectors?: string[];
  additionalExcludeSelectors?: string[];   // 追加而非覆盖
  stayOriginalSelectors?: string[];
  atomicBlockSelectors?: string[]; // 整块当一个段落，不再向下拆
  extraInlineSelectors?: string[];
  extraBlockSelectors?: string[];
  shadowRootSelectors?: string[];
  mutationExcludeSelectors?: string[];
  injectedCss?: string[];
  isTranslateTitle?: boolean;
  paragraphMinTextCount?: number;
  glossaries?: Array<{ k: string; v: string }>;
  translationMode?: "dual" | "translation";
  theme?: string;
  service?: string;                // 该站点固定用某个服务
}
```

合并顺序：`generalRule` ← 内置站点规则 ← 用户规则。数组字段带 `additional` 前缀的是追加，其余是覆盖。沉浸式翻译用 `key.add` / `key.remove` 后缀表达追加删除，比较绕，改成显式 `additional*` 字段更好读。

内置规则第一批做 10 个站：GitHub、Twitter/X、Reddit、YouTube（评论区）、Hacker News、Stack Overflow、Wikipedia、arXiv、Medium、Google 搜索结果。

用户规则在 Options 页用 JSON 编辑器改，带 schema 校验（zod）。

### 5.8 语言检测

- 页面级：`<html lang>` 优先，其次对 body 前 2000 字符跑 `franc`。
- 段落级：只对短于 50 字符的段落跳过检测（太短不准），其余跑 `franc`，和目标语言相同则不翻。
- zh-CN / zh-TW 视为同一语言，除非用户显式配置翻译对（沉浸式翻译 `translationLanguagePairs`）。

### 5.9 输入框翻译

- 监听 `input`/`textarea`/`contenteditable` 的 keydown。
- 触发：内容以 `//` 开头，或末尾连续 3 个空格（`inputTrailingTriggerKey`，超时 1.5 秒重置）。
- 可在开头写语言码指定目标语言：`/en 你好` → 翻成英文。
- 翻译期间禁用输入框，结果用 `document.execCommand('insertText')` 替换（保留撤销栈），contenteditable 用 Selection API。
- 超过 200 字符弹确认（沉浸式翻译 `confirmLongTextLength`）。

### 5.10 YouTube 字幕

- 页面上下文注入脚本（`world: "MAIN"`），打补丁 `XMLHttpRequest`/`fetch`，拦截 `/api/timedtext` 响应。
- 解析字幕 JSON（events → segs），按句合并，批量翻译。
- 把译文合并回同一响应体（每条字幕原文 `\n` 译文），交还播放器渲染。这是最省事的方式，样式沿用 YouTube 原生字幕。
- 自绘字幕层（可调字号、颜色、背景）放后续。

### 5.11 消息协议

```ts
type Msg =
  | { type: "getRule"; url: string }                      → Rule
  | { type: "translate"; tabId; paragraphs: {id, text}[]; from; to; service? }
  | { type: "translateResult"; results: {id, text?, error?}[] }   // background → content，分批推
  | { type: "cancel"; tabId }
  | { type: "getConfig" } | { type: "setConfig"; patch }
  | { type: "configChanged" }                              // 广播
  | { type: "toggleTranslate"; tabId }                     // popup/快捷键 → content
```

用 `chrome.runtime.sendMessage` + `chrome.tabs.sendMessage`。翻译结果分批推送用 `chrome.runtime.connect` 的长连接 Port，每个 tab 一条。

---

## 6. 配置 schema

```ts
interface Config {
  version: number;
  targetLanguage: string;           // "zh-CN"
  sourceLanguage: string;           // "auto"
  translationMode: "dual" | "translation";
  theme: string;                    // "underline"
  font?: string;
  service: string;                  // 当前服务 id
  services: Record<string, ServiceConfig>;   // apiKey、baseUrl、model、prompt、limits
  shortcuts: Record<string, string>;
  alwaysTranslateSites: string[];
  neverTranslateSites: string[];
  alwaysTranslateLangs: string[];
  neverTranslateLangs: string[];
  glossaries: Array<{ k: string; v: string }>;
  userRules: Rule[];
  input: { enabled: boolean; trigger: "//" | "space3"; targetLanguage?: string };
  hover: { enabled: boolean; holdKey: "Alt" | "Ctrl" | "Shift" };
  selection: { enabled: boolean };
  floatBall: { enabled: boolean; position: "left" | "right" };
  subtitle: { youtube: boolean };
  cache: { enabled: boolean; maxAgeDays: number };
}
```

- 用 zod 定义，storage 读出来先 parse，缺字段补默认值，带 `version` 做迁移。
- apiKey 放 `chrome.storage.local`，不进 sync。导出配置时默认脱敏 apiKey，用户勾选才带上。

---

## 7. UI

### 7.1 Popup（点击图标）

一屏内解决：
- 大按钮：翻译 / 显示原文
- 服务下拉、目标语言下拉
- 模式切换：双语 / 仅译文
- 当前站点：总是翻译 / 从不翻译 开关
- 底部：打开设置、快捷键提示

### 7.2 Options（设置页）

左侧 tab：
1. 基本：语言、模式、主题、字体、悬浮球
2. 翻译服务：卡片列表，每个可编辑 apiKey/baseUrl/model/prompt/并发/批大小，带"测试连接"按钮
3. 输入框 / 划词 / 悬停
4. 站点规则：内置规则只读列表 + 用户规则 JSON 编辑器
5. 术语表
6. 快捷键
7. 缓存 / 导入导出 / 关于

### 7.3 悬浮球

右侧中部小圆按钮，点击切换翻译，右键菜单：设置、仅译文、从不翻译此站。可拖动，位置记忆。

---

## 8. Manifest 权限

```json
{
  "manifest_version": 3,
  "permissions": ["storage", "activeTab", "contextMenus", "scripting", "tabs"],
  "host_permissions": ["<all_urls>"],
  "background": { "service_worker": "background.js", "type": "module" },
  "content_scripts": [{ "matches": ["<all_urls>"], "js": ["content.js"], "run_at": "document_idle", "all_frames": true }],
  "commands": { "toggle-translate": { "suggested_key": { "default": "Alt+A" } }, ... },
  "options_page": "options.html",
  "action": { "default_popup": "popup.html" }
}
```

沉浸式翻译申请了 `webRequest`、`declarativeNetRequest`、`offscreen`、`sidePanel`。v1 都不需要：字幕拦截用页面上下文 patch 解决，不动网络层；offscreen 是它跑 OCR 用的。权限少，商店审核快，用户信任度高。

`<all_urls>` 是必需的，否则每个站点都要用户点一次授权。

---

## 9. 开发阶段

### 阶段 1：能翻页面（2 周）

- [ ] 项目脚手架：Vite + crxjs + TS + Preact，能加载到 Chrome
- [ ] 配置 schema + storage 读写 + 默认值
- [ ] DOM 段落提取 + 单测 fixture（4 个站点快照）
- [ ] 占位符编解码 + 单测
- [ ] OpenAI 兼容适配器 + Google 免费接口适配器
- [ ] 调度器：批处理、并发、缓存
- [ ] 译文渲染 + 3 种主题
- [ ] 视口懒加载 + MutationObserver
- [ ] Popup：翻译开关、选服务、选语言
- [ ] 快捷键 Alt+A

验收：GitHub issue、Reddit、Wikipedia、Hacker News 四个站翻译结果和沉浸式翻译肉眼对比无明显缺段、错位。

### 阶段 2：好用（2 周）

- [ ] 规则系统 + 10 个内置站点规则 + 用户规则编辑器
- [ ] Options 页全部 tab
- [ ] Claude、DeepLX、自定义 HTTP 适配器 + fallback
- [ ] 术语表注入 prompt
- [ ] 语言检测、总是/从不翻译
- [ ] 悬浮球、右键菜单
- [ ] 仅译文模式、更多主题
- [ ] SPA URL 变化重扫
- [ ] 配置导入导出

### 阶段 3：扩展入口（2 周）

- [ ] 输入框翻译
- [ ] 划词翻译
- [ ] 悬停翻译
- [ ] YouTube 字幕
- [ ] 错误提示、重试 UI
- [ ] Firefox 打包验证

### 阶段 4：可选

- PDF（pdf.js 嵌入）
- 本地 srt 文件翻译
- 遮罩模式、译文编辑
- 上下文感知 prompt
- 侧边栏 AI 助手

---

## 10. 已知难点与对策

| 难点 | 沉浸式翻译的做法 | 我们的对策 |
|---|---|---|
| 段落切分错误（把导航栏几十个链接合成一段，或把一句话拆成三段） | 166 个规则字段 + 769 条站点规则人工调 | 先把通用算法做扎实，靠 fixture 测试守住，站点规则只补例外 |
| LLM 返回段落数不对 | YAML + id 对齐，失败走 fallback | 同上，另外单段失败只标记该段，不整批作废 |
| 站点 CSS 污染译文样式 | `<font>` 标签 + 高优先级选择器 | 同上，必要时译文用 `all: revert` 重置后再套自己的样式 |
| MutationObserver 死循环 | 排除自己的节点 + 防抖 | 所有自己插入的节点带 `data-imt` 属性，observer 回调第一步过滤 |
| MV3 service worker 被杀 | 状态放 storage | 队列做成可重建：content 端持有未完成段落列表，worker 重启后 content 重发 |
| 免费 Google 接口被限流 | 多个免费源轮换 | v1 只做 Google 一个免费源，明确告诉用户建议配自己的 API key |
| 网站 CSP 阻止注入 | 用 `world: MAIN` 的 scripting API | 同上；样式用 `adoptedStyleSheets` 而非 `<style>` 标签 |

---

## 11. 参考

- 沉浸式翻译本地文件：`~/Library/Application Support/Google/Chrome/Profile 1/Extensions/bpoadfkcbjbfhfodiogcnhhhpibjhbnh/1.32.7_0/`，`default_config.json` 里的 `generalRule` 和 `rules` 是段落提取算法最直接的参考。
- 开源同类：kiss-translator（github.com/fishjar/kiss-translator），双语对照 + 自定义接口，代码量小，段落提取和规则设计可直接参考。
- crxjs：https://crxjs.dev
- Chrome MV3 文档：https://developer.chrome.com/docs/extensions/mv3/
