# ifuyo Reverie — M8 TTS 有声阅读开发提示词

> **项目：ifuyo Reverie**
>
> **里程碑：M8 — TTS 有声阅读**
>
> **目标平台：Windows**
>
> **技术基线：以当前仓库实际代码、项目配置、运行环境为唯一事实来源**
>
> **开发方式：Explore → Plan → Implement → Test → Review → Document**
>
> **重要：不要假设此前设计一定已经完整实现。先检查代码，再根据事实调整实现方案。**
>
> **本阶段完成后，Reverie 应具备真正可用的本地有声阅读能力，并能与现有 Unified Reader Shell、Web / EPUB / PDF / Markdown / TXT Reader、Search、Bookmark、Annotation、Progress 正常协同。**

---

# 一、M8 的核心目标

本阶段实现：

> **TTS = Unified Reader Shell 的共享阅读能力，而不是某个格式 Reader 的专属功能。**

M8 完成后，用户能够在 Reverie 中：

- 对当前文档进行朗读；
- 对选中的文字进行朗读；
- 从当前阅读位置开始朗读；
- 暂停；
- 继续；
- 停止；
- 调整语速；
- 切换可用语音；
- 跳到上一段 / 下一段；
- 自动连续朗读；
- 在朗读过程中看到当前正在朗读的位置；
- 在文档中定位回当前朗读位置；
- 切换文档后正确停止或切换 TTS；
- 对不同语言文本选择合适语音；
- 对超长文档稳定朗读，而不会因为一次性传入全文导致卡顿、内存增长或无法取消。

同时：

> **TTS 必须建立在已有 Reader 文本抽象和 ReaderLocation 之上。**

不得针对 Web、EPUB、PDF 分别写三套 TTS。

---

# 二、先明确 M8 的边界

## 2.1 本阶段必须完成

M8 核心范围：

1. Reader 文本抽取接口统一化
2. Reader Text Model / Reading Segment 抽象
3. TTS Provider 抽象
4. Windows 本地 TTS 能力接入
5. Voice 枚举与选择
6. Speech Queue
7. 播放 / 暂停 / 恢复 / 停止
8. 语速控制
9. 段落级 / 句子级朗读
10. 从当前位置开始朗读
11. 选中文字朗读
12. 当前朗读位置同步
13. TTS → ReaderLocation
14. ReaderLocation → TTS
15. 自动继续下一段
16. 文档切换 / Reader 切换生命周期处理
17. TTS 错误处理
18. 长文本分块
19. 取消与并发控制
20. CJK 文本处理
21. Search / Annotation / Bookmark / Progress 集成
22. 本地化
23. 测试
24. 性能测试
25. 文档

---

# 三、明确非目标

本阶段明确不做：

### 3.1 不做云端 TTS

不得默认调用：

- Azure 云端语音
- Google Cloud TTS
- ElevenLabs
- 第三方在线 TTS
- 任何必须上传用户正文内容的服务

Reverie 的核心原则仍然是：

> **Local-first。用户阅读内容默认不离开本机。**

---

### 3.2 不做 AI Voice

不做：

- AI 人声
- Voice Cloning
- 情感语音生成
- AI 改写后朗读
- AI 总结后朗读
- AI 翻译后朗读

TTS 只负责：

> **把当前 Reader 提供的文本转换为语音。**

---

### 3.3 不做语音识别

不做：

- Speech-to-Text
- Dictation
- Voice Command
- 语音笔记

---

### 3.4 不做在线语音市场

不做：

- 在线下载声音
- 在线 Voice Marketplace
- 用户账户
- 云端 Voice Sync

---

### 3.5 不做复杂音频编辑

不做：

- 音频剪辑
- 导出 MP3
- 自动生成有声书文件
- 背景音乐系统
- 混音器

---

# 四、第一原则：先 Explore，不要直接编码

在开始实现任何代码以前：

## 4.1 检查当前项目真实状态

重点检查：

- Unified Reader Shell
- `IReaderAdapter`
- ReaderLocation
- Progress
- Bookmark
- Search
- Annotation
- Web Reader
- EPUB Reader
- PDF Reader
- Markdown Reader
- TXT Reader
- Reader Selection
- Reader 生命周期
- Reader Toolbar
- Reader Settings
- 项目当前音频相关能力
- Windows 平台能力
- 当前 .NET / C# 运行环境
- 当前 Godot 版本和导出配置

确认：

> M6 / M7 提供的文本、Selection、Location 抽象究竟实现到什么程度。

不要依据文档假设代码已经存在。

---

# 五、先定义 TTS 的真正架构

推荐目标架构：

```text
Unified Reader Shell
        │
        ├── Reader Adapter
        │      ├── Web
        │      ├── EPUB
        │      ├── PDF
        │      ├── Markdown
        │      └── TXT
        │
        └── Reader Text Service
                 │
                 ├── Reading Document
                 ├── Reading Section
                 ├── Reading Segment
                 ├── Segment Location
                 └── Text Metadata
                          │
                          ▼
                    TTS Service
                          │
                    Speech Queue
                          │
                    TTS Provider
                          │
                 Windows Local TTS
```

重点：

> **Reader 决定“读什么”。TTS 决定“怎么读”。**

不要让 TTS 自己重新解析 HTML / EPUB / PDF。

---

# 六、Reader Text Model

M8 必须建立或者补全统一的阅读文本抽象。

建议概念：

```text
ReadingDocument
ReadingSection
ReadingSegment
ReadingLocation
```

例如：

```text
ReadingDocument
 ├── Section 1
 │    ├── Segment 1
 │    ├── Segment 2
 │    └── Segment 3
 │
 ├── Section 2
 │    ├── Segment 4
 │    └── Segment 5
 │
 └── Section 3
```

