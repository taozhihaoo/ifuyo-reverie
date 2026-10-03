# ifuyo Reverie — 总纲领开发提示词

你现在负责开发 **ifuyo Reverie**。

Reverie 是一个 **Windows 优先、本地优先、文件原生的个人阅读档案系统**。

它不是单纯的稍后阅读工具，不是普通电子书阅读器，也不是 Notion / Obsidian / AI 知识库。

它的核心目标是：

> **把用户多年积累的网页、RSS、电子书、PDF、Markdown、Highlight 与 Note，保存为属于用户自己的、可迁移、可长期维护的阅读档案。**

核心闭环：

```text
发现
→ 保存
→ 阅读
→ 划线
→ 记录
→ 归档
→ 搜索
→ 再次阅读
```

必须始终围绕这个闭环开发。

---

# 0. 第一原则：先理解产品，再写代码

在开始任何实现之前：

1. 检查整个仓库当前状态。
2. 检查已有代码、文档、配置、依赖、测试和构建方式。
3. 不假设仓库是空白项目。
4. 不擅自推翻已有有效实现。
5. 不因为“架构更漂亮”而重构没有实际问题的代码。
6. 不提前实现未来阶段的功能。
7. 不创建没有明确用途的抽象层。
8. 不使用 AI 猜测出来的 API、库能力、许可证或浏览器行为作为事实。
9. 对第三方库、许可证、浏览器 API、Windows API 等外部事实进行实际核验。
10. 当现有代码与设计文档冲突时，以**当前代码的真实行为 + 实际测试结果**为首要事实来源，并记录偏差。

你的目标不是制造大量代码，而是逐阶段建立一个：

**可靠、可维护、可迁移、可验证的个人阅读软件。**

---

# 1. 产品定位

## 1.1 产品名称

**ifuyo Reverie**

Reverie 是内部项目名称。

对外发布前需要自行进行名称可用性、软件重名、商标和域名等检查，不在开发阶段擅自认定名称一定可用。

---

# 2. 产品核心理念

必须贯彻以下原则：

## 2.1 文件是真相

核心用户资料必须以开放格式文件存在。

数据库只是：

- 搜索索引
- 快速查询
- 缓存
- UI 状态
- 可重建的数据层

不得让 SQLite 成为用户资料唯一真实来源。

理想关系：

```text
User Library
    ↓
开放格式文件
    ↓
Index / Cache / Search DB
```

数据库损坏后，应能够通过 `reverie doctor` 或等价机制重新建立索引。

---

## 2.2 用户的数据不属于 Reverie

Reverie 不应制造：

- 必须账号
- 必须云同步
- 必须服务器
- 必须订阅
- 私有数据库锁死
- 无法导出的内部格式

产品原则：

> Your library is a folder, not an account.

核心资料应该能够：

- 复制
- 备份
- 迁移
- 检查
- 导出
- 在未来脱离 Reverie 使用

---

## 2.3 本地优先，但不是“永远断网”

Reverie 可以主动访问网络来完成：

- 保存网页
- 获取 RSS
- 获取用户明确允许的资源

但这些网络能力不应演变成：

- 云端存储依赖
- 遥测依赖
- 在线账号依赖
- 第三方服务器依赖

保存后的核心阅读资料原则上应尽可能能够脱离原网站继续阅读。

---

## 2.4 阅读优先

所有设计都必须优先考虑：

**长时间阅读的舒适性、稳定性、可恢复性。**

不要为了增加功能而牺牲：

- 阅读区域
- 响应速度
- 键盘操作
- 选区体验
- 搜索速度
- 页面稳定性

---

# 3. 产品边界

Reverie 的核心资料类型：

```text
Web Article
RSS Article
EPUB
PDF
Markdown
TXT
Highlight
Note
Bookmark
```

未来允许增加格式适配器，但不得因为“格式支持更多”而偏离核心产品。

---

# 4. 非目标

明确禁止项目滑向：

```text
Notion
Obsidian
AI Knowledge Base
Social Reading
Online Book Store
Cloud Content Platform
Collaboration Platform
Blog Platform
Content Re-publication Platform
```

同时不得开发：

- DRM 破解
- 付费墙绕过
- 登录限制绕过
- 内容盗取
- 未授权公开转载
- 私有内容抓取绕过
- 恶意网页执行环境

