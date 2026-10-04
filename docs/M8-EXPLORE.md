# M8 Explore — TTS 有声阅读（Phase A/B 产物）

> FACT 全部来自当前仓库代码与真实 Electron 运行 PoC（2026-10-05）；推测显式标注。

## 1. 运行环境与 TTS 能力 PoC（Batch 1 实测）

**FACT（真实 Electron + 本机 Windows 实测，脚本见提交历史 tmp-tts-poc）**：

- `window.speechSynthesis` 可用（Chromium → Windows SAPI/OneCore 桥接，零新依赖、零网络、本地合成）。
- 枚举到 3 个语音：Microsoft Huihui / Kangkang / Yaoyao，全部 `zh-CN`、`localService=true`；
  **本机没有任何英文语音**（EN_VOICES=0）——语言 fallback 与"语音不匹配提示"是本机真实场景。
- 英文文本用 zh 语音可正常合成（onstart/onend 正常）；中文正常。
- **volume=0 静音下事件与时长照常**：rate 0.5 → 8611ms，rate 2.0 → 4505ms（≈2 倍反比，语速映射有效）。
- `cancel()` → `onerror('interrupted')` 而**不是** onend——控制器必须把 interrupted 视为预期取消。
- **`speechSynthesis.paused` 标志不可信**（pause() 后读 false、resume() 后读 true，与语义相反）
  → 印证任务书 §9：位置/状态绝不依赖引擎内部状态，用自有状态机。
- **HYPOTHESIS**（无法自动化验证听觉）：Windows 上 Chromium 的 pause() 实际暂停可靠性存在
  已知版本差异。**决定**：Pause 采用**段级暂停**（cancel + 记住当前段；Resume 从当前段重读），
  语义粒度 = 句子，跨版本确定可靠且可在 Node 中完整测试；记录为体验取舍。

**选型结论**：`speechSynthesis`（Web Speech API）作为 Windows 本地 TTS Provider。
无第三方依赖（Electron/Chromium 内置）、无网络上传（§3.1 local-first 满足）、
无 native 部署项。License：Chromium 内置能力，无额外包。SAPI 语音由系统提供。

## 2. Reader 文本抽象现状（代码事实）

- **FACT**：三种可打开格式（article/book/pdf）在渲染层都持有 canonical text 且
  DOM textContent === canonical（M2/M6/M7 契约测试锁定）→ **ReaderAnchor 全局偏移
  对三种格式一律可用**，高亮/跳转/选区机制天然共享。
- **FACT**：结构化 sections 全部可从既有 payload 推导（无需改 main）：
  - article：`loaded.blocks[].text` 累积长度 = canonical 偏移（markdown-reader 保证
    canonical === blocks.text.join('')），block.type 可识别 code/heading；
  - book：`chapters[].text` 累积长度（M6 拼接契约）；
  - pdf：`page_spans`（M7）+ `pages[].has_text`。
- **FACT**：Reader 无法打开 markdown/text 类型文档（loadArticle 只有 book/pdf/article
  分支）——M8 TTS 跟随 Reader 能力，不新造 Reader（§52 复用正文提取，不另写）。
  Markdown/TXT 行该记 Unavailable（待未来 Reader 支持后自动获得 TTS——同一套机制）。
- **FACT**：扫描 PDF canonical 为空（M7）→ TTS 禁用 + 明确提示（§19/不变量 6）。

## 3. 复用面（不新造）

- 位置同步 = CSS Custom Highlight `reverie-tts` + `ReaderAnchor.rangeForOffsets` +
  scrollIntoView——与高亮/搜索跳转同一套（不变量 3：不建第二套 ReaderLocation）。
- 从当前位置朗读 = ReaderAnchor.textIndex 找视口顶部首个文本节点 → 全局偏移 → 段定位。
- 选区朗读 = 既有 selectionParts 的 {start,end} → 段落队列，selection 模式不跟随滚动、
  不碰 Progress（不变量 4）。
- Progress = 既有滚动防抖保存器（TTS 跟随播放滚动视图 = 用户可见位置，单一进度体系，§31）。
- 设置持久化 = 渲染层 localStorage（voiceId + rate，本地即弃性质；无独立数据库，§36/58）。

## 4. 架构（§5 边界）

```
app/renderer/app.js（Shell：控制按钮/状态区/跟随滚动/生命周期挂钩）
        │ 注入 sections + currentOffset + jump 回调
app/renderer/tts.js           TtsController + SpeechQueue + 状态机 + generation
        │ Provider 接口（注入）
app/renderer/tts-provider.js  WebSpeechProvider（唯一触碰 speechSynthesis 的文件）
        │
src/tts/text-segmenter.js     句子切分（CJK/英文/混合/超长回退）→ canonical 偏移
src/tts/text-normalizer.js    朗读前规范化（瞬态派生，绝不回写，§45）
src/tts/reading-segments.js   sections × 句子 → ReadingSegments（纯函数，全格式共用）
```

- src/tts 全部纯函数 → Node 直接单测（61.1/61.2）。
- TtsController 依赖注入 FakeProvider → Node 完整测状态机/队列/并发/文档切换
  （61.3/61.4/61.5/61.6），不依赖真实语音。
- 语速：Reverie 逻辑速度 0.75×–2.0× → provider rate 直传（PoC 证实线性有效）。
- 语言选择：段首字符启发式（CJK 平假名/片假名/谚文范围）→ 匹配 voice.lang 前缀 →
  找不到同语言 voice → 用默认 voice + UI 提示"未找到 xx 语音"（§23，本机真实场景）。

## 5. UX 规则（§28/§29/§53 明确定义）

- 播放中：视图自动跟随当前段（滚动至段中央）；暂停/停止后视图完全交给用户。
- 手动导航（TOC/搜索/书签/标注跳转、翻页）：**中断当前队列**，跳转位置成为下一次
  "从当前位置朗读"的起点；正在播放则停止（不偷偷继续旧位置）。
- 文档切换/返回：stop + generation 作废（旧回调按 generation 丢弃）。
- Selection 朗读：独立一次性队列，不滚动、不写进度、不产生标注/书签。
- 结尾：文档读尽 → Completed → Idle。

## 6. 未解决问题 / 限制

- 本机无英文语音：英文文档朗读音质依赖系统安装语音（提示已实现）——部署环境差异，非代码缺陷。
- 段级暂停会从当前句开头重读（可靠性优先，已记录）。
- PDF 文本层阅读顺序 = 内容流顺序（M0 spike 记录过 columns 顺序问题）——多栏 PDF 朗读
  顺序限制继承自 M7 文本层，M8 记录不做重排（§50 明确允许）。
- markdown/text Reader 不存在 → TTS 对这两种类型 Unavailable（跟随 Reader 能力）。
