# ifuyo Reverie — M7 PDF Reader PDF 阅读器开发提示词

> 你现在负责实施 **ifuyo Reverie M7：PDF Reader**。
>
> 本提示词是 M7 的完整开发任务书。
>
> **不要把 M7 理解成“加一个 PDF 预览器”。**
>
> M7 的真正目标是：
>
> > 将 PDF 纳入 Reverie 的 Unified Reader Shell，使 PDF 成为与 Web Article / EPUB 同等级别的一等 Document：可打开、可阅读、可搜索、可定位、可恢复进度、可书签、可选中文本、可 Highlight、可 Note，并且这些用户状态独立于原始 PDF 文件、SQLite 索引和具体渲染器而持久存在。
>
> 本阶段必须继续遵守 Reverie 的核心原则：
>
> - **文件是真相，SQLite 是派生索引 / Cache / UI State。**
> - 原始用户文件默认不可变。
> - Annotation / Bookmark / Reading Progress / User State 不写回原始 PDF。
> - Unified Reader Shell 负责公共阅读体验。
> - Format Adapter 负责 PDF 特有能力。
> - 第三方 PDF 库、Renderer、Native API 不能泄漏到 UI/Core。
> - Reader 必须能够在 SQLite 索引损坏或删除后重新扫描文件并恢复。
> - 用户数据优先于索引、缓存和 UI。
> - 不为了“架构漂亮”进行无证据大规模重构。
> - 所有 P0/P1 判断必须建立在实际代码、测试结果或可复现证据之上。
>
> 当前阶段是个人本地优先产品开发，不做云服务、账户系统、商业平台等扩展。

---

# 一、先读取项目，再开始任何实现

你必须先完整探索当前仓库。

**不要直接开始写 PDF 代码。**

首先检查：

```text
项目目录结构
现有 Document Model
Library
Library Scanner
File Loader
Reader Shell
Reader Adapter
Web Reader
EPUB Reader
M2 Annotation Core
M3 Search / Library
M4 RSS
M5 Import / Export
Reading Progress
Bookmark
User State
Persistence
SQLite Index
Settings
Test
Docs
第三方依赖
Godot / C# 项目配置
```

重点寻找：

```text
Document
Source
ReaderDocument
ReaderShell
ReaderAdapter
ReaderLocation
Progress
Bookmark
Annotation
Highlight
Note
Search
Library
LibraryScanner
DocumentLoader
Index
UserState
```

以及 M6 中实际落地的 EPUB 实现。

---

# 二、代码是真相，文档不是

严格执行：

> **Code > Tests > Current Runtime Behavior > Docs > Old Plans**

如果历史文档与代码不一致：

1. 先记录事实；
2. 不要盲目按照旧设计重写；
3. 判断现有实现是否已经满足 M7 的需求；
4. 只有确实缺失时才修改。

探索阶段必须明确区分：

```text
FACT
HYPOTHESIS
INFERENCE
```

例如：

```text
FACT:
当前 Reader Shell 已经存在 IReaderAdapter。

FACT:
EPUB Adapter 已经实现 ReaderLocation。

HYPOTHESIS:
PDF 可以直接复用 EPUB 的 selection abstraction。

INFERENCE:
需要增加 PDF-specific locator，但不需要修改 Generic Annotation。
```

不要把假设写成事实。

---

# 三、M7 的总体目标

M7 完成后，用户应该可以：

```text
导入 / 保存 PDF
↓
Library 中看到 PDF
↓
打开 PDF
↓
进入统一 Reader Shell
↓
正常翻页 / 滚动 / 缩放
↓
查看 PDF TOC / Outline
↓
在 PDF 内搜索文本
↓
跳转搜索结果
↓
选中文本
↓
创建 Highlight
↓
给 Highlight 添加 Note
↓
创建 Bookmark
↓
关闭 PDF
↓
再次打开
↓
恢复之前阅读位置
↓
恢复 Highlight / Note / Bookmark
↓
SQLite 删除后
↓
重新扫描 Library
↓
PDF 仍然可以正常打开
↓
用户状态仍能从文件恢复
```

最终结果必须是：

> PDF 是 Reverie 的正式 Document，而不是一个脱离 Reverie 数据模型的临时预览窗口。

---

# 四、M7 的范围

## 4.1 本阶段必须实现

### A. PDF Document Integration

支持：

```text
PDF File
↓
Library
↓
Document
↓
Reader Shell
↓
PdfReaderAdapter
```

PDF 必须进入现有 Library / Document 数据模型。

需要支持：

- PDF metadata
- 文件大小
- 文件路径
- 文件 hash / fingerprint
- 页数
- 标题
- 作者（如果可获得）
- 修改日期（如适用）
- MIME / Format
- 来源信息
- Reading State
- Favorite
- Inbox
- Tags
- Recent
- Progress

---

# 五、PDF Reader Adapter

建议目标结构：

```text
Unified Reader Shell
        │
        ▼
IReaderAdapter
        │
        ├── WebReaderAdapter
        ├── EpubReaderAdapter
        └── PdfReaderAdapter
                    │
                    ├── PdfContainer
                    ├── PdfParser
                    ├── PdfDocumentModel
                    ├── PdfTextProvider
                    ├── PdfRenderer
                    ├── PdfNavigationProvider
                    └── PdfAnnotationLocator
```

实际命名必须服从现有代码。

不要为了遵守示例命名强行增加重复 abstraction。

---

# 六、第三方 PDF 库的技术选型原则

这是 M7 的关键技术调查点。

不要先决定：

```text
一定用某某 PDF Library
```

而应该：

```text
探索现有项目
↓
列出候选 PDF Runtime / Renderer
↓
验证：
    Windows 支持
    Godot 4.6.2 .NET 支持
    C# API
    PDF 2.0 / 常见 PDF 支持
    Text extraction
    Page rendering
    Outline / TOC
    Text selection
    Search
    Licensing
    Native dependency
    x64 / ARM64 情况
    部署方式
    性能
    崩溃隔离
↓
做最小 PoC
↓
选择实际可用方案
```

尤其要验证：

```text
能否在当前 Reverie 运行环境稳定部署
能否获取 PDF text layer
能否得到文本坐标
能否渲染单页
能否获得 page size
能否访问 outline
能否处理 CJK
能否处理常见图片 / 字体
能否安全处理 malformed PDF
```

不要因为某个库 API 好看，就把整个 Reverie 架构绑定到它。

---

# 七、第三方 API 必须隔离

禁止出现：

```text
UI
 ↓
ThirdPartyPdfDocument
 ↓
ThirdPartyPdfPage
```

应该尽量形成：

```text
UI
 ↓
Reader Shell
 ↓
PdfReaderAdapter
 ↓
Reverie PDF Abstraction
 ↓
Third-party PDF implementation
```

例如：