Reverie 只处理用户有权访问和保存的内容。

---

# 5. Reader 架构总原则

Reverie 必须采用：

> **统一 Reader Shell + 多格式 Reader Adapter**

而不是：

> 一个渲染器解决所有格式。

架构概念：

```text
                       ┌─ Web Reader Adapter
                       ├─ EPUB Reader Adapter
Universal Reader  ─────┼─ PDF Reader Adapter
                       ├─ Markdown Reader Adapter
                       └─ TXT Reader Adapter
                             
                       ↓
                 Shared Reader Services
                       ├─ Progress
                       ├─ Search
                       ├─ Bookmark
                       ├─ Highlight
                       ├─ Note
                       └─ Reading State
```

不同格式拥有自己的：

- Parser
- Renderer
- Selection Model
- Anchor Adapter
- Progress Model

但必须共享 Reverie 的上层阅读数据模型。

---

# 6. Annotation 是核心基础设施

Highlight / Note 不能只是 UI 功能。

必须把 Annotation 设计为 Reverie 的核心数据层。

一个 Highlight 至少应该能够表达：

```text
UUID
Source ID
Created Time
Quoted Text
Context
Position
Format-specific Locator
Note
Tags
Status
Revision Information
```

---

## 6.1 多重定位

不要只依赖一个 offset。

Web / Article：

```text
Text Quote
+ Prefix
+ Suffix
+ Position
```

EPUB：

```text
Text Quote
+ EPUB CFI
+ Context
```

PDF：

```text
Page
+ Text Quote
+ Context
+ PDF-specific position
```

最终形成：

```text
Generic Annotation
        ↓
Generic Anchor
        ↓
Format-specific Anchor Adapter
```

---

## 6.2 定位失败

任何 Highlight 都不得因为重新提取、文件更新或定位失败而静默删除。

状态至少包含：

```text
resolved
orphaned
```

定位失败时：

1. 保留原 Highlight。
2. 显示为 orphaned。
3. 尝试重新匹配。
4. 允许用户手动修复。
5. 不得静默丢失。

---

## 6.3 原文修改

需要允许未来支持：

```text
Original Source Revision
New Source Revision
Re-anchor
```

不能假设网页永远不会变化。

---

# 7. 文件格式设计

建立公开的：

```text
docs/FORMAT.md
```

定义：

- Library layout
- `meta.json`
- article format
- book metadata
- annotations
- notes
- assets
- IDs
- timestamps
- versioning
- migrations
- integrity information

所有格式必须带版本号。

例如：

```json
{
  "format_version": 1
}
```

不得依赖“未来永远不会变化”。

---

# 8. 推荐的数据目录模型

不是强制最终结构，但设计必须朝这个方向：

```text
Reverie Library/
├─ articles/
│  └─ 2026/
│     └─ article-id/
│        ├─ article.md
│        ├─ meta.json
│        ├─ annotations.jsonl
│        ├─ source/
│        │  └─ page.html
│        └─ assets/
│
├─ books/
│  └─ book-id/
│     ├─ book.epub
│     ├─ meta.json
│     └─ annotations.jsonl
│
├─ pdf/
│  └─ document-id/
│     ├─ document.pdf
│     ├─ meta.json
│     └─ annotations.jsonl
│
└─ exports/
```

应用自身的：

```text
index.db
cache
thumbnail
temporary data
```

优先放在应用数据目录，而不是用户资料目录。

---

# 9. 原始内容与提取结果必须同时保存

对于网页：

```text
Original Capture
        +
Extracted Article
        +
Metadata
        +
Assets
```

不能只保留最终 Markdown。

原因：

- 提取算法会升级。
- 网站结构会变化。
- 将来可能需要重新提取。
- 用户需要知道数据来源。

至少保留：

```text
original_url
canonical_url
capture_time
extractor_version
content_hash
```

URL 应区分：

```text
original_url
canonical_url
```

不能只留下一个。

---

# 10. Web Article Extraction

正文提取是项目最大风险之一。

第一原则：

> **不要从零发明成熟的网页正文提取算法。**

优先验证成熟开源方案，例如 Mozilla Readability 或其他经过许可证核验的方案。

但不能仅仅“接入 Readability”就宣布问题解决。

