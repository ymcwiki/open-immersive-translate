# 功能对照清单（沉浸式翻译 1.32.7 → 本项目）

目标：除漫画 OCR / 图片翻译、EPUB、移动端、账号与付费体系外，覆盖 ≥90% 功能。
状态：✅ 已实现且有测试 · 🔧 部分 · ⬜ 未做 · ➖ 明确排除（不计入分母）

## A. 网页翻译核心
| # | 功能 | 状态 | 阶段 |
|---|---|---|---|
| A1 | 双语对照模式 | ✅ | 1 |
| A2 | 仅译文模式（原文隐藏可恢复） | ✅ | 1 |
| A3 | 段落级提取（块/行内判定、最小字数） | ✅ | 1 |
| A4 | 视口懒加载翻译 | ✅ | 1 |
| A5 | 动态内容（MutationObserver）翻译 | ✅ | 1 |
| A6 | SPA URL 变化重扫 | ✅ | 1 |
| A7 | 富文本标签占位保留（两种分隔符风格） | ✅ | 1 |
| A8 | stayOriginal（code/img/math/sup/sub） | ✅ | 1 |
| A9 | `<br>` 分行拆段 | ✅ | 1 |
| A10 | Shadow DOM 翻译 | ✅ | 1 |
| A11 | iframe 内翻译（all_frames） | 🔧 | 2 |
| A12 | 标题（document.title）翻译 | ✅ | 1 |
| A13 | 页面级语言检测 + 同语言跳过 | 🔧 | 2 |
| A14 | 段落级语言检测 | 🔧 | 2 |
| A15 | 总是翻译 / 从不翻译（按站点） | ✅ | 1 |
| A16 | 总是翻译 / 从不翻译（按语言） | ⬜ | 3 |
| A17 | 整页 vs 仅正文（main 区域）翻译 | ⬜ | 3 |
| A18 | 立即翻译到页面底部（不懒加载） | ⬜ | 3 |
| A19 | 术语表（glossary）注入 prompt | 🔧 | 2 |
| A20 | 术语表带领域（domain）规则 | ⬜ | 3 |
| A21 | 上下文感知（标题/摘要进 prompt） | ⬜ | 3 |
| A22 | 遮罩模式（译文模糊悬停显示）+ 快捷键 | 🔧 | 3 |
| A23 | 译文可编辑 | ⬜ | 3 |
| A24 | pre/code 换行保留与 likePre 处理 | ⬜ | 3 |
| A25 | 翻译错误提示 + 单段重试 | ✅ | 1 |
| A26 | 译文缓存（IndexedDB，过期清理） | ✅ | 1 |
| A27 | 同一服务失败自动 fallback 到备用服务 | ✅ | 1 |
| A28 | 按 URL 指定翻译模式（dual/translation） | ⬜ | 3 |
| A29 | 按语言指定翻译模式 | ⬜ | 3 |
| A30 | 翻译中/完成的页面状态角标（badge） | ⬜ | 3 |

## B. 译文样式
| # | 功能 | 状态 | 阶段 |
|---|---|---|---|
| B1 | 主题：underline dashed dotted highlight mask opacity blockquote paper bold italic grey dividingLine wavy marker none | ✅ | 1 |
| B2 | 主题：dashedBorder solidBorder thinDashed nativeUnderline nativeDashed nativeDotted weakening blur | ⬜ | 3 |
| B3 | 译文字体选择 | ✅ | 1 |
| B4 | 译文字号/颜色自定义 | ⬜ | 3 |
| B5 | 按站点主题（translationThemePatterns） | ⬜ | 3 |
| B6 | 深色模式适配 | ✅ | 1 |
| B7 | 站点自定义注入 CSS（injectedCss） | ✅ | 1 |
| B8 | 全局自定义 CSS | ⬜ | 3 |

## C. 交互入口
| # | 功能 | 状态 | 阶段 |
|---|---|---|---|
| C1 | 快捷键：toggleTranslatePage / WholePage / MainPage | 🔧 | 3 |
| C2 | 快捷键：toggleOnlyTranslation / ToPageEndImmediately / TranslationMask / MouseHoverDirectly / VideoSubtitlePreTranslation / SidePanel / InputBox / AiWriting | ⬜ | 3 |
| C3 | 快捷键：translateWith{Google,Bing,DeepL,OpenAI,Claude,Gemini,Custom1-3} | ⬜ | 3 |
| C4 | Popup：开关、服务、语言、模式、站点开关 | ✅ | 1 |
| C5 | Popup：更多菜单（设置、快捷键、缓存、反馈） | 🔧 | 3 |
| C6 | 悬浮球（拖动、右键菜单、位置记忆） | ✅ | 1 |
| C7 | 右键菜单（翻译网页 / 选中文本） | 🔧 | 2 |
| C8 | 鼠标悬停 + 修饰键翻译单段 | ✅ | 1 |
| C9 | 悬停直接翻译（无需修饰键）开关 | ⬜ | 3 |
| C10 | 划词翻译（迷你面板） | ✅ | 1 |
| C11 | 划词：单词词典模式（音标/词性/例句） | ⬜ | 3 |
| C12 | 划词：朗读（TTS） | ⬜ | 3 |
| C13 | 划词：触发方式（图标悬停/点击/直接） | ⬜ | 3 |
| C14 | 输入框翻译（// 或三空格触发） | ✅ | 1 |
| C15 | 输入框：语言码前缀 + 别名 | 🔧 | 3 |
| C16 | 输入框：目标语言栏 / 自动语言 | ⬜ | 3 |
| C17 | 输入框：长文本确认 | ✅ | 1 |
| C18 | 侧边栏（Side Panel）：AI 助手对话式翻译 | ⬜ | 3 |
| C19 | AI 写作弹窗（总结/改写/建议） | ⬜ | 3 |
| C20 | 触屏手势 | ➖ | |

