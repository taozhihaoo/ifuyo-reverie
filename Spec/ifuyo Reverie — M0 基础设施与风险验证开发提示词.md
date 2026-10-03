# ifuyo Reverie — M0 基础设施与风险验证

你现在开始执行：

# M0 — Foundation & Risk Spikes

项目：

**ifuyo Reverie**

---

# 一、M0 的定位

M0 不是正式产品功能开发阶段。

M0 的核心任务是：

> **在大规模开发之前，把 Reverie 最危险、最容易导致后续返工的技术问题验证清楚。**

M0 的目标不是做出漂亮 UI，也不是尽快堆功能。

必须优先解决：

```text
Web 正文提取是否可靠
Annotation 是否能够稳定定位
EPUB 阅读引擎是否满足需求
PDF 技术路线是否成立
文件原生数据模型是否合理
浏览器扩展通信方案是否可行
基础安全边界是否成立
第三方依赖是否存在明显问题
测试体系是否能够支撑后续开发
```

M0 完成后，M1～M12 才进入正式产品开发。

---

# 二、第一原则

执行整个 M0 时遵守：

```text
Evidence First
Minimal Architecture
Risk First
Data First
Test First
No Premature Features
```

不要为了“看起来已经完成”而提前开发 M1/M2/M3。

---

# 三、当前任务顺序

严格按照：

```text
Repository Reconnaissance
↓
Risk Inventory
↓
Technical Spikes
↓
Data Format Draft
↓
Security Baseline
↓
Test Infrastructure
↓
M0 Review
```

不要直接进入大规模编码。

---

# 四、第一步：Repository Reconnaissance

先完整检查当前仓库。

必须检查：

```text
项目目录
源码目录
测试目录
文档
构建系统
package / project 配置
依赖
锁定版本
Git 状态
.gitignore
CI
脚本
开发工具
浏览器扩展代码（如果已有）
桌面端代码（如果已有）
```

同时检查：

```text
README
设计文档
TODO
Issue
已有 Architecture 文档
已有测试
已有原型
```

不要因为文档写了什么，就直接假设代码已经实现。

必须区分：

```text
Documented
Implemented
Tested
Actually Working
```

---

# 五、Current State 报告

在开始修改代码之前建立：

```text
docs/
```

中的 M0 工作文档。

推荐：

```text
docs/M0-STATUS.md
```

至少包含：

```text
Project Overview
Current Repository Structure
Current Runtime
Current Dependencies
Existing Architecture
Existing Tests
Existing Prototype
Known Risks
Unknowns
M0 Work Plan
```

对于每个重要结论尽可能标记：

```text
FACT
HYPOTHESIS
INFERENCE
```

例如：

```text
FACT:
当前仓库已经存在 XXX。

FACT:
XXX 已有自动化测试。

HYPOTHESIS:
某 EPUB 引擎可能支持所需 Anchor。

UNKNOWN:
目前尚未验证重新打开文档后能否恢复 Highlight。
```

禁止把未经验证的能力写成 FACT。

---

# 六、建立 M0 Risk Inventory

创建：

```text
docs/M0-RISKS.md
```

至少按照下面类别检查。

---

## R1 Web Extraction

风险：

> 不同网站正文提取质量差异巨大。

检查：

```text
Title
Author
Published Time
Canonical URL
Main Content
Images
Links
Quotes
Code
Tables
Lists
Embedded Media
```

同时关注：

```text
动态页面
复杂 HTML
多栏布局
无正文页面
论坛
博客
Newsletter
文档网站
GitHub
异常 HTML
```

---

## R2 Annotation

风险：

> Highlight 如果只依赖 DOM offset / 字符 offset，很容易在重开、重新提取、网页变化之后失效。

必须验证：

```text
Create Highlight
↓
Store Anchor
↓
Close
↓
Reopen
↓
Resolve Anchor
↓
Restore Highlight
```

---

## R3 EPUB

验证候选阅读引擎是否能够支持：

```text
Open EPUB
TOC
Chapter
Text Selection
Highlight
Bookmark
Progress
Search
```

最重要的是：

```text
Highlight Anchor Persistence
```

---

## R4 PDF

验证 PDF 技术路线：

```text
Load PDF
Render
Text Layer
Select Text
Search
Page Navigation
```

同时观察：

```text
Highlight 是否能稳定定位
Text Layer 与视觉文本是否一致
大型 PDF 是否容易出现性能问题
```

不要求 M0 做完整 PDF Reader。

---

## R5 Browser Extension

验证：

