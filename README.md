# 双语网页翻译

这是一个 Chrome Manifest V3 双语翻译扩展。它按段落提取网页正文，在原文旁显示译文，并支持仅译文、正文/整页范围、遮罩学习模式、动态页面、富文本占位符和站点规则。

首次安装默认使用免密钥的 Google 翻译服务，目标语言为简体中文。

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

## 用 ChatGPT 账号登录（无需 API key）

1. 打开设置页的“翻译服务”，选择“ChatGPT 账号（OAuth）”。
2. 点击“登录 ChatGPT”，复制页面显示的设备码。
3. 点击“打开登录页面”，在 `https://auth.openai.com/codex/device` 输入设备码并完成授权。
4. 设置页显示账号和套餐后，点击“测试连接”。也可以展开“从 Codex CLI 导入”，粘贴 `~/.codex/auth.json` 的完整内容。

此 provider 使用与 Codex CLI / hermes-agent 相同的设备码流程，通过 ChatGPT Codex 后端调用订阅账号可用的模型。访问令牌和刷新令牌只保存在 `chrome.storage.local` 的独立条目中，不进入配置导出。油猴脚本版不包含此 provider，因为它当前的 GM 请求层不支持所需的流式 SSE 响应。

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
