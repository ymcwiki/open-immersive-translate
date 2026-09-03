# 开源版沉浸式翻译

**沉浸式翻译（Immersive Translate）是闭源软件。** 它的 Chrome 扩展包是 12 MB 压缩混淆过的 JavaScript，没有源码、没有 source map，用户无法审计它发出了什么请求、无法修改它的行为，也无法在它停止维护时自救。

这个仓库是一个从零编写、MIT 许可的开源替代品。功能对照它 1.32.7 版本逐项复刻（见 [docs/FEATURE_PARITY.md](docs/FEATURE_PARITY.md)，105 项中 102 项完成），全部代码可读、可改、可自行构建。

- 和 immersivetranslate.com 没有任何关联，也不使用它的任何代码。
- 没有账号系统、没有付费墙、没有埋点上报。翻译请求只发往你自己配置的服务。
- **可以直接登录自己的 ChatGPT 账号翻译**（OAuth 设备码，不需要 API key），详见下文。
- 支持 Chrome / Edge（MV3）、Firefox，以及油猴脚本版。

> 这个项目由 AI 编码代理（OpenAI Codex）在人工编排下完成，开发过程的任务书保留在 [docs/prompts/](docs/prompts/)。


这是一个 Chrome Manifest V3 双语翻译扩展。它按段落提取网页正文，在原文旁显示译文，并支持仅译文、正文/整页范围、遮罩学习模式、动态页面、富文本占位符和站点规则。

首次安装默认使用免密钥的 Google 翻译服务，目标语言为简体中文。

## 用自己的 ChatGPT 账号登录（OAuth，不需要 API key）

