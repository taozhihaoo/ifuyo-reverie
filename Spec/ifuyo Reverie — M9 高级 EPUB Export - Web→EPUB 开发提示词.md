# IFUYO Reverie — M9 高级 EPUB Export / Web→EPUB 开发提示词

> **项目：ifuyo Reverie**
>
> **阶段：M9**
>
> **阶段名称：Advanced EPUB Export / Web → EPUB**
>
> **目标：将 M5 的基础 EPUB 导出升级为真正可长期使用、可迁移、可归档、可脱离 Reverie 使用的高级 EPUB 生成系统，并打通 Web Article → EPUB 的完整生产链。**
>
> **核心原则：Reverie 的文件是真相，EPUB 是用户可携带的最终成果，不允许 EPUB 导出反过来成为 Reverie 内部数据的唯一存储。**
>
> **执行方式：先 Explore，再 Plan，再 Implement，再 Test，再 Review，再 Document。**
>
> **重要：本提示词是开发任务规范，不是架构假设。凡涉及当前项目已有实现、类名、目录、第三方库、技术能力、版本兼容性的问题，一律以当前代码和实际运行环境为准，不得根据本提示词自行臆造已有能力。**

---

# 一、M9 的核心目标

M9 完成后，Reverie 应具备一条完整且可靠的：

```text
Reverie Document
    ↓
Content / Metadata / Annotation / Assets
    ↓
Export Model
    ↓
EPUB Generator
    ↓
OPF / Navigation / XHTML / CSS / Assets
    ↓
EPUB 3
    ↓
可脱离 Reverie 的普通 EPUB 文件
```

同时建立：

```text
Web Article
    ↓
Web Capture / Normalization
    ↓
Clean Article Content
    ↓
EPUB Export Pipeline
    ↓
高质量 EPUB
```

最终实现两个核心场景：

### 场景 A：资料归档

用户可以把 Reverie 中的一篇文章、一组文章或一本内容集合导出成 EPUB。

### 场景 B：Web → EPUB

用户保存网页之后，不需要依赖 Reverie 才能长期阅读，可以直接把清洗后的网页文章转换为标准 EPUB 文件。

---

# 二、M9 最重要的产品原则

## 2.1 EPUB 是导出成果，不是数据库

必须严格保持：

```text
Source Files = Truth
SQLite = Derived Index / Cache
EPUB = Export Artifact
```

禁止：

```text
EPUB
  ↓
作为 Reverie 唯一内容源
```

也禁止：

```text
SQLite
  ↓
成为 EPUB 的唯一数据来源
```

EPUB 导出必须尽可能从 Reverie 当前真实文件数据生成。

---

# 三、继承 M0～M8 的架构约束

M9 不得破坏既有：

- Document
- Source
- Library
- Search
- Tags
- Read State
- Inbox
- Bookmark
- Annotation
- Note
- Reader
- ReaderLocation
- Progress
- RSS / Atom
- Import / Export
- TTS

并必须继续满足：

```text
原始内容不可被导出过程修改
```

```text
导出失败不影响原始资料
```

```text
删除 SQLite 后仍可以重新扫描文件并重新导出
```

```text
ReaderLocation 不被 EPUB Export 自行重新定义
```

```text
Annotation 不允许产生第二套隐藏定位系统
```

---

# 四、M9 的范围

## 4.1 必须实现

### A. 高级 EPUB Export

支持：

- 单篇文章导出
- 多篇文章导出
- 按 Library 选择导出
- 按 Search 结果导出
- 按标签导出
- 按收藏导出
- 按 Inbox 导出
- 按过滤条件导出
- 按文件夹 / 集合导出（如果当前项目已经存在对应概念）
- 导出全部内容
- 导出书籍型 EPUB
- 导出单文章型 EPUB

---

### B. Web → EPUB

支持：

```text
Web URL
 ↓
Web Capture
 ↓
正文提取
 ↓
Content Normalization
 ↓
Metadata Normalization
 ↓
Asset Collection
 ↓
EPUB Generation
```

重点不是简单：

```text
HTML → ZIP
```

而是：

```text
网页
→ 去除网页 UI 噪声
→ 提取正文
→ 规范化结构
→ 处理图片
→ 处理标题
→ 生成目录
→ 生成 EPUB
```

---

### C. EPUB 结构

生成标准 EPUB 3。

至少考虑：

```text
mimetype
META-INF/container.xml
OEBPS/
    content/
    images/
    styles/
    fonts/
    navigation.xhtml
    package.opf
```

实际目录结构可根据实现调整。

不得为了“看起来标准”而硬编码某一个固定目录，只要生成的 EPUB 满足标准并经过实际验证即可。

---

# 五、先 Explore：实施前必须做的调查

M9 不允许直接开始写 Exporter。

第一步必须检查当前代码。

---

## 5.1 检查 M5 的 EPUB Export

找到实际已经存在的：

- EPUB Exporter
- EPUB Writer
- Export Pipeline
- Metadata Export
- Content Serializer
- Asset handling
- HTML serializer

确认：

```text
哪些已经存在
哪些只是 TODO
哪些已经可以使用
哪些只是迁移级实现
```

输出：

```text
docs/M9-EXPLORE.md
```

---

# 六、必须检查当前 M6 EPUB Model

M9 必须尽可能复用 M6。

检查：

- EpubBookModel
- EpubParser
- Manifest
- Spine
- Navigation
- XHTML model
- Metadata model
- Resource model
- URI resolver
- ReaderLocation
- Chapter model

不要因为“导出方便”就重新定义一套 EPUB domain model。

原则：

```text
M6 Reader Model
+
M9 Export Model
```

而不是：

```text
M6 一套 EPUB model
M9 又一套完全不同的 EPUB model
```

---

# 七、导出模型必须独立

建议建立：

```text
ExportDocument
ExportChapter
ExportResource
ExportMetadata
ExportAnnotation
ExportTableOfContents
ExportManifest
```

但必须结合当前代码决定最终命名。

导出模型的职责是：

```text
把 Reverie 数据转换为 EPUB 所需结构
```

不要让：

```text
Card / Document / Reader / Library
```

直接负责写 ZIP/XML/XHTML。

---

# 八、推荐的高级 EPUB Export Architecture

推荐结构：

```text
Export UI
    ↓
Export Request
    ↓
Export Coordinator
    ↓
Document Collector
    ↓
Content Normalizer
    ↓
Metadata Resolver
    ↓
TOC Builder
    ↓
Asset Collector
    ↓
Export Model
    ↓
EPUB Validator
    ↓
EPUB Writer
    ↓
Temporary EPUB
    ↓
Atomic Finalize
```

其中：

### Export UI

只负责：

- 选择内容
- 选择导出方式
- 选择输出位置
- 设置少量导出选项
- 显示进度
- 显示错误

不能把业务规则全部塞进 UI。

---

# 九、Export Request

建立明确的导出请求模型。

至少能够表达：

```text
Selection
ExportType
OutputPath
BookTitle
Author
Language
Cover
IncludeNotes
IncludeHighlights
IncludeMetadata
IncludeImages
IncludeFonts
GenerateTOC
```

