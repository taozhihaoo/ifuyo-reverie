# ifuyo Reverie — M6 EPUB Reader EPUB 阅读器开发提示词

> **项目：ifuyo Reverie**  
> **里程碑：M6 — EPUB Reader**  
> **目标：将 EPUB 正式接入 Reverie Unified Reader Shell，形成可长期使用的 EPUB 阅读、目录、翻页、搜索、进度、书签、高亮、笔记能力。**
>
> **本阶段原则：先理解现有系统，再实现；以当前代码与实际运行行为为事实来源；不要因为理论上的“架构更漂亮”而大规模重构。**
>
> **M6 是 EPUB 阅读能力的产品化阶段，不是 EPUB 编辑器，也不是电子书格式研究项目。**

---

# 一、你的角色

你现在负责 ifuyo Reverie 项目的 **M6 EPUB Reader** 开发。

你不是在新建一个孤立的 EPUB 阅读器，而是在现有 Reverie 架构中实现一个完整的：

> **EPUB Reader Adapter**

它必须接入 Reverie 已有的：

- Unified Reader Shell
- Document
- Library
- Reader State
- Progress
- Search
- Bookmark
- Generic Annotation
- Highlight
- Note
- Metadata
- Import / Export
- Persistence
- File-native data architecture

你的实现必须让 EPUB 成为 Reverie 的一种普通 Document，而不是一套完全独立的数据系统。

---

# 二、最高优先级原则

整个 M6 必须遵守以下原则。

## 1. 文件是真相，SQLite 不是 EPUB 真相

EPUB 原文件：

```text
book.epub
```

永远是用户资产的原始真相。

SQLite：

- 只能做索引
- 查询缓存
- UI 状态缓存
- 性能优化
- 可重建派生数据

不能成为 EPUB 内容唯一存储。

删除 SQLite 后：

- EPUB 仍然存在
- 阅读器仍然可以重新解析 EPUB
- Library 可以重新扫描
- Search Index 可以重新建立
- Reader State 可以恢复或从文件派生

不得设计成：

```text
EPUB → SQLite → Reader
```

而应保持：

```text
EPUB File
   ↓
EPUB Parser / Adapter
   ↓
Generic Document / Reader Model
   ↓
Unified Reader Shell
```

SQLite 仅作为派生索引和缓存存在。

---

# 三、先做 Explore，禁止直接编码

开始实施之前，不允许直接创建大量 EPUB 代码。

第一步必须对现有项目进行完整探索。

## 必须检查

### 1. Unified Reader Shell

查找当前 Reader Shell 的：

- 接口
- 生命周期
- Reader Controller
- Reader View
- Toolbar
- Navigation
- Progress
- Search
- Bookmark
- Annotation
- Document Loading
- Reader State
- 输入事件
- Selection
- 页面切换
- Window/Fullscreen
- UI 状态

回答：

```text
当前 Unified Reader Shell 到什么程度？
哪些能力已经真正稳定？
哪些只是接口？
哪些功能只有 Web Adapter 实现？
哪些仍然是 Stub？
```

---

### 2. Web Reader Adapter

重点研究已有 Web Reader。

确认：

- Adapter 如何注册
- Document 如何进入 Reader
- Reader Shell 如何调用 Adapter
- Selection 如何暴露
- Anchor 如何保存
- Progress 如何计算
- Bookmark 如何保存
- Search 如何接入
- Reader State 如何持久化
- UI 与 Reader Adapter 的边界在哪里

EPUB Adapter 应尽量遵循已经被验证过的模式，而不是重新设计另一套体系。

---

### 3. M2 Annotation Core

完整检查当前：

- Generic Annotation
- Highlight
- Note
- Anchor
- Locator
- Quote
- Context
- Re-anchor
- Orphan Annotation
- Annotation Persistence

必须搞清楚：

> EPUB 高亮到底如何映射到 Generic Annotation？

不要因为 EPUB 特有定位机制而重新创建第二套 Annotation System。

正确方向：

```text
Generic Annotation
        ↑
        │
EPUB-specific Anchor / Locator
        ↑
        │
EPUB Reader
```

而不是：

```text
Generic Annotation
Web Annotation
EPUB Annotation
RSS Annotation
...
```

各自维护互不兼容的数据系统。

---

### 4. M3 Search

确认现有：

- Global Search
- Search Index
- Document Search
- Annotation Search
- Search Result
- Snippet
- Search Provider / Adapter
- Index rebuild

EPUB 阅读器内部 Search 必须与现有 Search 架构协同。

不要再创建一套 SQLite Search。

---

### 5. M5 Import / Export

重点确认：

- EPUB Import 是否已经存在
- EPUB Export 的输出格式
- Metadata
- Document identity
- Provenance
- Library layout
- 文件命名
- Document ID
- Import-generated EPUB metadata

M6 必须兼容 M5。

---

### 6. 当前文件系统结构

确认当前项目实际采用的 Library Layout。

尤其确认 EPUB 最终实际是否类似：

```text
books/
    book-id/
        book.epub
        meta.json
        annotations.jsonl
```

不要因为本提示词中的示例路径而擅自改变已有目录规范。

如果实际代码已经形成事实标准：

> 以代码与当前数据为准。

---

# 四、M6 最终目标

M6 完成后，用户应该能够：

```text
Library
  ↓
打开 EPUB
  ↓
Reader Shell
  ↓
正常阅读
  ↓
打开目录
  ↓
章节跳转
  ↓
翻页 / 滚动
  ↓
阅读进度保存
  ↓
恢复上次阅读位置
  ↓
书内搜索
  ↓
选中文字
  ↓
高亮
  ↓
添加笔记
  ↓
创建书签
  ↓
从 Annotation / Bookmark 返回原文
```

并且：

```text
关闭 Reverie
重新启动
↓
重新读取 EPUB
↓
恢复阅读位置
↓
恢复高亮
↓
恢复笔记
↓
恢复书签
```

---

# 五、M6 核心 Scope

本阶段正式实现以下能力。

## A. EPUB Parser

支持：

- EPUB 容器
- OPF
- metadata
- manifest
- spine
- navigation
- XHTML / HTML 内容
- 图片资源
- CSS 基础能力
- 字体资源（在可安全支持范围内）
- 章节资源
- relative URI
- 内部链接

兼容常见 EPUB 2 / EPUB 3 结构。

对于 EPUB 2 / EPUB 3 的具体差异：

> 根据真实测试样本和当前使用的 EPUB 解析库能力决定支持范围。

不得为了追求格式规范的理论完整度，把 M6 变成无限扩张项目。

---

# 六、EPUB Container Architecture

EPUB 本质上是 ZIP Container。

必须建立明确的：

```text
EpubContainer
```

职责至少包括：

```text
Open
ListEntries
ReadEntry
EntryExists
GetEntrySize
Close
```

Container 层只负责容器访问。

不要让：

```text
Reader UI
Search
Annotation
Progress
```