这是本项目区别于原版最实用的一点：**你有 ChatGPT Plus / Pro / Team 订阅，就能直接用它翻译，不用再去 platform.openai.com 买 API 额度。** 原理和 OpenAI 官方 Codex CLI、[hermes-agent](https://github.com/nousresearch/hermes-agent) 一样，走 OpenAI 的设备码 OAuth 流程，拿到的令牌调用 ChatGPT 的 Codex 后端，用的是你订阅里包含的模型额度。

### 登录步骤

1. 设置页 →「翻译服务」→ 选「ChatGPT 账号（OAuth）」。
2. 点「登录 ChatGPT」。设置页会显示一串**设备码**（形如 `XXXX-XXXXX`），旁边有复制按钮。
3. 点「打开登录页面」，浏览器打开 `https://auth.openai.com/codex/device`，登录你的 ChatGPT 账号，把设备码填进去，点授权。
4. 回到设置页，它会自动轮询，几秒内显示「已登录」以及账号邮箱、套餐类型、令牌有效期。
5. 点「测试连接」确认能翻，然后在弹窗里把当前服务切成 ChatGPT 即可。

整个过程不需要输入密码到插件里，授权全部在 OpenAI 自己的登录页完成。设备码 15 分钟内有效，过期重新点登录即可。

### 已经装了 Codex CLI 的话

展开「从 Codex CLI 导入」，把 `~/.codex/auth.json` 的完整内容粘贴进去，直接复用 CLI 已登录的凭据，不用再走一遍设备码。

### 背后发生了什么

| 步骤 | 请求 |
|---|---|
| 申请设备码 | `POST auth.openai.com/api/accounts/deviceauth/usercode` |
| 轮询授权结果 | `POST auth.openai.com/api/accounts/deviceauth/token`（未完成返回 403/404） |
| 换取令牌 | `POST auth.openai.com/oauth/token`（`authorization_code` + PKCE `code_verifier`） |
| 翻译 | `POST chatgpt.com/backend-api/codex/responses`（Responses API，流式 SSE） |
| 模型列表 | `GET chatgpt.com/backend-api/codex/models` |
| 续期 | `POST auth.openai.com/oauth/token`（`refresh_token`，到期前 2 分钟自动刷新） |

请求头带 `Authorization: Bearer <access_token>` 和从 JWT 里解出的 `ChatGPT-Account-ID`，并按 OpenAI 对第三方客户端的要求用 `originator` 标识本插件。401 会自动刷新令牌重试一次，429 按 `Retry-After` 退避。

### 安全与边界

- 访问令牌和刷新令牌只存在 `chrome.storage.local` 的独立条目里，**不会随配置导出**，也不会发给任何第三方。「退出登录」即清除。
- 这是 OpenAI 面向 Codex 客户端开放的流程，额度受你订阅计划的限制，和网页版 ChatGPT 共用。用量大时可能触发 429，属正常限流。
- 油猴脚本版不含此 provider（GM 请求层不支持流式 SSE），Chrome / Edge / Firefox 扩展版都支持。
- 全部实现在 [src/background/services/chatgpt-oauth/](src/background/services/chatgpt-oauth/)，两个文件，可自行审阅。

## 主要入口

- 网页：弹窗、悬浮球、划词、悬停、输入框、右键菜单和浏览器快捷键。
- PDF：内置 pdf.js 阅读器可打开本地或在线 PDF，按段显示双语译文，并可导出双语 PDF。
- 视频字幕：支持 YouTube、通用 WebVTT `<track>` 和多类流媒体/课程站点适配器；部分第三方站点适配器仍属实验性兼容。
- 字幕文件：独立页面可导入 SRT、WebVTT、ASS/SSA，翻译后下载双语或仅译文字幕。
- 侧边栏：可翻译文字、保留本地历史，并提供对话和页面操作入口。
- AI 写作：在可编辑区域中执行总结、润色、翻译和建议提示词。

翻译控制器会把当前页面的空闲、翻译中、完成或错误状态及段落计数同步给后台。扩展图标按标签页显示对应角标，并在主框架导航时清除旧状态。

弹窗的“更多”菜单可以打开设置、快捷键、反馈、PDF 阅读器、字幕文件页、侧边栏和配置导入/导出，并在显示缓存条目数和确认后清除缓存。右键菜单提供翻译网页、翻译选中文本、翻译本地 PDF、翻译字幕文件和打开侧边栏。所有新增设置位于设置页，包括服务字段、字幕、PDF、搜索增强、远程规则、侧边栏、AI 写作、术语表领域和缓存策略。

## 构建

需要 Node.js 和 pnpm。

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm e2e
```

构建结果位于 `dist/`。

另有两个分发构建：

```bash
pnpm build:firefox
pnpm build:userscript
```

## 在 Chrome 中加载

1. 打开 `chrome://extensions/`。
2. 开启右上角的“开发者模式”。
3. 点击“加载已解压的扩展程序”，选择本项目的 `dist/` 目录。
4. 打开普通网页，点击扩展图标或按 `Alt+A` 开始翻译。

修改代码后重新运行 `pnpm build`，再到扩展管理页点击刷新按钮。

## 配置 OpenAI 兼容服务

1. 在扩展弹窗中点击“设置”，进入“翻译服务”。
2. 找到 OpenAI 兼容服务并启用。
3. 填写 API Key、Base URL 和模型名。OpenAI 官方接口的 Base URL 可填写 `https://api.openai.com/v1`，模型名按账号可用模型填写。
4. 如服务使用不同路径，可在导出的配置中设置 `apiPath`；默认路径为 `/chat/completions`。
5. 点击“测试连接”。设置页会显示请求延迟和返回样例，或直接显示认证、超时等错误。测试通过后，在扩展弹窗的服务列表中选择该服务。

API Key 保存在浏览器的扩展本地存储中，不会写入项目文件。兼容服务必须接受 Chat Completions 格式并返回 `choices[0].message.content`。

设置页也可配置 Google、Bing、DeepL、Azure Translator、Gemini、Claude、国内机器翻译服务、OpenAI 兼容预设及自定义 HTTP 服务。未填写凭据的收费服务不会自动启用。

调度器会先检查所选服务是否支持当前源语言和目标语言。如果不支持，会跳过该服务并尝试它配置的备用服务；没有可用服务时返回明确错误。设置页会在当前服务卡片中直接提示不支持的语言对。

侧边栏对话、词典和 AI 写作需要选择 ChatGPT 账号、OpenAI 兼容、Azure OpenAI、Claude 或 Gemini 服务；这些请求只由后台适配器发出，页面脚本不会直接访问服务端接口。

## 编写站点规则

在设置页的“站点规则”中填写 JSON 数组。下面的规则只扫描 `example.com` 的文章区域，跳过广告和补充的代码区域，并在访问时自动翻译：

```json
[
  {
    "id": "example-article",
    "matches": ["*://*.example.com/*"],
    "selectors": ["article"],
    "additionalExcludeSelectors": [".advertisement", "pre", "code"],
    "autoTranslate": true
  }
]
```

- `matches` 是必填的 URL glob 数组；`*` 可匹配任意字符。
- `excludeMatches` 可排除特定 URL。
- `selectors` 限定扫描区域；不填写时沿用通用规则。
- `additionalExcludeSelectors` 在通用排除列表上追加 CSS 选择器；`excludeSelectors` 会替换该列表。
- `autoTranslate` 为 `true` 时自动翻译，但“从不翻译的网站”设置仍有最高优先级。
- `service`、`translationMode` 和 `theme` 可覆盖该站点的全局设置。

保存前，设置页会校验 JSON 和规则字段。

规则合并顺序为：通用规则 → 内置规则 → 远程规则 → 用户规则。后面的普通字段覆盖前面的字段，`additional*` 字段按追加语义合并。远程订阅只接受 HTTP(S) URL，每 24 小时刷新；拉取失败时保留最近一次有效缓存。

## 常用快捷键

- `Alt+A`：切换页面翻译。
- `Alt+W`：切换整页翻译。
- `Alt+M`：切换正文翻译。
- `Alt+T`：切换双语/仅译文模式。

其他命令已注册，可在 `chrome://extensions/shortcuts` 中自行分配，包含立即翻译到底部、遮罩、悬停直接翻译、字幕预翻译、服务切换、输入框翻译、侧边栏和 AI 写作。设置页的“快捷键”标签会通过 `chrome.commands.getAll` 列出全部命令及当前绑定，并提供快捷键管理页入口。

## 端到端测试

首次运行先安装 Playwright 的 Chromium：

```bash
pnpm exec playwright install chromium
```

然后运行：

```bash
pnpm e2e
```

测试会构建扩展并以 `dist/` 启动 Chromium。端到端用例只使用确定性的 `mock` 服务，覆盖普通网页翻译与 DOM 恢复、术语表、遮罩、仅译文模式、PDF 阅读器、三条字幕的 SRT 文件页，以及侧边栏文字翻译。

Netflix、Prime Video、Disney+、HBO Max、Hulu、课程平台和社交视频字幕适配器均有捕获格式 fixture 的解析单测。真实第三方站点的登录态、DRM、当前字幕接口和播放器版本仍需在线验证，因此这些兼容项继续标记为实验性。

## 与原版的关系和致谢

- 原版沉浸式翻译闭源；本项目只把它的公开功能列表当作对标目标，实现全部重写。
- 内置站点规则里有 144 条由原版扩展包内公开的 `default_config.json` 站点规则（CSS 选择器等配置数据）经 [scripts/port-rules.ts](scripts/port-rules.ts) 转换而来，其余为手写。
- ChatGPT 账号 OAuth 设备码登录流程参考了 [hermes-agent](https://github.com/nousresearch/hermes-agent)（MIT）的实现。
- PDF 渲染使用 pdf.js，双语 PDF 导出使用 pdf-lib。

## 许可证

MIT，见 [LICENSE](LICENSE)。