具体字段根据当前项目实际情况调整。

---

# 十、不要让导出 UI 直接操作文件

禁止：

```text
Button Click
 ↓
遍历 Document
 ↓
创建 HTML
 ↓
创建 ZIP
 ↓
写 EPUB
```

应该：

```text
UI
 ↓
ExportRequest
 ↓
ExportCoordinator
```

这样未来才能：

- 批量导出
- Headless Export
- CLI
- 自动化测试
- Background Export

---

# 十一、单篇文章 EPUB

单篇 Web Article 至少包含：

```text
Title
Author
Published Date
Source URL
Content
Images
Language
```

如果有：

- Description
- Site Name
- Tags
- Publisher
- Cover

可写入 EPUB Metadata。

---

# 十二、多文章 EPUB

多篇文章必须生成明确的：

```text
Book
 ↓
Chapter 1
Chapter 2
Chapter 3
...
```

并生成：

```text
Navigation
Spine
Manifest
```

不得简单：

```text
所有 HTML 拼接成一个巨大 HTML
```

除非经过实际验证确认这是当前 renderer / validator 最可靠方式。

优先：

```text
Article = EPUB Chapter
```

---

# 十三、文章章节命名

默认可以：

```text
文章标题
```

作为章节标题。

发生标题重复时，应有稳定处理策略，例如：

```text
原标题
原标题 (2)
原标题 (3)
```

不要随机生成名称。

---

# 十四、EPUB Metadata

必须处理：

- title
- creator
- language
- identifier
- modified
- publisher（如果存在）
- description（如果存在）
- subject / tags（如果存在）
- source URL
- publication date（如果存在）

特别注意：

## Identifier

必须稳定。

禁止：

```text
每次 Export GUID 随机变化
```

导致同一内容每次导出都完全不同。

可以根据：

```text
DocumentId
```

或稳定 UUID / hash 生成。

必须记录策略。

---

# 十五、Web → EPUB 的核心目标

Web → EPUB 不应该重新实现 Web Capture。

必须复用现有：

```text
Web Reader / Web Capture
```

中的：

- URL normalization
- HTML fetching
- content extraction
- main-content detection
- sanitization
- metadata extraction
- asset handling

理想流程：

```text
Web Capture
    ↓
Canonical Document
    ↓
EPUB Export
```

而不是：

```text
Web → EPUB
```

再自己搞一套：

```text
HTTP
HTML parsing
article extraction
metadata extraction
sanitization
image download
```

---

# 十六、Web 页面清洗

必须尽量移除：

- navigation
- header
- footer
- sidebar
- share buttons
- cookie banner
- advertisement
- login controls
- subscription prompts
- scripts
- tracking elements
- hidden elements
- unrelated recommended articles

保留：

- 标题
- 正文
- 正文中的图片
- blockquote
- list
- headings
- code block
- links
- table（能力允许时）
- figure / caption（能力允许时）

不得把原网页整个 DOM 原样打包成 EPUB。

---

# 十七、正文结构必须保留

例如：

```html
<h1>Title</h1>

<p>...</p>

<h2>Section</h2>

<p>...</p>

<blockquote>...</blockquote>

<ul>...</ul>

<pre><code>...</code></pre>
```

导出后应该尽量保持语义结构。

不要为了视觉简单把所有东西转换成：

```html
<div>
    text
</div>
```

---

# 十八、HTML → XHTML

EPUB 内部文档应满足 EPUB/XHTML 要求。

必须处理：

- HTML 结构合法化
- 编码
- entity
- void elements
- invalid nesting
- unsupported tags
- inline styles
- dangerous attributes
- external resources
- script
- iframe
- object
- embed

禁止直接相信输入 HTML 是合法 XHTML。

---

# 十九、CSS 策略

不要简单把网页原始 CSS 全部复制到 EPUB。

网页 CSS 往往：

- 非常庞大
- 与网站 DOM 强耦合
- 含大量无意义规则
- 包含 JS 状态样式
- 使用外部字体/CDN
- 使用复杂 layout
- 包含 viewport / responsive rules

M9 应建立：

```text
Reverie EPUB CSS
```

只保留适合 EPUB 阅读的规则。

至少支持：

- body
- headings
- p
- a
- blockquote
- ul
- ol
- li
- code
- pre
- img
- figure
- figcaption
- table

---

# 二十、EPUB CSS 的核心目标

不是“复制网页视觉”。

而是：

```text
Readable
Portable
Predictable
Renderer-compatible
```

优先确保：

```text
字体大小
行距
段落间距
标题层级
图片尺寸
代码块
引用块
```

都能够跨 EPUB 阅读器稳定工作。

---

# 二十一、图片 Asset Pipeline

建立明确的：

```text
Asset Collector
```

处理：

- img src
- srcset
- figure
- background image（仅必要时）
- data URI
- relative URL
- absolute URL
- protocol-relative URL

需要解决：

```text
网页 URL
 ↓
最终下载 URL
 ↓
本地 EPUB asset
 ↓
manifest item
 ↓
XHTML reference
```

---

# 二十二、图片去重

同一图片被不同章节引用时：

```text
只保存一份
```

不要：

```text
chapter1/image1.png
chapter2/image2.png
chapter3/image3.png
```

全部重复保存。

应该根据稳定资源 identity / content hash 去重。

---

# 二十三、图片失败策略

某图片加载失败时：

不得导致：

```text
整个 EPUB 导出失败
```

默认：

```text
记录 warning
继续生成
```

但必须在导出报告中告诉用户：

```text
有 X 张图片未成功导出
```

---

# 二十四、外部资源

EPUB 必须尽量自包含。

原则：

```text
EPUB 不依赖互联网才能正常阅读
```

因此：

- 外部 CSS → 尽量内嵌/本地化
- 外部图片 → 本地化
- 外部字体 → 只有明确允许且安全时才本地化
- JS → 不携带
- 外部 iframe → 不携带

---

# 二十五、不要无脑下载所有资源

必须设置：

- 最大单文件大小
- 最大资源数
- 最大总资源体积
- 超时
- CancellationToken
- 并发限制

防止：

```text
恶意网页
→ 数十万个资源
→ 超大图片
→ 无限下载
→ 内存爆炸
```

---

# 二十六、封面策略

支持：

```text
Article Cover
```

以及：

```text
Book Cover
```

如果没有合适封面：

不要强制联网生成。

可以：

```text
无封面 EPUB
```

或者使用非常简单的纯 HTML / CSS title page。

禁止引入复杂在线封面生成服务。

---

# 二十七、目录 TOC

必须生成 EPUB3 Navigation Document。

例如：

```text
Table of Contents
 ├─ Article 1
 ├─ Article 2
 ├─ Article 3
```

如果单篇文章包含明显：

```text
<h1>
<h2>
<h3>
```

可以构建内部章节结构。

但不要因为一个页面存在几十个小标题就生成失控目录。

应该根据实际语义和深度限制处理。

---

# 二十八、EPUB Spine

必须保证：

```text
Navigation order
=
Spine reading order
=
实际文章阅读顺序
```