直接操作 ZIP API。

正确结构：

```text
EPUB File
   ↓
EpubContainer
   ↓
EpubParser
   ↓
EpubBookModel
   ↓
EpubReaderAdapter
   ↓
Reader Shell
```

---

# 七、EPUB 数据模型

根据实际项目需要建立 EPUB-specific model。

建议至少包含：

```text
EpubBook
EpubMetadata
EpubManifest
EpubManifestItem
EpubSpine
EpubSpineItem
EpubNavigation
EpubNavigationItem
EpubResource
EpubChapter
```

但不要为了形式完整而建立大量没有实际用途的 DTO。

模型必须服务于：

- Reader
- TOC
- Progress
- Search
- Selection
- Annotation
- Bookmark
- Internal Navigation

---

# 八、OPF 解析

必须正确处理常见：

```xml
<package>
<metadata>
<manifest>
<spine>
```

需要识别：

- title
- creator / author
- language
- identifier
- publisher
- date
- cover
- manifest resource
- media-type
- properties
- spine order
- linear/non-linear

尤其注意：

> manifest order ≠ reading order

真正阅读顺序必须由：

```text
spine
```

确定。

---

# 九、Navigation / TOC

实现：

```text
Table of Contents
```

至少支持：

- EPUB 3 nav
- EPUB 2 NCX
- 常见 EPUB 内部 TOC 结构

必须统一成 Reverie 自己的：

```text
ReaderNavigation
ReaderNavigationItem
```

不要让 UI 直接知道：

```text
nav.xhtml
toc.ncx
```

这些 EPUB 文件结构。

Reader Shell 只应该看到统一的：

```text
TOC
```

---

# 十、章节与阅读顺序

EPUB 可能存在：

- 多个 XHTML
- 子章节
- 非线性 spine item
- 内部链接
- fragment identifier
- 同一个章节多个资源
- 资源不在同一目录

必须正确处理 URI。

尤其不能简单写：

```text
Path.Combine(currentPath, href)
```

然后假定一切正常。

需要处理：

- URI decode
- relative path
- `/`
- `../`
- fragment
- URL encoded characters
- XHTML 内部 anchor

---

# 十一、EPUB Rendering

这是 M6 的核心技术难点之一。

必须先确认当前 Godot 项目实际可用的：

- HTML rendering
- WebView
- WebKit / Chromium / Edge WebView2
- Godot Control rendering
- 外部 HTML rendering
- 第三方 EPUB / HTML engine

再决定方案。

---

# 十二、Rendering 边界

EPUB Renderer 不应该把第三方引擎直接暴露给整个 Reverie。

错误：

```text
Reverie
 ├── WebView2 API
 ├── SomeEpubEngine API
 ├── ZIP API
 └── Reader
```

正确：

```text
Reverie
   ↓
IReaderAdapter
   ↓
EpubReaderAdapter
   ↓
IEpubRenderer
   ↓
Concrete Renderer
```

这样以后更换底层实现，不会污染：

- Annotation
- Search
- Progress
- Library
- UI
- Document Model

---

# 十三、CSS 支持策略

不要试图实现完整浏览器。

M6 的目标是：

> **足够可靠地阅读真实 EPUB，而不是复刻 Chromium。**

优先支持：

- font-size
- font-family
- font-weight
- line-height
- color
- background
- margin
- padding
- text-align
- text-indent
- display
- width / height
- max-width
- img
- basic list
- basic table
- basic block / inline
- page-break related common properties

对于：

- 高级 CSS
- complex layout
- animation
- script
- interactive widgets
- obscure vendor-specific CSS

应该：

```text
Graceful Degradation
```

不能因为一个 CSS 属性不支持而导致整章无法阅读。

---

# 十四、JavaScript

默认：

> **不执行 EPUB 中的任意 JavaScript。**

M6 不需要做互动式 Web App。

如果 EPUB 包含：

```text
<script>
```

必须有明确处理策略。

优先：

```text
ignore / disable
```

并保证：

- 不执行任意脚本
- 不访问本机文件
- 不访问任意网络
- 不注入应用环境
- 不突破 Reader Sandbox

---

# 十五、外部资源

EPUB 内部资源：

```text
images
styles
fonts
media
```

必须与 EPUB container 解耦。

默认不应允许 EPUB HTML 任意加载：

```text
file:///
http://
https://
```

外部资源是否允许，必须由当前安全模型决定。

默认采用：

> EPUB 自包含内容优先。

不因为某个 EPUB 需要联网资源而放宽整个应用的网络安全边界。

---

# 十六、EPUB Security

M6 必须把 EPUB Container 当作：

> **不可信输入。**

不能认为 `.epub` 是安全文件。

至少处理：

## 1. Path Traversal

拒绝类似：

```text
../../file
```

以及变体。

不能出现：

```text
ZIP Entry → 任意写入本机路径
```

---

## 2. ZIP Bomb

限制：

- compressed size
- uncompressed size
- total extraction size
- entry count
- nesting / recursion where applicable
- memory usage

不要无条件：

```text
Extract All
```

---

## 3. 超大文件

必须有：

- file size limit
- entry size limit
- resource limit

具体数值根据实际产品目标与测试数据确定。

不要随便拍脑袋写成一个极端小值导致真实电子书不可读。

---

## 4. XML Security

OPF / NCX / XHTML 解析必须防范：

- DTD
- XXE
- external entity
- entity expansion
- malicious nesting
- malformed XML
- oversized XML

使用的 XML parser 如果具有安全配置：

> 显式关闭危险特性。

---

## 5. HTML Security

EPUB XHTML 必须经过受控解析。

不能因为：

```html
<script>
```

或者：

```html
<object>
<iframe>
```

之类内容存在就把宿主环境暴露出来。

---

## 6. Unsupported Encryption / DRM

M6：

> 不破解 DRM。

如果 EPUB 使用加密资源或 DRM：

```text
Detect
→ Explain Unsupported
→ Fail Gracefully
```

绝对不要加入：

- DRM 破解
- 许可证绕过
- 加密资源解密绕过
- 账户验证绕过

---

# 十七、原始 EPUB 不可变

必须坚持：

```text
book.epub = original source
```

阅读过程中：

- 不修改 EPUB
- 不写回 HTML
- 不把高亮直接写进 EPUB
- 不修改 CSS
- 不修改 OPF
- 不重新压缩原文件

用户高亮、笔记、书签、进度全部存储在 Reverie 自己的数据层。

例如：

```text
book.epub
meta.json
annotations.jsonl
reader-state.json
```

具体路径以当前项目实际格式为准。

---

# 十八、Reader Shell Integration

EPUB 必须接入统一 Reader Shell。

Reader Shell 负责：

```text
Toolbar
Navigation
Search UI
Bookmark UI
Annotation UI
Progress UI
Reader settings
Keyboard shortcuts
Window state
```

EPUB Adapter 负责：

```text
Book loading
Chapter loading
Rendering
Position mapping
Selection mapping
Search mapping
Navigation mapping
```

