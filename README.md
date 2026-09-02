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

弹窗的“更多”菜单可以打开 PDF 阅读器、字幕文件页和侧边栏。所有新增设置位于设置页，包括服务字段、字幕、PDF、搜索增强、远程规则、侧边栏、AI 写作、术语表领域和缓存策略。

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
5. 点击“测试连接”。测试通过后，在扩展弹窗的服务列表中选择该服务。

API Key 保存在浏览器的扩展本地存储中，不会写入项目文件。兼容服务必须接受 Chat Completions 格式并返回 `choices[0].message.content`。

设置页也可配置 Google、Bing、DeepL、Azure Translator、Gemini、Claude、国内机器翻译服务、OpenAI 兼容预设及自定义 HTTP 服务。未填写凭据的收费服务不会自动启用。

侧边栏对话、词典和 AI 写作需要选择 OpenAI 兼容、Azure OpenAI、Claude 或 Gemini 服务；这些请求只由后台适配器发出，页面脚本不会直接访问服务端接口。

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

其他命令已注册，可在 `chrome://extensions/shortcuts` 中自行分配，包含立即翻译到底部、遮罩、字幕预翻译、服务切换、输入框翻译、侧边栏和 AI 写作。

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