必须建立：

# Article Extraction Corpus

语料分类：

```text
新闻
博客
技术文章
文档
GitHub
Newsletter
论坛
图片文章
动态页面
异常 HTML
表格
代码
嵌套内容
长页面
短页面
```

测试至少覆盖：

```text
Title
Author
Date
Canonical URL
Main body
Images
Code blocks
Tables
Links
Quotes
```

测试结果必须量化和记录。

公开仓库中不得直接提交没有明确许可的第三方网页内容。

CI 使用：

- 合成样例
- 许可明确的内容
- 自有测试网页

真实网页语料可作为本地/外部测试集。

---

# 11. Browser Extension

浏览器扩展是 Reverie 的重要入口，但必须与桌面主程序解耦。

推荐：

```text
Browser Extension
        ↓
Native Messaging
        ↓
Reverie Capture Host
        ↓
Capture Queue
        ↓
Library
```

优先考虑 Native Messaging。

不要为了简单而长期暴露：

```text
localhost HTTP Server
```

通信必须遵守：

- 最小权限
- 来源限制
- 输入验证
- 参数长度限制
- 错误处理
- 日志脱敏

浏览器扩展需要支持：

```text
Save Page
Save URL
Save Selection
```

后续再扩展更多捕获模式。

---

# 12. Capture Queue

浏览器扩展提交保存任务时：

```text
Capture Request
       ↓
Queue
       ↓
Persist Job
       ↓
Process
       ↓
Extract
       ↓
Store
       ↓
Index
```

即使 Reverie UI 没有打开，也应该具备任务排队能力。

失败任务不能直接丢弃。

至少记录：

```text
job id
time
source
status
error
retry count
```

---

# 13. RSS

RSS/Atom 是发现入口。

流程：

```text
Feed
 ↓
Fetch
 ↓
Parse
 ↓
Normalize
 ↓
Deduplicate
 ↓
Inbox
```

RSS 条目和手动保存网页最终进入统一资料模型。

必须处理：

- 重复
- canonical URL
- GUID
- 发布时间
- Feed 更新
- 删除/不可访问
- 网络失败
- 超时
- 重试

不要要求每个 RSS 条目都必须被保存成完整网页。

---

# 14. Search

M3 建立统一搜索。

搜索范围：

```text
Title
Author
Body
Highlight
Note
Tag
URL
```

考虑：

- 中文
- 英文
- 数字
- 标点
- Markdown
- 代码片段

中文搜索实现不要在总架构阶段锁死某一种算法。

以实际语料 benchmark 为依据选择实现。

---

# 15. Import / Export

目标：

> **用户可以随时进入 Reverie，也可以随时离开 Reverie。**

至少规划：

```text
Pocket
Wallabag
Raindrop
Markdown
OPML / RSS
EPUB
PDF
```

导出：

```text
Markdown
EPUB
Raw Files
Highlights
Notes
Metadata
```

导出过程中不得破坏原始资料。

---

# 16. EPUB

EPUB 是 Reverie 的一等阅读格式。

目标是达到：

**真正电子书阅读器级别的基础阅读体验。**

至少：

```text
EPUB 2
EPUB 3
TOC
Chapter Navigation
Pagination
Continuous Reading
Progress
Search
Font
Font Size
Line Height
Margins
Theme
Bookmark
Highlight
Note
```

优先验证：

```text
foliate-js
```

但不把整个 Reverie 锁死在 foliate-js 的 API 上。

设计：

```text
Reverie EPUB Adapter
        ↓
foliate-js
```

如果未来需要替换底层实现：

```text
Reverie EPUB Adapter
        ↓
Other Engine
```

上层数据模型尽可能不受影响。

M0 必须先做 EPUB Engine Spike。

Spike 至少完成：

```text
Open EPUB
→ TOC
→ Read
→ Select
→ Highlight
→ Store Anchor
→ Reopen
→ Restore Highlight
```

---

# 17. PDF

PDF 是重要扩展，但不是项目第一阶段的核心。

优先验证：

```text
PDF.js
```

但不提前假定：

- Highlight 一定简单
- PDF Text Layer 可以完全解决定位
- 任意 PDF 都能完美处理

M7 必须针对真实 PDF 做验证：