其中 `ReadingSegment` 至少应能够表达：

```text
SegmentId
Text
DocumentId
SectionId
Sequence
StartLocation
EndLocation
Language
SourceType
Selectable
```

根据当前代码实际情况调整字段。

---

# 七、TTS 不应直接依赖视觉页面

非常重要：

> TTS 位置不能建立在“屏幕坐标”或“当前 UI Page Index”上。

例如 PDF：

```text
PDF Page 10
```

不是稳定的朗读定位。

应该尽可能关联：

```text
DocumentId
PageIndex
Text Range
Quote
Context
ReaderLocation
```

EPUB：

```text
Chapter
Element
Text Range
Quote
Context
```

Web：

```text
DOM/semantic block
Text Range
Quote
Context
```

Markdown / TXT：

```text
Line / Offset / Text Range
```

最终都应该落到：

> `ReaderLocation`

---

# 八、必须把 TTS 与 ReaderLocation 打通

这是 M8 最重要的技术任务之一。

## 8.1 ReaderLocation → TTS

用户当前在：

```text
ReaderLocation X
```

点击：

> 从当前位置朗读

TTS 应该能够找到最接近的 `ReadingSegment`：

```text
ReaderLocation
      ↓
ReadingSegment
      ↓
SpeechQueue
```

---

## 8.2 TTS → ReaderLocation

朗读过程中：

```text
Speech Segment
       ↓
Segment Location
       ↓
ReaderLocation
       ↓
Reader UI
```

Reader 应该能够显示：

- 当前章节；
- 当前段落；
- 当前文本附近位置；
- 当前阅读位置。

具体视觉表现以当前 Reader UI 为准。

---

# 九、朗读位置不能依赖语音引擎内部状态

不要直接假设：

> “TTS API 告诉我们现在播放到第 347 个字符。”

不同平台 / Provider 的能力可能不同。

因此建立自己的：

```text
SpeechSegment
```

和：

```text
SegmentOffset
```

模型。

最小可靠定位单位优先使用：

> **句子 / 段落 / Segment**

而不是强行做到逐字符同步。

---

# 十、M8 的 TTS Provider 抽象

建立类似：

```csharp
ITtsProvider
```

职责只包括语音能力：

```text
GetVoices()
Speak()
Pause()
Resume()
Stop()
SetRate()
```

或者根据当前工程实际架构调整。

不要让 Provider 负责：

- Reader
- Library
- Annotation
- Progress
- UI
- SQLite

Provider 只负责：

> **Speech Synthesis。**

---

# 十一、Windows TTS 实现

先检查当前运行环境能够实际使用哪些 Windows 本地 TTS 能力。

不要因为资料中某个 API “理论上可用”就直接采用。

必须实际验证：

- 当前 Windows；
- 当前 .NET；
- 当前 Godot C#；
- 当前导出方式；
- 当前线程模型；
- 当前音频输出；
- 当前部署环境。

建立最小 PoC。

验证：

1. 能否枚举系统 Voice；
2. 能否播放中文；
3. 能否播放英文；
4. 能否暂停；
5. 能否恢复；
6. 能否停止；
7. 能否调整语速；
8. 是否支持异步；
9. 是否能够可靠取消；
10. 文档切换时是否能够停止；
11. 程序关闭时是否能够释放资源。

---

# 十二、第三方依赖必须隔离

如果当前环境最终需要第三方 TTS 库：

必须：

```text
TTS Abstraction
        ↓
Provider Adapter
        ↓
Third-party API
```

禁止：

```text
Reader → Third-party API
UI → Third-party API
```

第三方 API 不允许污染 Reverie 核心领域模型。

同时记录：

- package
- version
- license
- native dependency
- runtime dependency
- Windows-only limitation
- redistributable requirement

不得因为“能运行”就忽略许可证和部署条件。

---

# 十三、Speech Queue

必须建立明确的队列模型。

推荐：

```text
SpeechQueue
 ├── Current
 ├── Pending
 └── Completed
```

每个 Queue Item 至少包含：

```text
DocumentId
SegmentId
Text
ReaderLocation
Language
Voice
Rate
Sequence
```

---

# 十四、为什么必须有 Queue

不能：

```text
整本书 → 一次性传给 TTS
```

必须进行有限分块：

```text
Document
   ↓
Sections
   ↓
Paragraphs
   ↓
Sentences
   ↓
Speech Segments
```

原因：

- 避免超长输入；
- 提高取消速度；
- 支持当前位置；
- 支持暂停；
- 支持下一段；
- 支持错误恢复；
- 减少内存占用；
- 减少 UI 卡顿。

---

# 十五、Chunk / Segment 切分策略

建立统一的：

```text
TextSegmenter
```

至少处理：

### 中文

例如：

```text
这是第一句话。这里是第二句话！第三句话？
```

应合理切分。

### 英文

处理：

```text
.
!
?
```

以及常见缩写，避免粗暴按句号切断。

### 混合文本

例如：

```text
这是 Windows 11 上的测试。
The next section starts here.
```

需要正常处理。

---

# 十六、不要把所有换行都当一句

HTML / EPUB / Markdown / PDF 中：

```text
视觉换行 ≠ 语义句子结束
```

尤其 PDF。

不要简单：

```text
Split('\n')
```

作为最终方案。

必须考虑：

- paragraph
- line break
- sentence punctuation
- heading
- list
- block
- page boundary

---

# 十七、Reader Text Provider

建议建立：

```text
IReaderTextProvider
```

职责：

```text
GetCurrentText()
GetSelectionText()
GetTextFromLocation()
GetNextSegment()
GetPreviousSegment()
GetReadingSegments()
```