不要把 UI 逻辑复制一份到：

```text
EpubReader
```

---

# 十九、Reader Adapter 接口

检查当前系统是否已有：

```text
IReaderAdapter
```

如果已经存在：

> 优先复用。

如果现有接口确实无法支持 EPUB：

> 只做必要扩展。

不要因为 EPUB 出现几个特殊需求，就重新定义整个 Reader Architecture。

最终结构应接近：

```text
ReaderShell
      │
      ├── WebReaderAdapter
      ├── EpubReaderAdapter
      ├── PdfReaderAdapter      ← later
      ├── MarkdownReaderAdapter
      └── TxtReaderAdapter
```

---

# 二十、Document → EPUB Adapter

必须保证：

```text
Document
   ↓
ReaderFactory
   ↓
EpubReaderAdapter
```

能够根据：

```text
document.type
```

或者已有项目对应机制识别 EPUB。

不要根据：

```text
UI 点击来源
```

判断阅读器类型。

---

# 二十一、TOC UI

实现完整的：

```text
目录面板
```

至少具备：

- 显示章节
- 层级
- 当前章节状态
- 点击跳转
- 自动定位当前章节
- 长目录滚动
- 关闭目录
- 键盘操作

点击 TOC：

```text
TOC Item
→ Reader Location
→ Adapter Navigate
→ Shell 更新 Progress
```

不能：

```text
TOC UI
→ 自己解析 EPUB
```

---

# 二十二、Pagination / Page Model

必须先结合实际 Renderer 确定：

> Reverie M6 的 EPUB 是“分页阅读”还是“滚动阅读”，或者允许两者存在。

不要为了“像传统电子书”而强行设计一个底层分页系统。

如果采用分页：

需要定义统一：

```text
ReaderLocation
```

例如：

```text
book
spine item
document offset
page
```

如果采用滚动：

也必须能够建立：

```text
stable reading position
```

推荐底层不要把：

```text
pixel y
```

作为唯一进度锚点。

---

# 二十三、稳定 Reading Location

EPUB 阅读进度必须尽量使用：

```text
Book ID
+
Spine Item
+
Content Position
```

而不是：

```text
Window ScrollY = 18342
```

因为：

- 字体可能改变
- 窗口大小可能改变
- DPI 可能改变
- 渲染器可能改变
- CSS 可能变化

建议采用多级定位：

```text
Primary:
EPUB structural location

Fallback:
text quote / context

Optional:
renderer-specific offset
```

---

# 二十四、Progress Model

必须接入 Reverie 的统一 Progress。

至少记录：

```text
book
current spine item
position
overall normalized progress
last opened
```

如果当前系统支持：

```text
chapter progress
overall progress
```

则统一接入。

---

# 二十五、Progress 不应依赖 Renderer

错误：

```text
Renderer → SQLite progress
```

正确：

```text
EPUB Adapter
      ↓
ReaderLocation
      ↓
Progress Service
      ↓
Persistent State
```

这样以后换 Renderer 后：

> 用户不会丢失阅读进度。

---

# 二十六、恢复阅读位置

重新打开 EPUB：

```text
Book ID
→ Load Reader State
→ Resolve EPUB Location
→ Navigate
→ Render
```

必须支持：

- EPUB 文件仍存在
- EPUB 文件位置未变
- Reverie 重启
- Renderer 重新初始化

都能恢复。

如果原 EPUB 被替换：

必须检测：

```text
content identity / file identity / metadata
```

不要盲目套用旧进度。

---

# 二十七、Book Identifier

注意：

文件名不能作为唯一身份。

应使用已有：

```text
Document ID
```

或现有 Library identity system。

EPUB 内部的：

```text
dc:identifier
```

是书籍元数据的一部分。

不要直接拿它取代 Reverie Document ID。

---

# 二十八、EPUB Search

实现：

> **书内搜索。**

用户输入关键词：

```text
Search
→ EPUB content
→ matching chapters
→ snippets
→ click result
→ navigate to location
```

---

# 二十九、EPUB Search 不要重复造轮子

如果 M3 已经有 Search abstraction：

必须尽可能复用。

EPUB Adapter 可以提供：

```text
IEpubSearchProvider
```

但 Search UI、Search Result、Search State 不应该重新实现。

---

# 三十、书内搜索结果

结果至少包含：

```text
chapter
snippet
location
match range
```

点击结果：

```text
Search Result
→ Reader Location
→ Navigate
→ Highlight Match
```

---

# 三十一、Search 与 Annotation

必须明确：

```text
Global Search
```

和：

```text
In-Book Search
```

是两个视图 / 两种查询范围，而不是两个完全独立的 Search Systems。

例如：

```text
Global:
所有 Document + Annotation

In Book:
当前 EPUB Document
```

最终结果结构保持统一。

---

# 三十二、Text Selection

这是 M6 与 M2 最重要的结合点之一。

必须实现：

```text
用户选择 EPUB 文本
        ↓
Reader Selection
        ↓
Generic Annotation Request
```

不能由 EPUB Adapter 自己创建另一种 Highlight 数据格式。

---

# 三十三、EPUB Anchor

EPUB 的高亮定位必须尽量稳定。

不要只存：

```text
pixel x
pixel y
```

也不要只存：

```text
DOM node index
```

应使用结构化定位。

候选方案：

```text
Spine Item
+
CFI / DOM structural locator
+
text quote
+
prefix/suffix context
```

具体采用什么定位格式：

> 必须先检查当前 M2 的 Anchor 模型和现有 Web Adapter 实现，再确定。

---

# 三十四、定位必须允许 Fallback

推荐：

```text
Primary Locator
    ↓
精确恢复

失败
    ↓
Quote / Context Search

仍失败
    ↓
Orphan
```

不能：

```text
Locator 失败
→ 删除 Highlight
```

必须保留 Annotation。

---

# 三十五、Re-anchor

EPUB 发生以下变化时：

- CSS 改变
- Renderer 改变
- 页面宽度改变
- Font 改变
- EPUB Reader 实现改变

不能直接认为高亮失效。

应该尽量通过：

```text
structural locator
+
exact quote
+
context
```

恢复。

---

# 三十六、Highlight UI

用户可以：

```text
选中文字
→ Highlight
```

并复用现有 Highlight 系统。

至少支持：

- 创建
- 查看
- 删除
- 跳转
- 状态
- orphan 标记

颜色方案：

> 遵循现有 Reverie / M2 设计，不要重新创建另一套主题系统。

---

# 三十七、Note

用户能够从 Highlight：

```text
Highlight
→ Add Note
```

或者根据现有 Annotation UI：

```text
Selection
→ Note
```

Note 必须：

- 与 Annotation 关联
- 单独持久化
- 可搜索
- 可跳回原文

---

# 三十八、Bookmark

M6 必须正式支持 EPUB Bookmark。

Bookmark 不应该只保存：

```text
page number
```