三者不能出现明显矛盾。

---

# 二十九、EPUB Manifest

确保所有引用资源都有：

```text
Manifest Item
```

至少包括：

- XHTML
- CSS
- images
- fonts（如果有）
- navigation
- cover（如果有）

不得产生：

```text
XHTML 引用了不存在资源
```

或：

```text
Manifest 宣布资源存在
但 ZIP 中没有该文件
```

---

# 三十、ZIP / Container 安全

必须安全生成 EPUB。

必须验证：

- ZIP path normalization
- no absolute paths
- no `../`
- no duplicate path
- no invalid ZIP entry
- deterministic UTF-8
- valid `mimetype`
- `mimetype` 必须满足 EPUB 要求
- ZIP entry 不得产生目录逃逸

原始导出目录应该首先写入：

```text
temporary export directory
```

再生成：

```text
temporary epub
```

最终：

```text
validate
→ atomic rename
```

---

# 三十一、原子导出

绝对禁止：

```text
直接覆盖用户目标 EPUB
```

应该：

```text
Output.epub.tmp
 ↓
write
 ↓
flush
 ↓
validate
 ↓
rename
```

如果失败：

```text
Output.epub
```

保持原样。

---

# 三十二、EPUB Validator

M9 必须建立独立验证步骤。

至少验证：

### Container

```text
META-INF/container.xml
```

### Package

```text
package.opf
```

### Manifest

所有资源存在。

### Spine

阅读顺序合法。

### Navigation

TOC 引用合法。

### XHTML

结构合法。

### CSS

无明显破坏性错误。

### URI

内部引用能够解析。

### ZIP

没有坏包。

---

# 三十三、最好接入真实 EPUB 校验工具

Explore 当前环境后，如果可合理引入 EPUB validator：

进行实际 PoC。

例如验证：

```text
Reverie generated EPUB
```

而不是只测试：

```text
自己写的 XML parser
```

但：

- 不要为了 validator 引入一套巨大 runtime
- 不要把第三方库 API 渗透到整个项目
- 不要因为 validator 存在就让 Exporter 强绑定它

第三方工具应该处于：

```text
Validation Adapter
```

边界。

---

# 三十四、EPUB Renderer Compatibility

同一个 EPUB 需要尽量测试多个实际阅读环境。

至少测试：

- Reverie 自己的 M6 Reader
- Windows 常见 EPUB 阅读器
- 至少一个第二方 EPUB 阅读环境（环境允许时）

重点检查：

- CJK
- 图片
- 标题
- 目录
- 代码块
- 长文
- 链接
- CSS
- 字体
- 大文件

不要只在 Reverie 自己的 Reader 里面“看起来没问题”。

---

# 三十五、Annotation Export

M9 可以支持：

```text
Highlight
Note
```

导出。

但必须明确：

```text
EPUB 内容
```

与：

```text
Reverie Annotation
```

是两个不同层次。

---

# 三十六、不要修改文章正文来“存储标注”

禁止：

```text
原文
→ 插入 <mark>
→ 插入私有 HTML
→ 重新保存原文
```

作为 Reverie 原始内容。

必须保持：

```text
Original Content
+
Annotation Export Layer
```

---

# 三十七、Annotation 导出策略

建议支持可选：

```text
Include Highlights
Include Notes
```

默认可以：

```text
作为 EPUB 末尾的 Notes / Highlights Section
```

或者使用 EPUB 标准能力 / compatibility-safe strategy。

必须优先考虑：

```text
跨阅读器可读性
```

而不是追求：

```text
只有 Reverie 能识别的特殊标记
```

---

# 三十八、ReaderLocation 不得被破坏

Annotation 来源可能是：

```text
Web
EPUB
PDF
Markdown
TXT
```

导出 EPUB 后，不要求原始：

```text
ReaderLocation
```

在第三方 EPUB 中继续可恢复。

但：

```text
Reverie 本身的 Annotation
```

必须保持原来的 location 与 identity。

导出失败不能破坏 annotation。

---

# 三十九、Highlight / Note 导出内容

建议至少包含：

```text
Highlight text
Note text
Source title
Chapter
Date
```

如果存在：

- tags
- created time
- updated time
- source URL

可以加入。

但是不要泄露：

- 内部数据库 ID
- 内部路径
- 私有运行时状态
- Debug 信息

除非用户明确选择导出内部 metadata。

---

# 四十、Export Metadata

建议支持：

### EPUB 内部

```text
Title
Author
Language
Identifier
Description
Publisher
Date
Subject
Source
```

### 外部导出报告

```text
Document Count
Chapter Count
Asset Count
Skipped Assets
Warnings
Errors
Output Path
Export Time
```

---

# 四十一、导出报告

每次复杂导出应该提供：

```text
Export Report
```

至少：

```text
Status
Documents Processed
Documents Exported
Documents Skipped
Images Downloaded
Images Failed
Warnings
Errors
Output
```

不能只显示：

```text
Export Failed
```

而不告诉用户哪里失败。

---

# 四十二、部分失败策略

例如：

```text
100 篇文章
97 篇成功
3 篇失败
```

必须明确处理。

推荐：

```text
生成完整 EPUB
+
报告 3 篇失败
```

但如果核心内容结构已经损坏：

```text
整体 Export Failed
```

必须删除临时文件。

不要生成：

```text
看起来成功
实际上内容损坏
```

的 EPUB。

---

# 四十三、取消操作

用户点击：

```text
Cancel
```

必须：

```text
停止下载
停止解析
停止资源处理
停止写入
清理临时文件
```

不得留下：

```text
半个 EPUB
大量临时图片
挂死任务
```

---

# 四十四、并发

Export Pipeline 必须支持合理 cancellation。

禁止：

```text
用户连续点击 Export
→ 同时启动多个冲突任务
```

需要决定：

- 禁止重复导出
- 或每次导出拥有独立 job

但必须避免：

```text
多个 Job 写同一个 OutputPath
```

---

# 四十五、进度系统

复杂导出必须有：

```text
Preparing
Collecting
Processing Content
Downloading Assets
Writing EPUB
Validating
Finalizing
Completed
Failed
Cancelled
```

进度不要只根据：

```text
bytes written
```

计算。

因为 EPUB 导出包含：

```text
Parsing
Normalization
Network
Asset
Serialization
Validation
```

最好采用阶段 + 子任务。

---

# 四十六、Web Asset 下载安全

沿用 M4 网络安全原则。

至少检查：

- http/https
- timeout
- bounded redirect
- private IP / localhost
- loopback
- local network
- link-local
- DNS rebinding 风险
- max response size
- content type
- cancellation
- concurrency

不要因为：

```text
这是为了生成 EPUB
```

而绕过 M4 的 SSRF 安全。

---

# 四十七、HTML 安全

网页内容是不可信输入。

必须继续：

- sanitize
- remove script
- remove event handlers
- remove dangerous URLs
- remove iframe / object / embed
- remove executable content
- remove external tracking

最终：

```text
EPUB = Passive Reading Artifact
```

不应该是一个：

```text
可执行网页容器
```

---