```text
Browser
↓
Extension
↓
Native Messaging
↓
Reverie Host
↓
Capture Request
```

重点不是漂亮 UI。

重点是证明：

> 浏览器可以可靠地向 Reverie 提交一个 Capture Job。

---

## R6 File Format

验证：

> 文件原生设计是否可以支撑未来整个产品。

至少需要能够表达：

```text
Article
Metadata
Source
Assets
Highlight
Note
Bookmark
Progress
```

---

## R7 Search

M0 不需要完成正式全文搜索。

但是要验证：

> 后续采用的资料结构是否适合建立搜索索引。

需要检查：

```text
Title
Body
Author
Note
Highlight
Tags
URL
```

是否能够在不修改原始资料的情况下重新建立索引。

---

## R8 Security

验证：

```text
HTML Sanitization
EPUB Safety
PDF Isolation
ZIP Extraction
External URLs
File Paths
Native Messaging
```

把外部内容一律视为：

> Untrusted Input

---

# 七、建立 Architecture Boundary

M0 必须明确建立以下边界。

推荐目标：

```text
Reverie
│
├─ App
│
├─ Library
│
├─ Reader
│   ├─ Core
│   ├─ Web Adapter
│   ├─ EPUB Adapter
│   ├─ PDF Adapter
│   └─ Markdown Adapter
│
├─ Annotation
│
├─ Capture
│
├─ Feed
│
├─ Search
│
├─ ImportExport
│
└─ Infrastructure
```

注意：

这不是要求现在立即把所有目录和模块全部创建出来。

M0 只是建立**边界与依赖方向**。

不要为了架构图而提前创建几十个空项目、空接口和空类。

---

# 八、Reader Boundary

M0 必须确定：

```text
Reader Shell
```

与：

```text
Reader Engine
```

之间的关系。

目标：

```text
Reverie Reader
       ↓
Reader Adapter
       ↓
Underlying Engine
```

禁止：

```text
Reverie 全局代码
       ↓
直接依赖 foliate-js 内部 API
```

以及：

```text
Reverie 全局代码
       ↓
直接依赖 PDF.js 内部对象
```

底层引擎必须尽可能被隔离。

---

# 九、建立 Generic Document Model

M0 必须产出一个**最小通用文档模型草案**。

不是一次把未来所有字段设计完。

至少定义概念：

```text
Document
DocumentId
DocumentType
Title
Author
Source
CreatedAt
CapturedAt
UpdatedAt
Content
Assets
Progress
Annotations
```

DocumentType 至少考虑：

```text
web
article
epub
pdf
markdown
text
```

不要在这里添加几十个未来字段。

---

# 十、Annotation Model

M0 必须确定 Annotation 的最小数据模型。

至少包含：

```text
AnnotationId
DocumentId
Type
CreatedAt
UpdatedAt
QuotedText
Prefix
Suffix
Locator
Note
Tags
Status
```

Type 至少：

```text
highlight
note
bookmark
```

Status 至少：

```text
resolved
orphaned
```

---

# 十一、Anchor 抽象

建立最小：

```text
Anchor
```

概念。

例如：

```text
GenericTextAnchor
```

包含：

```text
quote
prefix
suffix
position
```

然后允许：

```text
WebAnchor
EpubAnchor
PdfAnchor
```

实现自己的格式特有定位信息。

---

# 十二、Web Annotation Spike

必须做一个最小实验。

流程：

```text
测试 HTML
↓
渲染
↓
用户选择文本
↓
建立 Highlight
↓
生成 Anchor
↓
保存
↓
关闭
↓
重新加载
↓
重新定位
```

至少证明：

```text
Same Document
→ Highlight Restore
```

可以工作。

再加入：

```text
Slightly Changed Document
```

验证：

```text
quote
+
prefix
+
suffix
```

是否能够进行重新定位。

---

# 十三、Orphan Annotation Spike

必须故意制造：

```text
无法定位 Highlight
```

验证系统行为。

正确行为：

```text
Resolve Failed
↓
Keep Annotation
↓
Mark orphaned
↓
Do Not Delete
```

必须写测试。

---

# 十四、EPUB Spike

M0 必须建立最小 EPUB 实验工程。

目标：

```text
Open EPUB
↓
Display Content
↓
TOC
↓
Text Selection
↓
Highlight
↓
Store Anchor
↓
Close
↓
Reopen
↓
Restore Highlight
```

至少准备：

```text
简单 EPUB
多章节 EPUB
长章节 EPUB
包含图片 EPUB
EPUB 3
```