而应保存稳定 Reader Location。

例如：

```text
book
spine item
structural locator
display metadata
created time
```

---

# 三十九、Bookmark 生命周期

支持：

```text
Create
Open
Delete
List
```

重新启动 Reverie 后依然存在。

删除 EPUB 原文件：

> Bookmark 不应导致程序崩溃。

根据当前项目的数据模型，它应该进入：

```text
orphan / unresolved
```

或采用已有一致的处理方式。

---

# 四十、Keyboard Navigation

至少检查并支持当前 Reader Shell 的：

```text
Page Next
Page Previous
Chapter Next
Chapter Previous
Search
TOC
Bookmark
```

具体快捷键必须与现有 Reader Shell 保持统一。

不要为 EPUB 自己发明另一套快捷键。

---

# 四十一、Reading Settings

M6 可以提供必要的 EPUB 阅读设置：

- font size
- line height
- margin
- theme
- column/page mode（若底层支持）
- font family（若底层支持）

但：

> 必须先确认哪些设置已经属于 Reader Shell。

统一设置应该归：

```text
Reader Preferences
```

而不是：

```text
EpubSettings
```

存一套独立 UI State。

---

# 四十二、Rendering Preference 与 Progress 分离

改变：

- 字体
- 字号
- 窗口尺寸
- Theme

不能破坏：

- Bookmark
- Highlight
- Note
- Progress

这是 M6 的核心验收点。

---

# 四十三、Image Resource

EPUB 中：

```text
<img>
```

必须能够正确加载常见图片格式。

需要处理：

- relative path
- encoded path
- missing image
- oversized image
- invalid image
- very large resolution

对于超大图片：

> 应有合理的内存 / 尺寸保护。

不要因为一本电子书包含一个巨大图片就让整个程序 OOM。

---

# 四十四、Fonts

如果支持嵌入字体：

必须：

- 安全读取
- 限制资源大小
- 失败时使用 fallback font
- 不因为字体损坏导致整本书打不开

同时：

> 不要为了支持字体而修改用户系统字体安装目录。

---

# 四十五、内部链接

必须支持：

```html
<a href="chapter2.xhtml">
<a href="chapter2.xhtml#section3">
```

等常见内部链接。

导航：

```text
Click Link
→ Resolve URI
→ Resolve Spine Item
→ Navigate
```

不得让 WebView / Renderer 直接访问任意本机路径。

---

# 四十六、External Link

对于：

```text
http://
https://
```

外部链接：

采用当前产品统一的 External Link Policy。

默认：

> 不让 EPUB 内容静默在内部环境中执行任意网络行为。

如允许打开：

```text
用户主动点击
→ 系统默认浏览器
```

而不是 EPUB 自动访问。

---

# 四十七、HTML 清洗与兼容性

真实 EPUB 的 XHTML 往往并不完美。

可能存在：

- 非严格 XHTML
- 缺失 metadata
- 非标准 CSS
- 错误闭合标签
- 多余 namespace
- 奇怪编码
- 老 EPUB 结构
- 不规范 URI

需要设计：

```text
Parse → Normalize → Render
```

避免：

```text
Parse Failure → Entire Book Failure
```

---

# 四十八、错误恢复原则

错误必须分层。

例如：

### Book-level Error

```text
OPF missing
Container invalid
Manifest unreadable
```

→ 该 EPUB 无法打开。

### Chapter-level Error

```text
One XHTML broken
One image broken
One CSS broken
```

→ 尽量只影响该章节 / 资源。

### Resource-level Error

```text
Missing image
Bad font
Unsupported media
```

→ 使用 fallback。

这是 M6 稳定性的关键。

---

# 四十九、EPUB Reader 生命周期

建议明确：

```text
Open
↓
Load Container
↓
Parse Metadata
↓
Parse Manifest
↓
Parse Spine
↓
Parse Navigation
↓
Initialize Renderer
↓
Create Reader State
↓
Render Current Location
```

关闭：

```text
Save Reader State
↓
Dispose Renderer
↓
Dispose Resources
↓
Close Container
```

所有生命周期必须支持：

- cancellation
- disposal
- repeated open/close
- failed initialization cleanup

---

# 五十、Cancellation

用户快速：

```text
Open Book A
Open Book B
Close Reader
Switch Books
```

时：

旧任务不能继续修改当前 Reader。

必须检查是否已有：

```text
CancellationToken
generation id
request id
```

之类的机制。

避免：

```text
Book A loading
Book B loading
A 完成后覆盖 B
```

---

# 五十一、Concurrency

重点测试：

```text
Search
Render
Load Chapter
Save Progress
Annotation Save
```

同时发生时：

不得：

- 锁死 UI
- 数据互相覆盖
- Reader 显示旧 Book
- Annotation 写错 Document
- Progress 写到另一本书

---

# 五十二、Persistence

M6 新增的数据必须继续遵守：

```text
temp
→ write
→ validate
→ atomic rename
```

特别是：

- reader state
- bookmarks
- annotations

不能：

```text
直接覆盖用户文件
```

---

# 五十三、Annotation 保存失败

不能出现：

```text
UI 显示“已高亮”
↓
文件保存失败
↓
程序继续认为保存成功
```

应该：

```text
User Action
→ Validate
→ Persist
→ Success
→ Update UI
```

或者使用：

```text
Optimistic UI
→ rollback on failure
```

但必须保证真实状态最终与文件一致。

---

# 五十四、EPUB 与现有 Metadata

M6 应正确读取并映射：

```text
Title
Author
Language
Publisher
Identifier
Date
Cover
```

但注意：

EPUB 元数据和 Reverie Document Metadata 是不同层次。

建立明确映射：

```text
EPUB metadata
        ↓
Reverie Metadata
```

不能让 EPUB OPF 成为整个 Library 的数据模型。

---

# 五十五、Cover

如果当前 Library 支持缩略图 / Cover：

EPUB 应优先读取：

```text
cover resource
```

或根据实际 EPUB 规范结构寻找。

但：

> Cover 是派生资源。

不能因为生成 thumbnail 而修改 EPUB。

---

# 五十六、Index Integration

M3 Global Search 应能够搜索 EPUB。

至少：

```text
Title
Author
Book Content
Highlight
Note
Tag
```

具体字段以现有 Search Schema 为准。

EPUB 内容索引来源必须来自：

```text
EPUB Adapter / Generic Document Loader
```

而不是 Search Index 再自己解压 EPUB。

---

# 五十七、统一 Document Loader

M6 必须继续保持：

> Library Scanner / Document Loader / Reader Adapter / Indexer 不得各自重复解析 EPUB。

推荐方向：

```text
Library Scanner
       ↓
Document Descriptor
       ↓
Document Loader
       ↓
EPUB Parser
       ↓
Generic Document / Searchable Representation
```

Reader 与 Search 尽量共享解析结果或统一的中间模型。

---

# 五十八、不要让 SQLite 反向成为 EPUB Parser

