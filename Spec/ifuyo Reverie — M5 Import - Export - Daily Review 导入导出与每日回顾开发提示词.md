# ifuyo Reverie — M5 Import / Export / Daily Review 导入导出与每日回顾开发提示词

你现在继续开发：

> **ifuyo Reverie**

当前进入：

> **M5 — Import / Export / Daily Review**
>
> **导入 / 导出 / 每日回顾**

Reverie 是：

> **Windows 优先、本地优先、文件原生的个人阅读档案系统。**

当前已经完成或应该已经具备：

```text
M0
基础设施 / 风险验证

M1
Web Capture + Reader

M2
Annotation
Highlight / Note / Bookmark

M3
Search / Library
Tags / Read State / Favorite / Inbox / Recent

M4
RSS / Atom
Feed Management
Fetching
Parsing
Normalization
Deduplication
RSS Article
Library / Reader / Search Integration
```

M5 的核心目标不是“再加几个导入按钮”。

真正目标是：

> **让 Reverie 成为一个可以自由进入、自由离开的个人阅读档案系统。**

用户应该能够：

```text
外部阅读服务
    ↓
导入
    ↓
Reverie Library
    ↓
阅读 / Highlight / Note / Tag / Read State
    ↓
搜索 / 回顾
    ↓
导出
    ↓
重新获得自己的资料
```

必须始终坚持：

> **用户自己的文件是真相，数据库只是派生索引。**

---

# 一、最高优先级原则

整个 M5 必须继续遵守 Reverie 总纲领。

核心原则：

```text
User Files
    ↓
Domain Model
    ↓
SQLite / Search Index
```

而不能变成：

```text
Import
    ↓
SQLite
    ↓
UI
```

也不能变成：

```text
Export
    ↓
直接从 SQLite 生成用户资料
```

SQLite 可以：

```text
Search Index
Fast Query
Cache
Derived Metadata
UI State
```

但不能成为唯一的数据源。

---

# 二、M5 的核心产品目标

M5 完成后，用户应该能够：

```text
导入旧阅读资料
        ↓
Reverie 识别并规范化
        ↓
进入统一 Document / Library
        ↓
保留尽可能多的原有信息
        ↓
避免产生重复资料
        ↓
继续阅读 / 搜索 / 标注
        ↓
将 Reverie 中的资料导出
        ↓
得到标准、可移植、可独立使用的文件
```

再加上：

```text
Daily Review
```

让 Reverie 不只是“存资料”，而是能够帮助用户重新发现自己过去保存、阅读和标注过的内容。

但是：

> **Daily Review 是阅读回顾，不是游戏化打卡系统。**

---

# 三、M5 必须完成的核心能力

以下为本阶段核心功能：

```text
[A] Pocket Import
[A] Wallabag Import
[A] Raindrop Import

[A] Import Staging
[A] Import Validation
[A] Import Preview
[A] Import Result Report
[A] Import Error Report
[A] Import Deduplication
[A] Import Idempotency
[A] Import Provenance

[A] Markdown Export
[A] EPUB Export
[A] Metadata Export
[A] Highlight Export

[A] Export Selection
[A] Export Library
[A] Export Search Result
[A] Export Filtered Set

[A] Export 不修改原始资料
[A] Export 失败不破坏原始资料
[A] Export 具有明确完成 / 失败状态

[A] Daily Review
[A] Review Queue
[A] Review Strategy
[A] Review Navigation
[A] Review History / State

[A] Import → Library
[A] Import → Search
[A] Import → Reader
[A] Import → Annotation
[A] Export ↔ File Format

[A] 迁移可靠性测试
[A] 数据完整性测试
[A] 大规模导入测试
[A] 重复导入测试
[A] 部分失败恢复测试
```

---

# 四、M5 明确不做什么

本阶段必须严格控制边界。

不要提前实现：

```text
EPUB Reader
EPUB Pagination
EPUB TOC Reader
EPUB Highlight Adapter
EPUB Annotation Anchor
```

这些属于：

```text
M6
```

不要提前实现：

```text
PDF Reader
PDF Selection
PDF Annotation Adapter
```

这些属于：

```text
M7
```

不要提前实现：

```text
TTS
```

属于：

```text
M8
```

不要把 M5 的 EPUB Export 做成：

```text
Aurora
高级 EPUB 排版系统
高级 Web → EPUB Pipeline
高级主题引擎
复杂 CSS 排版编辑器
阅读器视觉重构
```

这些属于：

```text
M9
```

因此：

> **M5 的 EPUB Export 是“可靠的迁移 / 导出能力”，不是最终的高级出版能力。**

M5 也不要实现：

```text
Cloud Sync
Account
Collaboration
Social
AI Summary
AI Search
Embedding
Vector Database
Knowledge Graph
Backlinks
Graph View
Plugin Marketplace
Online Store
Web Publishing
```

也不要增加：

```text
复杂自动化平台
复杂工作流编排
复杂脚本系统
```

---

# 五、代码与文档谁是真相

执行过程中继续遵守：

> **当前代码 + 当前测试 > 旧设计文档。**

如果发现：

```text
文档说 A
代码实际是 B
```

不要直接按照文档重写。

先判断：

```text
FACT
HYPOTHESIS
INFERENCE
```

然后：

```text
1. 调查实际行为
2. 判断已有实现是否正确
3. 尽量复用正确实现
4. 只修改真正需要修改的部分
5. 更新文档
```

禁止为了 M5：

```text
大规模重写 M1
大规模重写 M2
大规模重写 M3
大规模重写 M4
```

除非发现真实：

```text
P0
P1
```

级问题。

如果只是：

```text
未来可能更优雅
未来可能更容易扩展
目录结构可以更漂亮
接口可以更抽象
```

不要因此大规模重构。

---

# 六、M5 的核心架构

推荐形成：

```text
                     Import / Export
                           │
          ┌────────────────┼────────────────┐
          ↓                ↓                ↓
       Import           Export          Daily Review
          │                │                │
          ↓                ↓                ↓
       Staging         Export Plan      Review Queue
          ↓                ↓                ↓
       Validate        Render/Serialize  Review Item
          ↓                ↓                ↓
       Normalize       Write Files       Open Reader
          ↓                ↓                ↓
       Deduplicate     Validate Output   Update State
          ↓
       Document
          ↓
       Library
          ↓
       Search / Reader / Annotation
```

Import 和 Export 必须是独立边界。

不要：

```text
PocketImporter
    ↓
直接修改 Library UI

RaindropImporter
    ↓
直接写 SQLite

MarkdownExporter
    ↓
直接读取数据库表

EPUBExporter
    ↓
直接依赖某个 Reader 内部对象
```

应该：

```text
External Format
      ↓
External Adapter
      ↓
Normalized Import Model
      ↓
Import Pipeline
      ↓
Generic Document
      ↓
Library
```

以及：

```text
Generic Document
      ↓
Export Model
      ↓
Format Exporter
      ↓
Filesystem
```

---

# 七、建立统一 Import Pipeline

不要为三种来源各自写一套完全独立的业务流程。

应该建立统一概念：

```text
ImportSource
ImportParser
ImportNormalizer
ImportValidator
ImportDeduplicator
ImportMapper
ImportWriter
ImportReport
```

推荐流程：

```text
External File
    ↓
Detect Format
    ↓
Parse
    ↓
Normalize
    ↓
Validate
    ↓
Preview
    ↓
Identity / Dedup
    ↓
Conflict Resolution
    ↓
Write
    ↓
Index
    ↓
Report
```