```text
IPdfDocument
IPdfPage
IPdfTextProvider
IPdfRenderer
IPdfOutlineProvider
```

具体名称服从项目现有架构。

目的不是增加接口数量。

目的只有一个：

> **以后替换 PDF Renderer / Library 时，不需要重写 Reader Shell、Annotation、Search、Progress 和 Library。**

---

# 八、PDF Container / Parser

PDF 与 EPUB 不同。

不要照搬 EPUB Container。

需要根据实际选定 PDF Library 建立：

```text
PdfDocumentModel
```

至少能表达：

```text
Document metadata
Page count
Page size
Page rotation
Page labels
Outline
Text content
Text spans / text coordinates
Internal links
External links
```

根据实际库能力决定是否加入：

```text
Embedded images
Annotations
Form fields
Attachments
Layers
```

这些不是 M7 的核心目标。

---

# 九、PDF 页模型

必须区分：

```text
Page Index
Page Label
Physical Page Size
Rotation
Text Layer
Rendered Surface
```

例如：

```text
pageIndex = 0
pageLabel = "i"

pageIndex = 1
pageLabel = "ii"

pageIndex = 5
pageLabel = "1"
```

绝对不能认为：

```text
pageIndex == printed page number
```

阅读进度、Bookmark、Search、Highlight 不得仅依赖用户看到的页码文字。

---

# 十、PDF Rendering

这是 M7 的核心。

必须首先确认实际采用的 Render Model。

例如可能是：

```text
PDF Page
↓
Rasterize
↓
Texture / Image
↓
Reader View
```

也可能实际采用：

```text
PDF Renderer
↓
native surface
```

或其它模型。

以当前项目可稳定落地的方案为准。

---

# 十一、Rendering 的核心要求

至少支持：

```text
打开 PDF
显示页面
上一页
下一页
跳转到指定页
缩放
Fit Width
Fit Page
页面旋转（如 renderer 自然支持）
```

推荐支持：

```text
Single Page
Continuous Page
```

但不要为了增加模式而过度复杂化。

---

# 十二、页面渲染不能全量加载

禁止：

```text
打开 PDF
↓
一次渲染全部页面
↓
全部转成 Bitmap
↓
全部缓存
```

必须采用：

```text
Current Page
Adjacent Pages
Visible Pages
LRU Cache
Bounded Memory
Lazy Render
```

例如：

```text
当前页
± 1 / ± 2 邻近页
```

具体窗口大小根据实际性能测试决定。

缓存必须：

```text
有上限
可淘汰
可取消
不会无限增长
不会阻塞 UI
```

---

# 十三、Rendering Cache

需要明确区分：

```text
Persistent User Data
Derived Cache
Temporary Runtime Cache
```

PDF Page Render Cache：

```text
Temporary Runtime Cache
```

绝不能成为 PDF 可恢复阅读所必需的唯一数据。

删除 Cache 后：

```text
PDF
+
user state
```

仍必须可以恢复。

---

# 十四、PDF Security

PDF 必须被当成：

> **不可信输入**

处理。

不能认为：

```text
用户自己的 PDF
```

就天然安全。

至少检查：

### 14.1 文件大小

需要有限制：

```text
Max PDF file size
```

或其它合理资源保护机制。

---

### 14.2 页数

避免极端 PDF：

```text
百万级 page count
```

导致：

```text
内存爆炸
UI 卡死
thumbnail 爆炸
search index 爆炸
```

---

### 14.3 巨型页面

需要处理：

```text
极大 Page Size
极高 Render Resolution
```

必须有：

```text
render scale clamp
memory guard
```

避免单页渲染直接占满内存。

---

### 14.4 恶意 PDF

确认 Renderer 是否可能处理：

```text
JavaScript
Actions
Embedded Files
Launch Actions
External URI
Forms
Multimedia
Annotations
```

默认原则：

> **Reader 不执行 PDF 中的主动内容。**

特别是：

```text
PDF JavaScript
外部程序启动
任意 Embedded File 自动打开
自动执行 Action
```

均不得默认执行。

---

# 十五、External Link

PDF 中可能包含：

```text
https://...
http://...
mailto:...
file://...
```

必须明确处理策略。

推荐：

```text
http/https
→
由系统浏览器打开
```

而：

```text
file://
其他本地路径
任意程序启动
```

默认拒绝。

不能允许 PDF 通过 link 直接访问 Reverie 本地文件。

---

# 十六、Embedded Files

M7 不实现：

```text
从 PDF 自动提取并执行附件
```

至少：

```text
不自动打开
不自动执行
不自动导入 Library
```

若 Renderer 暴露 Embedded Files：

```text
只读取 metadata
```

或者：

```text
明确标记 Unsupported
```

具体行为必须经过安全分析。

---

# 十七、Password Protected PDF

需要区分：

```text
普通 PDF
Password-protected PDF
DRM / 权限受限 PDF
损坏 PDF
```

允许的行为：

```text
用户拥有密码
→
由 PDF Library 正常打开
```

不允许：

```text
绕过密码
破解加密
绕过 DRM
绕过权限限制
```

如果当前实现不支持密码：

```text
明确提示“此 PDF 受密码保护”
```

而不是：

```text
Failed to parse PDF
```

错误信息应可理解。

---

# 十八、PDF Outline / TOC

PDF 可能包含：

```text
Outline
Bookmarks
```

需要转换到 Reverie 的统一导航模型。

目标：

```text
PDF Outline
↓
ReaderNavigation
```

支持：

```text
章节标题
嵌套层级
目标页
目标位置
```

点击：

```text
Outline Entry
↓
ReaderLocation
↓
PDF Page
```

---

# 十九、Outline 兼容性

至少测试：

```text
无 Outline
一级 Outline
多级 Outline
指向不同页
内部链接目标
损坏 target
循环 / 异常结构
```

损坏的 Outline 节点不能导致整本 PDF 打不开。

要求：

> **局部错误局部失败。**

---

# 二十、PDF Text Layer

PDF 最重要的一个现实问题：

> **不是所有 PDF 都拥有可用 Text Layer。**

必须区分：

```text
Text PDF
Scanned PDF
Hybrid PDF
Malformed Text Layer
```

---

# 二十一、Text PDF

有 Text Layer 时支持：

```text
文本提取
页面搜索
全文搜索
文本选择
Highlight
Note Anchor
```

---

# 二十二、Scanned PDF

如果 PDF 只有图片，没有文本层：

```text
可以阅读
可以翻页
可以缩放
可以 Bookmark
可以保存 Progress
```

但是：

```text
文本 Search
文本 Selection
Text Highlight
```

可能不可用。

M7 **不要为了补齐这些功能自动加入 OCR**。

OCR 不属于 M7 核心范围。

如果当前项目未来确实需要 OCR：

```text
M7 → 明确记录 Unsupported
```