```text
Text PDF
Scanned PDF
Multi-column PDF
Long PDF
Code-heavy PDF
```

至少具备：

- 页面
- 缩放
- 搜索
- 文本选择
- 阅读进度
- Highlight
- Note

扫描 PDF / OCR 是否支持，由实际需求和性能决定，不得为了“格式完整”无限扩张。

---

# 18. 安全基线

所有外部内容都视为：

> **不可信输入。**

包括：

```text
HTML
RSS XML
EPUB ZIP
PDF
Images
Fonts
External URLs
```

必须考虑：

## HTML

- Sanitization
- Script blocking
- Event handler blocking
- Dangerous URL scheme filtering

## EPUB

默认不允许执行任意脚本。

必须验证第三方 EPUB 中：

- Script
- External Resource
- Links
- Embedded Content

的处理方式。

## ZIP / Container

防止：

- Path Traversal
- Zip Slip
- Compression Bomb
- Excessive extraction
- Huge file allocation

## External Links

默认通过系统浏览器打开，不直接给予 Reader 任意网页执行权限。

## DRM

检测并明确：

> Reverie 不支持 DRM 破解或绕过。

---

# 19. Daily Review

M5 加入最轻量的：

**Daily Review**

每天随机/按照策略展示用户过去的：

```text
Highlight
Note
Saved Article
```

目的不是打卡，不是积分，不是游戏化。

目标是让：

```text
Archive
```

真正产生：

```text
Long-term Personal Value
```

---

# 20. Aurora Reading

Aurora 是 Reverie 的视觉增强，而不是核心阅读引擎。

基础 Reader 必须先优秀。

Aurora Reading 可以加入：

```text
微弱环境光
渐变
夜间氛围
柔和动画
环境变化
```

严格禁止：

- 干扰选字
- 干扰翻页
- 高 CPU 占用
- 过度动画
- 影响文字对比度

原则：

> **漂亮，但必须让阅读变得更舒服，而不是抢走注意力。**

---

# 21. TTS

TTS 必须采用可替换后端。

抽象：

```text
TTS Interface
├─ System Voice
├─ Optional Local Neural Voice
└─ Future Provider
```

第一阶段只要求：

**Windows 本地系统语音。**

不要为了 TTS 引入在线 API、账号或云端依赖。

以后考虑第三方神经语音模型时，必须单独核验：

- 许可证
- 模型大小
- 性能
- CPU/GPU
- 商用限制
- 分发限制

---

# 22. 手机策略

第一阶段：

**不开发完整手机 App。**

通过开放格式解决移动阅读：

```text
Reverie
 ↓
Export EPUB / Markdown
 ↓
Phone / E-reader
```

未来再根据真实需求决定是否增加移动端。

---

# 23. 同步策略

Reverie 不自建同步服务器。

由于：

```text
文件是真相
```

天然允许：

```text
OneDrive
Syncthing
Dropbox
手动复制
NAS
```

等方式同步用户资料。

但不要宣称“天然零冲突”。

SQLite 索引应视为：

```text
Derived Data
```

可以重建。

未来若需要真正无服务器多设备合并：

```text
Immutable Records
UUID
Revision
Tombstone
Merge Strategy
```

必须单独设计。

不要在早期为了“未来同步”过度复杂化。

---

# 24. 文件写入安全

所有重要文件写入必须优先考虑：

```text
Write Temp
 ↓
Flush / Validate
 ↓
Atomic Rename
```

避免应用崩溃造成半文件。

特别关注：

- meta.json
- annotations
- notes
- source manifest

索引重建不能覆盖用户源文件。

---

# 25. Doctor

建立：

```text
reverie doctor
```

用于检查：

```text
Missing files
Invalid metadata
Invalid JSON
Broken references
Duplicate IDs
Broken annotations
Missing assets
Index mismatch
Unsupported versions
```

并提供：

```text
check
repair
reindex
```

等明确动作。

修复前必须避免静默破坏原始资料。

---

# 26. 阶段规划

总共：

# M0～M12，共 13 个阶段

---

## M0 — Foundation & Risk Spikes

目标：

**先验证最大风险，再建立最小架构。**

内容：

```text
Article Extraction Spike
Annotation Anchor Spike
EPUB Engine Spike
Security Baseline
FORMAT.md
Local Library Skeleton
```

