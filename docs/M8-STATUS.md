# M8 Status — ifuyo Reverie（TTS 有声阅读）

> M8 完成报告。测试证据：`npm test` **282/282 全绿**（M8 新增 19 例）+
> `npm run smoke:tts` **真实 Electron + Windows 语音引擎 7/7 检查通过**。

## 1. Goal / Scope / Non-Goals

- **Goal**：TTS 是 Unified Reader Shell 的共享能力——"读什么"由 Reader 决定，"怎么读"由
  TTS 决定；与 ReaderLocation / Selection / Progress / Search / Bookmark / Annotation 协同。
- **Scope**：文本切分/规范化/ReadingSegments、TtsProvider 抽象 + Windows 本地语音、
  Speech Queue + 状态机、播放/暂停/恢复/停止/上下句、语速、语音选择与语言匹配、
  从当前位置朗读、选区朗读、自动连读、位置跟随、生命周期与取消。
- **Non-Goals**：云端 TTS / AI 语音 / 语音识别 / 语音市场 / 音频编辑导出 / OCR（全部明确排除）。

## 2. Explore Results / Selected Provider

见 docs/M8-EXPLORE.md。**选定 Provider = Web Speech API（speechSynthesis）**：
Chromium 内置 → Windows SAPI/OneCore 本地语音；零新依赖、零网络、零 native 部署项。
PoC 实测（真机）：3 个 zh-CN 语音、rate 线性有效、`cancel → onerror('interrupted')`、
`speechSynthesis.paused` 标志不可信 → 状态自有、暂停采用**段级暂停**（cancel + 段首重读，
§9 最小可靠单位 = 句子）。

## 3. Provider Architecture（隔离）

- `app/renderer/tts-provider.js` — 唯一触碰 speechSynthesis 的文件；
  归一化 `interrupted` → `'cancelled'`，补 cancel 回调兜底定时器，暴露 onVoicesChanged。
- `app/renderer/tts-controller.js` — 状态机 + SpeechQueue + generation（UMD shim，
  Node 直接单测）；Provider 经依赖注入，可整体替换（§10）。
- `app/renderer/tts-view.js` — Shell 接线（控制按钮/状态区/跟随高亮/语音下拉/设置持久化）；
  app.js 仅调 open/close/readSelection/stopForNavigation。
- `src/tts/`（纯函数，Node 测试）— text-segmenter / text-normalizer / reading-segments。

## 4. Reader Text Model / Segmentation / Normalization

- **ReadingSections**（格式 → canonical 区间）：article = blocks（type 识别 code，§47 默认
  跳读源码）；book = 章节；pdf = 页（page_spans）。canonical 偏移体系三格式统一
  （M2/M6/M7 契约），段落 = 句子级 `ReadingSegment {index, sectionIndex, start, end}`。
- **TextSegmenter**：。！？；… + 英文 .（缩写/URL/小数/单字母首字母守卫）+ 引号闭合跟随；
  换行不作句界（§16）；超长回退逗号/空格/硬切。
- **TextNormalizer**：瞬态派生（控制字符/零宽/软连字符/空白折叠），URL 等不重写、
  绝不回写源文件（§45/不变量 1）。

## 5. Queue / State Machine / Voice / Rate

- Queue：文档切换/replace 走 generation 作废；陈旧回调按 generation 丢弃（§39，测试锁定）。
- 状态机：idle → preparing → speaking ⇄ paused → stopping → idle；speaking → error → idle；
  非法转换有明确行为（61.4 测试）。
- Voice：`refreshVoices()` 枚举（onvoiceschanged 异步补拉 + 打开时延迟重试）；保存
  voiceId 而非显示名（localStorage）；**语言匹配 = 段文本字符启发式**（zh/ja/ko/en）→
  同语言 voice → 无匹配显式提示"未找到匹配语言的语音"（§23，本机无英文语音的真实场景）。
- Rate：Reverie 逻辑速度 0.75–2.0 钳制，映射 provider rate（PoC 线性验证）。

## 6. Reader / Location / Selection / Auto Continue

- **从当前位置朗读** = 视口阅读锚点的首个文本节点 → canonical 偏移 → 命中段
  （fallback：下一段 → 文档首，§26）。
- **位置同步** = 当前段经 ReaderAnchor.rangeForOffsets → CSS Custom Highlight
  `reverie-tts`（蓝色，与标注黄区分）→ 播放中滚动跟随到段中央（§53：仅播放时跟随，
  暂停/停止后视图归用户）。零第二套 ReaderLocation（不变量 3）。
- **选区朗读** = selectionParts 偏移 → 一次性队列，不滚动不写进度不产生标注（§25，
  不变量 4）。
- **自动连读** = 段完成 → 下一段 → 段尽 → 下 section → 文档尽 → Completed（§27）。
- **手动导航**（TOC/书内搜索/全局搜索跳转/标注跳转/书签跳转/PDF 翻页）→ stopForNavigation
  中断队列（§29），跳转位置成为下次朗读起点。