## D. 翻译服务
| # | 功能 | 状态 | 阶段 |
|---|---|---|---|
| D1 | OpenAI 兼容通用适配器（YAML id 合批） | ✅ | 1 |
| D2 | Claude 原生 | ✅ | 1 |
| D3 | Gemini 原生 | ⬜ | 3 |
| D4 | Google 免费接口 | ✅ | 1 |
| D5 | Bing/Edge 免费接口（auth token） | ⬜ | 3 |
| D6 | Microsoft Azure Translator（key） | ⬜ | 3 |
| D7 | DeepL 官方 API | ⬜ | 3 |
| D8 | DeepLX | ✅ | 1 |
| D9 | 火山引擎 / 腾讯 / 百度 / 有道 / 彩云 / 阿里 | ⬜ | 3 |
| D10 | Papago / Yandex / Transmart / NiuTrans / OpenL | ⬜ | 3 |
| D11 | Azure OpenAI | ⬜ | 3 |
| D12 | 预设：DeepSeek/Qwen/Kimi/智谱/SiliconCloud/Groq/OpenRouter/Grok/Ollama/Mistral/豆包/混元/零一/StepFun/千帆 | ⬜ | 3 |
| D13 | 自定义 HTTP 服务（模板 + JSON path） | ✅ | 1 |
| D14 | 自定义 prompt（system/user 模板变量） | 🔧 | 3 |
| D15 | 每服务模型列表 + 自定义模型名 | ⬜ | 3 |
| D16 | 拒答识别（ignoreResRegexs） | ✅ | 1 |
| D17 | 测试连接 | 🔧 | 2 |
| D18 | 并发/限流/批大小/超时可配 | ✅ | 1 |
| D19 | 流式（streaming）译文 | ⬜ | 3 |
| D20 | 语言对支持检查（不支持自动换服务） | ⬜ | 3 |

## E. 视频字幕
| # | 功能 | 状态 | 阶段 |
|---|---|---|---|
| E1 | YouTube 字幕拦截 + 双语 | ✅ | 1 |
| E2 | 自绘字幕层（字号/颜色/背景/位置） | ⬜ | 3 |
| E3 | 字幕预翻译开关 + 快捷键 | ⬜ | 3 |
| E4 | Netflix / Prime Video / Disney+ / HBO Max / Hulu | ⬜ | 3 |
| E5 | Coursera / Udemy / edX / Khan / TED / Vimeo / LinkedIn Learning | ⬜ | 3 |
| E6 | Bilibili / Twitter Spaces / Facebook / Dailymotion | ⬜ | 3 |
| E7 | 通用 `<track>` / WebVTT 字幕站点自动支持 | ⬜ | 3 |
| E8 | 本地字幕文件（srt/vtt/ass）翻译页 | ⬜ | 3 |
| E9 | 字幕样式：双语/仅译文/仅原文 | ⬜ | 3 |

## F. PDF
| # | 功能 | 状态 | 阶段 |
|---|---|---|---|
| F1 | 内置 pdf.js 阅读器 + 双语段落渲染 | ⬜ | 3 |
| F2 | 打开本地 PDF | ⬜ | 3 |
| F3 | 在线 PDF 链接拦截 → 阅读器 | ⬜ | 3 |
| F4 | arXiv 规则（摘要 + PDF 入口） | 🔧 | 3 |
| F5 | 导出双语 PDF | ⬜ | 3 |
| F6 | Pro 版保排版翻译（服务端） | ➖ | |

## G. 规则与配置
| # | 功能 | 状态 | 阶段 |
|---|---|---|---|
| G1 | generalRule 默认值体系 | ✅ | 1 |
| G2 | URL glob 匹配 + selectorMatches | ✅ | 1 |
| G3 | 规则合并（additional 追加语义） | ✅ | 1 |
| G4 | 内置站点规则 10 个 | ✅ | 1 |
| G5 | 内置站点规则 ≥100 个（从沉浸式翻译 769 条移植高频站点） | ⬜ | 3 |
| G6 | 用户规则 JSON 编辑 + 校验 | ✅ | 1 |
| G7 | 远程规则订阅（URL 定时拉取） | ⬜ | 3 |
| G8 | 配置导入导出（apiKey 脱敏） | ✅ | 1 |
| G9 | 配置云同步 | ➖ | |
| G10 | 缓存统计与清理 | 🔧 | 2 |
| G11 | 设置页 7 个 tab | ✅ | 1 |
| G12 | 界面多语言（zh-CN / en / zh-TW / ja） | 🔧 | 3 |
| G13 | 搜索增强（Google 结果双语 query） | ⬜ | 3 |
| G14 | Firefox 打包 | ⬜ | 3 |
| G15 | 油猴脚本版 | ⬜ | 3 |

## H. 排除项（不计）
漫画/图片 OCR 翻译、截图区域翻译、EPUB 阅读器与制作、移动端 App 与触屏手势、账号/Pro/会员/活动/埋点、配置云同步、分享到草稿。