如果底层引擎无法稳定完成 Anchor Round-trip：

> 必须在 M0 明确暴露，而不是暂时忽略。

---

# 十五、PDF Spike

M0 只做：

```text
Open
Render
Page Navigation
Text Selection
Search
```

同时调查：

```text
Text Layer
Highlight Position
Large File
Multi-column
```

至少测试：

```text
普通文字 PDF
多栏 PDF
长 PDF
扫描 PDF
```

扫描 PDF 可以明确记录：

```text
OCR = Not Supported in M0
```

不要因为没有 OCR 就阻塞整个 M0。

---

# 十六、Article Extraction Spike

这是 M0 最重要的实验之一。

不要直接宣布：

> “接入某某库，所以正文提取问题已经解决。”

必须实际建立 Extraction Test Harness。

输入：

```text
HTML
```

输出：

```text
title
author
date
canonical_url
body
images
links
code
tables
```

---

# 十七、Extraction Corpus

建立：

```text
tests/extraction/
```

测试样本至少分类：

```text
blog
news
documentation
GitHub
forum
newsletter
technical article
long article
image-heavy article
table-heavy article
code-heavy article
malformed HTML
minimal HTML
```

不要求 M0 就积累海量真实网页。

但必须建立：

> 可持续扩张的 Corpus 结构。

---

# 十八、Extraction Evaluation

至少记录：

```text
Correct Title
Correct Author
Correct Date
Correct Canonical
Correct Body
Correct Images
Correct Code
Correct Tables
```

不要只做：

```text
assert body != empty
```

应尽可能建立结构化检查。

---

# 十九、外部真实网页测试

可以使用真实网页进行本地人工/实验验证。

但测试资产必须考虑：

```text
Copyright
License
Redistribution
Repository Size
```

不得因为建立测试 Corpus 而把大量未经授权的第三方全文内容直接提交到公开仓库。

正式 CI 优先使用：

```text
自有 HTML
合成 HTML
授权测试数据
```

真实网页测试可以作为本地测试集。

---

# 二十、Original Capture 模型

M0 必须确定网页保存不是：

```text
URL
+
Markdown
```

这么简单。

至少设计：

```text
Original URL
Canonical URL
Capture Time
Extractor Version
Content Hash
Extracted Article
Original Source
Assets
```

概念关系：

```text
Source
 +
Capture
 +
Extracted Article
```

---

# 二十一、文件格式

建立：

```text
docs/FORMAT.md
```

暂定定义：

```text
Library
Document
Metadata
Annotation
Assets
Export
Versioning
```

原则：

```text
开放格式
人类可理解
可迁移
可备份
可重建
```

推荐：

```text
JSON
Markdown
JSONL
原始文件
```

但最终选择必须结合实际代码和测试。

---

# 二十二、Database Boundary

M0 明确：

```text
SQLite = Index / Cache / Derived State
```

不是：

```text
SQLite = User Data Source of Truth
```

必须设计：

```text
Library Files
       ↓
Indexer
       ↓
SQLite
```

同时允许：

```text
Library Files
       ↓
Rebuild Index
       ↓
Fresh SQLite
```

M0 不要求完成完整 Indexer。

但是必须保证数据模型不会阻碍它。

---

# 二十三、Index Recovery

建立最小思想验证：

```text
Delete Index
↓
Read Source Files
↓
Rebuild
```

最终目标：

> 用户的数据目录本身就是完整资产。

---

# 二十四、Native Messaging Spike

建立最小 Browser Extension + Native Host 实验。

只需要完成：

```text
Browser
→ Send URL
→ Native Host
→ Receive
→ Log
→ Return Result
```

暂时不需要：

```text
完整 Save UI
完整 Article Extraction
完整 Queue
```

重点验证：

- 安装方式
- Manifest
- 通信
- JSON 消息格式
- 错误处理
- Windows 路径
- Host 启动
- 权限

---

# 二十五、Capture Message Contract

建立：

```text
CaptureRequest
CaptureResponse
```

最小字段例如：

```text
request_id
url
title
selected_text
timestamp
```

必须带：

```text
protocol_version
```

以后才能演进：

```text
v1
v2
```

---

# 二十六、Security Baseline

创建：

```text
docs/SECURITY.md
```

记录 M0 已确认的边界。

至少包含：

```text
Threat Model
HTML
JavaScript
EPUB
PDF
ZIP
File Paths
URLs
Native Messaging
External Content
```

---

# 二十七、HTML Security

必须明确：

Reader 默认不是普通浏览器。