必须形成：

```text
可执行实验
+
测试结果
+
结论
+
技术选型记录
```

M0 不追求产品 UI。

---

## M1 — Web Capture

目标：

**完成第一个真正可用的阅读闭环。**

```text
Browser Extension
Native Messaging
Capture Host
Capture Queue
Article Extraction
Web Reader
Local Storage
```

最终：

```text
浏览网页
→ Save
→ 本地保存
→ 打开 Reverie
→ 阅读
```

---

## M2 — Annotation Core

加入：

```text
Highlight
Note
Bookmark
Multi-anchor
Re-anchor
Orphan Handling
```

必须重点验证：

```text
保存
→ 关闭
→ 重启
→ 重新打开
→ 定位恢复
```

---

## M3 — Search & Library

加入：

```text
Full-text Search
Tags
Read / Unread
Favorites
Inbox
Recent
```

目标：

> 已保存几十/几百篇资料后仍然能够快速找到目标内容。

---

## M4 — RSS

加入：

```text
RSS / Atom
Feed Management
Fetching
Deduplication
Inbox
Read State
```

RSS 必须与 Web Article 使用统一上层资料模型。

---

## M5 — Import / Export / Daily Review

加入：

```text
Pocket Import
Wallabag Import
Raindrop Import
Markdown Export
EPUB Export
Metadata Export
Highlight Export
Daily Review
```

重点测试迁移可靠性。

---

## M6 — EPUB

加入：

```text
EPUB Adapter
TOC
Pagination
Search
Progress
Highlight
Note
Bookmark
```

以 M0 Spike 结果作为实现依据。

不得让 EPUB 底层库 API 泄漏到整个 Reverie。

---

## M7 — PDF

加入：

```text
PDF Adapter
PDF.js
Text Layer
Search
Selection
Highlight
Note
Progress
```

针对真实 PDF 做兼容性测试。

---

## M8 — Local TTS

加入：

```text
TTS abstraction
System Voice
Play / Pause
Speed
Continuous Reading
Reader Following
```

以本地能力为默认方案。

---

## M9 — Export EPUB / Aurora Reading

加入：

```text
Web → EPUB
Article → EPUB
Aurora Reading
Reader Experience Polish
```

重点：

> 让 Reverie 的 Web 阅读和电子书阅读逐渐统一成同一种高级阅读体验。

---

## M10 — Stability / Recovery

加入：

```text
reverie doctor
Index Rebuild
Backup
Recovery
Integrity Checks
Corruption Handling
Performance Optimization
Large Library Testing
```

重点验证：

```text
100
1000
5000+
```

资料规模下的性能。

具体 benchmark 以实际机器和测试结果为准。

---

## M11 — Windows Productization

加入：

```text
Installer
File Associations
Browser Extension Packaging
Update Mechanism
App Data Management
Crash Recovery
Startup Behavior
Windows Integration
```

目标：

从：

```text
Developer Build
```

变成：

```text
正常桌面软件
```

---

## M12 — Self-Use 1.0

M12 不是继续无止境加功能。

目标：

> **Reverie 已经足够稳定，可以作为用户日常使用的主阅读档案。**

完成：

```text
Core Reliability
UX Polish
Data Integrity
Documentation
Known Issues
Performance
Migration
Recovery
```

此阶段必须做一次完整验收。

---

# 27. 每个 Milestone 的统一工作方式

每个阶段必须遵守：

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

不要：

```text
看到功能
→ 立刻开始写代码
```

---

# 28. 每个阶段必须输出

至少：

```text
1. 当前状态
2. 实现范围
3. 架构变化
4. 数据格式变化
5. 代码变化
6. 测试
7. 性能
8. 已知问题
9. 风险
10. 下一阶段依赖
```

---

# 29. 测试原则

Reverie 是长期保存用户个人数据的软件。

因此必须高度重视：

**数据正确性 > 功能数量**

重点测试：

```text
Restart
Crash Recovery
File Corruption
Import / Export
Re-index
Duplicate Detection
Annotation Restore
Source Mutation
Large Library
Network Failure
Interrupted Capture
```

所有关键数据操作尽量建立自动化测试。

---

# 30. AI 编码纪律

你是 AI Coding Agent。

必须：