# 四十八、URL Scheme

只允许明确支持的 URL。

例如：

```text
https://
http://
```

对于：

```text
javascript:
data:
file:
blob:
custom scheme
```

必须进行限制或转换。

---

# 四十九、链接处理

文章中的链接可以保留。

但是：

### 内部 anchor

转换为：

```text
chapter.xhtml#fragment
```

### 外部 http/https

可以保留：

```text
https://...
```

但必须经过 URL 清洗。

### javascript

必须删除。

---

# 五十、Relative URL Resolver

M9 必须复用或共享 M4/M6 已有 URL Resolver。

需要正确处理：

```text
../image/a.png
./image/a.png
/image/a.png
https://example.com/a.png
https://example.com/path/
```

以及：

```text
URL encoded characters
Unicode path
fragment
query
```

不要在 Exporter 内创建第二套解析逻辑。

---

# 五十一、Unicode / CJK

必须重点测试：

```text
中文
日文
韩文
英文
中英混排
emoji
全角符号
特殊标点
```

文件路径与 EPUB metadata 同样需要考虑 Unicode。

---

# 五十二、代码块

对于技术文章必须支持：

```html
<pre><code>
...
</code></pre>
```

重点保证：

- 不丢换行
- 不压缩空格
- 不破坏特殊字符
- 不被普通段落 serializer 错误处理

---

# 五十三、表格

至少：

```text
简单 table
thead
tbody
tr
th
td
```

必须尽可能保留。

对于极端复杂网页表格：

```text
记录 warning
```

而不是让整个 EPUB 失败。

---

# 五十四、图片尺寸

禁止简单写死：

```css
width: 100vw;
```

或：

```text
网页像素尺寸
```

应该使用 EPUB-friendly strategy：

```css
img {
    max-width: 100%;
    height: auto;
}
```

具体 CSS 根据实际 renderer 测试确定。

---

# 五十五、字体策略

默认优先：

```text
依赖阅读器字体
```

而不是：

```text
把整个网页字体库塞进 EPUB
```

只有在：

- 用户明确要求
- 许可证允许
- 文件体积合理
- EPUB renderer 验证通过

时才考虑嵌入字体。

不得嵌入来源不明的商业字体。

---

# 五十六、许可证 / 来源

M9 生成的 EPUB 可能包含：

```text
原网站文章
```

必须保留来源信息。

建议：

```text
Source URL
Original Author
Publication Date
```

但不要擅自：

```text
改变作者身份
```

或：

```text
伪装为 Reverie 原创内容
```

Reverie 是：

```text
个人阅读 / 归档工具
```

不是内容再发布平台。

---

# 五十七、版权边界

M9 不得实现：

- DRM 破解
- Paywall 绕过
- 登录限制绕过
- 私有页面抓取绕过
- 内容盗取
- 批量未经授权转载
- 访问控制绕过

对于无法正常获取内容的网页：

```text
正常失败
```

而不是尝试绕过限制。

---

# 五十八、文件真相原则

导出过程中：

```text
Source Article
```

必须保持不变。

不得为了：

```text
EPUB format
```

修改：

```text
article.md
meta.json
annotations.jsonl
```

---

# 五十九、SQLite 约束

Export 不应该依赖：

```text
index.db
```

作为唯一数据源。

可以使用：

```text
SQLite
```

快速获取选择结果。

但实际导出时，最终必须能回到：

```text
Library files
```

验证真实存在的数据。

---

# 六十、删除 index.db 验证

必须有一个测试：

```text
Export EPUB
 ↓
删除 index.db
 ↓
Library rebuild
 ↓
Export EPUB
```

结果应该保持：

```text
内容完整
metadata 正确
annotation 正确
```

SQLite 只能影响：

```text
速度
```

不能改变：

```text
数据真相
```

---

# 六十一、Deterministic Export

同一份输入，在相同配置下重复导出，应该尽可能稳定。

例如：

```text
Document
+
Export Options
=
same logical EPUB
```

避免：

```text
随机 UUID
随机文件名
随机章节顺序
```

造成每次 Export 完全不同。

如果 EPUB ZIP 时间戳等因素无法做到字节级完全一致：

至少保证：

```text
语义一致
结构一致
metadata identity 一致
目录一致
内容 hash 稳定
```

并记录原因。

---

# 六十二、Export 选项

不要一次做几十个高级开关。

M9 首先提供：

```text
Export as EPUB
Include Images
Include Highlights
Include Notes
Generate TOC
```

即可。

如果当前 UI 已有合理设置系统，可以复用。

不要为了“功能丰富”制造复杂 Export Wizard。

---

# 六十三、默认值

默认应该倾向：

```text
Include Images = ON
Generate TOC = ON
Include Highlights = OFF / 根据现有产品设计
Include Notes = OFF / 根据现有产品设计
```

实际最终值必须结合当前 UI 和用户使用路径。

原则：

```text
第一次导出应该简单
```

---

# 六十四、单篇 Web → EPUB UX

理想用户路径：

```text
打开 Web Article
 ↓
Export
 ↓
EPUB
 ↓
选择保存位置
 ↓
开始
 ↓
进度
 ↓
验证
 ↓
完成
```

不要把用户带进：

```text
复杂导出配置界面
```

---

# 六十五、批量导出 UX

用户选择：

```text
20 Documents
```

之后：

```text
Export → EPUB
```

应该生成：

```text
Book.epub
```

而不是默认生成：

```text
20 个 EPUB
```

除非用户明确选择：

```text
Export Each Separately
```

---

# 六十六、两种批量方式

推荐支持：

### Merge

```text
20 Documents
→
1 EPUB
```

### Separate

```text
20 Documents
→
20 EPUB
```

但：

```text
Separate
```

可以视实现难度安排为 M9 后段。

M9 核心优先：

```text
Merge
```

---

# 六十七、书籍型 EPUB

多文章集合导出时，可以构建：

```text
Cover
Title Page
TOC
Chapter 1
Chapter 2
Chapter 3
...
Notes / Highlights
```

最终是一个真正可以在外部阅读器打开的：

```text
Personal Archive Book
```

---

# 六十八、章节顺序

批量导出顺序必须稳定。

优先使用：

```text
用户明确排序
```

否则：

```text
CreatedAt
PublishedAt
Title
DocumentId
```

具体使用哪一种必须结合当前 Library/Collection 实现确定并记录。

绝对不能依赖：

```text
SQLite 查询偶然顺序
```

---

# 六十九、重复文章处理

多篇文章被用户选中时，如果：

```text
同一 DocumentId
```

出现多次：

```text
只导出一次
```

不要重复生成。

---

# 七十、相同内容不同 Document

对于不同 Document：

```text
不同 DocumentId
```

但内容 hash 相同：

不要擅自删除。

因为：

```text
不同来源
不同 metadata
不同历史
```

可能是用户有意保存的。

最多：

```text
报告 Duplicate-like Content
```

---

# 七十一、Progress

EPUB Export 不修改：

```text
Progress
```

导出一次不应该：

```text
自动标记 Read
```

也不应该：

```text
更新 Last Read Position
```

---