交给后续独立能力。

---

# 二十三、Hybrid PDF

需要处理：

```text
部分页面有 Text Layer
部分页面只有图片
```

行为应该是：

```text
有 Text Layer
→ Search / Selection / Highlight 可用

没有 Text Layer
→ 阅读正常
→ 文本能力 unavailable
```

不能因为某一页没有文本层，把整本 PDF 判定为无法阅读。

---

# 二十四、PDF Search

M7 需要提供：

```text
In-document Search
```

并接入现有 Reader Search contract。

同时如果 M3 Search 已经具备：

```text
Document Full-text Search
```

PDF 应该能够被纳入。

---

# 二十五、PDF Search Architecture

不要让 UI 直接调用 PDF Library。

推荐：

```text
Reader Shell
 ↓
Reader Search Contract
 ↓
PdfReaderAdapter
 ↓
PdfTextProvider
```

搜索结果至少包含：

```text
DocumentId
PageIndex
PageLabel
Matched Text
Context / Snippet
Match Range
ReaderLocation
```

点击结果：

```text
Search Result
↓
ReaderLocation
↓
对应页
↓
尽可能定位到匹配文本
```

---

# 二十六、PDF Search 不允许阻塞 UI

搜索大 PDF 时：

```text
Cancellation
Progress
Background Work
Generation / Request Id
```

必须避免：

```text
用户先搜索 A
然后搜索 B
B 已返回
A 后返回
A 把 UI 覆盖
```

必须采用现有 M3 的：

```text
debounce
cancellation
generation
stale-result rejection
```

具体机制复用现有实现。

---

# 二十七、Global Search

将 PDF 纳入 M3：

```text
Title
Author
Body / Extracted Text
Highlight
Note
Tag
URL / Source
```

如果 PDF 没有 Text Layer：

```text
Body Search = unavailable / empty
```

而：

```text
Metadata
Tag
Annotation
```

仍然可以搜索。

---

# 二十八、PDF ReaderLocation

这是 M7 最重要的架构问题之一。

禁止：

```text
Bookmark = page number only
Highlight = screen coordinate only
Progress = scroll pixel only
```

这些信息不足以形成稳定位置。

---

# 二十九、推荐的 PDF ReaderLocation

根据项目实际 ReaderLocation abstraction 设计。

理想结构类似：

```text
DocumentId
+
DocumentFingerprint
+
PageIndex
+
PageLabel
+
Structural Position
+
Text Quote
+
Text Context
+
Text Range
+
Normalized Bounding Box
```

具体字段按照实际代码模型落地，不要机械照搬。

---

# 三十、PageIndex 与 PageLabel 的职责

推荐：

```text
PageIndex
=
Renderer / Internal Position

PageLabel
=
Human-readable Display Label
```

例如：

```text
PageIndex = 8
PageLabel = "iv"
```

Bookmark 的 identity：

```text
PageIndex
```

而 UI：

```text
显示 PageLabel
```

两者不能混为一谈。

---

# 三十一、Highlight Locator

PDF Highlight 至少需要保存：

```text
DocumentId
PageIndex
Quoted Text
Context
Text Range
Bounding Rect(s)
```

其中：

> **Bounding Rect 主要服务于视觉恢复，不应成为唯一的逻辑身份。**

因为：

```text
Renderer 不同
DPI 不同
缩放不同
字体渲染不同
```

都会导致像素坐标变化。

---

# 三十二、为什么不能只保存坐标

不要：

```text
x = 134
y = 832
width = 200
height = 24
```

就认为 Highlight 完整。

必须尽可能保留：

```text
文本内容
文本上下文
页面
文本范围
```

这样即便 Rendering 改变：

```text
Quote
Context
```

仍然可以帮助重新定位。

---

# 三十三、Annotation Resolution

重新打开 PDF 时：

```text
Annotation
↓
PageIndex
↓
Text Range / Quote
↓
尝试找到原位置
↓
重新计算视觉坐标
```

如果成功：

```text
Resolved
```

如果失败：

```text
Orphaned / Unresolved
```

不能：

```text
Silent Delete
```

---

# 三十四、Document Fingerprint

考虑 PDF 被替换：

```text
原 PDF
A.pdf
```

后来用户替换成：

```text
新的 A.pdf
```

必须有：

```text
Document Identity
+
File Fingerprint
```

帮助识别：

```text
同一本文件
还是
不同版本文件
```

不要只因为：

```text
filename == filename
```

就认为是同一个 PDF。

---

# 三十五、PDF Annotation 与 M2

M7 不应建立第二套 Annotation 系统。

必须复用：

```text
Generic Annotation
```

统一：

```text
Highlight
Note
Timestamp
Tags
Source Document
Anchor
Status
```

PDF 只负责：

```text
PDF-specific Locator
PDF-specific Selection Mapping
PDF-specific Resolution
```

---

# 三十六、Text Selection

需要确认当前 PDF Renderer 能否提供：

```text
Mouse Down
Drag
Selected Text
Text Range
Page
Coordinates
```

如果可以：

```text
Selection
↓
Generic Annotation
```

如果 Renderer 不支持稳定 selection：

必须记录为实际能力限制，而不是伪造。

---

# 三十七、Selection 与 Highlight

用户操作：

```text
选择 PDF 文本
↓
Highlight
```

需要形成：

```text
Annotation
{
    id
    documentId
    type = highlight
    quote
    locator
    createdAt
    updatedAt
}
```

具体 schema 服从 M2。

不要在 PDF 专属 JSON 再复制：

```text
highlightText
highlightNote
highlightTags
```

造成双重真相。

---

# 三十八、Note

支持：

```text
Highlight
+
Note
```

或者现有 Generic Annotation 所支持的 Note 方式。

必须保证：

```text
Note 属于 Annotation / Document
```

而不是：

```text
Note 依赖 SQLite
```

---

# 三十九、Bookmark

PDF Bookmark 不应只保存：

```text
page = 42
```

应该保存：

```text
ReaderLocation
```

例如：

```text
PageIndex
+
optional text context
+
optional intra-page location
```

这样未来如果 Reader Mode 发生变化，仍有恢复空间。

---

# 四十、Reading Progress

必须接入统一 Progress。

Progress 至少需要：

```text
DocumentId
CurrentPage
TotalPages
NormalizedProgress
LastOpened
ReaderLocation
```

其中：

```text
CurrentPage
```

用于 UI，

而：

```text
ReaderLocation
```

用于精确恢复。

---

# 四十一、恢复进度

重新打开 PDF：

```text
Load PDF
↓
Load User State
↓
Validate Document Identity / Fingerprint
↓
Resolve ReaderLocation
↓
Open Page
↓
Restore viewport / intra-page position if supported
```

如果无法精确恢复：

```text
降级恢复到 PageIndex
```

如果 PageIndex 不可用：