具体接口根据现有代码调整。

核心原则：

> Reader Adapter 提供“语义阅读文本”，TTS 不直接碰底层 DOM、EPUB XML、PDF API。

---

# 十八、不同格式的 TTS 策略

## Web

优先：

```text
正文语义结构
```

避免朗读：

- 导航菜单
- 页脚
- 分享按钮
- UI 文本
- 隐藏文本
- 不相关侧栏

---

## EPUB

优先：

```text
Reading Order
→ XHTML Content
→ Semantic Blocks
```

不要朗读：

- EPUB UI
- TOC UI
- 隐藏元素
- 脚本内容

---

## PDF

使用：

```text
PDF Text Layer
```

处理：

- 页面顺序；
- 段落；
- 断行；
- 连字符；
- 页眉页脚；
- 多栏文本。

尤其注意：

> PDF 不是天然的“语义文本”。

不要假设 PDF Text Extraction 得到的字符串已经适合直接朗读。

需要建立最小可用的文本规范化处理。

---

## Markdown / TXT

优先使用原始文本。

可以根据：

- Heading
- Paragraph
- Blockquote
- List

组织 Segment。

---

# 十九、扫描 PDF 的处理

M7 已明确：

> M7 不做 OCR。

因此：

```text
Scanned PDF
```

在 M8：

- 可以显示；
- 可以翻页；
- 可以收藏；
- 可以 Bookmark；
- 可以保存 Progress；

但是：

- 没有文本；
- 无法 TTS；
- 无法基于文本 Selection；
- 无法进行文本 Search。

UI 必须明确表现：

> 当前文档不包含可读取文本。

不要静默失败。

---

# 二十、TTS 控制

Reader Shell 应提供统一 TTS 控制。

至少：

```text
Play
Pause
Resume
Stop
Previous Segment
Next Segment
```

以及：

```text
Rate
Voice
```

---

# 二十一、语速

建议不要把 UI 与底层 Provider 参数直接绑定。

建立 Reverie 自己的逻辑速度：

```text
SpeechRate
```

例如：

```text
0.75x
1.0x
1.25x
1.5x
1.75x
2.0x
```

具体范围根据实际 Provider 能力调整。

如果 Provider 只有有限 rate 范围：

```text
Reverie Rate
    ↓
Provider Mapping
```

而不是让整个 Reader 依赖平台参数。

---

# 二十二、Voice 管理

建立：

```text
TtsVoice
```

至少包含：

```text
VoiceId
DisplayName
Language
Gender (如果 Provider 能可靠提供)
ProviderId
```

不要依赖 Voice DisplayName 作为唯一 ID。

设置应保存：

```text
VoiceId
Rate
```

而不是：

```text
VoiceName
```

---

# 二十三、语言自动选择

至少考虑：

```text
zh-CN
zh-TW
en-US
en-GB
ja-JP
```

具体支持以系统实际安装 Voice 为准。

建议：

```text
Document Language
        ↓
Preferred Voice
        ↓
Fallback Voice
```

但必须避免：

> 没有中文 Voice，却错误使用英文 Voice 读完整中文。

UI 应明确提示 Voice 不匹配。

---

# 二十四、语言检测

M8 不需要建立复杂 NLP。

可以基于：

- 文档 metadata；
- Reader 已知语言；
- 用户选择；
- 简单字符范围 heuristic。

最终得到：

```text
DetectedLanguage
```

它只是：

> Voice Selection Hint

不是权威事实。

---

# 二十五、选中文字朗读

M8 必须支持：

用户：

```text
Select text
    ↓
Read Selection
```

然后：

```text
Selected Text
    ↓
TextSegmenter
    ↓
Speech Queue
```

这不应该改变整个 Document 的阅读位置。

也不应该因为朗读 Selection：

> 自动把 Progress 写到选区结束位置。

---

# 二十六、从当前位置朗读

提供：

> 从当前位置开始

逻辑：

```text
Current ReaderLocation
        ↓
Find nearest ReadingSegment
        ↓
Create Queue
        ↓
Speak
```

如果无法精确恢复：

```text
Exact
→ Nearby
→ Section Start
→ Document Start
```

采用已有 ReaderLocation fallback 设计。

---

# 二十七、自动连续朗读

当当前 Segment 完成：

```text
Current Segment
       ↓
Next Segment
       ↓
Speak
```

直到：

```text
End of Section
```

继续：

```text
Next Section
```

直到：

```text
End of Document
```

---

# 二十八、不要让自动朗读无限跨越用户意图

需要明确：

### 默认行为

从用户启动的位置开始：

> 连续读当前阅读上下文。

### 文档结束

停止。

### 用户切换章节

根据 Reader 当前行为决定：

- 跟随新位置继续；
- 或停止当前 TTS。

必须形成明确的 UX 规则，而不是出现：

> 用户跳到完全不同的位置，TTS 仍然偷偷继续原来的内容。

---

# 二十九、用户手动导航时的行为

用户在播放过程中：

```text
Page Down
Next Chapter
TOC Jump
Search Result Jump
Annotation Jump
Bookmark Jump
```

必须定义：

> 是否停止、暂停或重定位 TTS。

建议默认：

```text
重大 ReaderLocation 跳转
→ 中断当前 Queue
→ 新位置成为下一次朗读起点
```

不要继续朗读旧位置。

最终以现有 Reader UX 为准。

---

# 三十、TTS 与 Progress

这是一个容易产生数据污染的地方。

必须明确：

> **TTS 不得偷偷改变用户阅读状态。**

尤其禁止：

```text
TTS 播放开始
→ 自动 Mark Read
```

也禁止：

```text
TTS 读到 20%
→ 强制写 Progress 20%
```