# 七十二、Bookmark

默认不导出为：

```text
EPUB Bookmark
```

除非已经找到跨阅读器可靠方案。

Reverie 内部 Bookmark 仍然保留。

可以选择将 Bookmark 作为：

```text
Notes / Reading Marks
```

导出，但必须明确这是：

```text
Export representation
```

而不是要求第三方阅读器识别 Reverie Bookmark。

---

# 七十三、Annotation Anchor

EPUB Export 不得修改：

```text
Annotation Anchor
```

如果导出：

```text
Highlight
```

应该使用：

```text
当前 Annotation 的已保存内容
```

而不是：

```text
重新从渲染器选择文本
```

---

# 七十四、Export 后重新导入

必须尽可能支持：

```text
Export EPUB
 ↓
Import EPUB
```

基本 round-trip 测试至少确认：

- title
- content
- chapter order
- images
- metadata

保持合理一致。

注意：

```text
Annotation / Bookmark / Read State
```

不要求通过普通 EPUB 自动恢复，因为 EPUB 本身不是 Reverie State Container。

---

# 七十五、Export 与 M5 的边界

M5 已经做了：

```text
Migration-grade EPUB Export
```

M9 不允许重新实现同一套功能。

应该：

```text
M5 Basic Export
        ↓
M9 Advanced Export Engine
```

M5 的调用方应尽可能迁移到 M9。

避免：

```text
BasicEpubExporter
AdvancedEpubExporter
MigrationEpubExporter
WebToEpubExporter
ArticleEpubExporter
```

五套重复实现。

---

# 七十六、推荐统一为一个 Export Pipeline

最终理想：

```text
ExportRequest
    ↓
ExportCoordinator
    ↓
IExportSource
    ↓
ExportDocument
    ↓
EpubDocumentBuilder
    ↓
EpubWriter
```

Web：

```text
WebDocument
   ↓
IExportSource
```

EPUB：

```text
Document
   ↓
IExportSource
```

Markdown：

```text
MarkdownDocument
   ↓
IExportSource
```

未来其他格式也可以复用。

---

# 七十七、Aurora 边界

如果当前代码 / 设计文档中已经存在：

```text
Aurora
```

相关命名、模块或概念：

必须先检查其真实定义。

若 Aurora 是 M9 的 Web → EPUB / Export Pipeline 代号：

```text
继续统一到 M9 Export Architecture
```

不要再单独建立另一套系统。

如果当前项目不存在 Aurora：

不要为了本阶段强行制造：

```text
Aurora Framework
Aurora Engine
Aurora Database
```

M9 的核心资产应该是：

```text
Export Pipeline
```

而不是品牌化命名。

---

# 七十八、错误分类

建议统一：

```text
ExportError
ExportWarning
```

错误至少区分：

### Input Error

输入文件不存在、Document 无法读取。

### Content Error

正文无法转换。

### Resource Error

图片 / CSS / Font 失败。

### Serialization Error

XHTML / XML / OPF 生成失败。

### Packaging Error

ZIP 失败。

### Validation Error

生成 EPUB 不符合约束。

### IO Error

目标目录不可写。

### Cancellation

用户主动取消。

---

# 七十九、错误隔离

单篇文章：

```text
Article A
Article B
Article C
```

如果：

```text
Article B
```

有一张坏图片：

不应该导致：

```text
A + C
```

全部失败。

但是如果：

```text
package.opf
```

无法生成：

则：

```text
整个 EPUB Export Failed
```

必须区别：

```text
Document-level failure
```

与：

```text
Book-level structural failure
```

---

# 八十、日志

日志可以包含：

```text
DocumentId
ExportJobId
ResourceCount
OutputSize
Duration
WarningCount
ErrorCount
```

不要默认记录：

```text
完整文章正文
```

尤其不要：

```text
完整网页 HTML
完整 Highlight
完整 Note
```

避免日志成为敏感阅读内容副本。

---

# 八十一、性能目标

必须测试：

### Small

1 篇文章，几十 KB。

### Medium

20 篇文章，数 MB。

### Large

100+ 篇文章，数十 MB。

### Heavy

大量高清图片、复杂 HTML、多章节。

观察：

- CPU
- Memory
- GC
- 临时磁盘
- 网络下载
- ZIP 写入速度
- UI responsiveness
- Cancellation latency

---

# 八十二、禁止整本内容一次性进入内存

不要：

```text
100 篇文章
→ 一个巨大 string
→ 一个巨大 byte[]
→ Zip
```

推荐：

```text
Document
 ↓
Chapter
 ↓
Serialize
 ↓
Write
```

资源也尽可能：

```text
stream / bounded buffer
```

处理。

---

# 八十三、缓存

可以利用：

```text
Asset cache
```

减少重复下载。

但缓存属于：

```text
Derived Cache
```

不是用户数据真相。

缓存丢失后：

```text
重新下载 / 重新生成
```

系统仍然必须正确运行。

---

# 八十四、缓存安全

Cache key 应基于：

```text
normalized URL
```

或：

```text
content identity
```

并注意：

```text
不同资源不能错误复用
```

---

# 八十五、文件名策略

EPUB 文件名不得直接使用未经处理的网页标题。

必须处理：

- 非法字符
- 路径分隔符
- 控制字符
- 超长文件名
- 保留名称
- Unicode
- 重复名称

例如：

```text
My Article: C# / EPUB?
```

转换成合法稳定文件名。

---

# 八十六、文件名不能影响内部 identity

文件名只是：

```text
Export Presentation
```

不能作为：

```text
Document identity
```

---

# 八十七、导出到现有文件

必须处理：

```text
Output already exists
```

明确策略：

- Replace
- Choose another path
- Cancel

禁止：

```text
静默覆盖
```

---

# 八十八、外部 EPUB 可移植性

生成 EPUB 必须满足：

```text
复制到另一台电脑
→
无需 Reverie
→
可以正常打开
```

这应该是 M9 的核心验收，而不是附带能力。

---

# 八十九、离线能力

已经保存到 Reverie 的：

```text
Web Article
```

导出 EPUB 时：

```text
不应该重新抓原网页
```

优先使用：

```text
本地保存的 Article
+
本地 Assets
```

只有当当前设计允许自动恢复缺失资源时，才考虑联网。

默认应优先：

```text
本地资料
```

---

# 九十、Web → EPUB 的“离线优先”测试

测试：

```text
保存 Web Article
 ↓
断网
 ↓
Export EPUB
```

如果 Article 的正文和资源均已经保存：

应该：

```text
成功生成 EPUB
```

不能因为：

```text
原始网页当前打不开
```

就失败。

---

# 九十一、Source URL

EPUB 中可以保留：

```text
Original Source URL
```

推荐在：

```text
Metadata
```

或：

```text
Source Information
```

中呈现。

但不要把：

```text
整个 URL
```

重复塞进正文。

---

# 九十二、版权与来源信息

建议 Book / Article title page 可以包含：

```text
Original Source
Author
Published
Archived by Reverie
```

但必须视当前产品定位和用户偏好决定。

不要擅自加入：

```text
大量 Reverie 品牌宣传
```