```text
降级到 NormalizedProgress
```

必须设计明确 fallback chain。

---

# 四十二、Reader Settings

继续复用 Reader Shell。

PDF 可以暴露：

```text
Zoom
Fit Width
Fit Page
Single Page
Continuous
Background / Theme
```

不要给 PDF 单独造一套 Settings Store。

---

# 四十三、统一 Reader Shell

M7 不应重新造：

```text
PDF Toolbar
PDF Search Dialog
PDF Bookmark UI
PDF Annotation Panel
```

除非 PDF 有真正不同的交互需求。

应优先：

```text
Unified Reader Shell
```

统一处理：

```text
Back
Document Title
Progress
Search
Navigation
Bookmarks
Annotations
Settings
```

---

# 四十四、PDF 特有 UI

PDF 可以提供自己的：

```text
Page Number
Page Label
Zoom
TOC / Outline
Fit Mode
```

这些属于 Adapter 能力。

Reader Shell 只依赖：

```text
Capabilities
```

例如：

```text
SupportsSearch
SupportsSelection
SupportsHighlight
SupportsBookmarks
SupportsNavigation
SupportsZoom
SupportsContinuousMode
```

不要让 Shell 判断：

```text
if (pdf) ...
if (epub) ...
if (web) ...
```

---

# 四十五、Reader Capability

检查 M6 当前实现。

如果已经存在 Capability abstraction：

```text
复用。
```

如果没有：

只有在 M7 确实需要解决格式能力差异时，再加入最小 Capability abstraction。

不要为了抽象而抽象。

---

# 四十六、PDF Page Navigation

至少支持：

```text
First
Previous
Next
Last
Go to Page
```

需要正确处理：

```text
1-based UI page
0-based internal page
Page Label
```

避免出现：

```text
用户看到第 1 页
内部显示 PageIndex = 1
```

导致 off-by-one。

---

# 四十七、Mixed Page Size

PDF 很可能：

```text
Portrait
Landscape
A4
A3
Letter
Custom
```

甚至同一文件混合。

不能假设：

```text
所有页面尺寸一样
```

Rendering / Fit Width / Fit Page 必须根据当前页面实际尺寸处理。

---

# 四十八、Page Rotation

需要考虑：

```text
0°
90°
180°
270°
```

Rotation 不能只改变图片显示而不改变：

```text
Text Coordinates
Selection
Highlight Geometry
```

所以必须验证：

```text
Renderer Coordinate Space
```

与：

```text
Reverie Reader Coordinate Space
```

之间的转换。

---

# 四十九、Coordinate System

M7 必须明确：

```text
PDF coordinate
Renderer coordinate
Screen coordinate
Godot coordinate
Normalized coordinate
```

之间的关系。

需要形成单一、可测试的转换层：

```text
PdfCoordinateMapper
```

或复用现有 abstraction。

禁止 UI 各处自己写：

```text
x * zoom
y / scale
```

---

# 五十、Zoom

Zoom 必须避免：

```text
无限放大
```

需要：

```text
min zoom
max zoom
```

并考虑：

```text
超大位图
显存
纹理大小
渲染时间
```

---

# 五十一、Thumbnail

PDF Thumbnail 可以考虑实现，但它不是核心目标。

如果实现：

```text
Lazy Generation
Bounded Cache
Cancel
```

并且：

```text
Thumbnail failure
```

不能导致：

```text
整个 PDF 无法打开
```

---

# 五十二、Error Isolation

PDF 特别容易出现：

```text
某页坏掉
某图片坏掉
某字体坏掉
某 Outline 节点损坏
```

需要：

```text
Document-level failure
Page-level failure
Resource-level failure
```

分层。

例如：

```text
Page 37 render failed
```

应尽量表现为：

```text
Page 37 unavailable
```

而不是：

```text
整个 PDF 黑屏
```

---

# 五十三、Graceful Degradation

支持：

```text
PDF 可解析
但 Outline 坏掉
→ 仍可阅读

PDF 某图片损坏
→ 文本仍可显示

某页没有 Text Layer
→ 页面仍可显示

某页 Render 失败
→ 允许跳过 / 重试

Search unavailable
→ Reader 仍可运行
```

---

# 五十四、PDF Metadata

Metadata 提取至少考虑：

```text
Title
Author
Subject
Keywords
Creator
Producer
Creation Date
Modification Date
```

实际支持哪些字段，以 Renderer 能力和 Reverie Document Schema 为准。

不能因为 PDF Metadata 缺失，就使用空标题导致 Library 不可用。

应使用合理 fallback：

```text
PDF Metadata Title
→ filename
→ normalized filename
```

---

# 五十五、PDF Text Extraction

全文索引使用：

```text
PDF Text Layer
```

不能从 PDF 渲染后的截图反向 OCR。

因为：

```text
OCR
```

不是 M7 范围。

---

# 五十六、SQLite 原则

禁止：

```text
PDF → SQLite only
```

正确：

```text
Original PDF
+
User State Files
↓
SQLite Derived Index
```

删除：

```text
index.db
```

后：

```text
Library Scan
↓
发现 PDF
↓
重新建立 Document
↓
重新提取 Metadata / Text
↓
重新生成 Search Index
```

Reader 必须仍然能直接打开 PDF。

---

# 五十七、PDF Search Index 的可重建性

如果 Search Index 损坏：

```text
PDF remains valid
Annotations remain valid
Bookmarks remain valid
Progress remains valid
```

只能失去：

```text
Search performance
```

不能失去：

```text
user data
```

---

# 五十八、文件写入

所有用户状态继续遵守：

```text
temp
↓
write
↓
flush
↓
validate
↓
atomic rename
```

特别是：

```text
annotations
bookmarks
reading state
metadata
```

不要直接覆盖导致：

```text
半个 JSON
```

---

# 五十九、PDF 原文件不可变

禁止 M7 直接：

```text
修改 PDF
写 Highlight 到 PDF
写 Bookmark 到 PDF
写 Note 到 PDF
重写 PDF
```

原 PDF 默认视为用户资产。

PDF 修改能力不属于 M7。

---

# 六十、M7 不实现 PDF 编辑

明确排除：

```text
PDF Edit
PDF Merge
PDF Split
Page Reorder
PDF Annotation Writing
PDF Redaction
PDF Form Editing
PDF Creation
PDF Optimization
```

M7 是：

> Reader

不是：

> PDF Editor。

---

# 六十一、M7 不实现 OCR

明确排除：

```text
OCR
Image-to-text
Scanned PDF indexing
```

除非当前项目已有成熟 OCR 子系统，并且探索阶段证明无需改变 M7 范围。

默认不做。

---

# 六十二、M7 不实现复杂 PDF Feature

默认排除：

```text
AcroForm editing
Digital Signature
Multimedia
3D
JavaScript
Embedded Application
Attachments import
Layer editor
Redaction
Content editing
```