Progress 的行为必须与 Reader 当前产品规则一致。

可以支持：

> TTS 正常阅读期间同步 Reader 当前阅读位置。

但必须定义：

- 更新频率；
- 写盘频率；
- 用户停止时；
- 用户跳转时；
- 程序异常关闭时。

避免每个句子都触发磁盘写入。

---

# 三十一、推荐 Progress 策略

建议：

```text
Visual Reader Navigation
        ↓
Primary Progress

TTS Playback
        ↓
Secondary signal
        ↓
Only update Reader current location
```

也就是说：

> TTS 可以驱动当前阅读视图，但不要建立第二套 Progress 系统。

最终：

```text
ReaderLocation = 唯一阅读位置体系
```

---

# 三十二、TTS 与 Bookmark

Bookmark 使用：

```text
ReaderLocation
```

TTS 不需要创建独立 Bookmark。

用户从 Bookmark 跳转：

```text
Bookmark
   ↓
ReaderLocation
   ↓
Reader
   ↓
Read From Here
```

---

# 三十三、TTS 与 Annotation

Highlight / Note：

```text
Annotation
   ↓
ReaderLocation
   ↓
Reader
   ↓
Read From Here
```

不要让 TTS 创建新的 Annotation。

“朗读过”不等于用户 Highlight。

---

# 三十四、TTS 与 Search

Search：

```text
Search Result
    ↓
ReaderLocation
    ↓
Reader
    ↓
Read From Here
```

TTS 不需要自己的 Search。

同时可以考虑：

> 当前朗读文本是否与 Search / Selection 使用同一规范化文本模型。

如果当前系统存在文本标准化不一致，应在 M8 修复，而不是增加第三套规则。

---

# 三十五、TTS 与 SQLite

核心原则继续保持：

> **TTS 不依赖 SQLite 才能正常工作。**

SQLite 可以保存：

- 最近使用的 Voice；
- Rate；
- UI preference；
- 可选的 TTS state。

但不得让：

```text
TTS Queue
```

依赖数据库才能运行。

数据库删除后：

> TTS 仍然应该能够读取文件、打开文档、正常朗读。

---

# 三十六、TTS 设置保存

可以保存：

```text
Preferred Voice
Speech Rate
Auto Continue
```

但使用用户配置或现有 Preference 系统。

不要因为几个设置就建立独立数据库。

---

# 三十七、生命周期管理

重点处理：

```text
Reader Open
Reader Close
Document Switch
Application Pause
Application Exit
```

必须确保：

### Reader 关闭

停止 TTS。

### 文档切换

停止旧文档 Queue。

### 应用退出

释放 Speech Provider。

### Provider Exception

不会导致 Reader 崩溃。

---

# 三十八、取消与并发

这是 M8 的 P0 风险区域之一。

必须支持：

```text
Start
Cancel
Replace
```

例如：

```text
Document A 正在朗读
        ↓
用户打开 Document B
        ↓
Cancel A
        ↓
Dispose A
        ↓
Create B
```

禁止：

```text
A 和 B 同时在后台播放
```

---

# 三十九、Generation / Cancellation Token

根据当前项目并发模型选择合适机制。

可以采用：

```text
CancellationToken
+
Operation Generation
```

防止：

> 旧 TTS 请求完成后覆盖新状态。

例如：

```text
Generation 12
Generation 13
```

当 12 完成时：

```text
if generation != current
    discard
```

---

# 四十、异常处理

至少处理：

- Voice 不存在；
- Voice 被系统卸载；
- Provider 初始化失败；
- 文本为空；
- 文本过长；
- Provider 不支持语言；
- 播放设备异常；
- Provider 被中断；
- Reader 被关闭；
- App 退出；
- 系统 Voice 切换；
- Windows API 异常。

原则：

> TTS 是可选能力，不能拖垮核心 Reader。

---

# 四十一、TTS UI

基于现有 Unified Reader Shell 设计。

建议不要做巨大的独立播放器页面。

核心控制：

```text
🔊  Play / Pause
Voice
0.75x 1x 1.25x 1.5x 2x
Previous
Next
Stop
```

也可以提供一个轻量 TTS 状态区：

```text
Reading:
《xxx》

Chapter 3
██████████░░░░

1.5x · 中文语音
```

UI 以现有视觉系统为准。

---

# 四十二、不要复制浏览器播放器逻辑

TTS 不是音乐播放器。

不需要：

- Album
- Playlist
- Media Library
- Cover
- Audio Timeline
- Waveform
- EQ

它是：

> **Reader 的辅助能力。**

---

# 四十三、TTS State

建立清晰状态机。

例如：

```text
Idle
Preparing
Speaking
Paused
Stopping
Completed
Error
```

禁止靠：

```text
bool isPlaying
bool isPaused
bool isLoading
```

无规则堆叠状态。

具体状态枚举根据当前项目风格调整。

---

# 四十四、状态转换

至少验证：

```text
Idle
 → Preparing
 → Speaking
 → Paused
 → Speaking
 → Stopping
 → Idle
```

以及：

```text
Speaking
 → Error
 → Idle
```

和：

```text
Speaking
 → DocumentChanged
 → Stopping
 → Idle
```

---

# 四十五、文本清洗

TTS 前建立统一：

```text
TextNormalizer
```

处理：

- 多余空格；
- 连续换行；
- HTML entity；
- 不可见字符；
- 非必要控制字符；
- PDF 连字符；
- 重复页眉页脚；
- URL；
- Emoji；
- 特殊符号。

但注意：

> 不允许因为“方便朗读”而破坏 Reader 原文。

TTS Normalization 是：

```text
Ephemeral Derived Representation
```