对于保存后的 Article：

```text
Script
Event Handlers
Dangerous HTML
javascript:
data:
```

等内容必须有明确处理策略。

不能简单：

```text
set HTML
→ Browser 自己处理
```

然后假定安全。

---

# 二十八、EPUB Security

测试至少：

```text
embedded script
external URL
embedded asset
malicious path
unexpected file
```

默认原则：

> 用户阅读本地 EPUB，不应因此获得任意代码执行能力。

---

# 二十九、ZIP / EPUB 解压安全

必须检查：

```text
Path Traversal
Zip Slip
Huge Entries
Compression Bomb
Unexpected File Types
Extraction Limits
```

绝对路径和：

```text
../
```

必须得到安全处理。

---

# 三十、依赖审计

建立：

```text
THIRD_PARTY.md
```

记录当前实际使用的：

```text
Library
Version
License
Source
Purpose
Runtime / Build-time
```

重点关注：

```text
Web Extraction
EPUB
PDF
RSS
Search
TTS
Browser Extension
Native Components
```

不要只记录名称。

必须确认实际许可证文本/官方说明。

---

# 三十一、许可证的处理原则

M0 做许可证检查的目的：

> **建立未来可持续性，不代表现在进行商业化。**

不要在 M0 做：

```text
收费
支付
商店
账号
商业发行
营销
```

但是必须发现潜在问题，例如：

```text
当前依赖如果未来分发可能存在限制
```

就记录：

```text
Commercial Distribution Risk
```

而不是擅自修改产品路线。

---

# 三十二、测试基础设施

M0 必须建立最基本的：

```text
Unit Test
Integration Test
Fixture Test
```

至少覆盖：

```text
File Format
Annotation
Anchor
Extraction
Native Messaging
Security
```

---

# 三十三、必须拥有的 Round-trip 测试

M0 特别重要的一类测试：

```text
Create
↓
Serialize
↓
Close
↓
Read
↓
Deserialize
↓
Compare
```

应用于：

```text
Document
Metadata
Annotation
Highlight
Note
Bookmark
```

确保：

> 保存之后重新打开，不会改变用户资料语义。

---

# 三十四、错误注入

M0 至少设计几种失败情况：

```text
网络失败
HTML 损坏
文件不存在
JSON 损坏
索引不存在
Anchor 不存在
EPUB 无法打开
PDF 无法解析
Native Messaging 中断
程序异常退出
```

检查：

```text
是否丢数据
是否产生半文件
是否进入未知状态
是否可以恢复
```

---

# 三十五、日志

建立最基本日志体系。

原则：

```text
可诊断
不过度
不泄露隐私
```

尤其不要默认记录：

```text
完整网页正文
完整 Highlight 内容
敏感 URL 参数
用户文件内容
```

---

# 三十六、M0 不做什么

明确禁止在 M0 大规模开发：

```text
完整 Library UI
完整 Dashboard
完整 RSS UI
完整 Search UI
完整 Settings
完整 Aurora
完整 TTS
完整 Import
完整 PDF Reader
完整 EPUB Reader
完整 Browser Extension UX
```

M0 只做能够证明技术路线成立的最小实现。

---

# 三十七、M0 的代码量控制

M0 不以代码量为目标。

优先：

```text
Spike
Test
Fixture
Prototype
Architecture Boundary
Documentation
```

宁可：

```text
500 行高价值验证代码
```

也不要：

```text
5000 行没有验证风险的大规模实现
```

---

# 三十八、M0 最终交付物

完成 M0 后必须至少产生：

```text
docs/M0-STATUS.md
docs/M0-RISKS.md
docs/FORMAT.md
docs/SECURITY.md
THIRD_PARTY.md
```

以及相应的：

```text
Test Fixtures
Spike Code
Integration Tests
```

---

# 三十九、M0 Final Review

完成实现后，进行一次完整审计。

必须分别回答：

## Web Extraction

```text
实际测试多少类别？
哪些成功？
哪些失败？
最大问题是什么？
```

## Annotation

```text
Anchor 能否 Round-trip？
文档变化后能否重新定位？
失败时是否保留？
```

## EPUB

```text
候选引擎最终是否成立？
哪些功能已验证？
哪些功能未知？
```

## PDF

```text
候选路线是否成立？
Text PDF 是否成立？
Scan PDF 如何处理？
```

## Browser Extension

```text
Native Messaging 是否成立？
安装与通信问题是什么？
```

## Data

```text
数据是否完全依赖 SQLite？
能否重建索引？
文件格式是否足够开放？
```