---

# 九十三、输出目录

默认保存：

```text
用户指定位置
```

不要偷偷保存：

```text
AppData
```

作为唯一 EPUB。

如果需要内部临时文件：

```text
AppData / temp
```

仅作为临时目录。

---

# 九十四、临时文件清理

以下情况都必须清理：

```text
Success
Failure
Cancellation
Crash recovery
```

至少设计：

```text
stale temp file cleanup
```

---

# 九十五、Crash Safety

如果应用在：

```text
Export EPUB
```

过程中突然退出：

下一次启动不能把：

```text
半成品 Output.epub
```

误识别为成功产物。

---

# 九十六、测试策略

M9 必须增加真实 fixture。

至少：

```text
Simple Article
Chinese Article
English Article
Mixed Language
Long Article
Article With Image
Article With Many Images
Article With Broken Image
Article With Code
Article With Table
Article With Quote
Article With Links
Article With Headings
Article With Bad HTML
Article With External CSS
Article With Tracking Elements
Article With Malicious HTML
```

---

# 九十七、Web Fixture

必须至少包含：

```text
Normal news page
Blog
Technical article
Documentation page
Long-form article
Image-heavy article
```

不要只用手写：

```text
<html><body>Hello</body></html>
```

测试。

---

# 九十八、EPUB Fixture

至少测试：

```text
EPUB 3 generated by Reverie
EPUB opened by M6 Reader
EPUB re-imported by Reverie
```

必要时加入：

```text
external EPUB fixture
```

用于验证兼容性。

---

# 九十九、Round Trip

必须增加：

```text
Document
 ↓
EPUB Export
 ↓
EPUB Import
 ↓
Document
```

验证：

```text
Content
Metadata
Order
Images
```

---

# 一百、Annotation Round Trip 边界

不要伪造：

```text
EPUB Import automatically restores Reverie Annotation
```

除非已经设计了明确标准。

M9 只要求：

```text
导出 Annotation
```

不要求：

```text
普通 EPUB
→
自动恢复完整 Reverie Annotation identity
```

---

# 一百零一、Index Rebuild 测试

测试：

```text
正常 Library
 ↓
Export
```

以及：

```text
删除 index.db
 ↓
启动 Reverie
 ↓
Rebuild Index
 ↓
Export
```

两者结果必须逻辑一致。

---

# 一百零二、Source File Immutability Test

测试：

```text
Before Export
SHA256(article.md)
SHA256(meta.json)
SHA256(annotations.jsonl)
```

Export 后：

```text
重新 SHA256
```

应该一致。

---

# 一百零三、Determinism Test

相同：

```text
Document
Export Options
```

连续导出两次。

比较：

```text
metadata
chapter order
HTML
assets
TOC
manifest
```

确认没有随机差异。

如果 ZIP 字节级不同：

必须说明：

```text
原因
```

---

# 一百零四、安全测试

至少：

### HTML

测试：

```html
<script>
<img onerror=...>
<iframe>
<object>
<embed>
javascript:
```

### URL

测试：

```text
localhost
127.0.0.1
::1
private IP
link-local
redirect
DNS edge cases
```

### ZIP

测试：

```text
../
absolute path
duplicate entry
huge resource
```

---

# 一百零五、超大内容测试

测试：

```text
超长文章
超大图片
大量图片
大量章节
大量文章
```

确保：

```text
没有 OOM
没有明显 UI freeze
没有无限增长
```

---

# 一百零六、Cancellation Test

在以下阶段取消：

```text
Downloading
Parsing
Building
Writing
Validation
```

每个阶段都必须：

```text
及时停止
清理临时资源
状态正确
```

---

# 一百零七、UI Regression

检查 M1/M3/M5/M6/M7/M8 功能：

```text
Web Reader
EPUB Reader
PDF Reader
Search
Annotation
TTS
Export
```

不能因为 M9 引入：

```text
global Export service
```

导致 Reader / TTS lifecycle regression。

---

# 一百零八、M8 TTS Regression

特别检查：

```text
Export
→
Reader remains open
→
TTS continues normally
```

以及：

```text
TTS active
→
Export
→
no stale callbacks
```

Export 不应抢占 Reader/TTS 生命周期。

---

# 一百零九、M6 Reader Regression

必须确认：

```text
M6 EPUB Reader
```

仍然可以打开：

```text
M9 generated EPUB
```

并检查：

- TOC
- chapter navigation
- CJK
- images
- progress
- search
- selection
- annotation
- bookmark

---

# 一百一十、Export API

最终建议形成稳定 API：

```csharp
Task<ExportResult> ExportAsync(
    ExportRequest request,
    CancellationToken cancellationToken);
```

具体名字依据项目现状决定。

API 必须：

- 可取消
- 异步
- 可测试
- 不依赖 UI
- 返回结构化结果

---

# 一百一十一、Export Result

建议包含：

```text
Success
OutputPath
DocumentCount
ChapterCount
AssetCount
WarningCount
ErrorCount
Duration
```

不要只返回：

```text
bool
```

---

# 一百一十二、Headless 能力

如果当前项目已有：

```text
Headless Simulation
```

或其他无 UI infrastructure：

检查是否可以让 M9 Export 在：

```text
headless
```

环境中运行基础测试。

不要求为了 M9 重新建立 CLI 产品。

但 Export Core 不应该依赖：

```text
Control
Node
SceneTree
```

才能工作。

---

# 一百一十三、第三方库边界

M9 如果需要：

- EPUB library
- HTML parser
- ZIP library
- XML library
- CSS parser
- validator

必须先进行：

```text
License
Version
Windows
.NET
Godot C#
Performance
Security
Maintenance
```

评估。

第三方库只应该出现在：

```text
Adapter / Infrastructure
```

边界。

---

# 一百一十四、不要为了导出引入重量级 HTML 浏览器

除非实际 PoC 证明：

```text
没有更轻量方案
```

否则：

```text
DOM parsing
+
sanitization
+
serialization
```

优先于：

```text
完整浏览器
→
截图/打印
→
EPUB
```

Reverie 需要的是：

```text
语义内容
```

不是：

```text
网页像素复刻
```

---

# 一百一十五、M9 不做的内容

以下明确不属于 M9：

- 云端 EPUB 服务
- 在线 EPUB 商店
- 内容分享平台
- 用户社区
- AI 自动写作
- AI 自动摘要
- AI 自动翻译
- AI TTS
- 云 TTS
- DRM 破解
- Paywall 绕过
- 登录绕过
- 私有内容抓取绕过
- 内容盗取
- 自动公开发布
- 协作编辑
- 社交阅读
- EPUB 编辑器
- 可视化排版软件
- 专业出版排版工具
- InDesign 类能力
- PDF → EPUB 高质量 OCR
- 扫描 PDF OCR
- EPUB → PDF 专业出版
- EPUB Editor

尤其不要把 M9 做成：

```text
EPUB Authoring Tool
```

Reverie 是：

```text
Reading Archive
```

不是：

```text
出版软件
```

---

# 一百一十六、M9 与 M10 的边界

M9 重点：