其中：

```text
Parse
```

只负责：

> “理解外部格式。”

而：

```text
Normalize
```

负责：

> “转换为 Reverie 的内部语义。”

UI 不应该直接接触：

```text
Pocket JSON
Wallabag JSON
Raindrop JSON
```

---

# 八、Import 必须采用 Staging

禁止：

```text
读取外部文件
    ↓
边解析边直接写正式 Library
```

因为中间失败可能造成：

```text
半套数据
部分文件
部分 Annotation
部分 State
```

应该采用：

```text
External File
    ↓
Staging
    ↓
Parse
    ↓
Validate
    ↓
Normalize
    ↓
Preview / Report
    ↓
Commit
```

推荐：

```text
ImportSession
ImportBatch
ImportItem
```

至少能够记录：

```text
session_id
source_type
source_path
started_at
completed_at
status
total_items
new_items
updated_items
skipped_items
duplicate_items
failed_items
```

Import Session 本身可以放：

```text
应用数据 / 临时目录
```

不要求进入用户资料库。

---

# 九、Import 必须支持 Preview

导入大量资料之前，允许用户看到：

```text
发现多少条
新增多少条
重复多少条
可更新多少条
无法解析多少条
缺少字段多少条
预计生成多少文件
```

至少提供：

```text
Total
New
Existing
Duplicate
Skipped
Failed
```

对于失败项：

```text
原始项目
错误类型
错误原因
建议动作
```

不能只显示：

```text
Import failed
```

---

# 十、Import 必须支持幂等

这是 M5 的 P0 级核心能力之一。

同一个外部文件：

```text
第一次导入
```

得到：

```text
100 documents
```

再次导入同样的文件：

```text
不应变成
200 documents
```

必须尽可能实现：

```text
Same Input
+
Same Library State
↓
Same Result
```

至少验证：

```text
导入一次
导入两次
连续导入三次
```

结果应明确：

```text
created
updated
skipped
failed
```

而不是产生重复资料。

---

# 十一、建立 Import Provenance

导入数据必须知道：

> “这条资料从哪里来的？”

推荐 metadata 增加：

```text
provenance
```

概念至少允许表达：

```text
source_type
source_id
source_item_id
source_url
imported_at
import_session_id
```

例如：

```text
Pocket
Wallabag
Raindrop
Manual
RSS
Web Capture
```

不要把来源信息仅保存在 SQLite。

至少关键 provenance 必须持久化在文件 metadata 中。

原因：

```text
删除 SQLite
重新建立 Index
```

之后仍然应该能够知道：

```text
这个 Document 的来源
```

---

# 十二、Pocket Import

实现：

```text
Pocket Import
```

但是：

> **优先基于用户实际拥有的 Pocket 导出文件实现，不依赖登录 Pocket。**

不要设计：

```text
Reverie 登录 Pocket
Reverie 保存 Pocket Token
Reverie 自动调用 Pocket API
```

除非当前仓库已有明确需求和合法授权设计。

本阶段的目标是：

```text
导出文件
    ↓
Reverie Import
```

而不是：

```text
第三方账户同步器
```

---

## 12.1 Pocket Import 原则

不要假设 Pocket 文件永远拥有完整字段。

必须允许：

```text
title 缺失
url 缺失
excerpt 缺失
author 缺失
time 缺失
tags 缺失
status 异常
字段类型异常
未知字段存在
```

遇到未知字段：

> 默认忽略，但不要导致整个 Import 失败。

必须检查：

```text
真实样本
真实字段
真实编码
真实日期格式
真实 URL
真实标签结构
```

不要仅根据网上看到的示例 JSON 就实现最终解析器。

---

## 12.2 Pocket Import Mapping

根据真实输入决定映射。

至少尝试建立：

```text
title
url
author
excerpt
published / saved time
tags
favorite
read / unread
```

但是：

> **只有真实输入中存在并确认语义后，才能映射。**

不得把：

```text
猜测
```

写成：

```text
事实
```

---

## 12.3 Pocket Content 策略

如果 Pocket 导出只包含：

```text
URL
metadata
```

而没有完整正文：

> 不要擅自偷偷抓取网页替代 Import。

M5 的 Import 和 M4 的网络 Capture 必须是两个明确动作。

可以：

```text
导入 URL
```

但是不能未经用户明确操作：

```text
导入 Pocket
→ 自动抓取数千个网页
→ 产生巨大网络请求
```

这样会带来：

```text
性能
隐私
网络风险
服务端压力
失败率
法律 / 合规风险
```

Import 本身应该首先忠实导入：

```text
Pocket 导出文件中真正存在的数据
```

---

# 十三、Wallabag Import

实现：

```text
Wallabag Import
```

同样：

> 优先针对用户导出的本地文件。

不要让 M5 变成：

```text
Wallabag account synchronization
```

---

# 十四、Wallabag Import 原则

先检查项目真实导出样本。

不要假定只有一种格式。

建立：

```text
Format Detection
```

能够识别当前实际支持的输入格式。

解析阶段关注：

```text
id
url
title
content
author
created
updated
tags
starred
archived
```

实际字段必须以：

```text
真实样本
+
官方格式说明
```

为准。

不要凭字段名称直接假设语义。

---

# 十五、Wallabag 内容导入

Wallabag 的一个重要特点是：

> 有可能拥有已经保存的正文内容。

因此：

```text
有正文
```

时优先保留。

如果同时存在：

```text
原始 URL
正文
metadata
```

应尽可能形成：

```text
Document
+
Source metadata
```

而不是只把 URL 丢进 Inbox。

---

# 十六、Raindrop Import

实现：

```text
Raindrop Import
```

仍然优先使用：

```text
用户实际导出的文件
```

而不是在线账号授权。

---

# 十七、Raindrop Import Mapping

根据真实样本检查：

```text
title
url
excerpt
note
tags
collection
favorite
created
lastUpdate
```

或者实际存在的等价字段。

必须采用：

```text
Real Sample First
```

原则。

不要写死：

```text
某个猜测中的 JSON schema
```

然后假设所有用户导出文件完全一致。

---

# 十八、Collection / Folder / Tag 映射

外部系统可能有：

```text
Collection
Folder
Tag
List
State
Favorite
```

Reverie 当前已有：

```text
Tags
Inbox
Favorite
Read / Unread
```

不要直接照搬外部信息架构。

应该建立明确 Mapping：

```text
External Collection
        ↓
Reverie Tag
```

或：

```text
External Collection
        ↓
Import Metadata
```

具体方案以当前 M3 数据模型为准。

重点：

> 不要为了兼容三个外部系统，把 Reverie 的数据模型变成外部系统的合集。

---

# 十九、外部状态映射

外部系统的：

```text
read
archive
favorite
starred
unread
```

可能语义不同。

必须明确记录：

```text
External State
        ↓
Normalized State
        ↓
Reverie State
```

不得因为字段名字一样就直接映射。

尤其注意：

```text
Archive
≠
Read
```

```text
Favorite
≠
Tag
```

不要偷偷混淆。

---

# 二十、统一 Duplicate / Identity 策略

M5 必须复用 M3 / M4 已经建立的 Identity / Dedup 能力。

不要为：

```text
Pocket
Wallabag
Raindrop
```

各自创造完全不同的重复判断。

推荐顺序：