## Security

```text
外部内容的信任边界是否明确？
是否存在明显高风险？
```

## Dependencies

```text
哪些依赖已经确认？
哪些许可证仍需进一步研究？
```

---

# 四十、M0 验收条件

只有满足以下条件，才允许宣布：

# M0 COMPLETE

---

## A. 架构

已经明确：

```text
Library
Reader
Annotation
Capture
Search
Import/Export
Infrastructure
```

的边界。

---

## B. Web Extraction

已经有：

```text
Extraction Harness
Fixtures
Evaluation
```

并知道主要失败模式。

---

## C. Annotation

已经证明至少一个 Web 文档可以：

```text
Highlight
→ Persist
→ Restart
→ Restore
```

并验证 orphan 行为。

---

## D. EPUB

至少已经完成：

```text
Open
TOC
Select
Highlight
Persist
Reopen
Restore
```

或者明确证明候选引擎存在什么阻塞，并给出替代路线。

---

## E. PDF

已经完成基础技术验证：

```text
Open
Render
Text Select
Search
```

并知道 Highlight 后续实现的主要风险。

---

## F. Browser Extension

最小：

```text
Extension
→ Native Host
```

通信已经跑通。

---

## G. Format

已经形成：

```text
FORMAT.md
```

并明确：

```text
Source of Truth
Index
Cache
Annotation
Asset
```

之间关系。

---

## H. Security

已经形成：

```text
SECURITY.md
```

并确定主要攻击面和处理策略。

---

## I. Dependency

已经形成：

```text
THIRD_PARTY.md
```

并记录当前依赖及许可证信息。

---

## J. Recovery

至少验证：

```text
Delete / Rebuild Index
```

不会破坏源文件。

---

# 四十一、问题分级

M0 过程中发现问题时使用：

```text
P0
核心路线无法成立
数据丢失
安全漏洞
无法恢复

P1
核心能力明显不稳定
关键第三方引擎存在严重阻塞
数据一致性问题

P2
普通 Bug
兼容性问题
一般性能问题

P3
优化建议
代码风格
非必要重构
```

不要因为：

```text
“架构不够漂亮”
```

就把问题定义成 P0/P1。

---

# 四十二、事实记录要求

最终报告必须分别标记：

```text
FACT
已实际验证

HYPOTHESIS
尚未验证

INFERENCE
根据证据得出的判断

BLOCKER
已经阻塞后续阶段

OPEN QUESTION
仍待后续验证
```

特别禁止：

```text
“这个库应该支持”
“应该没问题”
“理论上可以”
```

把这种话当成结论。

---

# 四十三、M0 完成后的输出格式

最终不要只说：

> M0 完成。

必须输出：

```text
# M0 Final Report

## 1. Repository State

## 2. Architecture

## 3. Technical Spikes

### Web Extraction
### Annotation
### EPUB
### PDF
### Native Messaging

## 4. Data Format

## 5. Security

## 6. Dependencies / Licenses

## 7. Tests

## 8. Benchmarks

## 9. Risks

## 10. FACT / HYPOTHESIS / INFERENCE

## 11. Blockers

## 12. Changes Made

## 13. Known Limitations

## 14. M1 Prerequisites

## 15. Final Verdict
```

其中 `Final Verdict` 只能回答：

```text
Ready for M1
Ready with Known Risks
Blocked
```

不得为了让项目继续推进而掩盖真实阻塞。

---

# 四十四、Git / 提交纪律

M0 可以拆成多个有意义的提交。

建议围绕：

```text
M0 repository baseline
M0 format foundation
M0 extraction spike
M0 annotation spike
M0 EPUB spike
M0 PDF spike
M0 native messaging spike
M0 security baseline
M0 tests
```

但不要机械要求每完成一个小文件就提交一次。

每个 commit 应该代表一个能够理解和回滚的逻辑变化。

---

# 四十五、最终工作原则

请始终记住：

> M0 的价值不是“做出了多少功能”，而是“避免 M1～M12 在错误技术路线之上越做越大”。

尤其关注：

```text
网页提取
Annotation Anchor
EPUB
PDF
文件原生数据
Native Messaging
安全
恢复
```

这些才是 Reverie 当前真正的高风险点。

当风险已经获得足够证据之后，再进入 M1。

**不要因为还有未知问题，就无限扩大 M0。**

M0 的目标是：

> **把影响后续架构的未知问题变成已验证结论；把暂时无法验证的问题记录下来，而不是假装它们不存在。**