### 30.1 不滥造抽象

没有真实需求，不创建：

```text
ManagerManager
FactoryFactory
GenericBaseService
UniversalManager
```

等无意义抽象。

### 30.2 不提前开发

当前 Milestone 没有的功能，不因为“顺手”提前实现。

### 30.3 不重复造轮子

涉及：

```text
Web Extraction
EPUB
PDF
RSS
Search
```

优先调查成熟方案。

### 30.4 依赖必须有理由

引入任何第三方库之前检查：

```text
功能
维护状态
许可证
体积
性能
安全
平台支持
API 稳定性
```

不要为了一个很小功能引入重量级依赖。

---

# 31. FACT / HYPOTHESIS / INFERENCE

所有技术审计和重要决策，尽可能明确区分：

```text
FACT
事实，可验证

HYPOTHESIS
尚未验证的假设

INFERENCE
基于现有证据得到的推断
```

不要把猜测写成事实。

对于第三方库：

```text
官方文档 / 官方仓库
```

优先于：

```text
博客
AI 记忆
论坛帖子
二手资料
```

---

# 32. 技术选型原则

候选技术不是拍脑袋锁死。

尤其需要验证：

```text
Web Extraction
EPUB Engine
PDF Engine
Browser Native Messaging
Search Engine
TTS
```

推荐候选不等于最终决定。

必须通过：

```text
Spike
Benchmark
Compatibility Test
License Check
```

决定。

---

# 33. 许可证原则

所有第三方依赖必须建立：

```text
THIRD_PARTY.md
```

记录：

```text
Dependency
Version
License
Source
Usage
Distribution Consideration
```

特别关注：

```text
Runtime dependency
Bundled asset
Font
Model
Browser extension dependency
Native binary
```

不能因为“开源”就默认允许任意分发。

---

# 34. 性能目标

不要为了性能提前过度优化。

但必须关注：

```text
Startup
Library indexing
Full-text search
Article loading
EPUB loading
PDF loading
Large documents
Memory
TTS
Aurora effects
```

建立真实 benchmark。

不要使用没有实际测量依据的“必须 < XX ms”作为硬性目标。

---

# 35. UX 原则

核心 UI：

```text
Library
Inbox
Reader
Highlights
Notes
Search
Settings
```

尽量保持简单。

用户最常见的动作必须非常快：

```text
Save
Open
Read
Highlight
Note
Search
```

不要把普通阅读流程变成复杂的工作流。

---

# 36. 产品视觉

ifuyo 风格：

```text
克制
安静
精致
轻微未来感
有辨识度
```

但必须服从：

```text
可读性
稳定性
性能
键盘操作
信息层级
```

Reverie 不是视觉实验软件。

视觉是增强项，不是核心功能。

---

# 37. 未来扩展原则

未来可能增加：

```text
MOBI
AZW3
FB2
CBZ
更多浏览器
移动端
更强 TTS
高级推荐
更多 Review 策略
```

但必须使用：

```text
Adapter
Plugin-like boundary
Format abstraction
```

不能侵入核心数据模型。

---

# 38. 严格禁止的架构错误

不要：

```text
Browser Extension
→ 直接控制 UI
```

不要：

```text
Reader
→ 直接读写 SQLite
```

不要：

```text
Annotation
→ 绑定某一种 Reader Engine
```

不要：

```text
EPUB
→ 把 foliate-js 的内部对象直接作为 Reverie 数据模型
```

不要：

```text
PDF
→ 把 PDF.js 的内部对象直接作为 Reverie 数据模型
```

不要：

```text
Library
→ 只有 SQLite，没有可迁移源文件
```

不要：

```text
Save Article
→ 只保存 Markdown，不保留原始来源
```

不要：

```text
Annotation Resolve Failed
→ 删除 Highlight
```

---

# 39. 每次实现后的审计方式

完成一个阶段后，不只检查：

> “功能能不能用？”

还必须检查：

```text
数据是否正确？
数据是否可迁移？
崩溃后会不会丢？
重新索引后是否一致？
第三方库是否侵入核心架构？
安全边界是否正确？
是否引入不必要复杂度？
是否违反 Non-Goals？
是否提前做了未来功能？
```

---

# 40. 问题分级

发现问题时采用：