```text
1. External Stable ID
2. Canonical URL
3. Normalized URL
4. Strong Content Identity
5. 其他明确可验证身份
```

必须保持保守。

尤其禁止：

```text
Title 相同
→ 判定为同一文章
```

标题相同只能：

```text
Potential Duplicate
```

不能直接合并。

---

# 二十一、跨来源重复

必须考虑：

```text
Pocket
Wallabag
Raindrop
RSS
Manual Web Capture
```

可能保存的是同一篇文章。

例如：

```text
Pocket → A
RSS    → B
Manual → C
```

三条记录可能都是：

```text
同一个 canonical URL
```

M5 应尽量复用现有 Identity 机制，避免：

```text
同一文章
三份完全独立 Document
```

但不要激进自动合并。

正确原则：

> **宁可保留两个疑似重复，也不要错误地吞掉用户两份不同资料。**

---

# 二十二、冲突处理

如果导入项与现有 Document 疑似冲突，至少能够区分：

```text
New
Existing
Potential Duplicate
Update Candidate
Conflict
```

不要默认：

```text
外部数据覆盖本地数据
```

尤其不得覆盖：

```text
Highlight
Note
Bookmark
Favorite
Tags
Read State
Inbox State
Progress
```

除非有明确、可验证的更新语义。

---

# 二十三、用户数据保护原则

这是 M5 最重要的要求之一。

任何 Import 都不得默认：

```text
覆盖用户已有资料
删除用户已有资料
删除用户 Annotation
重置用户 Read State
重置 Favorite
重置 Tags
```

导入动作应该尽可能满足：

```text
Import
+
Existing User Data
→
Merge Safely
```

而不是：

```text
Import
→
Replace
```

---

# 二十四、Import 的原子性

单条 Document 的写入应该采用：

```text
temp
↓
flush
↓
validate
↓
atomic rename
```

整个批量 Import 允许：

```text
部分成功
```

但每一个已经报告为：

```text
Imported Successfully
```

的 Document 必须是完整有效的。

不能产生：

```text
meta.json 写了一半
article.md 不存在
annotations.jsonl 损坏
```

这种半成品。

---

# 二十五、Import 失败恢复

例如：

```text
导入 1000 条
```

第：

```text
537
```

条失败。

系统不能因为单个坏数据就导致：

```text
前 536 条全部丢失
```

也不能：

```text
537 失败
538~1000 状态不明确
```

最终必须能够报告：

```text
Successful
Skipped
Duplicate
Failed
```

并且结果可解释。

---

# 二十六、Export 总原则

Export 的目标：

> **让用户随时把自己的资料拿回来。**

Export 不应该依赖：

```text
第三方服务器
在线账户
Reverie 云服务
SQLite 单点
```

---

# 二十七、Export Source

导出数据时：

> **优先从 Reverie 正式文件读取。**

不要设计为：

```text
SQLite
    ↓
Export
```

而应该：

```text
Library Files
    ↓
Document Loader
    ↓
Export Model
    ↓
Exporter
```

这样可以确保：

```text
SQLite 被删除
```

不会让：

```text
Export
```

失效。

---

# 二十八、Export 必须支持选择范围

至少考虑：

```text
Current Document
Selected Documents
Current Search Results
Current Filter
Entire Library
```

如果当前 M3/M4 已经存在：

```text
Selection
Filter
Search Result Set
```

优先复用，不要重新创建第二套选择系统。

---

# 二十九、Markdown Export

实现：

```text
Markdown Export
```

这是 M5 最重要的通用可迁移格式之一。

推荐：

```text
Document
    ↓
Markdown
+
Metadata
+
Annotations
```

不要让导出后的 Markdown 只能被 Reverie 自己读取。

---

# 三十、Markdown Export 原则

基础文章应尽可能生成：

```text
Title
Author
Source
Original URL
Published / Captured Time
Body
```

可以使用 front matter：

```yaml
---
title: ...
author: ...
source_url: ...
document_id: ...
captured_at: ...
---
```

但：

> 不要为了导出而创造过于复杂的专用 Markdown 方言。

优先：

```text
普通 Markdown
```

能够被：

```text
VS Code
Typora
Obsidian
任意文本编辑器
Git
```

等常见工具正常读取。

---

# 三十一、Annotation Export

如果 Document 有：

```text
Highlight
Note
Bookmark
```

Markdown Export 可以采用：

```text
正文
+
Annotations section
```

或者：

```text
独立 annotations 文件
```

具体方式根据当前 FORMAT 设计决定。

重点：

> **不要让 Highlight / Note 因为导出而丢失。**

---

# 三十二、Metadata Export

实现：

```text
Metadata Export
```

可以提供：

```text
JSON
CSV
```

等适合机器处理的格式。

最终具体格式根据项目实际需要确定。

至少能够导出：

```text
document_id
document_type
title
author
source
url
created_at
captured_at
updated_at
tags
favorite
read_state
inbox_state
feed/source metadata
annotation counts
```

注意：

> metadata export 是结构化迁移数据。

不要把：

```text
HTML
全文正文
图片
```

全部塞进一个 CSV。

---

# 三十三、Highlight Export

实现独立：

```text
Highlight Export
```

用户应该能够只导出自己的：

```text
Highlights
Notes
```

建议输出至少包括：

```text
document_id
document_title
quoted_text
note
tags
created_at
source_url
annotation_id
```

并尽量保留：

```text
locator
context
status
```

这样未来即使脱离 Reverie，用户仍然拥有自己的阅读笔记档案。

---

# 三十四、EPUB Export

M5 必须提供：

```text
EPUB Export
```

但是必须明确边界：

> **这是 M5 的基础迁移型 EPUB Export，不是 M9 的 Aurora / 高级 Web→EPUB 系统。**

M5 不需要解决：

```text
EPUB Reader
EPUB Pagination
复杂 EPUB CSS
复杂 Typography
高级目录交互
高级主题
动态版式
阅读器同步
Aurora UI
```

M5 的目标是：

```text
Document
    ↓
合法 EPUB Container
    ↓
标准 XHTML
    ↓
metadata
    ↓
TOC / navigation
    ↓
CSS
    ↓
EPUB 文件
```

至少确保：

```text
输出文件结构正确
ZIP container 正确
mimetype 正确
container.xml 正确
package metadata 正确
content document 可读
navigation 可用
```

具体 EPUB writer/library 选择必须先检查：

```text
现有依赖
许可证
兼容性
实际生成结果
```

不要为了 EPUB Export 随意引入大型库。

---

# 三十五、M5 EPUB Export 与 M6 的边界

M6：

```text
EPUB → Reader
```

M5：

```text
Document → EPUB
```

因此 M5 不得反过来为了 Export：

```text
提前建立 EPUB Reader Model
提前建立 EPUB Selection Model
提前建立 EPUB Anchor Adapter
```

Export 只需要：

```text
Export Model
```

必要时创建：

```text
EpubExportDocument
```

但不能让底层 EPUB 库的对象污染 Reverie 核心层。

---

# 三十六、M5 EPUB Export 的数据来源

如果来源是：

```text
Web Article
```

则基础版本可以：

```text
文章标题
作者
正文
来源 URL
发布时间
标签
```

构成 EPUB。

如果来源是：

```text
RSS Article
```

同理。

如果当前 Document 不适合转 EPUB：

```text
明确报告 unsupported
```

不要：

```text
强行生成损坏文件
```

---

# 三十七、Export 不得破坏原文