对于这些能力：

```text
Detect
Ignore safely
Show unsupported when relevant
```

即可。

---

# 六十三、PDF Import

M5 已经存在 Import / Library 体系。

M7 不要复制：

```text
PDF import pipeline
```

应该复用：

```text
Existing File Import
↓
Document
↓
Library
```

M7 增加：

```text
PDF Document Adapter
```

---

# 六十四、与 M5 Export 的关系

M5 的 PDF 相关导出能力如果不存在，不在 M7 补。

M7 只负责：

```text
Read existing PDF
```

不要出现：

```text
M7 顺手实现 PDF → PDF
```

---

# 六十五、与 M8 TTS 的关系

M7 需要为未来 M8 暴露：

```text
Readable Text
Text Range
Current Reader Location
```

但：

> **M7 不实现 TTS。**

只需要确保：

```text
PDF Text Layer
↓
Reader Text Provider
```

未来能够被 M8 消费。

例如：

```text
GetCurrentText()
GetTextForRange()
GetTextForCurrentPage()
```

具体 API 根据现有 Reader/Text abstraction 决定。

---

# 六十六、与 M9 的边界

M9：

```text
Advanced EPUB Export
Aurora Reading
Web → EPUB
Article → EPUB
Reader Experience Polish
```

M7 不抢 M9 工作。

特别不要在 M7 中加入：

```text
复杂版式重排
豪华阅读模式
杂志式阅读
高级 EPUB conversion
```

---

# 六十七、测试 PDF Corpus

不要只拿一个 PDF 验证。

建立真实测试 Fixture。

至少包含：

```text
01_simple_text.pdf
02_cjk_text.pdf
03_large_document.pdf
04_many_pages.pdf
05_mixed_page_size.pdf
06_landscape.pdf
07_rotated_pages.pdf
08_outline.pdf
09_nested_outline.pdf
10_internal_links.pdf
11_external_links.pdf
12_images.pdf
13_vector_graphics.pdf
14_font_variations.pdf
15_hybrid_pdf.pdf
16_scanned_no_text_layer.pdf
17_password_protected.pdf
18_malformed.pdf
19_missing_resource.pdf
20_huge_page.pdf
```

根据实际能获取的合法测试文件补充。

---

# 六十八、必须测试 CJK

因为 Reverie 面向中文阅读场景，必须验证：

```text
中文
日文
英文
中英文混排
```

特别测试：

```text
UTF-8
Unicode
标点
换行
全角字符
长句
```

---

# 六十九、Selection 测试

至少验证：

```text
单词
中文短句
跨多个词
跨行
跨段落
跨页
```

如果 Renderer 不支持跨页 selection：

```text
记录实际 limitation
```

不要伪造“支持”。

---

# 七十、Highlight 测试

必须测试：

```text
创建
保存
关闭
重新打开
重新定位
显示
删除
修改 Note
```

以及：

```text
PDF reopen
Index rebuild
App restart
```

全部仍然正确。

---

# 七十一、Annotation Failure Test

故意制造：

```text
PDF 被替换
PDF fingerprint changed
Text changed
Page missing
Selection anchor invalid
```

验证：

```text
Annotation
→
Resolved
或
Orphaned
```

并且：

```text
绝不 Silent Delete
```

---

# 七十二、Progress 测试

验证：

```text
打开第 1 页
打开第 20 页
退出
重新打开
```

检查：

```text
Progress
Bookmark
ReaderLocation
```

一致。

同时测试：

```text
关闭窗口
快速切换文档
强制退出
索引重建
```

---

# 七十三、Search 测试

至少验证：

```text
单词
中文
英文
大小写
长句
不存在关键词
多个命中
跨页
```

并测试：

```text
A 搜索
快速切换到 B
```

不会出现 stale result。

---

# 七十四、Security Test

必须至少包含：

```text
malformed PDF
huge page
huge page count
large object/resource
malicious embedded content
PDF JS
External URI
Embedded File
Password Protected
Corrupted Font
Corrupted Image
```

验证：

```text
不会崩溃
不会无限占用内存
不会执行 PDF JavaScript
不会自动运行外部程序
不会突破 Library 根目录
不会出现路径穿越
```

---

# 七十五、Resource Exhaustion

需要有实际测试。

关注：

```text
RAM
VRAM / Texture Memory
CPU
Render latency
Search latency
Cache size
```

不要只做功能测试。

---

# 七十六、性能测试

至少选：

```text
小型 PDF
中型 PDF
大型 PDF
超多页 PDF
高分辨率扫描 PDF
大量图片 PDF
```

记录：

```text
首次打开时间
首屏显示时间
翻页时间
Search 时间
Memory
Cache
```

关注：

> 用户是否能快速开始阅读。

而不是：

> Benchmark 数字是否漂亮。

---

# 七十七、Concurrency

测试：

```text
Open A
↓
Open B
↓
A renderer finished
```

不能让：

```text
A
```

覆盖：

```text
B
```

同样：

```text
Search A
Search B
```

不能发生：

```text
A result overwrite B
```

---

# 七十八、Cancellation

所有这些操作尽可能支持取消：

```text
Open
Render
Search
Extract Text
Build Thumbnail
Load Outline
```

例如：

```text
用户快速返回 Library
```

不能还在后台无限解析整个 PDF。

---

# 七十九、Lifecycle

明确：

```text
Create
↓
Open
↓
Load Metadata
↓
Load Pages / Outline
↓
Initialize Renderer
↓
Restore State
↓
Render
↓
Interact
↓
Close
↓
Save State
↓
Dispose
```

必须检查：

```text
double dispose
double open
open after close
switch document during loading
renderer failure
```

---

# 八十、Document Lifecycle 与 UI

不能出现：

```text
UI 已经显示 Document B
但后台 Document A 仍修改 Shell
```

也不能：

```text
关闭 Reader
但 PDF native resource 尚未释放
```

需要对：

```text
ownership
lifetime
dispose
cancellation
```

做明确设计。

---

# 八十一、错误信息

错误至少分为：

```text
Not a PDF
Corrupted PDF
Unsupported PDF Feature
Password Required
Renderer Initialization Failed
Page Render Failed
Text Layer Unavailable
Search Unavailable
Resource Limit Exceeded
```

不要统一：

```text
“Failed to open PDF”
```

---

# 八十二、用户体验上的降级原则

例如：

```text
没有 Text Layer
```

应该：

```text
正常打开
显示：
“此 PDF 没有可搜索文本。”
```

而不是：

```text
Open Failed
```

---

# 八十三、支持能力表

M7 最终必须明确输出：