不能反向写入源文件。

---

# 四十六、特殊文本处理

考虑：

```text
URL
www.example.com
email@example.com
123456789
Markdown syntax
HTML syntax
code block
table
emoji
CJK punctuation
English abbreviations
```

不要求 M8 实现专业 NLP。

但必须：

> 建立明确的最小规则，并保证不会明显破坏阅读体验。

---

# 四十七、代码块策略

需要检查当前项目对 Markdown / Web / EPUB 中 Code Block 的实际表现。

可以采用：

```text
Read Code
```

或：

```text
Skip Code
```

但必须统一定义。

默认情况下：

> 不要因为 TTS 正文模型错误地把源码、HTML、脚本、CSS 当作自然语言全文朗读。

---

# 四十八、表格策略

表格文字需要考虑：

```text
cell1 | cell2 | cell3
```

直接朗读可能很差。

M8 不需要做复杂无障碍语义引擎，但必须避免非常明显的：

> 重复标题 / 布局噪声 / HTML 标签朗读。

---

# 四十九、图片与 Alt Text

不能自动把：

```text
<img alt="...">
```

全部加入正文。

是否朗读 Alt Text：

- 根据当前 Reader 的语义文本模型；
- 根据内容结构；
- 明确定义规则。

不要无条件：

> 图片出现 = TTS 朗读 Alt。

---

# 五十、PDF 特殊问题

PDF TTS 必须重点检查：

- 两栏文本；
- 页眉；
- 页脚；
- 页码；
- 连字符；
- 阅读顺序；
- 图表；
- 文本框；
- 字体编码。

不要把：

```text
视觉位置排序
```

直接认定为：

```text
自然阅读顺序
```

如果底层 PDF 引擎能够提供更可靠顺序：

> 使用其实际能力。

否则：

> 在 M8 明确记录限制。

---

# 五十一、EPUB 特殊问题

注意：

- heading；
- paragraph；
- blockquote；
- list；
- image；
- footnote；
- hyperlink；
- ruby；
- CJK punctuation。

尤其：

> 不要把导航、脚注结构错误地拼进正文。

---

# 五十二、Web Reader 特殊问题

Web 页面的：

```text
DOM
```

与：

```text
Reading Content
```

不是同一个概念。

必须检查现有 Reader 是否已经具备：

```text
Main Content Extraction
```

如果已经存在：

> 直接复用。

不要 M8 又写一套网页正文提取器。

---

# 五十三、TTS 与页面自动滚动

可以让 TTS 当前 Segment 驱动：

```text
Reader Scroll / Page Jump
```

但要防止：

> TTS 每句话都强制把用户滚动位置抢回来。

建议：

- 自动朗读时可跟随；
- 用户主动滚动后暂时尊重用户；
- 下一重大 Segment / Chapter 再按规则恢复；
- 不允许滚动逻辑与 TTS 相互打架。

具体规则必须通过实际体验验证。

---

# 五十四、性能要求

测试：

### 短文本

几十句。

### 中型文章

约数千字。

### 长文

数万字。

### 长书

几十万字级正文。

重点监控：

- CPU；
- 内存；
- GC；
- TTS Queue；
- UI 响应；
- Reader 滚动；
- 取消延迟；
- 文档切换；
- 长时间播放。

禁止：

```text
启动整本书全文 String
→ 一次性进入 TTS Provider
```

---

# 五十五、缓存策略

不建议把大量已经生成的 TTS 音频缓存到 Library。

M8 默认：

> 实时本地合成。

不要因为实现方便就给每段生成永久音频文件。

这样可以避免：

- Library 膨胀；
- voice 修改后缓存失效；
- rate 修改后缓存失效；
- 语言修改后缓存失效；
- 数据迁移复杂化。

---

# 五十六、TTS 与文件真相原则

TTS 生成的任何：

```text
Queue
Normalized Text
Temporary Data
Playback State
```

都属于：

> Derived / Runtime Data

不能成为原始内容真相。

原始内容仍然来自：

```text
Web Article File
EPUB File
PDF File
Markdown File
TXT File
```

---

# 五十七、断电 / 崩溃安全

TTS 本身一般不需要持久化播放进度。

如果已有 Progress 系统会在正常阅读时更新：

> 使用已有安全写入策略。

不得为了 TTS 引入高频磁盘写入。

---

# 五十八、M8 的数据格式原则

尽量不增加新的核心用户数据格式。

如必须增加：

必须说明：

```text
为什么需要
谁读取
谁写入
能否删除
能否重建
是否影响用户数据恢复
版本策略
```

优先使用已有：

- preferences；
- Reader state；
- progress；
- settings。

---

# 五十九、国际化

TTS UI 所有文字必须进入已有 i18n 系统。

例如：

```text
Play
Pause
Resume
Stop
Voice
Speed
No voices available
Voice unavailable
This document contains no readable text
Reading selection
Reading from current position
```

不得把中文 / 英文硬编码进 UI。

---

# 六十、M8 实现分批

建议分为以下批次。

---

## Batch 1 — Explore / TTS Capability PoC

目标：

验证当前环境真实可行的 Windows Local TTS 方案。

输出：

```text
docs/M8-EXPLORE.md
```

至少记录：

- 当前运行环境；
- 可用 API；
- Provider 候选；
- 实际 PoC 结果；
- 中文；
- 英文；
- Voice；
- Rate；
- Pause；
- Resume；
- Stop；
- Async；
- Cancellation；
- 生命周期；
- Native Dependency；
- License；
- 部署问题；
- 最终选择；
- 未解决问题。

**没有完成 PoC，不要直接进入正式实现。**

---

## Batch 2 — Reader Text Abstraction

实现或补全：