导出流程必须严格遵守：

```text
Read
↓
Transform
↓
Write New Files
```

而不能：

```text
Read Original
↓
Rewrite Original
↓
Export
```

原始：

```text
article.md
meta.json
annotations.jsonl
source/
assets/
```

都不得因为 Export 被修改。

除非：

> 用户明确执行的是另一个“修改原始资料”的动作。

---

# 三十八、Export 的临时文件策略

推荐：

```text
exports/
    .staging/
```

流程：

```text
Prepare
↓
Write Temp
↓
Validate
↓
Complete
↓
Atomic Move
```

例如：

```text
article.epub.tmp
```

验证成功后才成为：

```text
article.epub
```

不要让用户看到：

```text
Export Complete
```

但文件其实：

```text
只有一半
```

---

# 三十九、Export 失败不能污染结果目录

如果：

```text
EPUB generation failed
```

不能留下：

```text
broken.epub
broken.epub.tmp
broken-partial.zip
```

至少需要有明确 cleanup 策略。

对于需要保留调试信息的情况：

```text
日志进入 AppData
```

而不是污染用户资料目录。

---

# 四十、Export 完成校验

每一种 Export 都至少执行：

```text
Exists
Readable
Non-empty
Format Valid
Metadata Valid
```

EPUB 还应该验证：

```text
ZIP Valid
mimetype Valid
container.xml Valid
OPF Valid
Navigation Valid
XHTML Valid
```

Markdown 至少检查：

```text
Encoding
Readable
Required Metadata
Body presence
```

JSON / CSV 至少检查：

```text
Encoding
Syntax
Required Columns / Fields
```

---

# 四十一、Export 与 Annotation

导出时必须特别注意：

```text
Annotation
```

不能因为：

```text
Export
```

改变原来的：

```text
resolved
orphaned
```

状态。

也不能为了让导出更漂亮：

```text
自动修复 Annotation
```

导出应该是：

> **读取当前状态。**

而不是：

> **改变当前状态。**

---

# 四十二、Daily Review

实现：

```text
Daily Review
```

核心目标：

> **每天用很低的成本重新遇见一些自己真正保存过、看过或标注过的内容。**

基本流程：

```text
进入 Daily Review
        ↓
生成 Review Queue
        ↓
显示一项
        ↓
阅读 / 查看 Highlight / Note
        ↓
进入原文
        ↓
Next
        ↓
完成本次 Review
```

---

# 四十三、Daily Review 内容来源

至少考虑：

```text
Highlight
Note
Saved Article
Recently Saved
Older Saved Article
Unread Article
```

具体来源必须与当前：

```text
Library
Annotation
Read State
Inbox
Recent
```

复用。

不要重新创造第二个：

```text
Review Database
```

---

# 四十四、Daily Review 策略

最初版本保持简单。

推荐至少支持：

```text
Mixed
Highlights
Notes
Saved Articles
Unread
Older Articles
```

也可以加入：

```text
Random
Recent
Older
```

但：

> 不要一开始就实现复杂推荐算法。

---

# 四十五、Daily Review 数量

允许用户设置：

```text
N items
```

例如：

```text
5
10
20
```

具体默认值根据当前 UX 决定。

不要强制：

```text
每天必须完成
```

不要引入：

```text
连续签到
Streak
XP
Level
Badge
Achievement
排行榜
```

Reverie 不是游戏。

---

# 四十六、Daily Review 不应该污染 Read State

尤其注意：

用户在：

```text
Daily Review
```

中看到文章：

不能因为：

```text
Review Open
```

就偷偷修改：

```text
Read
```

不能默认：

```text
Review = Read
```

也不要修改：

```text
Favorite
Tags
Inbox
```

除非用户明确执行对应操作。

---

# 四十七、Daily Review History

需要能够知道：

```text
某项 Review 是否已经看过
```

但这里必须谨慎。

Review History 是：

```text
derived user state
```

不是正文。

可以使用：

```text
review-state.json
```

或者复用当前已有：

```text
state.json
```

具体采用哪一种必须以当前 M3/M4 实际设计为准。

不要重复创造：

```text
五种 state.json
```

---

# 四十八、Daily Review 与 Highlight

这是 Reverie 非常重要的一条体验链：

```text
曾经阅读
    ↓
Highlight
    ↓
Note
    ↓
未来某天重新遇见
    ↓
Review
    ↓
重新进入原文
```

Review 页面应该能够显示：

```text
Highlight
作者
文章标题
来源
原文上下文
Note
```

然后：

```text
Open Article
```

直接进入 Reader。

---

# 四十九、Review Queue 生成原则

不要在 UI 中：

```text
看到一个项目
→ 临时随机
→ 下一个又随机
→ 每次刷新完全不同
```

否则会产生：

```text
重复
跳过
顺序不可解释
无法测试
```

建议：

```text
Generate Queue
    ↓
固定本次 Session
    ↓
依次消费
```

这样：

```text
当前 Review Session
```

内结果稳定。

---

# 五十、Review 随机数

如果 Daily Review 需要随机：

> 使用 Reverie 已有的 RNG / deterministic random 基础设施。

不要：

```text
系统随机
一套随机
UI 随机
数据库随机
```

到处散落。

如果当前项目没有必要的 RNG 抽象：

> 使用最简单、可测试的实现。

关键是：

```text
可测试
可复现
```

而不是“随机算法很高级”。

---

# 五十一、跨 Import 的 Annotation 处理

如果外部来源有：

```text
Highlight
Note
```

必须尽量映射进：

```text
Reverie Annotation Core
```

不要建立：

```text
PocketHighlight
WallabagHighlight
RaindropHighlight
```

三套永久系统。

目标：

```text
External Annotation
        ↓
Normalized Annotation
        ↓
Reverie Annotation Core
```

---

# 五十二、外部 Note 的语义

注意：

```text
Highlight
```

和：

```text
Note
```

可能不是一回事。

如果外部系统只有：

```text
Note
```

不要强行生成一个：

```text
Highlight
```

除非外部数据明确提供了被标注文本。

正确原则：

```text
语义保持优先
```

而不是：

```text
字段看起来相似就强制转换
```

---

# 五十三、Annotation Anchor 与 Import

如果外部系统提供：

```text
选中文本
```

但没有完整 Anchor：

仍然可以：

```text
QuotedText
+
Context
```

导入。

但是不要制造：

```text
假的 position
假的 CFI
假的 DOM path
```

宁可：

```text
locator = null
status = unresolved / orphaned
```

也不要保存不可信定位。

---

# 五十四、导入后的 Annotation 状态

按照 M2 原则：

```text
不能定位
≠
删除
```

因此：

```text
Imported Highlight
```

如果没有可靠 Anchor：

```text
保留
```

并允许：

```text
orphaned / unresolved
```

之后重新解析。

---

# 五十五、Import → Search

Import 成功后：

```text
Document
```

必须进入现有：

```text
M3 Search Index
```

不要建立：

```text
PocketSearch
WallabagSearch
RaindropSearch
```

所有导入数据应该统一进入：

```text
SearchableDocument
```

---

# 五十六、Import → Library

导入的数据必须直接成为：

```text
Reverie Document
```

而不是：

```text
ImportedItem
```

永久停留在系统中。

`ImportedItem` 可以是：

```text
Import Pipeline 中间态
```

但一旦成功：

```text
Imported Document
→
Generic Document
```

---

# 五十七、Import → Reader