## 7. 各格式支持（Batch 9 实测矩阵）

| Capability | Web(Article) | EPUB | PDF | Markdown | TXT |
|---|---:|---:|---:|---:|---:|
| Read Aloud | Supported | Supported | Supported | Unavailable* | Unavailable* |
| Selection Reading | Supported | Supported | Supported | — | — |
| From Location | Supported | Supported | Supported | — | — |
| Auto Continue | Supported | Supported | Supported | — | — |
| Location Sync | Supported | Supported | Supported | — | — |
| Language | Supported（启发式+提示） | 同 | 同（CJK 实测） | — | — |
| Search Integration | Supported | Supported | Supported | — | — |

\* Markdown/TXT **Reader 尚不存在**（loadArticle 无对应分支）——TTS 跟随 Reader 能力，
不新造 Reader；未来 Reader 支持后同一套机制自动生效。扫描 PDF：无 canonical →
控制组隐藏 + "当前文档没有可读取文本"（不变量 6）。PDF 多栏阅读顺序继承文本层内容流
顺序（M0 spike 记录的限制，M8 不做重排，§50）。

## 8. Security / Privacy / Performance

- **本地合成，零网络**：speechSynthesis 走系统本地语音；无任何用户内容上传（不变量 8/9）。
- TTS 不修改任何源文件（规范化是瞬态派生；全部测试+真机断言原始字节不变，不变量 1）。
- 不依赖派生索引（朗读数据全部来自 article:load payload；不变量 2）。
- 设置仅 localStorage（voiceId/rate，本地即弃，无新数据格式，§58）。
- 日志只 console 少量状态（无正文落日志，§72）；队列惰性取文本（不整书复制，§54）。

## 9. Tests / Regression / Restart

- **19 例 Node 测试**（tests/tts/）：切分（CJK/英文缩写/URL/换行/超长/空白）、规范化、
  sections×segments（code 跳读）、ReaderAnchor 偏移回环、状态机全转换、自动连读、
  段级暂停恢复、stop/replace 陈旧回调丢弃、**文档切换 A 停 B 播**、语音匹配与缺失提示、
  Provider 异常不崩溃、detectLang、语速钳制、真实 PDF canonical 分段。
- **回归**：M0–M7 全部 263 例无回归（282/282）。
- **真机 smoke（npm run smoke:tts）**：3 语音枚举 → 播放（第 1/165 句 + 高亮 + ⏸）→
  暂停/恢复 → 下一句推进 → 选区朗读所选 → 文档切换旧队列停止 → stop 清理。7/7。
- TTS 无持久化播放状态：应用重启后 Reader 位置由既有进度体系恢复（§64，M7 smoke 覆盖）。

## 10. Unsupported / Known Issues / Technical Debt

- 引擎暂停不使用（Windows 可靠性）→ 暂停=段首重读（体验取舍，已记录）。
- Markdown/TXT Unavailable（跟随 Reader 能力）。
- PDF 多栏顺序不做重排；扫描 PDF 不可朗读（明确提示）。
- 逐字符 karaoke 高亮不做（§9：句子级为最小可靠单位）。
- `speechSynthesis` 缺失环境（无语音系统）→ 控制组隐藏，Reader 其余功能完全正常
  （不变量 10）。

## 11. Third-party Dependencies / License

零新增。speechSynthesis 为 Electron/Chromium 内置能力；语音为 Windows 系统组件。

## 12. M9 Dependencies

M8 为 M9 提供：ReadingSegments（canonical 偏移段模型）、TTS Capability 接线模式
（tts-view 的 open/close 生命周期）、ReaderLocation 同步管线。M9 的 Web→EPUB /
高级导出不依赖 TTS 内部。

## RESOLVED

- 跨格式单套 TTS（article/book/pdf 共用同一 Provider/Queue/位置同步，零格式分支堆积）。
- Windows 引擎差异（paused 标志、pause 可靠性、cancel 事件、voices 异步加载）全部在
  Provider/Controller 层吸收并有测试。
- 选区朗读与进度隔离（selection 模式不滚动不写盘）。

## CONFIRMED

282/282 测试；smoke-tts 7/7（真实语音引擎合成、高亮跟随、暂停恢复、上下句、选区、
切换清理）；PDF CJK 文本分段朗读（text.pdf 165 句）。

## REMAINING RISKS

- 极端 malformed 文本（畸形 Unicode 组合）依赖引擎容错——分段已防御性清洗。
- 长时间播放（>1h）内存曲线未做自动化观测（队列惰性、无音频文件缓存，架构上无增长点；
  记录为 M11 稳定性阶段的长跑观测项）。
- Windows 语音安装差异（如无中文语音的英文系统）：提示已实现，音质取决于系统语音包。