```text
ReadingDocument
ReadingSection
ReadingSegment
IReaderTextProvider
```

整合：

- Web；
- EPUB；
- PDF；
- Markdown；
- TXT。

重点：

> TTS 不应该需要知道具体格式。

---

## Batch 3 — Text Segmentation / Normalization

实现：

```text
TextSegmenter
TextNormalizer
```

处理：

- CJK；
- English；
- mixed language；
- paragraph；
- heading；
- line break；
- URL；
- punctuation；
- PDF line break；
- hyphen；
- HTML noise。

建立单元测试。

---

## Batch 4 — TTS Domain / Provider

建立：

```text
ITtsProvider
TtsVoice
TtsState
TtsRequest
TtsResult
```

同时实现：

```text
Windows Local TTS Provider
```

Provider 与业务解耦。

---

## Batch 5 — Speech Queue / Playback Controller

实现：

```text
TtsController
SpeechQueue
```

支持：

```text
Play
Pause
Resume
Stop
Next
Previous
Cancel
Replace
```

实现状态机。

---

## Batch 6 — Reader Integration

整合 Unified Reader Shell：

```text
Play Current
Read Selection
Read From Here
```

整合：

```text
ReaderLocation
Selection
Navigation
```

---

## Batch 7 — Auto Continue / Position Sync

实现：

```text
Current Segment
→ Next Segment
→ Next Section
→ End
```

同时：

```text
TTS → ReaderLocation
ReaderLocation → TTS
```

解决：

- 跳转；
- 滚动；
- Chapter；
- Page；
- 文档切换；
- 用户手动导航。

---

## Batch 8 — Voice / Speed / Settings

实现：

- Voice enumeration；
- Voice selection；
- Language matching；
- Rate；
- Settings persistence；
- fallback。

确保：

> Voice 缺失不会导致 Reader 失败。

---

## Batch 9 — 全格式接入

逐个验证：

### Web

正文朗读。

### EPUB

章节朗读。

### PDF

文本层朗读。

### Markdown

正文朗读。

### TXT

正文朗读。

确认：

```text
同一套 TTS
+
不同 Reader Text Provider
```

而不是五套 TTS。

---

## Batch 10 — Error / Security / Performance

处理：

- malformed text；
- oversized input；
- Voice failure；
- cancellation；
- document switch；
- provider exception；
- memory growth；
- long running session；
- shutdown；
- unsupported document；
- scanned PDF。

---

## Batch 11 — Regression / Documentation

执行：

- M0～M7 回归；
- Reader 回归；
- Search 回归；
- Annotation 回归；
- Bookmark 回归；
- Progress 回归；
- Import/Export 回归；
- RSS 回归。

完成所有 M8 文档。

---

# 六十一、测试要求

必须建立自动化测试。

## 61.1 Text Segmenter

覆盖：

- 中文；
- 英文；
- 中英混合；
- 无标点；
- 连续标点；
- 多换行；
- 空白文本；
- 超长文本；
- URL；
- 数字；
- Markdown；
- PDF 提取文本。

---

## 61.2 Text Normalizer

验证：

```text
Original ≠ TTS Normalized
```

但：

> Normalized 文本应保持自然语义。

---

## 61.3 Queue

验证：

```text
enqueue
dequeue
cancel
replace
clear
next
previous
```

---

## 61.4 State Machine

测试：

```text
Idle → Preparing
Preparing → Speaking
Speaking → Paused
Paused → Speaking
Speaking → Stopping
Stopping → Idle
Speaking → Error
```

所有非法 transition 都必须有明确行为。

---

## 61.5 Document Switch

测试：

```text
A 正在播放
→ 打开 B
→ A 停止
→ B 可播放
```

确保不会出现：

```text
A Voice Callback
→ 更新 B UI
```

---

## 61.6 Selection

测试：

```text
Select
→ Read Selection
```

确认：

- 不污染 Progress；
- 不污染 Bookmark；
- 不创建 Annotation；
- 不改变原文。

---

## 61.7 Location

验证：

```text
TTS Segment
→ ReaderLocation
→ Reader Jump
```

以及：

```text
ReaderLocation
→ TTS Segment
```

---

## 61.8 PDF

至少：

- 普通 PDF；
- CJK PDF；
- 大型 PDF；
- 多栏；
- 横向；
- 旋转页；
- 混合页面；
- 无 Text Layer；
- Hybrid PDF；
- Password PDF；
- malformed PDF。

---

## 61.9 EPUB

至少：

- EPUB2；
- EPUB3；
- CJK；
- long chapter；
- 多章节；
- heading；
- list；
- footnote；
- link；
- ruby。

---

## 61.10 Web

至少：

- 普通文章；
- 长文章；
- 中英混合；
- 广告噪声；
- navigation；
- code block；
- tables。

---

# 六十二、长时间运行测试

至少进行长时间连续播放测试。

重点观察：

```text
Memory
CPU
GC
Queue Growth
UI Response
Reader Position
Provider State
```

尤其检查：

> 播放 1 小时后内存是否持续增长。

---

# 六十三、并发测试

测试：

```text
Play
→ Pause
→ Resume
→ Stop
→ Play
→ Next
→ Previous
→ Switch Document
```

在快速点击情况下：

> 状态不能乱。

---

# 六十四、Restart Test

测试：

1. 打开文档；
2. Reader 定位；
3. TTS；
4. 关闭应用；
5. 重启；
6. 恢复文档；
7. ReaderLocation 正确。

注意：

> TTS 本身不需要恢复播放状态。

只需要保证：

> Reader 本身的 Progress / Location 不被 TTS 破坏。

---

# 六十五、SQLite 删除测试

模拟：

```text
删除 index.db
```