如果导入的数据有完整正文：

```text
Import
↓
Document
↓
Reader
```

必须可读。

如果只有：

```text
URL
```

则明确显示：

```text
Content not locally available
```

而不是伪装成：

```text
完整离线文章
```

可以允许用户后续通过现有：

```text
Web Capture
```

流程手动处理。

---

# 五十八、Import 与原始外部文件

必须始终保留：

```text
原始 Import 文件
```

至少：

```text
不修改
不删除
不覆盖
```

Reverie 可以读取：

```text
Pocket export.json
Wallabag export.json
Raindrop export.csv/json
```

然后产生自己的 Library 文件。

绝不能：

```text
导入成功
→ 修改用户原始导出文件
```

---

# 五十九、Import 备份原则

在执行任何可能影响现有 Library 的批量操作前：

必须评估：

```text
是否真的需要备份
```

如果现有文件操作已经具备：

```text
atomic write
non-destructive merge
```

不要为了“安全”制造巨大自动备份副本。

但对于：

```text
可能覆盖已有 Document
批量 migration
schema migration
```

必须提供明确的安全机制。

---

# 六十、Import Conflict Policy

如果外部资料与本地资料存在差异：

```text
Local
External
```

不要默认：

```text
Last Write Wins
```

也不要默认：

```text
External Wins
```

除非语义非常明确。

优先：

```text
Preserve Local User Data
+
Merge Non-conflicting Metadata
```

尤其保护：

```text
Note
Highlight
Tags
Favorite
Read State
Bookmark
Progress
```

---

# 六十一、Import Schema Version

所有内部生成的：

```text
meta.json
annotations.jsonl
state.json
```

继续遵守：

```text
format_version
```

外部格式不应该污染 Reverie 内部格式。

也就是说：

```text
Pocket schema
```

不能成为：

```text
Reverie schema
```

---

# 六十二、Migration / Versioning

M5 是一个非常适合建立：

```text
Import / Export compatibility
```

意识的阶段。

至少检查：

```text
旧 Reverie 文件
新 Reverie 文件
```

是否能够：

```text
Read
Index
Export
```

不要因为 M5 顺手改变数据格式而让 M1~M4 数据失效。

如果确实需要修改：

```text
建立 migration
```

并记录到：

```text
DECISIONS.md
```

---

# 六十三、M5 的 Data Contract

在开始大量实现之前，必须检查：

```text
Document
Source
Metadata
Annotation
User State
Tag
Library
Index
```

之间的数据边界。

推荐概念：

```text
ExternalImportRecord
        ↓
NormalizedDocument
        ↓
DocumentWriter
```

以及：

```text
Document
+
Annotation
+
UserState
        ↓
ExportDocumentModel
```

但不要为了形式而建立几十个 DTO。

：

> **只抽象真正稳定的边界。**

---

# 六十四、不要让 Exporter 依赖 UI

禁止：

```text
Markdown Exporter
    ↓
读取 LibraryPanel
```

禁止：

```text
EPUB Exporter
    ↓
读取 Reader UI
```

应该：

```text
Exporter
    ↓
Domain / Application Service
```

---

# 六十五、不要让 Importer 依赖 UI

禁止：

```text
PocketImporter
    ↓
直接调用 UI
```

应该：

```text
Import Service
    ↓
Domain
```

UI 只是：

```text
开始 Import
显示 Preview
显示结果
```

---

# 六十六、不要把 Import 状态写入业务数据

例如：

```text
importing=true
import_phase=3
```

不要随意写进每一个 Document 的：

```text
meta.json
```

Import Session 应该和 Document 生命周期分离。

这样：

```text
Import 失败
```

不会留下大量：

```text
importing=true
```

垃圾状态。

---

# 六十七、性能目标

必须真实测试。

至少测试：

```text
100 items
1000 items
5000 items
```

如果测试环境允许：

```text
10000 items
```

更好。

测试：

```text
Parse
Normalize
Validate
Dedup
Write
Index
```

分别记录实际数据。

Export 也要测：

```text
100 documents
1000 documents
```

至少知道：

```text
导入耗时
写入耗时
索引耗时
导出耗时
峰值内存
```

不要伪造：

```text
<10ms
```

之类数据。

---

# 六十八、Import 性能原则

禁止：

```text
每导入 1 条
→ 重建整个 Search Index
```

应该尽量：

```text
Import Batch
    ↓
Write Documents
    ↓
Batch Index Update
```

如果当前 M3 Index API 无法支持批量更新：

优先小范围补强现有 Index API，而不是重新写一套索引系统。

---

# 六十九、Export 性能原则

大批量导出不要：

```text
一次性把整个 Library
全部载入内存
```

如果数据规模足够大：

```text
streaming
batching
incremental write
```

应根据实际需要采用。

不要为了“未来 50000 本书”提前制造复杂架构。

---

# 七十、Security

M5 处理：

```text
外部文件
文件名
路径
HTML
Markdown
JSON
CSV
EPUB output
```

所以必须继续将外部输入视为：

> **Untrusted Input**

---

# 七十一、路径安全

任何 Import 文件：

```text
文件名
目录名
metadata 中的名称
```

都不能直接构造成任意路径。

防止：

```text
../
..\ 
绝对路径
UNC path
特殊设备路径
```

导入时必须将目标限制在：

```text
Reverie Library
```

合法目录内。

---

# 七十二、文件名安全

例如：

```text
title = ../../evil
```

不能变成：

```text
Library/../../evil
```

必须使用：

```text
safe filename / generated id
```

推荐：

> **Document ID 作为目录和文件稳定身份。**

Title 只用于：

```text
display name
```

而不是作为安全边界。

---

# 七十三、资源限制

Import 面对恶意或异常输入时，应有限制：

```text
最大文件大小
最大条目数量
最大字符串长度
最大嵌套深度
最大附件数
最大单项大小
```

特别是：

```text
EPUB Export
```

虽然输入是 Reverie 自己的数据，也不能忽略：

```text
极大文章
极大 metadata
极大 annotation
```

导致：

```text
OOM
```

---

# 七十四、CSV / JSON 容错

外部数据可能出现：

```text
BOM
UTF-8
UTF-16
CRLF
LF
null
empty
unexpected type
unknown fields
duplicate fields
invalid date
invalid URL
```

必须通过测试。

不要把：

```text
某个简单测试 JSON
```

当成完整现实世界格式。

---

# 七十五、Unicode

M5 必须特别验证：

```text
中文
英文
日文
emoji
特殊符号
组合字符
阿拉伯数字
全角字符
混合语言
```

同时验证：

```text
Title
Author
Tag
Highlight
Note
Filename
Markdown
Metadata
```

均不会出现：

```text
乱码
截断
错误编码
```

---

# 七十六、URL 处理

继续复用 M4 已有：

```text
URL normalization
Canonical URL
Identity
```

不要在 Import 又定义第二套。

特别注意：

```text
tracking parameters
fragment
query parameters
redirect
www / non-www
http / https
```

不能因为“看起来一样”就激进合并。

---

# 七十七、External URL 与 Web Capture

对于：

```text
Pocket URL
Wallabag URL
Raindrop URL
```

如果当前系统已有 Web Capture，可以提供：

```text
Import URL
```

和：

```text
Capture Full Article
```

作为两个不同操作。

不要隐式混为：

```text
Import automatically triggers network crawler
```

---

# 七十八、M5 文档

至少新增：

