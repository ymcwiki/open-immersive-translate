# 双语网页翻译

这是一个 Chrome Manifest V3 扩展，按段落提取网页正文，在原文旁显示译文。它支持视口内优先翻译、动态页面重扫、富文本占位符、站点规则、多个翻译服务，以及划词、悬停、输入框和 YouTube 字幕等入口。

首次安装默认使用免密钥的 Google 翻译服务，目标语言为简体中文。

## 构建

需要 Node.js 和 pnpm。

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

构建结果位于 `dist/`。

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

## 端到端测试

首次运行先安装 Playwright 的 Chromium：

```bash
pnpm exec playwright install chromium
```

然后运行：

```bash
pnpm e2e
```

测试会构建扩展、以 `dist/` 启动 Chromium、打开本地文章页面，并通过仅在测试配置中启用的 `mock` 服务验证段落翻译、导航与代码排除，以及移除译文后的 DOM 恢复。