| Capability | Supported | Partial | Unsupported |
|---|---:|---:|---:|
| PDF Open | | | |
| Metadata | | | |
| Page Render | | | |
| Zoom | | | |
| Navigation | | | |
| Outline | | | |
| Search | | | |
| Text Selection | | | |
| Highlight | | | |
| Note | | | |
| Bookmark | | | |
| Progress | | | |
| Internal Links | | | |
| External Links | | | |
| Password PDF | | | |
| Scanned PDF | | | |
| OCR | | | |
| JavaScript | | | |
| Embedded Files | | | |
| Forms | | | |
| Multimedia | | | |

必须基于实际测试填写。

不要为了“完成度好看”全部填 Supported。

---

# 八十四、建议实施阶段

M7 不要一口气写完。

建议按以下批次：

## Batch 1 — Explore / PDF Runtime PoC

完成：

```text
检查现有 Reader Architecture
检查 M6 EPUB
检查 M2/M3
PDF Library candidates
Native / managed integration
Rendering PoC
Text extraction PoC
Selection feasibility
Outline feasibility
License / dependency review
```

输出：

```text
docs/M7-EXPLORE.md
```

---

## Batch 2 — PDF Core Model

实现：

```text
PdfDocument
PdfPage
PdfMetadata
PdfText
PdfOutline
PdfLink
```

以及：

```text
PDF identity
Fingerprint
Page model
```

---

## Batch 3 — PdfReaderAdapter

接入：

```text
Unified Reader Shell
```

实现最小：

```text
Open
Close
Render
Next
Previous
Go To Page
Progress
```

先跑通：

```text
PDF → Reader Shell
```

---

## Batch 4 — Navigation / Outline

实现：

```text
PDF Outline
ReaderNavigation
Page navigation
Page labels
Internal links
```

---

## Batch 5 — Text / Search

实现：

```text
Text Provider
Text extraction
In-document Search
M3 global Search integration
```

确保：

```text
SQLite rebuild
```

后仍然可恢复。

---

## Batch 6 — Location / Progress

实现：

```text
PdfReaderLocation
Page Index
Page Label
Text Context
Fingerprint
Progress
Resume
```

同时完善：

```text
fallback resolution
```

---

## Batch 7 — Selection / Annotation

实现：

```text
Text Selection
Highlight
Note
Annotation Resolution
Orphan Handling
```

复用 M2。

---

## Batch 8 — Bookmark

实现：

```text
Bookmark
Create
Delete
Rename if current model supports it
Navigate
Persistence
```

复用 Generic Bookmark / Reader State。

---

## Batch 9 — Security / Resource Limits

集中处理：

```text
Malformed PDF
Huge Input
Large Page
Memory Limits
PDF JS
Embedded Files
External Links
Password PDF
Renderer Failure
```

---

## Batch 10 — Performance / Regression / Docs

完成：

```text
Performance Benchmark
Memory Test
Concurrency
Cancellation
Restart
Index Rebuild
Annotation Recovery
Library Regression
Web Reader Regression
EPUB Regression
```

然后完善：

```text
M7 Status
Architecture
Security
Location
Rendering
Annotation
```

---

# 八十五、推荐的 Explore 产物

先不要实现大面积代码。

首先生成：

```text
docs/M7-EXPLORE.md
```

里面至少回答：

```text
1. 当前 Reader Shell 能复用什么？
2. M6 EPUB 实现哪些结构可复用？
3. M2 Annotation 哪些接口可直接复用？
4. M3 Search 哪些接口可直接复用？
5. M5 File / Import / Export 哪些可复用？
6. PDF Library 候选有哪些？
7. 当前项目为什么选择其中一个？
8. Renderer API 如何隔离？
9. PDF Text Layer 如何获取？
10. Text Selection 是否可实现？
11. Outline 如何获取？
12. Page Coordinate 如何处理？
13. PDF ReaderLocation 如何设计？
14. Password PDF 如何处理？
15. Security 风险有哪些？
16. 性能风险有哪些？
17. 哪些 PDF 能力明确不支持？
18. 哪些问题属于 M7 blocker？
19. 哪些问题可以留到以后？
```

---

# 八十六、Implementation Plan

然后生成：

```text
docs/M7-IMPLEMENTATION-PLAN.md
```

至少包含：

```text
Architecture
Data Flow
Classes
Interfaces
Persistence
Renderer
Search
Annotation
Location
Security
Test Matrix
Performance
Migration
Rollback
```

每个任务说明：

```text
目的
输入
输出
依赖
风险
验证方式
```

---

# 八十七、测试优先级

重点测试：

### P0

只有真正阻塞用户数据 / 安全 / Reader 使用的问题才允许 P0。

例如：

```text
PDF 可通过恶意内容导致应用崩溃
Annotation 数据丢失
PDF 打开后破坏其他 Document State
SQLite 损坏导致用户 PDF 状态永久丢失
路径穿越
PDF JS / 外部程序被执行
```

### P1

例如：

```text
大型 PDF 无法正常使用
Search 结果错位
Highlight 无法恢复
Progress 经常丢失
Renderer memory leak
切换文档产生 stale result
重要 Outline 无法使用
```

不要为了：

```text
类名不够优雅
接口还能继续抽象
文件夹还能重新分层
```

就产生 P0/P1。

---

# 八十八、Code Review 原则

Review 重点检查：

```text
1. PDF 第三方 API 是否泄漏
2. 原始 PDF 是否被修改
3. SQLite 是否变成真相
4. Annotation 是否独立持久化
5. Bookmark 是否依赖 pixel/page-only anchor
6. Progress 是否 renderer-dependent
7. Search 是否阻塞 UI
8. stale async result
9. cancellation
10. renderer resource dispose
11. ZIP 式资源风险 / PDF resource exhaustion
12. JavaScript / action / embedded content
13. path traversal
14. password / encryption handling
15. scanned PDF fallback
16. page-level failure isolation
17. unbounded cache
18. CJK text handling
19. index rebuild
20. app restart recovery
```

---

# 八十九、禁止的大规模重构

除非有实际证据，不要因为 M7：

```text
重写 Reader Shell
重写 M2 Annotation
重写 M3 Search
重写 Library
重写 Persistence
重写 Document Model
```

原则：

> **优先在现有架构上增加 PDF Adapter，而不是为了 PDF 发动全项目重构。**

如果确实发现共享架构存在真实 blocker：

```text
记录 FACT
展示受影响代码
展示测试 / reproduction
说明为什么 M7 无法继续
提出最小必要修改
```

---

# 九十、M7 数据模型原则

PDF 本体：

```text
user-owned PDF
```

用户状态：

```text
metadata
annotations
bookmarks
reading state
```

搜索：

```text
SQLite derived index
```

缓存：

```text
runtime / rebuildable
```

禁止：

```text
把完整 PDF 二进制内容存 SQLite
```

除非现有架构已有明确、必要且经过证据证明的特殊机制。

默认不要这么做。

---

# 九十一、PDF User Data Layout