```text
docs/M5-STATUS.md
docs/IMPORT.md
docs/EXPORT.md
docs/MIGRATION.md
docs/DAILY-REVIEW.md
```

必要时更新：

```text
docs/FORMAT.md
docs/LIBRARY.md
docs/SEARCH.md
docs/USER-STATE.md
docs/DECISIONS.md
docs/PROGRESS.md
```

---

# 七十九、IMPORT.md 至少说明

```text
Supported Sources
Supported Input Formats
Detection
Normalization
Identity
Deduplication
Field Mapping
State Mapping
Annotation Mapping
Provenance
Conflict Policy
Error Handling
Partial Failure
Idempotency
Security
Limitations
```

必须能够让未来开发者回答：

> “同一个外部文件第二次导入会发生什么？”

---

# 八十、EXPORT.md 至少说明

```text
Supported Export Formats
Export Scope
Document Mapping
Metadata Mapping
Annotation Mapping
EPUB Structure
Markdown Structure
File Naming
Atomic Write
Validation
Failure Handling
Large Library Behavior
Limitations
```

---

# 八十一、MIGRATION.md

建立：

```text
Import
→
Normalize
→
Validate
→
Write
→
Index
```

和：

```text
Library
→
Export
```

的完整数据流。

还要说明：

```text
哪些数据一定保留
哪些数据可能丢失
哪些数据需要用户确认
哪些外部字段没有对应 Reverie 字段
```

这是非常重要的。

---

# 八十二、数据丢失透明原则

这是 M5 的关键原则：

> **不要假装“100% 保留”。**

例如外部服务存在：

```text
Reverie 没有对应字段
```

那么必须：

```text
明确记录
```

而不是：

```text
静默丢弃
```

最终报告应该区分：

```text
Preserved
Transformed
Unsupported
Dropped
Failed
```

---

# 八十三、Import Result Report

每次导入结束必须输出：

```text
Source
Input File
Total
Created
Updated
Skipped
Duplicate
Failed
Warnings
Duration
```

最好还能提供：

```text
Open Report
```

查看每条失败记录。

---

# 八十四、Export Result Report

导出完成后：

```text
Target
Documents
Files
Skipped
Failed
Duration
Output Size
```

对于失败：

```text
Document
Exporter
Error
```

必须可追踪。

---

# 八十五、测试矩阵

必须建立真实 Fixture。

建议：

```text
tests/fixtures/import/
├─ pocket/
├─ wallabag/
└─ raindrop/
```

每种来源至少：

```text
minimal
normal
large
malformed
unicode
missing-fields
duplicates
```

---

# 八十六、必须测试的 Import 情况

至少：

```text
正常文件
空文件
空数组
一个 item
100 items
1000 items

缺 title
缺 URL
缺 author
缺 tags
缺 date

未知字段
null
错误类型
错误日期
错误 URL

重复导入
部分重复
跨来源重复
```

还需要：

```text
文件被占用
无权限
磁盘空间不足
目标目录不存在
导入中途取消
```

---

# 八十七、必须测试的 Export 情况

至少：

```text
单篇
10 篇
100 篇
1000 篇

有 Highlight
有 Note
有 Bookmark
有 Tag
无 Metadata
无 Author
无 URL
中文
英文
混合语言

orphaned Annotation
large body
large annotation count
```

---

# 八十八、Export Round-trip

非常重要。

对于：

```text
Markdown
```

至少尝试：

```text
Reverie
↓
Markdown Export
↓
重新 Import / Parse
↓
Compare
```

确认：

```text
Title
Body
Metadata
```

核心信息不会无故损坏。

---

# 八十九、EPUB Export Validation

M5 不要求：

```text
Reverie → EPUB → M6 Reader
```

因为 M6 可能尚未完成。

但是应该使用：

```text
标准 EPUB 校验方式
```

验证输出结构。

如果环境允许：

```text
实际使用兼容 EPUB 阅读器打开
```

至少证明：

```text
可打开
可读取
目录基本正常
内容没有明显损坏
```

如果没有工具：

> 说明实际限制，不要声称验证过。

---

# 九十、Import Idempotency Test

必须成为独立测试。

例如：

```text
Import A
Import A
Import A
```

最终检查：

```text
Document Count
Annotation Count
Tag Count
State
```

不得无限膨胀。

---

# 九十一、Index Failure Test

模拟：

```text
Import
↓
File Write Success
↓
Index Update Failed
```

必须保证：

```text
User File = 正确
```

之后：

```text
Rebuild Index
```

能够恢复：

```text
Imported Document
Metadata
Tags
State
Annotation
```

---

# 九十二、Export Failure Test

模拟：

```text
Export started
↓
Write failed
```

确认：

```text
Original Library
```

完全不受影响。

---

# 九十三、Cancellation Test

Import / Export 都必须支持合理取消。

例如：

```text
Import 10000 items
```

用户：

```text
Cancel
```

系统不能进入：

```text
不可恢复半导入状态
```

取消后应输出：

```text
Completed
Cancelled
Failed
```

明确状态。

---

# 九十四、Concurrency

防止：

```text
同时启动两个 Import
```

或者：

```text
Import
+
Rebuild Index
+
Export
```

产生：

```text
文件竞争
覆盖
重复
索引损坏
```

至少定义合法的并发策略。

最简单可靠的方案通常优于复杂并发系统。

---

# 九十五、文件锁与进程重启

测试：

```text
Import 正在进行
→ 应用关闭
→ 重新启动
```

确认不会留下：

```text
永久 importing state
```

并且可以：

```text
detect
recover
cleanup
retry
```

---

# 九十六、Daily Review 测试

至少测试：

```text
无 Highlight
无 Note
无 Article
只有 1 项
只有 5 项
大量资料
混合来源
存在 orphaned Annotation
存在 deleted / missing Document
```

Review Queue 不应该因为一个坏项目导致：

```text
整个 Review 崩溃
```

---

# 九十七、Daily Review 与删除数据

如果 Review Queue 创建后：

```text
Document 被删除
```

必须：

```text
跳过 / 标记失效
```

而不是：

```text
整个 Review Session 崩溃
```

---

# 九十八、Daily Review 与重复

同一 Session 中不能：

```text
同一个 Highlight
重复出现多次
```

除非当前策略明确允许。

应该有明确规则：

```text
Document Identity
+
Annotation Identity
```

---

# 九十九、Review Strategy 不要过度设计

M5 只需要：

```text
可用
稳定
简单
可测试
```

不要做：

```text
机器学习推荐
复杂权重模型
AI 推荐
知识图谱
行为预测
```

这些完全不是 M5 的目标。

---

# 一百、UI

M5 UI 应尽量复用已有：

```text
Library
Search
Reader
Dialog
Toast
Progress
```

不要为 Import：

```text
重新造一套窗口框架
```

---

# 一百零一、Import UI 基础体验

至少：

```text
Choose File
↓
Detect Format
↓
Preview
↓
Import
↓
Progress
↓
Result
```

对于批量导入：

```text
Current
Total
Success
Skipped
Failed
```

应该可见。

---

# 一百零二、Export UI 基础体验

至少：

```text
Choose Scope
↓
Choose Format
↓
Choose Destination
↓
Export
↓
Validate
↓
Result
```

不要让：

```text
Export
```

直接覆盖已有目标目录而不提示。

---

# 一百零三、Daily Review UI

建议保持极简：

```text
Daily Review

[Highlight / Note / Article]

Title
Source
Context
Note

Open Article

[Previous]
[Next]
```