```text
P0
数据丢失
安全漏洞
无法恢复
核心架构阻塞

P1
核心功能错误
重大兼容问题
明显数据一致性问题

P2
一般 Bug
体验问题
性能问题

P3
优化建议
代码洁癖
非必要重构
```

不要因为：

```text
“代码看起来不够优雅”
```

就把普通问题升级成 P0/P1。

---

# 41. 变更纪律

每个 Milestone 应保持：

```text
清晰边界
可回滚
可测试
可理解
```

不要一次性制造巨型提交。

相关工作可以形成合理的多个 commit，但不要为了制造 commit 数量而碎片化。

---

# 42. 重要原则：不要追求“架构完美”

Reverie 是实际软件，不是架构展示项目。

正确目标：

```text
足够可靠
+
足够简单
+
方便继续扩展
```

而不是：

```text
抽象越多越专业
```

---

# 43. 开发开始前必须先完成

在开始 M0 实施之前，先完成一次：

## Repository Reconnaissance

检查：

```text
项目目录
构建系统
运行环境
现有依赖
现有代码
现有测试
现有文档
Git 状态
Ignore
CI
发布配置
```

然后给出：

```text
Current State
Architecture
Risks
Unknowns
M0 Plan
```

不得在没有查看现状的情况下直接开始大量编码。

---

# 44. M0 的最终验收条件

M0 完成时至少应能回答：

```text
1. Web Extraction 采用什么方案？为什么？
2. Extraction 真实测试结果如何？
3. Highlight Anchor 采用什么模型？
4. Web Anchor 是否能 Round-trip？
5. EPUB 使用什么 Reader Engine？为什么？
6. EPUB Highlight 是否能 Round-trip？
7. PDF 后续采用什么候选方案？
8. 文件格式是什么？
9. 数据库为什么只是索引？
10. 安全边界是什么？
11. Browser Extension 如何与桌面程序通信？
12. 第三方依赖和许可证情况如何？
```

如果这些问题仍没有可靠答案，不要急着进入大规模开发。

---

# 45. 最终产品验收标准

M12 Self-Use 1.0 至少达到：

```text
可以快速保存网页
可以稳定提取正文
可以舒适阅读
可以 Highlight
可以 Note
可以 Bookmark
可以搜索
可以订阅 RSS
可以导入旧资料
可以导出自己的资料
可以阅读 EPUB
可以阅读 PDF
可以 TTS
可以恢复阅读进度
可以重建索引
可以检查数据
可以备份
可以在没有云端服务器的情况下长期使用
```

最重要的是：

> **Reverie 不应该让用户担心“我的阅读资料以后还能不能拿回来”。**

---

# 46. 总体实施顺序

最终严格按照：

```text
M0  风险验证 / 基础
 ↓
M1  Web Capture + Reader
 ↓
M2  Annotation
 ↓
M3  Search / Library
 ↓
M4  RSS
 ↓
M5  Import / Export / Review
 ↓
M6  EPUB
 ↓
M7  PDF
 ↓
M8  TTS
 ↓
M9  EPUB Export / Aurora
 ↓
M10 Stability / Recovery
 ↓
M11 Windows Productization
 ↓
M12 Self-Use 1.0
```

**不要倒置这个顺序。**

---

# 47. 你的工作方式

你不是只负责写代码。

你需要同时扮演：

```text
Software Architect
+
Senior Developer
+
QA Engineer
+
Security Reviewer
+
Data Integrity Reviewer
```

但是：

> **不要因为扮演这些角色而制造文档和流程负担。**

每一步都必须服务于最终可运行的软件。

---

# 48. 当前任务

现在不要直接实现 M1～M12。

先：

1. 检查仓库。
2. 建立 Current State。
3. 找出与上述总纲领冲突的现有设计。
4. 检查已有依赖。
5. 验证技术选型候选。
6. 建立 M0 Spike 方案。
7. 建立最小文件格式草案。
8. 建立测试策略。
9. 最后才开始 M0 实施。

完成后输出：

```text
[Reverie Project Audit]

Current State
Architecture
Existing Components
Dependencies
Risks
Unknowns
Conflicts
M0 Spike Plan
FORMAT Draft
Test Strategy
Recommended Next Action
```

**不要跳过现状审计，不要直接大规模写代码。**