```text
Export Correctness
Compatibility
Web → EPUB
Performance
Security
```

M10 才重点处理：

```text
长期运行稳定性
数据恢复
Doctor
Repair
Index corruption
Migration
Recovery
```

M9 可以提前暴露问题，但不要把 M10 的完整 Repair System 偷渡进来。

---

# 一百一十七、M9 与 M11 的边界

M9 不做：

- Windows installer
- code signing
- crash reporting service
- update service
- commercial distribution
- Store packaging
- enterprise deployment

这些属于：

```text
M11 Windows Productization
```

---

# 一百一十八、M9 完成后的用户能力

M9 完成之后，用户应该能够：

```text
保存网页
 ↓
阅读
 ↓
收藏/标注/笔记
 ↓
选择文章
 ↓
Export EPUB
 ↓
得到独立 EPUB
 ↓
脱离 Reverie 阅读
```

以及：

```text
Web Article
 ↓
Web → EPUB
 ↓
外部 EPUB Reader
```

---

# 一百一十九、M9 的真正成功标准

不是：

```text
“程序里有一个 EPUB Export button”
```

而是：

> **用户可以把自己辛苦积累的阅读资料，可靠地带出 Reverie。**

因此必须同时满足：

```text
可导出
可打开
可阅读
可迁移
可备份
可脱离 Reverie
```

---

# 一百二十、M9 实施批次

按照以下顺序推进。

---

## Batch 1 — Explore / Existing Export Audit

检查：

- M5 Export
- M6 EPUB model
- Document
- Web Capture
- Asset system
- Metadata
- Annotation
- Library
- SQLite
- ReaderLocation

输出：

```text
docs/M9-EXPLORE.md
```

必须明确：

```text
FACT
HYPOTHESIS
INFERENCE
```

并列出：

```text
Existing
Missing
Duplicate
Reusable
Risk
```

---

## Batch 2 — Export Domain

实现：

```text
ExportRequest
ExportResult
ExportDocument
ExportChapter
ExportMetadata
ExportResource
```

并建立：

```text
ExportCoordinator
```

---

## Batch 3 — Content Normalization

建立：

```text
ContentNormalizer
```

处理：

- HTML
- XHTML
- headings
- paragraph
- quote
- list
- table
- code
- image
- link

---

## Batch 4 — EPUB Builder

实现：

```text
EpubDocumentBuilder
```

生成：

```text
OPF
NCX（如兼容性需要）
Navigation
Manifest
Spine
XHTML
CSS
```

---

## Batch 5 — Asset Pipeline

实现：

```text
AssetCollector
AssetResolver
AssetDeduplicator
AssetCache
```

并完成：

```text
image
CSS
font
```

基础支持。

---

## Batch 6 — ZIP / EPUB Writer

实现：

```text
EpubWriter
```

完成：

```text
mimetype
container
package
resources
atomic output
```

---

## Batch 7 — EPUB Validation

实现：

```text
EpubValidator
```

至少完成：

```text
structural validation
resource validation
URI validation
XHTML validation
OPF validation
```

并根据实际 PoC 接入外部 validator。

---

## Batch 8 — Web → EPUB

打通：

```text
Web Capture
→
Document
→
EPUB Export
```

重点：

```text
offline export
asset localization
HTML cleaning
metadata
source URL
```

---

## Batch 9 — Annotation / Metadata Export

加入：

```text
Highlight
Note
Tags
Source Information
```

采用：

```text
compatibility-first
```

方案。

---

## Batch 10 — Batch Export

支持：

```text
多个 Document
→
一个 EPUB
```

完成：

```text
chapter order
TOC
metadata
duplicate handling
partial failure
report
```

---

## Batch 11 — Performance / Security / Cancellation

完成：

- large corpus
- resource limits
- SSRF
- malicious HTML
- malformed input
- cancellation
- concurrency
- memory
- temp cleanup
- crash safety

---

## Batch 12 — Regression / Compatibility

回归：

```text
M1
M2
M3
M4
M5
M6
M7
M8
```

重点：

```text
Web
Annotation
Search
EPUB Reader
PDF Reader
TTS
Library
Index Rebuild
```

---

## Batch 13 — Final Review / Documentation

形成最终：

```text
M9-STATUS.md
```

并更新：

```text
FORMAT.md
LIBRARY.md
SEARCH.md
USER-STATE.md
READER.md
ANNOTATION.md
DECISIONS.md
PROGRESS.md
```

---

# 一百二十一、必须新增 / 更新的文档

至少：

```text
docs/M9-EXPLORE.md
docs/M9-IMPLEMENTATION-PLAN.md
docs/M9-STATUS.md

docs/EPUB-EXPORT.md
docs/EPUB-EXPORT-ARCHITECTURE.md
docs/EPUB-EXPORT-HTML.md
docs/EPUB-EXPORT-ASSETS.md
docs/EPUB-EXPORT-METADATA.md
docs/EPUB-EXPORT-ANNOTATION.md
docs/EPUB-EXPORT-SECURITY.md
docs/EPUB-EXPORT-PERFORMANCE.md
docs/EPUB-EXPORT-VALIDATION.md
docs/WEB-TO-EPUB.md
```

具体文档名如与现有项目冲突，应复用已有文档，不要重复创建。

---

# 一百二十二、Git 提交策略

不得把 M9 所有修改压成一个巨大 commit。

至少按逻辑拆分：

```text
M9 Explore / Plan
M9 Export Domain
M9 Content Normalization
M9 EPUB Builder
M9 Asset Pipeline
M9 EPUB Writer
M9 Validation
M9 Web to EPUB
M9 Annotation / Metadata
M9 Batch Export
M9 Security / Performance
M9 Regression / Docs
```

提交信息必须描述真实修改。

不要为了“提交数量好看”而机械拆分。

---

# 一百二十三、开发纪律

必须遵守：

### 1. 代码优先于文档假设

如果文档与代码不一致：

```text
先记录差异
再决定是否更新文档
```

不得直接假设文档正确。

---

### 2. 不重构无关代码

M9 只修改：

```text
Export
Web Capture integration
EPUB
Asset
Metadata
Annotation Export
相关基础设施
```

发现其他架构问题：

记录：

```text
Out of Scope
```

不要顺手大规模重构。

---

### 3. 不制造重复系统

特别防止：

```text
第二套 URL Resolver
第二套 Metadata Model
第二套 Asset Cache
第二套 ReaderLocation
第二套 Document Parser
第二套 HTML Sanitizer
第二套 Export Pipeline
```

发现已有能力时优先复用。

---

# 一百二十四、Review 标准

最终 Review 必须证据优先。

只报告真正影响：

```text
Correctness
Security
Data Safety
Compatibility
Performance
Maintainability
```

的问题。

必须使用：

```text
FACT
HYPOTHESIS
INFERENCE
```

区分证据等级。

---

# 一百二十五、问题优先级

只允许：

```text
P0
P1
```

进入最终阻塞问题。

### P0

例如：

```text
导出会破坏原始用户文件
导出的 EPUB 无法正常打开
严重安全漏洞
系统级崩溃 / OOM
```