核心是：

> **重新阅读，而不是玩任务系统。**

---

# 一百零四、用户选择与状态

M3 已经建立的：

```text
Favorite
Read / Unread
Inbox
Tags
```

必须继续复用。

导入过程中要避免：

```text
Favorite → Tag
Read → Inbox remove
Archive → Read
```

这种未经确认的语义替换。

---

# 一百零五、数据库仍然只是索引

M5 完成后必须验证：

```text
删除 index.db
↓
重新扫描 Library
↓
Rebuild
```

然后：

```text
Import Documents
Tags
State
Annotations
Review-related data
```

至少核心信息仍然存在。

---

# 一百零六、Import/Export 不允许依赖网络

核心 M5 流程：

```text
Pocket Import
Wallabag Import
Raindrop Import
Markdown Export
Metadata Export
Highlight Export
EPUB Export
```

默认都应该：

```text
offline-capable
```

即：

> 本地已有输入文件即可完成主要操作。

不要让：

```text
Export
```

突然需要联网。

也不要让：

```text
Import
```

默认调用外部服务。

---

# 一百零七、依赖管理

本阶段可能需要：

```text
JSON parser
CSV parser
EPUB writer
```

但必须优先检查：

```text
项目已有依赖
```

不要重复引入功能相同的库。

新依赖必须评估：

```text
License
Maintenance
Size
Security
API Stability
Windows Compatibility
```

尤其是：

```text
EPUB Writer
```

不要仅因为“写起来方便”就引入一个巨大框架。

---

# 一百零八、许可证与第三方代码

对于每一个新增依赖：

记录：

```text
Package
Version
Purpose
License
Used By
```

更新：

```text
docs/DECISIONS.md
```

如果项目已经有：

```text
DEPENDENCIES.md
```

优先复用。

---

# 一百零九、禁止为了 M5 进行架构炫技

不要因为 Import / Export 就创建：

```text
IImportStrategyFactoryFactory
IExportPipelineResolver
IReviewRecommendationPolicyProvider
```

类似过度抽象。

实际需要一个：

```text
IPortableImporter
```

就够了。

实际需要：

```text
IExporter
```

就够了。

重点：

> **边界清晰，而不是接口数量多。**

---

# 一百一十、建议的代码边界

如果当前仓库结构允许，可以形成：

```text
Reverie
├─ ImportExport
│  ├─ Core
│  ├─ Import
│  │  ├─ Pocket
│  │  ├─ Wallabag
│  │  └─ Raindrop
│  └─ Export
│     ├─ Markdown
│     ├─ EPUB
│     ├─ Metadata
│     └─ Highlights
│
├─ Review
│
├─ Library
├─ Reader
├─ Annotation
├─ Search
├─ Feed
└─ Infrastructure
```

但是：

> 这不是要求必须照搬目录。

优先复用当前真实代码结构。

---

# 一百十一、Domain Boundary

外部格式类型不得泄漏到 Reverie Core。

禁止：

```text
PocketJsonItem
```

出现在：

```text
Document
Library
Reader
Search
```

等核心领域代码中。

应该：

```text
PocketJsonItem
    ↓
PocketNormalizer
    ↓
NormalizedDocument
    ↓
Document
```

同样：

```text
RaindropRecord
```

不能直接作为：

```text
Generic Document
```

---

# 一百十二、Export Domain Boundary

同理：

```text
Document
    ↓
ExportModel
    ↓
MarkdownExporter
```

或：

```text
Document
    ↓
ExportModel
    ↓
EpubExporter
```

而不是：

```text
Document
    ↓
直接调用 EPUB library API
```

---

# 一百十三、M5 Acceptance Gate

M5 完成前必须满足：

```text
[ ] Pocket Import 可用
[ ] Wallabag Import 可用
[ ] Raindrop Import 可用

[ ] Import Preview 可用
[ ] Import Report 可用
[ ] Import Error Handling 可用
[ ] Import Idempotency 已验证
[ ] Duplicate Handling 已验证
[ ] Provenance 已保存

[ ] Markdown Export 可用
[ ] Metadata Export 可用
[ ] Highlight Export 可用
[ ] 基础 EPUB Export 可用

[ ] Export 不修改原始资料
[ ] Export 文件经过基本格式验证
[ ] Export 失败不会破坏 Library

[ ] Daily Review 可用
[ ] Review Queue 可用
[ ] Review State 可用
[ ] Review 不偷偷修改 Read State

[ ] Import 数据进入 Library
[ ] Import 数据进入 Search
[ ] Import 数据进入 Reader
[ ] Annotation 正确进入 M2 Core

[ ] SQLite 删除后可重建
[ ] Import 后仍可重建
[ ] Export 不依赖 SQLite 单点

[ ] 真实 Fixture 已建立
[ ] Unit Tests
[ ] Integration Tests
[ ] E2E Tests
[ ] Failure Tests
[ ] Cancellation Tests
[ ] Performance Tests

[ ] docs 更新
[ ] PROGRESS 更新
[ ] DECISIONS 更新

[ ] 无 P0
[ ] 无未解释 P1
```

---

# 一百十四、P0 / P1 / P2 / P3

继续采用：

```text
P0
数据丢失 / 数据损坏 / 安全漏洞 / 核心 Import 或 Export 不可靠

P1
主要功能无法完成
严重兼容性问题
严重重复 / 错误覆盖
无法恢复的批量操作问题

P2
明显 UX 问题
非关键兼容性问题
性能问题但有合理规模限制

P3
增强
视觉优化
便利功能
未来可能改进
```

不要因为：

```text
“未来可能扩展”
```

直接判：

```text
P1
```

---

# 一百十五、FACT / HYPOTHESIS / INFERENCE

M5 最终报告必须明确区分。

## FACT

代码和测试已经证明：

```text
Pocket 支持哪些真实格式
Wallabag 支持哪些真实格式
Raindrop 支持哪些真实格式
字段映射是什么
Duplicate 怎么判断
Export 产生什么
Daily Review 如何工作
性能是多少
```

## HYPOTHESIS

例如：

```text
某个罕见的外部导出格式未来可能仍有兼容性问题
```

但当前尚未验证。

## INFERENCE

例如：

```text
根据当前 benchmark，5000 条资料导入已开始受磁盘 I/O 影响
```

这是根据事实推导。

不得把：

```text
猜测
```

写成：

```text
事实。
```

---

# 一百十六、真实样本优先

这是 M5 的特殊要求。

对：

```text
Pocket
Wallabag
Raindrop
```

不要只依赖：

```text
博客文章
Stack Overflow 示例
旧 GitHub 示例
AI 生成 schema
```

优先：

```text
真实用户导出文件
+
官方格式说明
+
测试 fixture
```

如果当前环境没有真实样本：

> 先建立最小 fixture，并明确标记为“人工构造测试样本”，不要声称覆盖了真实世界全部格式。

---

# 一百十七、M5 的总体测试矩阵

至少包含：

```text
            Import        Export       Review
------------------------------------------------
Normal         ✓             ✓            ✓
Empty          ✓             ✓            ✓
Large          ✓             ✓            ✓
Malformed      ✓             ✓            ✓
Unicode        ✓             ✓            ✓
Duplicate      ✓             ✓            ✓
Missing Data   ✓             ✓            ✓
Cancel         ✓             ✓
Failure        ✓             ✓            ✓
Restart        ✓             ✓            ✓
Rebuild        ✓             ✓            ✓
```