禁止这种结构：

```text
EPUB
 ↓
Indexer
 ↓
SQLite
 ↓
EPUB Reader
```

否则：

- 删除 DB
- 数据库损坏
- Index rebuild

都会影响阅读。

EPUB Reader 永远可以直接从原始 EPUB 恢复。

---

# 五十九、Performance

M6 不允许为了打开一本书：

```text
一次性解压整个 EPUB
一次性生成全部 DOM
一次性加载全部图片
一次性加载全部字体
```

如果当前实现确实需要其中部分机制：

必须通过实际 profiling 证明。

重点关注：

- 首屏时间
- 大 EPUB 打开
- 章节切换
- Search
- TOC
- 图片
- 内存占用
- 重复打开关闭

---

# 六十、推荐加载策略

优先考虑：

```text
Book metadata
   ↓
TOC / spine
   ↓
Current chapter
   ↓
Adjacent chapters
```

而不是：

```text
Load entire book
```

可以加入预加载，但必须：

- 可取消
- 有界
- 不阻塞当前章节
- 不无限缓存

---

# 六十一、真实 EPUB Corpus

M6 不允许只使用自己创建的一两本“完美 EPUB”测试。

必须准备真实样本。

建议建立：

```text
tests/fixtures/epub/
```

至少覆盖：

```text
EPUB 2
EPUB 3
CJK
English
Long book
Short book
Many chapters
Large images
Embedded fonts
Nested TOC
Internal links
Fragment links
Malformed EPUB
Missing resource
Odd CSS
Large EPUB
Legacy EPUB
Fixed-layout EPUB（至少验证并记录支持状态）
```

所有测试 EPUB 必须有合法来源或可合法使用。

不得提交：

- 受版权保护的完整商业电子书
- DRM 内容
- 未授权传播内容

测试 fixture 优先使用：

- 自制
- 明确允许测试
- 公版
- 开源许可
- 项目专门生成

---

# 六十二、Fixed Layout

M6 不要求实现完整的 fixed-layout EPUB。

但是必须：

> **明确检测并记录当前支持情况。**

如果现有 Renderer 无法可靠支持：

```text
pre-paginated
fixed-layout
```

可以：

```text
Detect
→ Explain Limited Support
→ Graceful Fallback / Reject
```

不要伪装成“完全支持”。

---

# 六十三、Media Overlays

M6 不需要把 EPUB Media Overlays 做成完整功能。

除非当前项目原本已有成熟基础，否则：

```text
Detect
→ Ignore unsupported feature
→ Continue normal reading where possible
```

并在文档中记录。

---

# 六十四、SVG

根据 Renderer 能力决定。

必须避免：

```text
Unsupported SVG
→ Renderer crash
```

至少应该：

```text
render
fallback
or graceful omission
```

---

# 六十五、RTL / CJK

至少测试：

```text
中文
英文
混合文本
长标题
长段落
标点
```

对于：

```text
RTL
```

需要明确支持状态。

不要声称“完全国际化 EPUB 支持”，除非测试证明。

---

# 六十六、Accessibility

不要求 M6 做完整无障碍系统。

但不要故意破坏：

- text selection
- readable semantic structure
- keyboard navigation
- text scaling

如果底层 Renderer 存在限制：

> 记录为已知限制。

---

# 六十七、Reader Search 与 Global Search 的关系

必须写入设计文档：

```text
Global Search
=
跨 Library 搜索

In-Book Search
=
当前 EPUB 内定位搜索
```

两者共享：

- Query Model
- Result Model
- Navigation Contract

但可以使用不同的底层索引策略。

---

# 六十八、Annotation Navigation

用户在：

```text
Annotation Panel
```

点击一个 EPUB Highlight：

必须：

```text
Annotation
→ Resolve Anchor
→ Open Book if needed
→ Chapter
→ Position
→ Highlight
```

如果无法恢复：

```text
Show Orphan
```

不得静默失败。

---

# 六十九、Bookmark Navigation

同样：

```text
Bookmark
→ Resolve ReaderLocation
→ Navigate
```

不得依赖当前页面编号。

---

# 七十、Reader History

如果现有项目有：

```text
Recent
```

打开 EPUB 后应进入统一 Recent。

不要创建：

```text
Recent EPUB
```

这种独立系统。

---

# 七十一、Read State

阅读 EPUB 时：

必须继续遵守 M3 的：

> Read / Unread 与 Favorite / Inbox 独立。

不要因为“用户打开了 EPUB”自动改变 Read 状态，除非当前 M3 设计已经明确如此。

以既有行为为准。

---

# 七十二、文件缺失

如果：

```text
book.epub
```

被用户删除：

Library 不得崩溃。

应显示：

```text
Missing File
```

已有：

- Highlight
- Note
- Bookmark
- Metadata

必须根据现有数据模型保留。

---

# 七十三、文件被外部替换

需要能够检测：

```text
book.epub
```

发生变化。

至少需要考虑：

- timestamp
- size
- content hash
- identity

具体策略按现有 Library / Scanner 机制决定。

如果 EPUB 内容变化：

> 不要无条件覆盖旧 Annotation。

必须经过重新解析 / re-anchor。

---

# 七十四、Annotation 不因 EPUB 更新而自动丢失

这是验收重点。

模拟：

```text
版本 A
→ Highlight “Hello world”

替换 EPUB
→ 内容略有调整

Reverie 重载
```

正确结果应尽量：

```text
Re-anchor
```

而不是：

```text
Delete Highlight
```

---

# 七十五、EPUB Reader State 与 EPUB 文件版本

建议 Reader State 包含可用于判断兼容性的最小信息，例如：

```text
document id
content identity
reader version / schema version
location
```

不要把整个 EPUB Reader 状态绑定到：

```text
具体 Renderer 内部实现细节
```

---

# 七十六、Versioning

所有新增持久化格式必须考虑：

```text
schema version
```

特别是：

- EPUB annotation locator
- Reader State
- Bookmark
- EPUB-specific cache

以后即使 Reader 实现改变：

> 数据格式仍然可以迁移。

---

# 七十七、Cache

可以建立 EPUB 派生缓存，例如：

```text
parsed metadata
toc cache
thumbnail
search text cache
```

但是必须满足：

```text
Cache ≠ Source of Truth
```

缓存丢失后：

```text
Reparse EPUB
```

必须能够恢复。

---

# 七十八、缓存失效

Cache 至少考虑：

```text
EPUB identity
parser version
schema version
```

变化后：

```text
invalidate / rebuild
```

不要继续使用旧解析结果。

---

# 七十九、日志

M6 应提供适量诊断信息：

```text
EPUB open
parse
render
search
anchor resolve
resource failure
```

但是不得把整个：

```text
EPUB content
```

写入日志。

尤其：

- 用户书籍正文
- Notes
- Highlight
- private metadata

不能无意义地写入日志。

---

# 八十、错误信息

错误信息必须面向用户。

例如：

错误：