沿用现有 Library Layout。

不要突然建立另一套：

```text
pdf-data/
pdf-db/
pdf-cache/
pdf-state/
```

除非现有架构确实要求。

原则应该继续：

```text
pdf/document-id/
    document.pdf
    meta.json
    annotations.jsonl
```

如果 Bookmark / Progress 已有统一 state 文件：

```text
直接复用。
```

不要再创建：

```text
pdf-bookmarks.json
pdf-progress.json
```

造成状态碎片化。

---

# 九十二、Data Migration

如果现有项目已经存在：

```text
PDF
```

需要探索：

```text
旧 PDF 数据
旧 Library Record
旧 Bookmark
旧 Annotation
```

如果不存在：

```text
明确写：
No migration required
```

不要凭空设计 migration。

---

# 九十三、File Watcher / External Modification

如果当前 Reverie 已经支持文件变化检测：

需要考虑：

```text
PDF modified externally
PDF replaced
PDF deleted
PDF moved
```

不能继续使用旧的：

```text
Annotation / Progress
```

而完全不检查 fingerprint。

需要根据现有 File Watcher 能力设计。

---

# 九十四、PDF Versioning

M7 不需要实现真正：

```text
Document Version History
```

但应该能够识别：

```text
Fingerprint Changed
```

然后：

```text
尝试 re-resolve
```

失败时：

```text
Orphan
```

而不是：

```text
把旧 Annotation 当成新 PDF 的正确 Annotation。
```

---

# 九十五、Annotation Export Compatibility

M5 已经存在：

```text
Highlight Export
Metadata Export
Markdown Export
```

M7 的 PDF Annotation 必须进入现有 Export Pipeline。

例如：

```text
PDF Highlight
PDF Note
↓
Generic Annotation
↓
Existing Export
```

不要增加：

```text
ExportPdfHighlight()
```

这样的第二套导出体系。

---

# 九十六、Daily Review Compatibility

M5 Daily Review 已经存在。

PDF Highlight / Note 应自动成为：

```text
Daily Review candidate
```

不增加 PDF 专属 Daily Review。

---

# 九十七、Search Result → Reader

必须形成统一体验：

```text
Global Search
↓
PDF Result
↓
Open PDF
↓
指定 Page
↓
定位文本
↓
Highlight / Context
```

不能只是：

```text
Open PDF to Page 1
```

---

# 九十八、Annotation → Reader

用户点击：

```text
Highlight
```

必须：

```text
Open PDF
↓
定位到 Page
↓
恢复 Highlight
↓
Scroll / Zoom 到合理位置
```

如果精确 anchor 失败：

```text
Page fallback
```

如果 Page 也不存在：

```text
Orphaned Annotation
```

---

# 九十九、Reader Shell 的能力声明

M7 完成后应形成清晰：

```text
PdfReaderCapabilities
```

例如：

```text
CanNavigate
CanSearch
CanSelect
CanHighlight
CanBookmark
CanReadText
CanUseOutline
CanZoom
```

注意：

> Capability 必须反映实际 Renderer 能力，而不是产品愿望。

---

# 一百、真实运行验证

不要只做：

```text
unit test
```

至少实际运行：

```text
打开 PDF
滚动 / 翻页
搜索
选择
Highlight
Note
Bookmark
关闭
重新打开
```

然后：

```text
删除 SQLite
重新运行
打开 PDF
搜索
恢复 Annotation
```

最后：

```text
切换 Web
切换 EPUB
切换 PDF
```

验证 Unified Reader Shell 没有互相污染。

---

# 一百零一、M7 完成标准

以下全部满足，才可以认为 M7 真正完成：

```text
[ ] PDF 是正式 Document
[ ] PDF 可进入 Library
[ ] PDF 可从 Library 打开
[ ] 使用 Unified Reader Shell
[ ] PdfReaderAdapter 与 UI/Core 隔离
[ ] 第三方 PDF API 没有泄漏
[ ] PDF metadata 可用
[ ] PDF page rendering 可用
[ ] 上一页 / 下一页可用
[ ] 指定页跳转可用
[ ] Page Label 正确处理
[ ] Zoom 可用
[ ] Outline / TOC 可用或明确记录 limitation
[ ] Text Layer 可读取
[ ] PDF Search 可用
[ ] Global Search 可索引 PDF
[ ] Search Result 可回到 Reader
[ ] Text Selection 可用或明确记录 limitation
[ ] Highlight 可用
[ ] Note 可用
[ ] Annotation 使用 M2 Generic Annotation
[ ] Annotation 可重新定位
[ ] 无法定位时保留为 Orphaned
[ ] Bookmark 可用
[ ] Bookmark 使用稳定 ReaderLocation
[ ] Progress 可用
[ ] ReaderLocation 可持久化
[ ] PDF 原文件不被修改
[ ] SQLite 不是 PDF 数据真相
[ ] 删除 SQLite 后可以 rebuild
[ ] App restart 后状态恢复
[ ] PDF replacement 可以识别 fingerprint change
[ ] 无 PDF JavaScript 执行
[ ] Embedded File 不自动执行
[ ] 外部链接受安全策略控制
[ ] Password PDF 行为明确
[ ] Scanned PDF 行为明确
[ ] Malformed PDF 不导致整个应用崩溃
[ ] 大 PDF 不无限吃内存
[ ] Renderer Resource 可以 Dispose
[ ] Async stale result 被阻止
[ ] Cancellation 正常
[ ] CJK 测试通过
[ ] Web Reader regression pass
[ ] EPUB Reader regression pass
[ ] Annotation regression pass
[ ] Search regression pass
[ ] Library regression pass
[ ] Export regression pass
```

---

# 一百零二、M7 文档

至少维护：

```text
docs/M7-EXPLORE.md
docs/M7-IMPLEMENTATION-PLAN.md
docs/M7-STATUS.md
docs/PDF.md
docs/PDF-ARCHITECTURE.md
docs/PDF-RENDERING.md
docs/PDF-SECURITY.md
docs/PDF-LOCATION.md
docs/PDF-ANNOTATION.md
docs/PDF-SEARCH.md
```

同步更新：

```text
docs/READER.md
docs/SEARCH.md
docs/FORMAT.md
docs/LIBRARY.md
docs/USER-STATE.md
docs/DECISIONS.md
docs/PROGRESS.md
```

具体文件如果项目已有对应文档，则优先扩展已有文档，不重复创建。

---

# 一百零三、M7 STATUS 必须包含

最终 `docs/M7-STATUS.md` 至少包含：