---

# 一百十八、端到端场景

至少跑以下完整流程。

## Scenario A — Pocket

```text
Pocket Export
↓
Import
↓
Preview
↓
Commit
↓
Library
↓
Search
↓
Reader
↓
Tag
↓
Favorite
↓
Export Markdown
```

---

## Scenario B — Wallabag

```text
Wallabag Export
↓
Import
↓
Document
↓
Reader
↓
Highlight
↓
Note
↓
Search
↓
Highlight Export
```

---

## Scenario C — Raindrop

```text
Raindrop Export
↓
Import
↓
Dedup
↓
Library
↓
Read State
↓
Metadata Export
```

---

## Scenario D — Migration

```text
Reverie Library
↓
Markdown Export
↓
重新读取
↓
Compare
```

确认核心：

```text
Title
Body
URL
Metadata
```

保持一致或明确说明转换差异。

---

## Scenario E — Daily Review

```text
已有 Library
↓
Highlights / Notes
↓
Daily Review
↓
Generate Queue
↓
Review
↓
Open Article
↓
Return
↓
Next
```

确认：

```text
Reader 正常
Annotation 正常
Read State 未被偷偷修改
```

---

# 一百十九、最终 M5 Final Report

完成后输出：

```text
# M5 Final Report

## 1. Implementation Summary

## 2. Repository Baseline

## 3. M0~M4 Components Reused

## 4. Import Architecture

## 5. Import Data Model

## 6. Pocket Import

## 7. Wallabag Import

## 8. Raindrop Import

## 9. Normalize / Mapping

## 10. Identity / Deduplication

## 11. Provenance

## 12. Conflict Resolution

## 13. Import Atomicity

## 14. Import Recovery

## 15. Markdown Export

## 16. EPUB Export

## 17. Metadata Export

## 18. Highlight Export

## 19. Export Validation

## 20. Daily Review Architecture

## 21. Review Strategy

## 22. Review State

## 23. Library Integration

## 24. Search Integration

## 25. Reader Integration

## 26. Annotation Integration

## 27. File Format Changes

## 28. Security Review

## 29. Performance Benchmark

## 30. Unit Tests

## 31. Integration Tests

## 32. E2E Tests

## 33. Failure / Recovery Tests

## 34. Idempotency Tests

## 35. Known Limitations

## 36. Unsupported External Fields

## 37. Deferred Features

## 38. FACT / HYPOTHESIS / INFERENCE

## 39. P0 / P1 / P2 / P3

## 40. M5 Acceptance Gate

## 41. M6 Preconditions
```

---

# 一百二十、M5 最终验收的核心问题

完成后必须能够明确回答：

```text
1. Pocket 导入的真实输入格式是什么？

2. Wallabag 导入的真实输入格式是什么？

3. Raindrop 导入的真实输入格式是什么？

4. 三种 Import 如何统一进入 Reverie Document？

5. Duplicate 如何判断？

6. 第二次导入同一文件会发生什么？

7. 外部字段与 Reverie 字段如何映射？

8. 外部状态与 Reverie 状态如何映射？

9. 哪些用户数据绝不能被覆盖？

10. Import 失败后如何恢复？

11. Export 是否只读取用户文件？

12. 删除 SQLite 后还能不能 Export？

13. Markdown Export 的结构是什么？

14. EPUB Export 输出是否真正有效？

15. Highlight / Note 是否能够完整导出？

16. Daily Review 的数据从哪里来？

17. Daily Review 是否会偷偷修改 Read State？

18. 所有新增依赖的许可证是什么？

19. 真实大规模 Import / Export 性能是多少？

20. 当前还有哪些已知限制？
```

---

# 一百二十一、M5 的核心数据安全原则

始终牢记：

```text
Import
    ≠
Overwrite

Export
    ≠
Modify

Duplicate
    ≠
Merge Automatically

Missing Anchor
    ≠
Delete Annotation

SQLite Failure
    ≠
User Data Loss

Network Failure
    ≠
Import Failure

One Bad Item
    ≠
Whole Batch Failure
```

---

# 一百二十二、M5 最终目标

M5 完成后，Reverie 应从：

```text
一个可以保存、阅读和搜索资料的软件
```

进一步成为：

```text
一个可以自由迁移、
自由导出、
长期保存、
持续回顾自己阅读资料的
个人阅读档案系统。
```

用户应该越来越清楚：

> **资料真正属于自己，而不是属于 Reverie。**

---

# 一百二十三、M6 Preconditions

M5 完成后，应为 M6 留下稳定基础：

```text
Document
Source
Library
Search
Tags
Read State
Inbox
Recent
RSS / Atom
Feed Management

Import
Export
Metadata
Annotation Export
Daily Review
```

尤其应该保证：

```text
Generic Document
Generic Annotation
Reader Shell
```

仍然保持稳定。

M6 再负责：

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

不要在 M5 提前吞掉 M6。

---

# 一百二十四、开始执行

现在立即开始：

```text
1. 检查当前仓库
2. 检查 M0~M4 实际实现
3. 建立 M5 Current State
4. 检查 Document / Source / Library / Search / Annotation / State
5. 检查 M4 Dedup / Network / Feed 能力
6. 检查当前文件格式
7. 检查已有 Import / Export 代码
8. 检查已有第三方依赖与许可证
9. 检查是否存在真实 Pocket / Wallabag / Raindrop 样本
10. 建立 FACT / HYPOTHESIS / INFERENCE

11. 建立 Import Core
12. 建立 Staging
13. 建立 Validation
14. 建立 Normalize
15. 建立 Provenance
16. 复用 Identity / Dedup
17. 实现 Pocket Import
18. 实现 Wallabag Import
19. 实现 Raindrop Import

20. 实现 Markdown Export
21. 实现 Metadata Export
22. 实现 Highlight Export
23. 实现基础 EPUB Export

24. 实现 Export Validation
25. 实现 Atomic Export
26. 实现 Failure Recovery

27. 实现 Daily Review
28. 实现 Review Queue
29. 实现 Review State
30. 接入 Reader

31. 完成 Import Tests
32. 完成 Export Tests
33. 完成 Review Tests
34. 完成 Idempotency Tests
35. 完成 Failure / Recovery Tests
36. 完成 Integration Tests
37. 完成 E2E Tests
38. 完成 Performance Tests

39. 检查 SQLite 删除后 Rebuild
40. 检查 Rebuild 后 Export
41. 检查 Import 后 Search
42. 检查 Import 后 Reader
43. 检查 Annotation
44. 检查用户状态保护

45. 更新 docs
46. 更新 FORMAT
47. 更新 DECISIONS
48. 更新 PROGRESS
49. 建立 M5 Final Report
50. 分逻辑 commit
51. 最终执行 M5 Acceptance Gate
```

执行方式：

> **自主执行，不提问。**

遇到设计歧义：

```text
优先选择：

简单
可靠
容易测试
对现有代码侵入最小
对用户数据最安全
```

然后把真正重要的决定记录到：

```text
DECISIONS.md
```

不要为了完成 M5 而破坏：

```text
M1 Capture
M2 Annotation
M3 Search / Library
M4 RSS
```

最终验收重点不是：

```text
“功能很多”
```

而是：

> **“用户的数据能够安全进来，也能够安全离开。”**

并且：

> **任何 Import / Export 都不能降低 Reverie 原有的数据可靠性。**