```text
ZipException: invalid local file header
```

更合理：

```text
This EPUB file could not be opened because the archive is invalid.
```

开发日志可以保留底层错误。

---

# 八十一、第三方依赖

如果使用 EPUB / ZIP / HTML / CSS 第三方库：

必须先检查：

```text
当前项目已有依赖
版本
许可证
平台支持
Godot C# 兼容性
Windows 支持
维护状态
```

不要随意再增加一套 EPUB Framework。

优先：

> 复用当前已有依赖。

如果必须新增：

必须说明：

```text
Why
What problem it solves
License
Runtime impact
Maintenance risk
Alternative considered
```

---

# 八十二、不要因为 EPUB 而引入重量级框架

除非真实技术验证证明必要，否则不要为了 M6 引入：

- 完整浏览器引擎
- 重型电子书框架
- 大规模 UI framework
- 第二套 application architecture

如果需要 WebView2：

必须确保：

> EPUB Reader 与 Web Article Reader 的底层能力可以合理复用。

---

# 八十三、M6 不做的事情

以下全部明确排除。

## 不做：

### PDF Reader

属于：

```text
M7
```

---

### TTS

属于：

```text
M8
```

---

### EPUB 高级导出

例如：

```text
高级排版
Aurora 风格导出
Web → EPUB 高级转换
```

属于：

```text
M9
```

---

### Cloud Sync

不做。

---

### User Accounts

不做。

---

### Online Book Store

不做。

---

### DRM 破解

不做。

---

### Paywall Bypass

不做。

---

### Automatic Piracy / Scraping

不做。

---

### AI Summary

不做。

---

### AI Semantic Search

不做。

---

### Social Sharing

不做。

---

### EPUB Editor

不做。

---

# 八十四、M6 与 M9 的明确边界

M6：

```text
EPUB
→ 可靠打开
→ 可靠阅读
→ Annotation
→ Progress
→ Search
→ Bookmark
```

M9：

```text
Reader Experience
+
Aurora
+
Web → EPUB
+
Article → EPUB
+
高级导出
```

不要在 M6 抢跑 M9。

---

# 八十五、M6 与 M7 的边界

两者应该共享：

```text
Unified Reader Shell
Reader State
Progress
Bookmark
Annotation
Search
```

但是：

```text
EPUB parsing/rendering
PDF parsing/rendering
```

必须独立 Adapter。

最终结构：

```text
Unified Reader Shell
        │
        ├── Web
        ├── EPUB   ← M6
        ├── PDF    ← M7
        ├── Markdown
        └── TXT
```

---

# 八十六、Architecture Acceptance

完成后必须能明确回答：

### Q1

EPUB Adapter 是否可以在不修改全局 Library 架构的情况下注册？

### Q2

EPUB 删除 SQLite 后能否继续阅读？

### Q3

EPUB 原文件是否保持不可变？

### Q4

Annotation 是否复用 Generic Annotation？

### Q5

Bookmark 是否复用 Generic Reader Location？

### Q6

Progress 是否与 Renderer 解耦？

### Q7

Global Search 是否与 M3 共用 Search Contract？

### Q8

EPUB-specific API 是否泄漏到 UI？

### Q9

以后加入 PDF 是否必须复制大量 EPUB 代码？

### Q10

替换 EPUB Renderer 是否会破坏用户 Annotation / Progress？

如果答案不是明确的：

> 必须说明原因并评估是否需要调整。

---

# 八十七、Testing Strategy

M6 测试必须分层。

---

## A. Unit Tests

测试：

```text
ZIP Container
OPF Parser
Manifest Parser
Spine Parser
Navigation Parser
URI Resolver
Metadata Parser
Reader Location
EPUB Search
Anchor
```

---

## B. Integration Tests

测试：

```text
EPUB
→ Library
→ Reader
→ Search
→ Annotation
→ Persistence
```

---

## C. Regression Tests

确保 M6 没有破坏：

- Web Reader
- M3 Search
- M4 RSS
- M5 Import/Export
- Library
- Annotation
- Recent
- Read State

---

# 八十八、必须建立 EPUB Fixture Matrix

至少建立测试矩阵：

| 类型 | 必测 |
|---|---|
| EPUB 2 | 是 |
| EPUB 3 | 是 |
| CJK | 是 |
| English | 是 |
| Long Book | 是 |
| Many Chapters | 是 |
| Images | 是 |
| Embedded Font | 是 |
| Internal Links | 是 |
| Fragment Links | 是 |
| Nested TOC | 是 |
| Missing Resource | 是 |
| Invalid XHTML | 是 |
| Invalid CSS | 是 |
| Large EPUB | 是 |
| Malformed ZIP | 是 |
| Suspicious ZIP | 是 |
| DRM / Encryption | 明确拒绝/降级 |
| Fixed Layout | 明确支持状态 |
| RTL | 明确支持状态 |

---

# 八十九、核心场景测试

必须至少验证以下场景：

```text
1. 打开普通 EPUB
2. 打开 CJK EPUB
3. 打开超长 EPUB
4. TOC 跳章
5. 内部链接跳转
6. 上一次位置恢复
7. 修改字号后位置仍合理
8. 重启 Reverie 后位置恢复
9. 书内搜索
10. 搜索结果跳转
11. 创建 Highlight
12. 重启后 Highlight 恢复
13. Highlight 点击跳转
14. Highlight 无法解析时保持 orphan
15. 创建 Note
16. Note 搜索
17. Bookmark
18. Bookmark 重启后存在
19. EPUB 原文件保持不变
20. 删除 SQLite 后 EPUB 仍可打开
21. 重建 Search Index 后 EPUB 仍可读
22. 缺失图片时 Reader 不崩
23. 损坏字体时 Reader 不崩
24. 一个损坏章节不影响其它章节
25. 打开多个 EPUB 快速切换
26. Reader 关闭时取消加载任务
27. 大文件不会导致无限内存增长
28. 恶意 ZIP 不允许路径逃逸
29. 恶意 XML 不触发外部实体
30. 不支持的 DRM EPUB 正确失败
```

---

# 九十、Persistence Tests

至少覆盖：

```text
正常保存
保存失败
磁盘空间不足
文件被占用
程序异常关闭
程序重新启动
数据文件损坏
Annotation 文件损坏
Reader State 文件损坏
```

确保：

> 文件损坏最多影响对应派生状态，不得损坏原 EPUB。

---

# 九十一、Crash Safety

模拟：

```text
Create Highlight
→ Kill Process
```

以及：

```text
Update Progress
→ Kill Process
```

确认：

- 不产生半截 JSON
- 不破坏 EPUB
- 不让 Library 整体失效
- 下次启动能够恢复 / 报告

---

# 九十二、Index Rebuild Test

这是 Reverie 的核心测试。

执行：

```text
删除 SQLite index
```

然后：

```text
启动 Reverie
→ Scan Library
→ Rebuild Index
```

必须确认：

