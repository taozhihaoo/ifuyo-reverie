# TTS — ifuyo Reverie（M8）

> 有声阅读的使用说明与行为边界。架构细节见 docs/M8-STATUS.md / docs/M8-EXPLORE.md。

## 使用

- 打开任意 Article / EPUB / PDF，工具栏出现 TTS 控制组：
  `⏮ ▶ ⏭ ■` + 语速（0.75x–2x）+ 语音下拉 + 状态提示。
- **▶ 朗读**：从当前阅读位置开始（视口阅读锚点所在句），自动连续读到文档末尾。
- 播放中 ▶ 变 ⏸：**暂停**（句级——继续时从当前句开头重读）；再点**继续**。
- ⏮ / ⏭：上一句 / 下一句（空闲时仅移动位置预览，不发声）。
- ■ 停止。
- 选中文字 → 弹出菜单 → **朗读所选**：一次性朗读选区，不滚动视图、不改变进度。
- 播放时当前句蓝色高亮，视图自动跟随到句中央；暂停/停止后视图完全交还用户。
- 手动跳转（目录/搜索/标注/书签跳转、PDF 翻页）会**中断朗读**——新位置就是下一次
  "朗读"的起点。

## 语音与语言

- 语音来自 Windows 系统本地语音（无网络、不上传任何内容）。
- "自动语音"按句内文字自动匹配语言（中/日/韩/英启发式）；找不到匹配语言语音时
  状态区明确提示，并回退默认语音。
- 语音选择与语速保存在本机（localStorage），换书保留。

## 边界

- 代码块（article 中的 code block）默认**不朗读**。
- 扫描版 PDF（无文本层）不可朗读，工具栏隐藏并提示"当前文档没有可读取文本"。
- Markdown / TXT 阅读器尚未提供——其 TTS 能力随 Reader 支持自动到位。
- TTS 不写任何源文件；不产生标注/书签；进度只经由现有阅读位置体系更新。

## 实现速览

| 层 | 文件 | 职责 |
|---|---|---|
| 文本 | src/tts/text-segmenter.js | 句子切分（CJK/英文/混合，偏移对齐原文） |
| 文本 | src/tts/text-normalizer.js | 朗读前瞬态规范化 |
| 文本 | src/tts/reading-segments.js | sections × 句子 → ReadingSegments |
| 控制 | app/renderer/tts-controller.js | 状态机 + 队列 + generation + 段级暂停 |
| 引擎 | app/renderer/tts-provider.js | 唯一触碰 speechSynthesis 的文件 |
| 接线 | app/renderer/tts-view.js | 工具栏/跟随高亮/语音/设置/生命周期 |

真机自检：`npm run smoke:tts`（CDP 驱动真实应用的 7 项运行时检查）。