### P1

例如：

```text
关键阅读器兼容性问题
批量导出数据丢失
大量文章无法导出
取消后严重资源泄漏
核心 Web → EPUB 流程不可靠
```

普通：

```text
代码美观
命名偏好
轻微重构机会
个人架构偏好
```

不得升级为 P0/P1。

---

# 一百二十六、最终完成检查

M9 完成前必须逐项确认：

```text
[ ] M5 EPUB Export 已审计
[ ] M6 EPUB model 已复用
[ ] Export Domain 已建立
[ ] Single Article Export
[ ] Multi Article Export
[ ] Web → EPUB
[ ] Offline Web Article Export
[ ] XHTML normalization
[ ] CSS normalization
[ ] Image localization
[ ] Asset deduplication
[ ] Metadata
[ ] TOC
[ ] Manifest
[ ] Spine
[ ] ZIP packaging
[ ] EPUB validation
[ ] Atomic output
[ ] Cancellation
[ ] Progress
[ ] Partial failure handling
[ ] Error reporting
[ ] Annotation export
[ ] Source URL
[ ] CJK
[ ] Long article
[ ] Image-heavy article
[ ] Malicious HTML
[ ] SSRF protection
[ ] Large file/resource limits
[ ] Index.db deletion test
[ ] Source file immutability test
[ ] Deterministic export test
[ ] M6 Reader regression
[ ] M7 PDF regression
[ ] M8 TTS regression
[ ] Round-trip Import test
[ ] Performance test
[ ] Documentation
[ ] Git logical commits
```

---

# 一百二十七、最终 M9 STATUS 必须回答的问题

在 M9 结束时，`docs/M9-STATUS.md` 必须明确回答：

### Export

- 单篇 EPUB 是否完成？
- 多篇 EPUB 是否完成？
- Web → EPUB 是否完成？
- Offline Web → EPUB 是否完成？
- Batch Export 是否完成？

### EPUB

- EPUB3 是否正确？
- OPF 是否正确？
- Navigation 是否正确？
- Spine 是否正确？
- XHTML 是否正确？
- CSS 是否正确？
- Asset 是否正确？

### Content

- CJK 是否正确？
- Code Block 是否正确？
- Table 是否正确？
- Image 是否正确？
- Link 是否正确？

### Annotation

- Highlight 是否可以导出？
- Note 是否可以导出？
- 是否修改原始 Annotation？
- ReaderLocation 是否保持唯一？

### Safety

- HTML sanitize 是否完成？
- SSRF 防护是否完成？
- Resource limit 是否完成？
- ZIP safety 是否完成？

### Reliability

- Atomic export 是否完成？
- Cancellation 是否完成？
- Partial failure 是否正确？
- Crash safety 是否验证？

### Data

- 原始文件是否保持 immutable？
- 删除 SQLite 后是否仍可导出？
- Cache 删除后是否仍能运行？

### Compatibility

- M6 Reader 是否可以正常读取？
- 外部 EPUB Reader 是否验证？
- CJK 是否验证？
- 大型 EPUB 是否验证？

### Performance

- 100+ documents 是否测试？
- 大图片是否测试？
- 长文是否测试？
- Memory / CPU 是否观察？
- Cancellation latency 是否观察？

### Architecture

- 是否复用了现有 Web Capture？
- 是否复用了 M6 EPUB model？
- 是否产生重复系统？
- 第三方库是否隔离？

---

# 一百二十八、M9 的最终验收场景

必须实际完成以下完整演示：

## Case 1：单文章

```text
打开 Web Article
→ Export EPUB
→ 使用外部 EPUB Reader 打开
→ 正常阅读
```

---

## Case 2：离线文章

```text
Web Article 已保存
→ 关闭网络
→ Export EPUB
→ EPUB 成功
```

---

## Case 3：批量文章

```text
选择 20 篇文章
→ Export as EPUB
→ 得到一本 EPUB
→ TOC 正确
→ Chapter 顺序正确
```

---

## Case 4：带图片

```text
图片文章
→ EPUB
→ 外部 Reader
→ 图片正常
```

---

## Case 5：带 Highlight / Note

```text
文章
→ Highlight
→ Note
→ Export EPUB
→ Notes / Highlights 正确呈现
```

---

## Case 6：SQLite 丢失

```text
Delete index.db
→ Rebuild
→ Export EPUB
→ 成功
```

---

## Case 7：取消

```text
Large Export
→ Cancel
→ Task stops
→ Temp cleaned
→ Source intact
```

---

## Case 8：恶意 HTML

```text
Malicious HTML
→ Import / Capture
→ Export EPUB
→ Script removed
→ Dangerous content removed
→ EPUB remains readable
```

---

## Case 9：M6 Reader

```text
M9 generated EPUB
→ Reverie M6 EPUB Reader
→ Open
→ TOC
→ Search
→ Progress
→ Selection
```

全部不能出现基础回归。

---

# 一百二十九、M9 的核心完成定义

M9 不以：

```text
“Exporter 类写完了”
```

作为完成。

必须达到：

```text
Reverie
  ↓
稳定、可验证的 EPUB Export
  ↓
标准 EPUB 文件
  ↓
外部阅读器可独立阅读
```

并满足：

```text
Source Files remain truth
SQLite remains derived
Annotations remain safe
ReaderLocation remains unified
Original content remains immutable
Export is atomic
Export is cancellable
Export is secure
Export works offline for archived material
```

最终用户应该可以放心地认为：

> **“我把资料放进 Reverie 以后，即使未来不用 Reverie，我仍然可以把自己的阅读资料带走。”**

这也是 M9 最重要的价值。

---

# 一百三十、执行要求

现在开始执行本 M9。

严格按照：

```text
Explore
→ Plan
→ Implement
→ Test
→ Review
→ Document
```

进行。

第一次不要直接大规模修改代码。

首先完成：

```text
docs/M9-EXPLORE.md
docs/M9-IMPLEMENTATION-PLAN.md
```

并回答：

```text
1. M5 当前 EPUB Export 到底已经做到什么程度？
2. M6 哪些 EPUB model 可以直接复用？
3. 当前 Web Capture 哪些结果可以直接成为 EPUB 输入？
4. Asset 系统当前是什么状态？
5. Annotation / ReaderLocation 当前实现能复用到什么程度？
6. 当前项目是否已经存在 Aurora / Web→EPUB 相关实现？
7. 是否真的需要新的第三方库？
8. 哪些地方存在重复系统风险？
9. 哪些能力应该进入 M9，哪些应该明确留到 M10/M11？
10. M9 的最小可行实现路径是什么？
```

如果发现：

```text
当前项目已经完成某项能力
```

不要重复实现。

如果发现：

```text
现有架构与本提示词不同
```

以实际代码为准，并在：

```text
M9-EXPLORE.md
```

记录差异。

最终再根据 Explore 结果制定实际实施批次，然后开始编码。

**不要为了满足本提示词的文字结构而修改项目。**

**最终目标只有一个：让 Reverie 成为一个真正能够把个人阅读资料可靠导出的、本地优先、文件优先的阅读档案系统。**