```text
EPUB
仍可读取
TOC
仍可读取
Progress
仍可读取（若其状态并非 DB-only）
Annotation
仍可读取
Bookmark
仍可读取
```

---

# 九十三、External File Test

手动：

```text
复制 book.epub
移动 Library Folder
重新启动 Reverie
```

确认：

> file-native architecture 仍成立。

如果现有 Library 设计尚未支持整个 Library 根目录移动：

不要在 M6 擅自改动。

记录当前限制。

---

# 九十四、Performance Benchmark

至少记录：

```text
Small EPUB
Medium EPUB
Large EPUB
```

的：

```text
Open time
First content render
Chapter switch
TOC load
Search latency
Memory
```

不要求一开始就达到极端性能指标。

要求：

> 找出明显的结构性性能问题，并记录基准。

---

# 九十五、Do Not Optimize Blindly

禁止为了“性能”而提前实现：

- 复杂异步框架
- 多层缓存
- Memory-mapped architecture
- 全书预渲染
- 自建全文搜索引擎
- 自建 HTML browser

任何优化必须有：

```text
Evidence
Measurement
Impact
```

---

# 九十六、Code Quality

由于 Reverie 是长期维护项目，M6 新代码必须重点防止：

```text
God Object
```

尤其禁止：

```text
EpubReaderManager
```

同时承担：

- ZIP
- XML
- HTML
- CSS
- Search
- Annotation
- Progress
- UI
- Persistence

这种单体结构。

应至少合理拆分：

```text
Container
Parser
Model
Resolver
Renderer
Adapter
Location
Search
Resource
```

但：

> 不要为了“看起来干净”过度拆分。

---

# 九十七、依赖方向

目标依赖关系：

```text
UI
 ↓
Reader Shell
 ↓
Reader Adapter
 ↓
EPUB Reader Services
 ↓
EPUB Parser / Container
 ↓
Raw EPUB File
```

而：

```text
EPUB Parser
```

不应该依赖：

```text
Godot UI
Reader Panel
Search Window
```

保持底层可测试。

---

# 九十八、纯逻辑代码优先

以下尽量做成纯 C#：

- ZIP abstraction
- OPF parsing
- spine
- nav
- URI resolution
- reader location
- annotation mapping
- search preparation
- identity
- resource resolution

Godot 只负责：

- UI
- lifecycle
- rendering integration
- input
- visual presentation

---

# 九十九、禁止 API 泄漏

如果底层使用某个具体 EPUB 库：

禁止出现：

```text
SomeEpubLibrary.Xxx
```

遍布：

```text
ReaderShell
AnnotationPanel
SearchService
Library
```

必须隔离。

---

# 一百、Documentation

M6 完成后必须更新 / 新建：

```text
docs/M6-STATUS.md
docs/EPUB.md
docs/EPUB-ARCHITECTURE.md
docs/EPUB-SECURITY.md
docs/EPUB-RENDERING.md
docs/EPUB-ANNOTATION.md
docs/EPUB-LOCATION.md
docs/READER.md
docs/SEARCH.md
docs/FORMAT.md
docs/DECISIONS.md
docs/PROGRESS.md
```

文件名如果当前项目已有对应文档规范：

> 优先遵循现有规范。

---

# 一百零一、EPUB.md 必须说明

至少包括：

```text
支持的 EPUB 版本
支持的 XHTML
支持的 CSS
支持的图片
字体支持
TOC 支持
内部链接
External Link Policy
Fixed Layout 状态
Media Overlay 状态
RTL 状态
DRM 状态
已知兼容性问题
```

绝对不要写：

```text
完全支持 EPUB
```

除非有足够测试证据。

---

# 一百零二、EPUB-SECURITY.md 必须说明

至少记录：

```text
ZIP 安全
Path Traversal
ZIP Bomb
XML Security
HTML Security
Script Policy
External Resource Policy
Resource Limits
DRM Policy
```

以及所有：

```text
Intentional Limit
```

---

# 一百零三、EPUB-LOCATION.md 必须说明

明确：

```text
ReaderLocation schema
Primary locator
Fallback locator
Progress mapping
Bookmark mapping
Annotation mapping
Re-anchor
Orphan handling
Versioning
```

这是未来 PDF / 其它 Reader Adapter 的基础文档。

---

# 一百零四、M6 实施方法

严格按照：

```text
Explore
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

执行。

不要：

```text
直接开始改 50 个文件
```

---

# 一百零五、Explore 阶段输出

先生成：

```text
docs/M6-EXPLORE.md
```

内容至少包括：

```text
当前 Reader Architecture
当前 Web Adapter
当前 Annotation Architecture
当前 Search Architecture
当前 Persistence
当前 Library
当前 EPUB 能力
现有第三方依赖
候选 EPUB Rendering 路线
实际阻塞点
风险
```

并明确：

```text
FACT
HYPOTHESIS
INFERENCE
```

---

# 一百零六、Plan 阶段

在 Explore 完成后形成：

```text
docs/M6-IMPLEMENTATION-PLAN.md
```

必须包括：

```text
阶段划分
代码变更
数据变更
接口变更
新增依赖
测试策略
兼容性
迁移
风险
回滚方式
```

---

# 一百零七、Plan 的分批落地原则

推荐拆成：

```text
Batch 1
EPUB Container + Parser

Batch 2
EPUB Model + Library Integration

Batch 3
Reader Adapter + Rendering

Batch 4
TOC + Navigation

Batch 5
Progress + Reader Location

Batch 6
Search

Batch 7
Selection + Highlight + Note

Batch 8
Bookmark

Batch 9
Security Hardening