```text
M7 Goal
Scope
Non-Goals

Current Architecture
PDF Architecture
Renderer Choice
Third-party Dependencies
License / Dependency Notes

Document Integration
Metadata
Rendering
Navigation
Outline
Search
Text Layer
Selection
Highlight
Note
Bookmark
Progress
ReaderLocation

Security
Resource Limits
Failure Isolation
Cancellation
Concurrency

Performance
Benchmark Results
Memory
Cache

Tests
Fixtures
Regression
Restart
Index Rebuild

Unsupported Features
Known Limitations
Technical Debt

Migration
M8 Dependencies
M9 Dependencies

RESOLVED
CONFIRMED
REMAINING RISKS
```

---

# 一百零四、最终 Review 格式

完成实现后，不要只说：

```text
M7 completed.
```

必须输出：

## FACT

实际已经验证的事实。

## RESOLVED

M7 已经解决的问题。

## CONFIRMED

经测试确认工作的能力。

## REMAINING RISKS

尚未解决的真实风险。

## P0

只有确实存在的 P0。

## P1

只有有证据、有影响的 P1。

## NOT BLOCKING

可以留到以后、但不阻塞 M7 的问题。

## M8 DEPENDENCIES

明确告诉下一阶段 TTS 需要哪些已经具备的接口。

---

# 一百零五、Git 提交

不要把整个 M7 压成一个超级 Commit。

建议按照逻辑拆分：

```text
PDF runtime / dependency
PDF core model
PDF library integration
Reader Adapter
Navigation
Search
Location / Progress
Annotation
Bookmark
Security
Tests
Docs
```

实际 commit 数量根据代码变化决定。

要求：

> 每个 commit 尽量有明确主题，可以独立 review。

不要为了凑 commit 数量强行拆碎。

---

# 一百零六、最重要的架构底线

整个 M7 始终围绕以下边界：

```text
                    Reverie
                      │
        ┌─────────────┴─────────────┐
        │                           │
   User-Owned Files          Derived SQLite
        │                           │
        │                           └── Search Index
        │                           └── Fast Query
        │                           └── Cache
        │
        ├── PDF
        ├── Metadata
        ├── Annotation
        ├── Bookmark
        └── Reading State

                    Reader Shell
                         │
                 Reader Adapter
                         │
                  PDF Abstraction
                         │
                  PDF Runtime
                         │
                  PDF Renderer
```

不能倒过来。

尤其不能变成：

```text
PDF
 ↓
SQLite
 ↓
Reader
```

而必须是：

```text
PDF
 ↓
Reader
```

SQLite 只是帮助：

```text
Search
Library
Index
```

---

# 一百零七、不要犯这几个典型错误

## 错误 1：把 PDF 当成图片查看器

错误：

```text
PDF → 每页 Bitmap → Image Viewer
```

这样会失去：

```text
Search
Selection
Highlight
Location
Annotation
```

---

## 错误 2：把 PDF 做成独立系统

错误：

```text
PdfViewer
PdfSearch
PdfBookmark
PdfAnnotation
PdfState
```

全部独立。

正确：

```text
Unified Reader
+
Pdf Adapter
```

---

## 错误 3：把 PDF 状态写进 SQLite

错误：

```text
Bookmark / Highlight / Progress
↓
SQLite only
```

SQLite 重建后全部消失。

这是严重架构问题。

---

## 错误 4：Highlight 只保存坐标

错误：

```text
page + x + y + width + height
```

正确：

```text
page
+
quote
+
context
+
text range
+
geometry
```

在实际 API 能力允许的范围内尽量保存。

---

## 错误 5：把 Page Number 当作稳定定位

错误：

```text
Bookmark = page 42
```

至少应该：

```text
ReaderLocation
```

保存内部 page identity。

---

## 错误 6：为了扫描 PDF 顺手加 OCR

不要。

M7：

```text
PDF Reader
```

不是：

```text
OCR Engine
```

---

## 错误 7：允许 PDF JavaScript

不要。

PDF 是不可信输入。

---

## 错误 8：为了兼容所有 PDF 而无限扩张

不要。

Reverie 不需要成为：

```text
Adobe Acrobat
```

M7 的目标是：

> 一个可靠的个人阅读归档系统中的 PDF Reader。

---

# 一百零八、执行方式

现在开始：

### Phase A — Explore

先读取项目并分析真实现状。

不要直接大规模编码。

输出：

```text
docs/M7-EXPLORE.md
```

---

### Phase B — Plan

根据真实现状生成：

```text
docs/M7-IMPLEMENTATION-PLAN.md
```

明确：

```text
现有能力
缺失能力
复用点
新增点
风险
测试
批次
```

---

### Phase C — Implement

按照 Batch 1 → Batch 10 逐步实施。

每个 Batch 完成后：

```text
代码
测试
必要文档
```

保持项目可运行。

---

### Phase D — Verify

执行：

```text
Unit Tests
Integration Tests
Runtime Tests
Security Tests
Performance Tests
Regression Tests
```

不要只测试 happy path。

---

### Phase E — Review

最终重点检查：

```text
Data Integrity
Reader Architecture
Annotation Integrity
Location Stability
Security
Performance
Concurrency
SQLite Independence
```

---

# 最终目标

M7 完成后，我希望看到的不是：

> “现在可以在 Reverie 里面打开 PDF。”

而是：

> **“PDF 已经真正成为 Reverie 的一等阅读文档。”**

即：

```text
PDF
→ Library
→ Reader
→ Search
→ Read
→ Select
→ Highlight
→ Note
→ Bookmark
→ Progress
→ Close
→ Reopen
→ Restore
→ Search Again
→ Export Annotation
→ Rebuild Index
→ Everything Still Works
```

用户不应该需要关心：

```text
SQLite 有没有坏
Cache 在不在
Renderer 有没有换过
PDF Library 有没有换过
程序重启过没有
```

只要：

```text
自己的 PDF
+
自己的 Reverie 用户数据
```

还在，

就应该尽可能继续拥有：

```text
阅读能力
搜索能力
标注能力
书签
阅读进度
```

这才是 M7 的完成标准。

---

**执行约束最终重申：**

1. 先探索，不要直接猜架构。
2. 代码是真相。
3. 不进行无证据的大规模重构。
4. 复用 M2 Annotation、M3 Search、M5 Import/Export、M6 Reader Shell。
5. 第三方 PDF Runtime 必须隔离。
6. 原始 PDF 不修改。
7. SQLite 可重建。
8. Annotation / Bookmark / Progress 不得依赖 SQLite。
9. PDF 必须按不可信输入处理。
10. 不做 DRM 破解、密码绕过或其他访问限制绕过。
11. 不把 OCR、PDF 编辑器、云服务等内容塞进 M7。
12. 优先保证数据安全、稳定定位、可靠阅读和故障隔离。
13. Git 使用逻辑拆分 Commit。
14. 最终必须输出 `RESOLVED / CONFIRMED / REMAINING RISKS`。
15. M7 完成后，为 M8 TTS 提供稳定的 PDF Text / Reader Location 能力，但不提前实现 TTS。