验证：

- Library 可恢复；
- Document 可打开；
- Reader 可读；
- TTS 可工作；
- Annotation 可工作；
- Bookmark 可工作。

证明：

> TTS 没有偷偷建立 DB-only 依赖。

---

# 六十六、用户原始文件安全测试

验证：

TTS 执行过程中：

```text
article.md
book.epub
document.pdf
```

都不会发生任何意外修改。

---

# 六十七、平台能力矩阵

建立：

```text
TTS Capability Matrix
```

至少记录：

| Capability | Web | EPUB | PDF | Markdown | TXT |
|---|---:|---:|---:|---:|---:|
| Read Aloud | | | | | |
| Selection | | | | | |
| From Location | | | | | |
| Auto Continue | | | | | |
| Current Location Sync | | | | | |
| Language | | | | | |
| Search Integration | | | | | |

真实结果填写：

```text
Supported
Partial
Unavailable
```

不要为了让矩阵好看而假设支持。

---

# 六十八、特别处理：Capability-Based Design

Reader Shell 不应该写：

```csharp
if (document is PdfDocument)
```

来决定 TTS。

应该使用 capability：

```text
ReaderCapabilities
```

例如：

```text
CanReadText
CanSelectText
CanSearch
CanAnnotate
CanTts
```

具体以当前项目现有能力系统为准。

M8 应该尽可能复用，而不是制造第二套 Capability System。

---

# 六十九、Reader Shell 的责任

Reader Shell 负责：

- 显示 TTS 控制；
- 触发命令；
- 显示状态；
- 与 Reader Navigation 协调；
- 显示当前朗读位置。

Reader Adapter 负责：

- 提供 Reading Text；
- 提供 Location；
- 提供 Selection；
- 提供下一 Segment。

TTS Service 负责：

- Voice；
- Speech；
- Queue；
- State；
- Cancellation；
- Provider。

必须保持职责边界。

---

# 七十、不要把 TTS 写成 Godot UI 逻辑

禁止：

```text
Button
 → Speech API
```

应该：

```text
Button
 ↓
Reader Command
 ↓
TtsController
 ↓
ITtsProvider
```

UI 不能成为业务控制中心。

---

# 七十一、TTS 日志

增加可控日志。

至少区分：

```text
TTS lifecycle
TTS provider
TTS queue
TTS cancellation
TTS errors
TTS location
```

不要默认记录全文内容。

尤其：

> 日志不得因为调试方便而把用户整篇文章正文写进日志。

---

# 七十二、隐私原则

TTS 日志不记录：

- 完整文档全文；
- 完整 Note；
- 完整 Highlight；
- 敏感用户内容。

必要时仅记录：

```text
DocumentId
SegmentId
TextLength
Language
VoiceId
ErrorCode
```

---

# 七十三、错误信息

用户看到的错误必须可理解。

例如：

```text
未找到可用的中文语音。
当前文档没有可读取文本。
当前语音不可用，请选择其他语音。
朗读服务发生错误。
```

不要直接把：

```text
COMException 0x...
```

当成 UI。

底层 Error Code 仍保留在日志。

---

# 七十四、M8 文档

至少建立：

```text
docs/M8-EXPLORE.md
docs/M8-IMPLEMENTATION-PLAN.md
docs/M8-STATUS.md
docs/TTS.md
docs/TTS-ARCHITECTURE.md
docs/TTS-PROVIDER.md
docs/TTS-TEXT.md
docs/TTS-LOCATION.md
docs/TTS-SETTINGS.md
docs/TTS-SECURITY.md
docs/TTS-PERFORMANCE.md
```

同时更新：

```text
docs/READER.md
docs/SEARCH.md
docs/FORMAT.md
docs/LIBRARY.md
docs/USER-STATE.md
docs/DECISIONS.md
docs/PROGRESS.md
```

如果仓库实际文档命名不同：

> 优先复用现有结构，不要为了形式制造重复文档。

---

# 七十五、M8 STATUS 必须写清楚

最终：

`docs/M8-STATUS.md`

至少包含：

```text
1. Goal
2. Scope
3. Non-Goals
4. Explore Results
5. Selected TTS Provider
6. Provider Architecture
7. Reader Text Model
8. Text Segmentation
9. Text Normalization
10. Speech Queue
11. TTS State Machine
12. Voice Management
13. Rate Management
14. Reader Integration
15. Location Integration
16. Selection Reading
17. Auto Continue
18. Web Support
19. EPUB Support
20. PDF Support
21. Markdown Support
22. TXT Support
23. Security
24. Privacy
25. Performance
26. Error Handling
27. Tests
28. Unsupported Cases
29. Known Issues
30. Technical Debt
31. Third-party Dependencies
32. License
33. M9 Dependencies
34. RESOLVED
35. CONFIRMED
36. REMAINING RISKS
```

---

# 七十六、M8 的核心数据不变量

完成后必须验证：

### 不变量 1

原始文档永远不会因为 TTS 被修改。

### 不变量 2

SQLite 删除后 TTS 仍可工作。

### 不变量 3

TTS 不建立第二套 ReaderLocation。

### 不变量 4

Selection Reading 不会偷偷修改 Progress。

### 不变量 5

Document Switch 后旧 TTS 不会污染新 Reader。

### 不变量 6

Scanned PDF 不会被假装成可朗读文本。

### 不变量 7

TTS Provider 不进入 Reader 核心领域模型。

### 不变量 8

TTS 默认不上传用户内容到互联网。

### 不变量 9

TTS 不需要 AI 服务才能正常工作。

### 不变量 10

禁用 / 不支持 TTS 时，Reader 其他功能完全正常。

---

# 七十七、M8 的完成标准