Batch 10
Regression + Performance + Documentation
```

实际实施顺序可以根据 Explore 结果调整。

---

# 一百零八、不要一个 Commit 包办 M6

提交必须按逻辑阶段拆分。

例如：

```text
feat(epub): add epub container abstraction
feat(epub): add package and spine parsing
feat(reader): add epub reader adapter
feat(reader): add epub navigation
feat(reader): add epub progress
feat(search): add in-book epub search
feat(annotation): add epub anchor mapping
feat(reader): add epub bookmarks
test(epub): add fixture coverage
fix(epub): harden archive validation
docs(epub): document reader and compatibility
```

不要求一定使用这些 commit message。

核心要求：

> Git 历史应能看出 M6 的实现过程，而不是一个巨型 Commit。

---

# 一百零九、测试频率

遵循项目整体原则：

> 不需要每完成一个微小改动就完整测试整个项目。

可以：

```text
局部快速测试
→ 阶段测试
→ M6 全量回归
```

但涉及：

- Parser
- Persistence
- Annotation
- Security

等关键基础设施时，必须及时进行针对性测试。

---

# 一百一十、Review 阶段

M6 完成后，必须进行一次主动代码审计。

重点寻找：

```text
P0
P1
```

级问题。

只有有：

```text
Evidence
Impact
Reproduction
```

时才升级为 P0/P1。

不要把：

```text
命名偏好
类数量
个人架构偏好
理论上的未来需求
```

写成高优先级问题。

---

# 一百一十一、必须主动检查的高风险点

Review 时重点检查：

### 1.

Renderer API 是否泄漏到核心层。

### 2.

EPUB 是否被完整解压导致明显内存风险。

### 3.

恶意 ZIP 是否可 Path Traversal。

### 4.

XML 是否存在 XXE / Entity Expansion 风险。

### 5.

HTML 是否执行任意 Script。

### 6.

外部资源是否可以突破安全边界。

### 7.

Reader State 是否错误依赖 page number。

### 8.

Annotation 是否只保存像素坐标。

### 9.

Renderer 变化是否破坏 Annotation。

### 10.

SQLite 是否意外成为 EPUB Reader 的必要条件。

### 11.

文件保存失败是否出现 UI 与磁盘状态不一致。

### 12.

异步任务是否存在 stale result / race condition。

### 13.

一个坏章节是否能导致整个 EPUB 崩溃。

### 14.

损坏的字体 / 图片是否能导致整个 Reader 崩溃。

### 15.

大量章节 / 图片是否产生无界缓存。

---

# 一百一十二、必须进行的恢复测试

至少：

```text
Delete Index
Restart
Open EPUB
```

```text
Corrupt Cache
Restart
Open EPUB
```

```text
Corrupt Reader State
Restart
Open EPUB
```

```text
Delete EPUB
Restart
Library
```

```text
Replace EPUB
Restart
Resolve Annotation
```

```text
Kill process while saving annotation
Restart
```

---

# 一百一十三、最终产品验收

M6 不以：

> “代码写完”

作为完成标准。

必须满足：

## Reader

- [ ] EPUB 可以打开
- [ ] 常见 EPUB 结构可以读取
- [ ] 章节阅读正常
- [ ] TOC 正常
- [ ] 内部链接正常
- [ ] 图片正常
- [ ] 基础 CSS 正常
- [ ] CJK 正常

## Progress

- [ ] 阅读位置保存
- [ ] 重启恢复
- [ ] 改变字体 / 窗口不导致位置彻底失效

## Search

- [ ] 书内搜索
- [ ] Search Result 定位
- [ ] 与 M3 Search Contract 一致

## Annotation

- [ ] Text Selection
- [ ] Highlight
- [ ] Note
- [ ] Anchor
- [ ] Re-anchor
- [ ] Orphan handling

## Bookmark

- [ ] Create
- [ ] Open
- [ ] Delete
- [ ] Restart persistence

## Data

- [ ] 原 EPUB 不被修改
- [ ] Annotation 独立
- [ ] Reader State 独立
- [ ] SQLite 可删除
- [ ] Index 可重建

## Security

- [ ] Path Traversal 防护
- [ ] ZIP Bomb 防护
- [ ] XML 安全
- [ ] Script 禁止
- [ ] 外部资源策略明确
- [ ] DRM 不破解

## Stability

- [ ] 损坏 EPUB 不崩溃
- [ ] 单一损坏章节不会拖垮整个 Reader
- [ ] Cancellation 正确
- [ ] 多书快速切换正确
- [ ] Persistence crash-safe

---

# 一百一十四、M6 完成报告

最终必须生成：

```text
docs/M6-STATUS.md
```

并至少包含以下内容：

```text
1. M6 Goal
2. Actual Scope
3. Final Architecture
4. EPUB Parser
5. Container
6. Manifest
7. Spine
8. Navigation
9. Rendering
10. Reader Shell Integration
11. Reader Location
12. Progress
13. Search
14. Selection
15. Highlight
16. Note
17. Bookmark
18. Persistence
19. Security
20. Performance
21. Test Matrix
22. Regression Result
23. Unsupported EPUB Features
24. Known Issues
25. Technical Debt
26. Dependency / License Status
27. Migration Concerns
28. M7 Dependencies
29. RESOLVED
30. CONFIRMED
31. REMAINING RISKS
32. Recommended Follow-up
```

并明确区分：

```text
FACT
HYPOTHESIS
INFERENCE
```

---

# 一百一十五、M6 最终技术问题

完成后必须明确回答：

### EPUB

```text
当前到底支持什么 EPUB？
```

### Rendering

```text
当前 Renderer 是什么？
为什么？
```

### Security

```text
EPUB 被视为不可信输入后，安全边界在哪里？
```

### Location

```text
Progress / Bookmark / Highlight 到底用什么定位？
```

### Annotation

```text
EPUB Anchor 如何与 M2 Generic Annotation 结合？
```

### Search

```text
EPUB Search 如何接入 M3？
```

### Persistence

```text
SQLite 删除后，EPUB 阅读是否仍然完整可用？
```

### Extensibility

```text
未来加入 PDF 时，哪些基础设施可以直接复用？
```

---

# 一百一十六、M7 前置条件

只有当以下内容稳定后，才进入 M7：

```text
Document
Source
Library
Search
Tags
Read State
Inbox
Recent
RSS
Feed Management
Import
Export
Metadata
Annotation Export
Daily Review

Generic Reader Shell
Generic Reader State
Generic Progress
Generic Bookmark
Generic Annotation
Web Reader Adapter
EPUB Reader Adapter
```

并且：

```text
EPUB 原文件 = Source of Truth
SQLite = Rebuildable Derived State
```

已经被实际测试验证。

---

# 一百一十七、最终原则

M6 最重要的不是：

> 做出一个“能打开 EPUB 的页面”。

而是：

> **让 EPUB 成为 Reverie Unified Reader 中真正的一等 Document。**

最终架构应该自然形成：

```text
                    ┌────────────────────┐
                    │   Unified Reader   │
                    │       Shell        │
                    └─────────┬──────────┘
                              │
             ┌────────────────┼────────────────┐
             │                │                │
             ▼                ▼                ▼
        Web Adapter      EPUB Adapter      PDF Adapter
             │                │
             ▼                ▼
        Web Source       EPUB File
             │                │
             └────────┬───────┘
                      ▼
               Generic Reader
                   State
                      │
        ┌─────────────┼──────────────┐
        ▼             ▼              ▼
    Progress       Bookmark      Annotation
                                     │
                              Highlight / Note
```

整个 M6 始终遵守：

```text
Source File First
Generic Contract First
Adapter Isolation
Stable Location
Rebuildable Index
Safe Persistence
Graceful Degradation
Evidence-Driven Architecture
```

不要为了追求 EPUB 功能数量而破坏 Reverie 已经建立的核心原则。

最终用户应该可以放心：

> **把 EPUB 放进 Reverie，就能阅读；在 EPUB 上产生的 Progress / Bookmark / Highlight / Note 属于用户自己，而不是绑定在某个渲染器、某个数据库、某个第三方服务上。**

**M6 的完成定义：不是 EPUB “能显示”，而是 EPUB 已经成为 Reverie 可持久、可搜索、可标注、可恢复、可迁移的第一类阅读资料。**