只有以下条件全部满足，才能标记：

```text
M8 COMPLETE
```

---

## 功能

- [ ] Web 可朗读
- [ ] EPUB 可朗读
- [ ] PDF Text Layer 可朗读
- [ ] Markdown 可朗读
- [ ] TXT 可朗读
- [ ] Selection 可朗读
- [ ] 从当前位置朗读
- [ ] Pause
- [ ] Resume
- [ ] Stop
- [ ] Next
- [ ] Previous
- [ ] Auto Continue
- [ ] Voice Selection
- [ ] Speed Control

---

## Reader Integration

- [ ] Unified Reader Shell
- [ ] ReaderLocation
- [ ] Selection
- [ ] Navigation
- [ ] Progress
- [ ] Search
- [ ] Bookmark
- [ ] Annotation
- [ ] Document Switch

---

## Architecture

- [ ] Reader 不依赖具体 TTS Provider
- [ ] TTS 不依赖具体 Reader Adapter
- [ ] TTS Provider 可替换
- [ ] 第三方 API 已隔离
- [ ] 没有格式专属 TTS 分支堆积
- [ ] Capability 设计与现有架构一致

---

## Stability

- [ ] Cancellation 正常
- [ ] Concurrent requests 正常
- [ ] Document Switch 正常
- [ ] Application Exit 正常
- [ ] Provider Error 不导致 Reader Crash
- [ ] 长时间播放无明显内存泄漏
- [ ] SQLite 删除后仍可用

---

## Data Safety

- [ ] 原始文件不会被 TTS 修改
- [ ] Annotation 不被破坏
- [ ] Bookmark 不被破坏
- [ ] Progress 不被异常污染
- [ ] 无全文日志泄露
- [ ] 无默认网络发送正文

---

# 七十八、M8 Review 要求

完成实现后进行一次完整 Review。

只输出真正有证据的问题。

问题分类：

```text
P0
P1
P2
```

其中：

### P0

阻止用户安全使用或导致用户数据破坏的问题。

### P1

明显影响核心功能、稳定性或数据正确性的问题。

### P2

普通技术债、体验问题、重构建议。

不要把：

> “我更喜欢另一种架构”

当成 P0 / P1。

---

# 七十九、Review 必须区分

```text
FACT
HYPOTHESIS
INFERENCE
```

例如：

```text
FACT:
Windows Provider 在连续切换 Voice 时抛出异常。

HYPOTHESIS:
可能与 Provider 生命周期释放时机有关。

INFERENCE:
当前实现可能存在旧 Provider callback 未注销问题。
```

不要把推测当成事实。

---

# 八十、最终验收场景

使用真实用户流程验证：

### 场景 A

打开一篇 Web 长文：

```text
Open
→ Read
→ Read From Here
→ Pause
→ Resume
→ Change Speed
→ Continue
```

---

### 场景 B

打开 EPUB：

```text
Chapter 1
→ Start TTS
→ Auto Continue
→ Chapter 2
→ Stop
→ Bookmark
→ Restart
→ Continue From Bookmark
```

---

### 场景 C

打开 PDF：

```text
Page 10
→ Read From Here
→ TTS
→ Search
→ Jump Result
→ Start From Here
```

---

### 场景 D

Selection：

```text
Select paragraph
→ Read Selection
→ Stop
```

确认：

> Progress 不被偷偷移动。

---

### 场景 E

文档切换：

```text
Document A TTS
→ Open Document B
```

确认：

> A 立刻停止；B 正常工作。

---

### 场景 F

关闭数据库：

```text
Delete index.db
→ Launch
→ Rebuild
→ Open document
→ TTS
```

确认：

> Reader + TTS 都正常。

---

### 场景 G

关闭应用：

```text
TTS Playing
→ Exit
```

确认：

> 程序可靠退出，没有后台线程 / 音频资源遗留。

---

# 八十一、M9 对接边界

M8 完成后，为 M9 提供：

```text
Reader Text
ReaderLocation
TTS Capability
TTS Service
```

M8 不做：

- Web → EPUB
- Advanced EPUB Export
- EPUB layout reconstruction
- Aurora 集成
- 高级内容转换
- 音频书导出

这些留给 M9。

---

# 八十二、最终执行要求

你是负责本里程碑落地的工程负责人。

执行顺序严格为：

```text
Explore
↓
Confirm Environment
↓
PoC
↓
Plan
↓
Implement
↓
Test
↓
Review
↓
Document
```

不要为了追求一次性“大重构”而破坏现有 M0～M7 功能。

不要默认当前设计正确。

不要默认以前的文档完全等于代码。

> **当前代码是真相，测试是真相，实际运行结果是真相。**

如果历史文档与代码冲突：

```text
Code / Test
    >
Historical Documentation
```

修正文档，而不是为了保持文档一致而错误修改代码。

---

# 八十三、最终 M8 目标

M8 的真正完成定义不是：

> “Reverie 能调用 TTS API。”

而是：

> **Reverie 已经拥有一个与 Reader 架构真正融合的、本地优先、可取消、可定位、可连续朗读、跨格式复用的 TTS 能力。**

用户面对的应该是一个统一体验：

```text
打开任何支持文本的资料
        ↓
阅读
        ↓
选中文本 / 当前阅读位置
        ↓
开始朗读
        ↓
TTS 驱动 ReaderLocation
        ↓
继续阅读 / 搜索 / 标注 / Bookmark
        ↓
随时停止
```

而不是：

```text
Web 有一套朗读
EPUB 有一套朗读
PDF 又有一套朗读
```

M8 的最终目标是：

> **把“阅读”和“听读”统一成同一个 Reader Location / Reader Text 系统下的两种阅读方式。**