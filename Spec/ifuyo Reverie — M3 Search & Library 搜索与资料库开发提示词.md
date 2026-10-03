# ifuyo Reverie — M3 Search & Library 搜索与资料库开发提示词

你现在继续开发 **ifuyo Reverie**。

这是一个：

> **Windows 优先、本地优先、文件原生的个人阅读档案系统。**

当前阶段：

> **M3 — Search & Library / 搜索与资料库**

---

# 一、M3 的核心目标

M3 的目标不是简单增加一个搜索框。

M0 建立基础能力。

M1 建立：

```text
保存网页
→ 形成 Reverie Document
→ 本地归档
→ Reader 阅读
```

M2 建立：

```text
Highlight
Note
Bookmark
Anchor
Orphan Handling
```

M3 要在这些基础上建立：

```text
Library
Search
Organization
Reading State
```

使 Reverie 从：

> “能够保存和阅读资料的软件”

真正变成：

> **“资料积累到几十、几百乃至几千篇之后，依然能够快速找到、整理和再次阅读的软件”。**

M3 最终必须形成：

```text
                    ┌─ Search
                    ├─ Tags
Library ────────────┼─ Inbox
                    ├─ Favorites
                    ├─ Read / Unread
                    └─ Recent
                          ↓
                 Document / Annotation
                          ↓
                       Reader
```

---

# 二、M3 必须完成的核心能力

本阶段 [A] 功能：

```text
[A] 全局全文搜索
[A] 搜索 Title
[A] 搜索 Author
[A] 搜索 Body
[A] 搜索 Highlight
[A] 搜索 Note
[A] 搜索 Tag
[A] 搜索 URL

[A] Tags
[A] Read / Unread
[A] Favorites
[A] Inbox
[A] Recent

[A] Library 主界面
[A] 搜索结果列表
[A] 搜索过滤
[A] 多条件组合过滤
[A] 从搜索结果进入 Reader
[A] 从搜索结果直接定位 Annotation
[A] 搜索结果显示来源上下文
[A] SQLite / Index 只是派生数据
[A] 删除索引后可重建

[A] 大量资料下的搜索性能验证
[A] 中文 / 英文混合搜索验证
[A] 搜索与 Annotation 数据一致性验证
```

---

# 三、M3 明确不做什么

严格禁止 M3 膨胀成知识管理系统。

本阶段不要提前实现：

```text
RSS
Atom
Feed
Pocket Import
Wallabag Import
Raindrop Import
EPUB
PDF
TTS
AI Summary
AI Search
Embedding
Vector Database
Knowledge Graph
Backlinks
Graph View
Cloud Sync
Account
Collaboration
Social
Web Publishing
Plugin System
```

也不要提前做：

```text
复杂 Markdown 编辑器
富文本 Note
复杂标签层级
标签自动分类 AI
自动标签
智能推荐
语义搜索
全文索引云同步
```

M3 只完成：

> **搜索 + 资料组织 + 基础阅读状态。**

---

# 四、开始前必须审计 M0～M2

不要直接写代码。

先检查当前仓库。

---

## 4.1 Repository Reconnaissance

检查：

```text
项目结构
构建方式
运行环境
依赖
数据库
文件存储
Library 扫描器
Document Model
Article Model
Reader
Annotation Core
Bookmark
现有 UI
现有 Navigation
现有 Tests
现有 CI
Git 状态
```

尤其检查：

```text
M1
M2
```

是否真正完成，而不是只看文档。

---

## 4.2 M3 前置事实

建立：

```text
FACT
HYPOTHESIS
INFERENCE
```

至少确认：

```text
Document ID 如何定义
Article 文件如何定位
meta.json 当前结构
article.md 当前结构
annotations.jsonl 当前结构
Bookmark 当前是否实现
SQLite 当前是否存在
SQLite schema 当前是什么
索引如何生成
索引是否可以重建
Reader 如何导航到 Document
Reader 如何导航到 Annotation
```

---

## 4.3 文档与代码冲突时

遵循：

> **当前代码实际行为 + 测试结果 > 旧设计文档中的假设。**

如果发现：

```text
M2 设计：
Bookmark 已经存在

实际：
Bookmark 尚未实现
```

不要假装已经完成。

将其记录：

```text
M3 prerequisite deviation
```

然后在不扩大范围的前提下补齐必要能力。

---

# 五、M3 最重要的数据原则

继续严格执行：

> **文件是真相，数据库是索引。**

也就是说：

```text
User Library
    ↓
User-owned files
    ↓
SQLite
    ↓
Search / UI
```

SQLite 可以随时被删除。

然后：

```text
Library files
    ↓
reindex
    ↓
SQLite
```

恢复。

---

# 六、用户资料与 Derived Data 必须分离

M3 会产生大量：

```text
搜索索引
排序
统计
缓存
```

这些都不应该成为用户资料的唯一来源。

必须区分：

### 用户事实

例如：

```text
title
author
tags
favorite
read/unread
inbox
created_at
last_opened_at
annotations
bookmark
```

### 派生事实

例如：

```text
FTS index
search ranking
token tables
normalized search text
document counts
facet counts
```

如果某个字段是用户明确产生的状态：

> 不能只存在 SQLite。

---

# 七、决定用户状态的持久化位置

在审计现有实现后，选择最简单、最可靠的方案。

默认建议：

```text
meta.json
```

保存相对稳定的文档元数据：

```text
title
author
canonical_url
published_at
captured_at
language
source
...
```

而用户经常改变的 Library 状态可以使用独立：

```text
state.json
```

例如：

```text
state.json

{
  "schema_version": 1,
  "read": false,
  "favorite": false,
  "inbox": true,
  "tags": [],
  "last_opened_at": "...",
  "last_read_at": "..."
}
```

但：

> 如果当前项目已经有合理的数据布局，不要为了这个建议进行无意义的重构。

关键要求不是文件名。

关键要求是：

> **这些用户状态必须属于用户 Library，而不是只属于数据库。**

---

# 八、Read / Unread 的定义

必须明确：

```text
Unread
Read
```

不能出现多个地方各自定义。

建议：

```text
read = false
```

表示：

> 用户还没有完成对该资料的基本阅读。

最简单第一版规则：

```text
打开资料
→ 仍然可以保持 unread

用户显式执行 Mark as Read
→ read = true
```

不要擅自使用：

```text
滚动到 50%
自动标记已读
```

除非实际产品设计已经确定。

原因：

用户打开资料：

```text
只是查看
```

不等于：

```text
已经阅读
```

因此 M3 默认应该提供：

```text
Mark as Read
Mark as Unread
```

而不是过度推测用户行为。

---

# 九、Read / Unread 必须是独立状态

不要把：

```text
favorite
```

推导为：

```text
read
```

也不要把：

```text
inbox
```

推导为：

```text
unread
```

三者必须独立：

```text
read
favorite
inbox
```

例如同一篇文章完全可能：

```text
read = true
favorite = true
inbox = false
```

或者：

```text
read = false
favorite = true
inbox = true
```

---

# 十、Inbox 的定义

M3 的 Inbox 是：

> **等待用户处理 / 阅读 / 整理的资料入口。**

它不是：

```text
所有 unread
```

也不是：

```text
所有最近保存
```

必须明确存在独立状态：

```text
inbox = true / false
```

建议初始保存行为：

```text
手动保存新文章
    ↓
加入 Inbox
    ↓
用户以后：
Mark Read
Remove from Inbox
Add Favorite
Add Tags
```

但如果当前产品已有不同约定：

> 以实际代码和已有设计为准。

不要在 M3 中偷偷建立两个不同 Inbox 规则。

---

# 十一、Inbox 与 Read 的关系

必须支持：

```text
Inbox + Unread
Inbox + Read
Not Inbox + Unread
Not Inbox + Read
```

这是合法状态组合。

例如：

```text
文章已经读完
但用户暂时不想整理
```

仍然可以：

```text
inbox = true
read = true
```

因此 UI 不能：

```text
Mark as Read
→ 自动 Remove from Inbox
```

除非产品规范明确如此。

默认保持独立。

---

# 十二、Favorites

Favorite 是单独的用户状态：

```text
favorite = true / false
```

支持：

```text
Add Favorite
Remove Favorite
```

并提供：

```text
Favorites
```

Library 过滤视图。

不要把 Favorite 与：

```text
Tag = favorite
```

混为一谈。

原因：

> Favorite 是系统级快速状态。

而 Tag 是用户分类体系。

---

# 十三、Tags

M3 开始正式实现：

```text
Tags
```

第一版保持非常简单。

一个 Document 可以：

```text
0
1
2
...
N
```

个 Tag。

例如：

```text
AI
Rust
GameDev
Design
Reading
```

---

# 十四、Tag 不要过度设计

第一版不要：

```text
Tag hierarchy
Parent Tag
Nested Tag
Tag inheritance
Tag rules
Tag automation
Tag aliases
AI tagging
Tag color editor
```

也不要设计：

```text
Tag Object
    ↓
Tag Group
    ↓
Tag Namespace
    ↓
Tag Taxonomy
```

M3 只需要：

```text
string tag
```

---

# 十五、Tag 规范化

必须定义：

```text
Tag canonicalization
```

例如：

```text
Rust
rust
RUST
```

是否视为同一个 Tag。

建议：

> 显示形式保留用户第一次创建的 canonical display name，而比较使用规范化形式。

至少需要确定：

```text
trim whitespace
empty tag
duplicate tag
case sensitivity
```

---

# 十六、Tag 最小合法规则

必须处理：

```text
空字符串
前后空格
重复
极长 tag
控制字符
非法 JSON 字符
```

至少保证：

```text
" Rust "
```

不会产生：

```text
" Rust "
```

与：

```text
"Rust"
```

两个不可预期标签。

---

# 十七、Tag 的持久化

Tag 是用户资料，因此：

```text
Library File
```

必须保存。

SQLite 可以有：

```text
document_tags
```

用于查询。

但必须支持：

```text
Library
→ Reindex
→ Tag 恢复
```

绝不能：

```text
SQLite 删除
→ 所有 Tag 丢失
```

---

# 十八、Global Search

M3 核心是：

> **一个统一搜索入口。**

搜索范围必须覆盖：

```text
Title
Author
Body
Highlight
Note
Tag
URL
```

其中 Annotation 来自 M2：

```text
Highlight
Note
```

搜索必须和 Annotation 数据保持一致。

---

# 十九、Search 不应该搜索什么

默认不要将：

```text
source/page.html
asset 二进制内容
应用缓存
SQLite 自己
logs
temporary files
```

加入全文搜索。

否则：

```text
原始 HTML
CSS
JavaScript
追踪参数
```

会污染用户搜索结果。

---

# 二十、Body 的搜索来源

正文搜索应该针对：

```text
canonical article content
```

也就是用户实际阅读的正文：

```text
article.md
```

对应的 Reverie Document。

不要简单：

```text
读取 source/page.html
→ strip tags
→ 全部扔进 FTS
```

否则极容易把网页噪声索引进去。

---

# 二十一、Annotation Search

必须支持：

```text
搜索 Highlight
搜索 Note
```

例如：

```text
搜索：
SQLite
```

能够找到：

```text
文章正文含 SQLite
```

也能够找到：

```text
Highlight：
SQLite is only a derived index
```

以及：

```text
Note：
这里的设计原则很重要
```

---

# 二十二、搜索结果必须区分命中类型

建议搜索结果结构能够表达：

```text
Document Match
Annotation Match
```

例如：

```text
Search Result

┌───────────────────────────────┐
│ Designing Local-First Apps    │
│ Gray                          │
│                               │
│ ... SQLite is only a derived  │
│ index ...                     │
│                               │
│ Match: Body                   │
└───────────────────────────────┘
```

或者：

```text
Match: Highlight
Match: Note
Match: Title
```

不要求视觉复杂。

但内部必须知道：

> **到底在哪里命中了。**

---

# 二十三、搜索结果 Context

不能只显示：

```text
Title
```

搜索结果必须尽量显示：

```text
命中上下文
```

例如：

```text
... database should be treated as a derived index ...
```

并突出命中词。

---

# 二十四、搜索结果点击行为

不同命中类型要有正确导航：

### Body 命中

```text
Search
 ↓
Open Document
 ↓
Reader
 ↓
定位到正文命中位置
```

### Highlight 命中

```text
Search
 ↓
Open Document
 ↓
定位 Highlight
```

### Note 命中

```text
Search
 ↓
Open Document
 ↓
定位关联 Annotation
 ↓
显示 Note
```

不能只是：

```text
Open Article
```

然后让用户自己慢慢找。

---

# 二十五、Search Query Parser

第一版不需要做复杂搜索语言。

但建议支持基础 filter syntax，例如：

```text
tag:rust
is:read
is:unread
is:favorite
in:inbox
author:xxx
```

组合：

```text
tag:rust is:unread
```

例如：

```text
AI tag:rust is:unread
```

表示：

```text
全文搜索 AI
+
Tag = rust
+
Unread
```

---

# 二十六、搜索语法不是数据库 SQL

严禁把：

```text
用户输入
```

直接拼接成：

```text
SQL
```

必须使用：

```text
Parameterized Query
```

搜索 Parser：

```text
User Query
    ↓
Parser
    ↓
SearchQuery
    ↓
FTS / SQL
```

不能：

```text
User Input
 ↓
SQL string concatenation
```

---

# 二十七、搜索语法的容错

第一版应做到：

```text
tag:rust
```

正常。

但：

```text
tag:
```

不能导致崩溃。

错误搜索语法应该：

```text
显示明确提示
```

而不是：

```text
空白结果
```

或者：

```text
SQL exception
```

---

# 二十八、中文搜索

必须重点测试中文。

测试至少包含：

```text
中文连续文本
中文短词
中英混合
数字
英文缩写
标点
URL
代码
```

例如：

```text
本地优先
local-first
SQLite
Rust
AI
2026
C#
```

不能默认：

> 空格分词就能解决中文。

---

# 二十九、中文搜索实现不要过早锁死

根据总纲领：

> 中文搜索实现必须以实际语料 benchmark 为依据选择，而不是在架构设计阶段凭感觉决定算法。

因此先建立：

```text
Search Benchmark Corpus
```

至少包括：

```text
Chinese articles
English articles
mixed articles
technical documents
short notes
highlights
URLs
tags
```

比较候选实现。

---

# 三十、中文搜索 Benchmark

至少测试：

```text
精确词
前缀
短词
长句
中英混合
数字
标点
```

例如：

```text
“本地优先”
“本地”
“SQLite”
“local-first”
“Rust”
“2026”
```

记录：

```text
expected results
actual results
false positives
false negatives
query latency
```

然后选择实际方案。

不要为了“看起来先进”使用复杂 tokenizer。

---

# 三十一、Search Engine 选择

优先复用当前项目已有：

```text
SQLite
FTS
```

如果当前项目不是 SQLite：

> 保持现有架构，不为了 M3 强行换数据库。

如果使用 SQLite：

优先考虑：

```text
FTS5
```

但必须实际验证：

```text
中文
英文
前缀
短词
排序
更新
删除
重建
```

不要假定数据库文档中的理论能力等于实际产品表现。

---

# 三十二、FTS 数据设计

如果使用 FTS：

逻辑上建立：

```text
documents
document_fts
annotations
annotation_fts
tags
```

或者将能够统一搜索的数据构造成：

```text
search_index
```

不要为了形式强行拆成大量表。

核心是：

```text
Searchable Entity
Searchable Text
Entity ID
Document ID
Match Type
```

---

# 三十三、搜索索引必须可重建

必须提供：

```text
reverie reindex
```

或者：

```text
Rebuild Search Index
```

流程：

```text
Library Files
    ↓
Parse metadata
    ↓
Read article.md
    ↓
Read annotations.jsonl
    ↓
Read state.json / user metadata
    ↓
Build search index
```

---

# 三十四、增量索引

不要每次启动：

```text
全部重新读取所有文件
```

如果已有可靠的文件状态机制，应实现增量：

```text
未变化
→ Skip

变化
→ Reindex

新增
→ Index

删除
→ Remove
```

至少基于：

```text
path
modified time
size
content hash
```

中的合理组合。

不要为了增量索引引入复杂文件监控平台。

---

# 三十五、删除数据

用户删除 Document：

必须处理：

```text
Library file
Search index
Annotation
Tags
state
Recent
Inbox
Favorites
```

不能出现：

```text
文章已经不存在
但搜索仍然出现
```

也不能：

```text
搜索结果存在
点击后打开一个幽灵 Document
```

---

# 三十六、删除策略

注意：

> 删除用户资料属于高风险操作。

必须至少有：

```text
Confirmation
```

并且明确显示：

```text
将删除：
Article
Annotations
State
Assets
```

如果当前产品设计提供 Trash：

可以使用。

如果没有：

不要擅自发明复杂回收站。

---

# 三十七、Recent

M3 增加：

```text
Recent
```

建议基于：

```text
last_opened_at
```

排序。

注意：

```text
created_at
≠
last_opened_at
```

一篇旧文章今天重新阅读：

应该进入：

```text
Recent
```

---

# 三十八、Recent 的数据持久化

必须避免：

```text
Recent 只存在内存
```

应该保存：

```text
last_opened_at
```

数据库仅作为索引。

---

# 三十九、Recent 更新频率

不要每滚动 1px 写一次文件。

建议：

```text
打开文档
→ 更新 last_opened_at
```

或者：

```text
首次进入
+
合理 debounce
```

具体方案以实际性能测试为准。

---

# 四十、Recent 不应该污染排序稳定性

如果用户正在：

```text
Recent
```

页面上阅读文章。

后台不应该因为：

```text
每个 UI 事件
```

导致列表不断跳动。

排序应该在适当事件后刷新。

---

# 四十一、Library 主界面

M3 应建立真正的：

```text
Library
```

而不是一个数据库调试页面。

建议结构：

```text
Library
│
├─ Inbox
├─ Recent
├─ Favorites
├─ Unread
└─ All
```

以及：

```text
Tags
```

---

# 四十二、Library 导航

最基础结构：

```text
Library
├─ Inbox
├─ Recent
├─ Favorites
├─ Unread
└─ All
```

Tags：

```text
Tags
├─ AI
├─ Rust
├─ GameDev
└─ ...
```

不要一开始做：

```text
复杂树形标签
```

---

# 四十三、All Library

All 是：

> 当前 Reverie Library 中所有有效资料。

默认可以按：

```text
recently updated
```

或者：

```text
recently added
```

排序。

但排序规则必须稳定、可解释。

不要随机排序。

---

# 四十四、Library Item

每个资料卡片 / 列表行至少可以显示：

```text
Title
Author / Source
Date
Read State
Favorite
Inbox
Tags
```

必要时：

```text
Excerpt
```

但不要塞满。

---

# 四十五、列表优先

M3 不要过度追求：

```text
Card Gallery
masonry
大型封面墙
复杂杂志风
```

因为 Reverie 的资料主要是：

```text
文章
技术资料
长文本
电子书
PDF
```

阅读档案更适合：

> **高信息密度但不拥挤的列表。**

---

# 四十六、长列表必须考虑性能

资料数量达到：

```text
100
500
1000
5000
```

时：

```text
滚动
搜索
过滤
排序
```

仍然应该保持流畅。

必要时使用：

```text
virtualized list
```

但只有实际需要时再引入。

---

# 四十七、搜索结果与 Library 结果统一

不要维护两套完全不同的 Item Model：

```text
LibraryItem
SearchItem
```

如果它们本质都是 Document 展示：

优先共享：

```text
DocumentListItemModel
```

但不要强行让 Search Result 和 Document 完全等价。

Search Result 额外需要：

```text
match_type
matched_text
snippet
```

---

# 四十八、过滤

M3 至少支持：

```text
All
Unread
Read
Favorites
Inbox
```

以及：

```text
Tag
```

组合。

例如：

```text
Unread
+
Tag:Rust
```

或者：

```text
Favorites
+
Tag:AI
```

---

# 四十九、过滤逻辑必须可组合

不要使用：

```text
if inbox then ...
else if favorite then ...
else if unread then ...
```

因为：

```text
Inbox + Favorite + Unread
```

是合法组合。

建议形成：

```text
LibraryFilter
├─ read_state
├─ favorite
├─ inbox
├─ tags
└─ text_query
```

然后统一执行。

---

# 五十、Filter Model

例如逻辑模型：

```text
LibraryQuery

text
read
favorite
inbox
tags
source
sort
limit
offset
```

实际结构根据项目情况决定。

不要创建无法解释的：

```text
QueryManagerManager
FilterOrchestratorFactory
```

等无意义抽象。

---

# 五十一、Tags 筛选语义

第一版需要明确：

多个 Tags：

```text
tag:Rust tag:AI
```

表示：

```text
AND
```

还是：

```text
OR
```

必须写入文档。

推荐：

```text
AND
```

因为它更适合逐步缩小资料范围。

例如：

```text
Rust
+
AI
```

只返回同时具有：

```text
Rust
AI
```

两个标签的资料。

如果需要 OR，可以未来扩展。

---

# 五十二、排序

M3 至少支持合理的：

```text
Recent
Created
Title
```

不需要一次实现几十种排序。

建议：

```text
Recently Added
Recently Opened
Title
```

---

# 五十三、排序稳定性

任何排序必须处理：

```text
相同 timestamp
同 title
缺失 author
缺失 date
```

例如：

```text
last_opened_at DESC
document_id ASC
```

作为稳定 tie-breaker。

不要让列表因为 SQLite 返回顺序改变而随机跳动。

---

# 五十四、搜索排序

搜索至少区分：

```text
Title Match
Exact Match
Phrase Match
Body Match
Annotation Match
```

但不要一开始设计复杂机器学习 ranking。

第一版使用：

> 简单、确定、可测试的 ranking。

例如：

```text
标题命中
>
作者命中
>
Tag 命中
>
Highlight / Note 命中
>
Body 命中
>
URL 命中
```

具体顺序必须通过实际体验和 benchmark 验证。

不要把这种排序当成永恒产品真理。

---

# 五十五、搜索结果中的重复

一篇文章可能同时：

```text
Title 命中
Body 命中
Highlight 命中
Note 命中
```

默认不要显示：

```text
4 个完全重复的 Article Card
```

建议：

```text
1 个 Document Result
+
多个 Match Context
```

例如：

```text
Designing Local-First Apps

Matches:
Title
Highlight
Note
```

点击不同 Match：

```text
跳转到对应位置
```

---

# 五十六、一个 Document 的多个命中

需要支持：

```text
next match
previous match
```

或者：

```text
展开全部命中
```

第一版可以简单：

```text
显示最相关的一条 Context
```

点击后定位。

不要为了搜索结果 UI 造复杂交互。

---

# 五十七、Search Debounce

输入：

```text
S
Sq
SQL
SQLi
SQLite
```

不要：

```text
每一个字符都同步阻塞整个 Library
```

使用合理：

```text
debounce
```

例如几十到几百毫秒范围。

具体数值以实际 profiling 为准。

---

# 五十八、搜索取消

如果用户快速输入：

```text
rust
rust a
rust ai
```

旧搜索结果不能覆盖新搜索结果。

必须具备：

```text
request generation
```

或者：

```text
cancellation
```

逻辑：

```text
Query A
 ↓
Query B
 ↓
Query C
```

最终只能：

```text
C
```

成为当前结果。

---

# 五十九、搜索不能阻塞 Reader

用户阅读时：

```text
Search
```

不应该：

```text
卡住 UI
暂停阅读
```

搜索执行必须在适当的：

```text
background / async path
```

中进行。

---

# 六十、搜索索引一致性

需要考虑：

```text
Document 写入
↓
Index 更新
```

任何中间失败都不能产生不可解释状态。

至少保证最终：

```text
File Truth
    ↓
Reindex
    ↓
Correct Search
```

因此：

> 即使增量索引暂时失败，也允许后续完整重建恢复。

---

# 六十一、Index Dirty State

推荐记录：

```text
index_dirty
```

或类似状态。

例如：

```text
File Changed
↓
Index not updated
↓
Dirty
```

然后：

```text
background reindex
```

完成：

```text
Clean
```

不要让：

```text
index error
```

变成：

```text
用户资料错误
```

---

# 六十二、Index Doctor

M3 应扩展：

```text
reverie doctor
```

至少检查：

```text
Document exists in files
Document exists in index

Index references existing document

Annotation references existing document

Tag references existing document

No duplicate Document IDs

No duplicate Annotation IDs

No broken paths

No unsupported schema versions
```

---

# 六十三、Index Rebuild

至少提供：

```text
Rebuild Search Index
```

流程必须：

```text
停止 / 隔离当前索引更新
↓
扫描 Library
↓
解析文件
↓
构建新的索引
↓
验证
↓
Atomic Replace
```

不要直接：

```text
DROP everything
→ 中途失败
→ 留下半个索引
```

---

# 六十四、Atomic Index Rebuild

推荐：

```text
index.db.tmp
```

建立完成后：

```text
validate
↓
replace
```

或者利用 SQLite 合理的：

```text
backup / transaction
```

机制。

关键要求：

> 重建失败不能损坏原来的可用索引。

---

# 六十五、数据库不是资料库

M3 必须进行一次专门检查：

```text
如果 index.db 被删除：

能否：
    打开 Library？
    扫描文件？
    重建搜索？
    恢复 Tags？
    恢复 Favorite？
    恢复 Read State？
    恢复 Inbox？
```

最终答案必须：

```text
YES
```

---

# 六十六、Library 文件扫描

M3 可以复用 M1 的：

```text
Library Scanner
```

不要重写第二个 Scanner。

如果当前没有：

> 建立一个唯一的 Library Discovery 层。

结构：

```text
Library
 ↓
Scanner
 ↓
Document Loader
 ↓
User State Loader
 ↓
Indexer
```

---

# 六十七、Document Loader

Indexer 不应该自己：

```text
读文件
解析 JSON
解释 Markdown
解释 Annotation
```

应该复用：

```text
Document Loader
Annotation Loader
Metadata Loader
```

避免：

```text
Reader 一套解析
Search 一套解析
Doctor 又一套解析
```

导致数据语义分裂。

---

# 六十八、Searchable Projection

建立统一的：

```text
SearchableDocument
```

概念：

```text
SearchableDocument
├─ document_id
├─ title
├─ author
├─ body
├─ url
├─ tags
└─ annotations
```

但它是：

> **派生模型。**

不是新的用户资料格式。

---

# 六十九、Search Adapter

UI 不应该直接知道：

```text
SQLite
FTS5
tokenizer
```

应该：

```text
UI
 ↓
SearchService
 ↓
SearchIndex
```

这样未来可以更换搜索实现。

不过：

> 不要因为“未来可能换搜索引擎”建立巨型抽象层。

---

# 七十、Library Service

建立统一：

```text
LibraryService
```

或者复用当前已有 Service。

至少支持：

```text
GetDocument
ListDocuments
UpdateTags
SetRead
SetFavorite
SetInbox
GetRecent
GetFavorites
GetUnread
GetInbox
```

不要让每个 UI 页面直接操作数据库。

---

# 七十一、用户状态修改

例如：

```text
Mark as Read
```

必须：

```text
UI
 ↓
LibraryService
 ↓
Persist user state
 ↓
Update index
 ↓
UI refresh
```

而不是：

```text
UI
 ↓
SQLite UPDATE
```

---

# 七十二、文件写入与索引更新顺序

任何用户状态更新必须考虑崩溃：

推荐：

```text
Update user-owned state file
        ↓
Validate
        ↓
Atomic Replace
        ↓
Update derived index
```

而不是：

```text
SQLite first
↓
write file later
```

这样数据库不会成为领先于用户资料的“假事实”。

---

# 七十三、失败恢复

例如：

```text
Favorite = true
```

写：

```text
state.json
```

失败：

```text
SQLite
```

不应该已经变成：

```text
favorite = true
```

然后文件还是：

```text
false
```

因此默认顺序：

```text
User File
    ↓
success
    ↓
Index
```

---

# 七十四、UI 乐观更新

可以：

```text
点击 Favorite
→ UI 立即变化
→ 异步持久化
```

但如果写入失败：

必须：

```text
rollback UI
+
提示用户
```

不能出现：

```text
看起来已经收藏
重启后消失
```

---

# 七十五、错误提示

避免：

```text
Error 0x800...
SQLite error...
IOException...
```

直接出现在用户界面。

应转换为：

```text
无法保存此更改
```

以及：

```text
查看日志
重试
```

等明确动作。

底层 diagnostic 仍然写入日志。

---

# 七十六、Library Empty State

不同状态应该有不同 Empty State。

例如：

### Inbox 空

```text
Inbox is empty
```

而不是：

```text
No documents
```

### Favorites 空

```text
No favorites yet
```

### Search 无结果

```text
No results
```

以及：

```text
Try another keyword
```

不要把：

```text
搜索无结果
```

误认为：

```text
Library 是空的
```

---

# 七十七、Search UX

搜索框至少支持：

```text
Ctrl+K
```

或者复用项目已有命令入口。

但：

> 如果当前项目已经有统一 Command Palette，则不要再创建第二个全局搜索框架。

统一入口：

```text
Search
Open Library
Open Inbox
Open Favorites
```

---

# 七十八、搜索焦点

进入 Search：

```text
输入框自动获得焦点
```

ESC：

```text
返回
```

↑↓

```text
移动结果
```

Enter：

```text
打开结果
```

Ctrl+K：

```text
打开命令面板 / 搜索
```

以现有 M1 UI 交互约定为准。

---

# 七十九、键盘可达

M3 Library 必须能够：

```text
Tab
Shift+Tab
Enter
Esc
Arrow keys
```

完成核心操作。

至少：

```text
Search
Filter
Open
Favorite
Read
Inbox
Tag
```

不能完全依赖鼠标。

---

# 八十、Tag 编辑 UI

第一版推荐：

```text
点击 Tags
→ 输入
→ Enter
```

生成：

```text
Tag chip
```

支持：

```text
remove
```

即可。

不要一开始做：

```text
Tag Manager 全屏应用
```

---

# 八十一、Tag 创建重复处理

例如现有：

```text
Rust
```

用户输入：

```text
rust
```

系统不能默默创建第二个标签。

必须按照之前定义的 canonicalization：

```text
检测重复
```

并：

```text
复用已有 Tag
```

---

# 八十二、批量操作

M3 可以支持基础批量操作：

```text
Select multiple
→ Mark Read
→ Favorite
→ Remove Favorite
→ Add Tag
→ Remove from Inbox
```

但这是 [B]，不是核心阻塞项。

如果实现：

> 必须完成测试。

不要把：

```text
50% 半成品 bulk action
```

算作完成。

---

# 八十三、不要做危险批量操作

M3 暂时不要：

```text
bulk delete
bulk move files
bulk rewrite source
```

除非已经有完整的安全机制。

因为：

> M3 的重点是组织和搜索，而不是批量文件管理。

---

# 八十四、Search Highlight

搜索结果中高亮匹配文本：

例如：

```text
The database is only a derived index.
```

搜索：

```text
derived
```

显示：

```text
The database is only a [derived] index.
```

但：

> 用户资料里的原文不得被修改。

Highlight 只属于：

```text
Search Result Rendering
```

---

# 八十五、Search Navigation Contract

定义统一：

```text
NavigateToSearchMatch(match)
```

Match 至少能描述：

```text
document_id
match_type
anchor / position
```

例如：

```text
body match
annotation match
```

这样以后：

```text
EPUB
PDF
```

可以复用上层导航逻辑。

---

# 八十六、Search 与 M2 Anchor 的关系

对于：

```text
Highlight
Note
```

搜索结果优先复用：

```text
Annotation Anchor
```

而不是重新计算一个新的不可兼容定位系统。

结构：

```text
Search
 ↓
Annotation
 ↓
Existing Anchor
 ↓
Reader
```

避免：

```text
M2 一套定位
M3 又一套定位
```

---

# 八十七、Bookmark

总纲领把 Bookmark 列入 M2 核心。

因此 M3 开始时首先确认：

```text
M2 Bookmark 是否已经真实完成
```

如果未完成：

> 补齐最小 Bookmark Contract，但不要重新设计 M2 Annotation Core。

M3 自身不要扩大 Bookmark 功能。

---

# 八十八、Bookmark 在 Library 中

如果当前已有 Bookmark：

可以提供：

```text
Bookmarked
```

过滤。

否则：

> 暂不把 Bookmark 做成新的复杂 Library taxonomy。

---

# 八十九、标签与搜索的一致性

例如：

```text
Add Tag: Rust
```

完成后必须立即能够：

```text
搜索:
tag:Rust
```

找到。

不能：

```text
UI 显示 Tag
但 Search Index 还不知道
```

如果采用异步索引：

必须允许：

```text
短暂 dirty state
```

但最终必须一致。

---

# 九十、Library 数量统计

可以显示：

```text
Inbox 12
Unread 38
Favorites 7
```

但这些数据应该来自：

```text
index
```

因为它们是派生统计。

如果统计不一致：

```text
reindex
```

可以恢复。

---

# 九十一、统计不要成为 Source of Truth

例如：

```text
Unread Count = 38
```

不要把：

```text
38
```

存入：

```text
stats.json
```

作为真实状态。

它是：

```text
COUNT(read = false)
```

自然计算出来的。

---

# 九十二、性能目标

M3 必须实际 benchmark，而不是估算。

至少测试：

```text
100 documents
500 documents
1,000 documents
5,000 documents
10,000 documents
```

每个规模至少测试：

```text
Library open
Search
Filter
Tag filter
Recent
Inbox
Favorites
Reindex
```

---

# 九十三、搜索性能

重点记录：

```text
cold query
warm query
Chinese query
English query
mixed query
annotation query
tag query
```

记录：

```text
p50
p95
```

如果规模太大：

可以记录：

```text
max
```

但不得伪造数据。

---

# 九十四、M3 不要求无限优化

如果：

```text
1000 篇
```

已经足够快：

不要为了：

```text
100 万篇
```

提前做：

```text
distributed search
vector engine
sharding
```

只记录：

```text
Observed limit
Future concern
```

---

# 九十五、Search Correctness Tests

必须测试：

```text
Title hit
Author hit
Body hit
Highlight hit
Note hit
Tag hit
URL hit
```

以及：

```text
No result
Duplicate result
Deleted document
Changed document
Deleted annotation
Changed note
Changed tag
```

---

# 九十六、Index Rebuild Tests

测试：

```text
正常 Library
→ 建索引
→ 删除 index
→ rebuild
→ 结果一致
```

以及：

```text
文件新增
文件删除
文件修改
Annotation 修改
Tag 修改
State 修改
```

重建后都必须正确。

---

# 九十七、Search Consistency Test

流程：

```text
Create Document
↓
Add Tag
↓
Add Highlight
↓
Add Note
↓
Mark Favorite
↓
Mark Read
↓
Remove Inbox
↓
Search
```

检查：

```text
所有字段都能正确进入对应功能。
```

---

# 九十八、Persistence Round-trip

必须测试：

```text
Modify user state
↓
Write
↓
Close
↓
Reopen
```

最终：

```text
Tag
Favorite
Read
Inbox
Recent
```

状态正确。

---

# 九十九、Crash Safety

至少模拟：

```text
写 state 文件失败
写 index 失败
reindex 中断
数据库损坏
数据库被删除
部分 Document 无法读取
```

不能：

```text
用户状态丢失
整个 Library 打不开
```

---

# 一百、损坏文件隔离

例如：

```text
100 篇文章
其中 1 篇 meta.json 损坏
```

不要：

```text
整个 Library fail
```

默认：

```text
99 篇正常可用
1 篇进入 diagnostic
```

并提供：

```text
Doctor
```

帮助发现问题。

---

# 一百零一、搜索错误隔离

如果：

```text
1 个 Annotation JSON 损坏
```

不能让：

```text
全部 Search 停止
```

应该：

```text
正常内容继续索引
+
坏数据记录 diagnostic
```

---

# 一百零二、重复 Document ID

Indexer 必须检查：

```text
duplicate document_id
```

不得：

```text
后扫描的覆盖前扫描的
```

需要明确：

```text
conflict
```

并写入 Doctor。

---

# 一百零三、路径与 ID

不要把：

```text
filesystem path
```

当作：

```text
Document ID
```

因为：

```text
文件移动
```

不应该让：

```text
Document Identity
```

发生变化。

继续使用 M1 的：

```text
stable document_id
```

---

# 一百零四、Library 内文件移动

M3 不一定必须实现复杂移动 UI。

但是必须保证：

```text
用户自己移动 Reverie Library
```

或者：

```text
单个 Document 目录移动
```

不会因为：

```text
Path changed
```

而改变 Document ID。

如果当前架构不支持：

必须明确记录为：

```text
Known Limitation
```

而不能假装支持。

---

# 一百零五、文件名不是业务 ID

不要使用：

```text
title.md
```

作为：

```text
document_id
```

因为：

```text
标题可以变
```

---

# 一百零六、URL 也不是 Document ID

继续保持：

```text
URL
≠
Document Identity
```

尤其：

```text
网页 URL 相同
内容可能不同
```

这是 M2 Anchor 能够稳定工作的前提。

---

# 一百零七、M3 UI 与 Reader 的边界

Library：

负责：

```text
Search
Filter
List
Organization
State
```

Reader：

负责：

```text
Read
Scroll
Selection
Highlight
Note
Bookmark
Navigation
```

不要让：

```text
Library Page
```

自己实现：

```text
DOM selection
scrollTop
anchor resolution
```

---

# 一百零八、架构建议

逻辑层次保持：

```text
UI
 ↓
Library / Search Services
 ↓
Domain Model
 ↓
Persistence / Index
 ↓
Files
```

Reader：

```text
Reader
 ↓
Reader Adapter
 ↓
Document
```

Search：

```text
Search UI
 ↓
SearchService
 ↓
SearchIndex
 ↓
Derived DB
```

---

# 一百零九、不要制造双重数据模型

避免：

```text
UiDocument
DbDocument
FileDocument
SearchDocument
```

全部各自定义字段。

建议：

```text
Canonical Domain Model
```

然后：

```text
Projection
```

负责：

```text
SQLite
UI
Search
```

---

# 一百一十、数据库 Schema

如果使用 SQLite：

至少设计：

```text
documents
annotations
tags
document_tags
```

以及：

```text
FTS
```

具体表结构按照实际需求确定。

不要提前创建：

```text
20 张未来表
```

---

# 一百一十一、Schema Version

SQLite schema 必须拥有明确：

```text
schema version
```

并可迁移。

同时：

```text
user-owned JSON
```

也继续使用：

```text
schema_version
```

两者不要混为一谈。

---

# 一百一十二、Migration

M3 至少建立：

```text
Database Migration
```

与：

```text
User File Migration
```

概念边界。

不要把：

```text
数据库 migration
```

误认为：

```text
用户数据 migration
```

---

# 一百一十三、Migration 安全

任何 migration：

```text
backup / validation
```

之后再替换。

不能：

```text
upgrade failed
→ data destroyed
```

---

# 一百一十四、日志

记录：

```text
Index rebuild started
Index rebuild finished
Document indexed
Document skipped
Document failed
Search error
State persistence error
```

但不要记录：

```text
完整 Note 内容
敏感用户数据
```

没有必要就不要把用户阅读资料写进日志。

---

# 一百一十五、隐私

继续遵守：

> Reverie 默认是本地优先软件。

M3 Search 不应该：

```text
上传搜索词
上传文档标题
上传 Note
上传 Highlight
```

任何遥测都不是 M3 的一部分。

---

# 一百一十六、外部网络

M3 不需要增加新的网络能力。

搜索必须：

```text
offline usable
```

在断网情况下：

```text
Library
Search
Tags
Favorites
Inbox
Recent
```

全部正常工作。

---

# 一百一十七、离线测试

必须模拟：

```text
No Network
```

验证：

```text
Search
Library
State
```

不依赖：

```text
network
```

---

# 一百一十八、测试夹具

建立：

```text
M3 Search Corpus
```

至少包含：

```text
20 Chinese documents
20 English documents
10 mixed documents
10 technical documents
20 annotations
20 notes
20 tags
URLs
duplicate phrases
similar titles
```

可以使用 synthetic fixtures。

不要把真实私人资料直接放进仓库。

---

# 一百一十九、Search Corpus 必须可重复

固定：

```text
Document IDs
Texts
Tags
Annotations
Expected results
```

每次：

```text
CI
```

跑出来结果应该稳定。

---

# 一百二十、Search Ranking Test

不要只测试：

```text
result exists
```

还需要测试：

```text
top result
```

但只针对：

```text
明确规定的 ranking contract
```

测试。

如果 ranking 只是实现细节：

不要把过多 UI 偏好写死成测试。

---

# 一百二十一、Search Regression

至少建立：

```text
search-regression.json
```

或者等价 fixture。

记录：

```text
query
expected document IDs
expected match types
```

以后换：

```text
tokenizer
FTS configuration
ranking
```

能够发现回归。

---

# 一百二十二、Library Regression

测试：

```text
新增 Document
修改 Tag
修改 Favorite
修改 Read
修改 Inbox
删除 Document
```

之后：

```text
All
Inbox
Recent
Favorites
Unread
Tags
Search
```

结果都正确。

---

# 一百二十三、UI Tests

至少测试：

```text
Open Library
Open Inbox
Open Favorites
Open Recent
Filter Unread
Add Tag
Remove Tag
Mark Read
Mark Unread
Favorite
Unfavorite
Search
Open Search Result
Navigate to Match
```

---

# 一百二十四、E2E 核心闭环

必须完成：

```text
保存网页
 ↓
Library 出现
 ↓
标记 Tag
 ↓
Favorite
 ↓
Mark Read
 ↓
退出
 ↓
重新打开
 ↓
Library 状态仍然存在
 ↓
Search 找到
 ↓
点击 Search Result
 ↓
Reader 打开
 ↓
定位正文 / Annotation
```

---

# 一百二十五、M3 与 M2 的集成验收

必须完成：

```text
Document
+
Highlight
+
Note
+
Bookmark
+
Tag
+
Search
```

完整链路。

例如搜索：

```text
SQLite
```

可以找到：

```text
Article body
Highlight
Note
```

并且：

```text
Highlight / Note
```

点击后：

```text
准确回到 Reader
```

---

# 一百二十六、搜索结果中的 orphaned Annotation

如果：

```text
Annotation = orphaned
```

仍然应该可以：

```text
Search
```

找到其：

```text
selected_text
note
```

因为：

> Annotation 数据仍然存在。

但点击导航时应该显示：

```text
无法定位到当前正文
```

不能静默失败。

---

# 一百二十七、Orphaned 不得从索引消失

错误：

```text
Resolver failed
→ Annotation removed from search
```

正确：

```text
Annotation remains searchable
+
status = orphaned
```

---

# 一百二十八、Search 与内容版本

如果 Document 内容更新：

```text
Re-extract
```

导致：

```text
Body changed
```

必须重新建立：

```text
Search index
```

Annotation 是否重新定位：

由 M2 Annotation Resolver 处理。

M3 不应该重新复制一套 Anchor 算法。

---

# 一百二十九、Content Update Workflow

推荐：

```text
Document changed
↓
Document loader
↓
content_hash changed
↓
Library state unchanged
↓
Reindex body
↓
Annotation Resolver
↓
Update orphan status if needed
```

具体调用顺序根据现有 M1/M2 实现调整。

---

# 一百三十、Tag Update Workflow

例如：

```text
User adds Rust
```

必须：

```text
state file updated
↓
atomic replace
↓
search index updated
↓
Library refreshed
```

如果 SQLite 更新失败：

```text
state file remains correct
index marked dirty
```

稍后：

```text
reindex
```

恢复。

---

# 一百三十一、Recent Update Workflow

打开文档：

```text
Reader
↓
LibraryService
↓
persist last_opened_at
↓
index update
```

Recent 不应需要：

```text
独立数据库
```

---

# 一百三十二、Inbox Workflow

保存新文章：

```text
Document created
↓
inbox = true
↓
Library Index
↓
Inbox
```

用户：

```text
Remove from Inbox
```

只改变：

```text
inbox
```

不要：

```text
delete document
```

---

# 一百三十三、Favorite Workflow

用户：

```text
Favorite
```

只改变：

```text
favorite
```

不要：

```text
create tag
```

---

# 一百三十四、Read Workflow

用户：

```text
Mark as Read
```

只改变：

```text
read
```

不要自动：

```text
remove inbox
```

除非已有产品规则明确如此。

---

# 一百三十五、Search Filter Workflow

用户：

```text
Rust AI
```

然后：

```text
Favorites
```

必须形成：

```text
SearchQuery
+
Favorite Filter
```

而不是：

```text
先搜索
→ 再在 UI 随便隐藏部分结果
```

最好让核心查询层直接表达过滤。

---

# 一百三十六、分页

Search 和 Library 都不应该默认：

```text
一次加载全部 10,000 条
```

应支持：

```text
limit / offset
```

或 cursor。

如果使用 SQLite：

优先采用：

```text
LIMIT
```

并根据实际数据规模进行 benchmark。

---

# 一百三十七、不要过早实现无限滚动

可以使用：

```text
Load More
```

或者：

```text
virtualized list
```

取决于现有 UI。

核心要求：

> 大 Library 下不能一次性把所有内容加载进内存。

---

# 一百三十八、Memory

至少测试：

```text
1,000 documents
5,000 documents
10,000 documents
```

观察：

```text
RAM
Search latency
UI responsiveness
Index size
```

将真实数据写入：

```text
docs/PERF.md
```

或者现有性能文档。

---

# 一百三十九、不要伪造 Benchmark

所有：

```text
ms
MB
documents/sec
```

必须来自真实运行。

如果没有测试：

写：

```text
NOT MEASURED
```

不要写：

```text
~20ms
```

---

# 一百四十、M3 文档

至少建立：

```text
docs/M3-STATUS.md
docs/SEARCH.md
docs/LIBRARY.md
docs/USER-STATE.md
docs/SEARCH-FORMAT.md
```

---

# 一百四十一、SEARCH.md

明确：

```text
Searchable Fields
Query syntax
Tokenization
Ranking
Result model
Navigation
Reindex
Known limitations
```

---

# 一百四十二、LIBRARY.md

明确：

```text
Inbox
Recent
Favorites
Read / Unread
All
Tags
Filters
Sorting
```

---

# 一百四十三、USER-STATE.md

明确：

```text
read
favorite
inbox
tags
last_opened_at
```

每项：

```text
Meaning
Persistence
Update rule
Failure handling
```

---

# 一百四十四、SEARCH-FORMAT.md

如果项目使用：

```text
SQLite FTS
```

记录：

```text
schema
FTS tables
tokenizer
query generation
rebuild
migration
```

但不要把底层数据库实现写成公开用户数据格式。

---

# 一百四十五、M3 Commit 纪律

不要把整个 M3 压成一个 commit。

推荐按逻辑拆分：

```text
M3: establish library state model

M3: add library indexing pipeline

M3: add full-text search

M3: add search result navigation

M3: add tags and library filters

M3: add read favorite inbox state

M3: add recent library view

M3: add library UI

M3: add search and library integration tests
```

实际 commit 名称按照真正产生的逻辑变化调整。

不要为了数量人为拆分。

---

# 一百四十六、AI Coding 纪律

不要：

```text
M3
→ 顺便重构 Reader
→ 顺便重写 Annotation
→ 顺便换数据库
→ 顺便换 UI 框架
```

除非：

> 已有实现直接阻塞 M3。

遇到非阻塞问题：

```text
记录
↓
标记 P2 / P3
↓
继续
```

---

# 一百四十七、架构问题判断

不要因为：

```text
Service 有 300 行
DAO 有 200 行
某个 Component 命名不喜欢
目录不够漂亮
```

就进行大型重构。

只有当问题造成：

```text
数据错误
数据丢失
搜索错误
严重性能问题
安全漏洞
无法扩展
测试无法进行
```

时才升级。

---

# 一百四十八、问题分级

继续：

```text
P0
数据丢失
索引无法恢复
核心 Library 不可用
严重安全漏洞

P1
核心搜索错误
用户状态错误
大量资料无法索引
严重兼容问题

P2
一般 Bug
体验问题
局部性能问题

P3
代码洁癖
优化建议
未来增强
```

P0/P1 必须给：

```text
Evidence
Impact
Reproduction
Fix
```

---

# 一百四十九、M3 Gate

只有以下全部满足，M3 才算通过：

```text
[ ] Library 可以展示当前所有有效资料
[ ] Inbox 正常
[ ] Recent 正常
[ ] Favorites 正常
[ ] Read / Unread 正常
[ ] Tags 正常
[ ] Tag 持久化正常
[ ] Favorite 持久化正常
[ ] Read 持久化正常
[ ] Inbox 持久化正常
[ ] Recent 持久化正常

[ ] Title 搜索正常
[ ] Author 搜索正常
[ ] Body 搜索正常
[ ] Highlight 搜索正常
[ ] Note 搜索正常
[ ] Tag 搜索正常
[ ] URL 搜索正常

[ ] 中文搜索经过 benchmark
[ ] 英文搜索经过 benchmark
[ ] 中英混合搜索经过 benchmark
[ ] 数字搜索经过 benchmark
[ ] 技术文本搜索经过 benchmark

[ ] 搜索结果不会重复产生同一 Document 的多个无意义结果
[ ] 搜索结果显示上下文
[ ] Body 命中可以定位 Reader
[ ] Highlight 命中可以定位 Annotation
[ ] Note 命中可以定位 Annotation

[ ] orphaned Annotation 仍然可搜索
[ ] orphaned Annotation 不会被静默删除

[ ] Search 支持基础 Filter
[ ] Tag Filter 正常
[ ] Read Filter 正常
[ ] Favorite Filter 正常
[ ] Inbox Filter 正常

[ ] 搜索结果更新不会被旧请求覆盖
[ ] Search 不会阻塞 Reader
[ ] Library 长列表可正常工作

[ ] SQLite 不是用户资料唯一来源
[ ] 删除 SQLite 后 Library 可以重建
[ ] Reindex 可以恢复搜索
[ ] Reindex 不损坏旧索引
[ ] 增量索引经过测试
[ ] 删除 Document 后不存在幽灵搜索结果

[ ] 单个坏文件不会拖垮整个 Library
[ ] Doctor 能发现索引/文件不一致
[ ] state 文件使用安全写入
[ ] 索引更新顺序不会制造数据库假事实

[ ] 全部 Unit Tests 通过
[ ] Integration Tests 通过
[ ] Search Regression Tests 通过
[ ] Persistence Round-trip Tests 通过
[ ] Reindex Tests 通过
[ ] UI/E2E Tests 通过

[ ] Windows Build 通过
[ ] CI 通过
[ ] M3 文档完成
[ ] PROGRESS.md 已更新
[ ] Git Commit 已完成
```

---

# 一百五十、M3 最终验收 Demo

必须能够现场完整演示：

```text
1. Library 中已有至少几十篇资料
        ↓
2. 打开 Inbox
        ↓
3. 打开一篇文章
        ↓
4. 添加 Tag：
   Rust
   AI
        ↓
5. Favorite
        ↓
6. Mark as Read
        ↓
7. 关闭
        ↓
8. 重新打开
        ↓
9. 状态全部保留
```

然后：

```text
10. 搜索：
    Rust
        ↓
11. 返回相关文章
        ↓
12. 搜索结果显示上下文
        ↓
13. 点击结果
        ↓
14. Reader 跳转到命中位置
```

然后：

```text
15. 搜索一个 Highlight 中存在的词
        ↓
16. 找到对应文章
        ↓
17. 显示 Match = Highlight
        ↓
18. 点击
        ↓
19. 跳回 Highlight
```

然后：

```text
20. 搜索 Note 内容
        ↓
21. 找到 Annotation
        ↓
22. 定位到 Note
```

然后：

```text
23. 删除 index.db
        ↓
24. Reindex
        ↓
25. Search
        ↓
26. 所有资料仍能正确找到
        ↓
27. Tags / Favorite / Read / Inbox
    全部正确恢复
```

最后：

```text
28. 人为让一个 Annotation 无法定位
        ↓
29. Search 仍然可以找到它
        ↓
30. 状态显示 orphaned
        ↓
31. 不会静默丢失
```

---

# 一百五十一、M3 最终报告

完成后必须输出：

```text
# M3 Final Report

## 1. Implementation Summary

## 2. Repository Baseline

## 3. Library Architecture

## 4. User State Model

## 5. Tag Model

## 6. Search Architecture

## 7. Searchable Fields

## 8. Query Syntax

## 9. Tokenization / Chinese Search

## 10. Ranking Strategy

## 11. Search Navigation

## 12. Library Views

## 13. Index Architecture

## 14. Reindex Strategy

## 15. Data Integrity

## 16. Failure Recovery

## 17. Performance Benchmarks

## 18. Test Coverage

## 19. Known Limitations

## 20. Deferred Features

## 21. FACT / HYPOTHESIS / INFERENCE

## 22. P0 / P1 / P2 / P3

## 23. M3 Gate

## 24. M4 Preconditions
```

---

# 一百五十二、FACT / HYPOTHESIS / INFERENCE

报告必须严格区分：

### FACT

实际代码和测试已经证明：

```text
事实
```

### HYPOTHESIS

当前仍未完全验证：

```text
假设
```

### INFERENCE

基于已有事实得到：

```text
推断
```

尤其是：

```text
中文搜索质量
搜索排序
大规模 Library 性能
```

不得用主观判断伪装成 FACT。

---

# 一百五十三、M4 前置条件

M3 完成后，为 M4 RSS 留下稳定基础：

```text
Document
Source
Library
Search
Tags
Read State
Inbox
Recent
```

M4 才在此基础上增加：

```text
RSS / Atom
Feed Management
Fetching
Deduplication
```

不要在 M3 提前实现 RSS。

---

# 一百五十四、M3 的真正产品目标

始终记住：

M3 不是：

> “做一个搜索框。”

也不是：

> “做一个漂亮的资料卡片列表。”

真正目标是：

```text
保存 10 篇
    ↓
还能找到

保存 100 篇
    ↓
还能找到

保存 1,000 篇
    ↓
还能找到

保存很多年
    ↓
依然知道：
    - 我收藏了什么
    - 我读过什么
    - 哪些还没处理
    - 最近看过什么
    - 我给什么资料打过什么标签
    - 我曾经在哪里划过线
    - 我曾经写过什么 Note
```

最终形成：

```text
                 Reverie Library
                       │
       ┌───────────────┼───────────────┐
       ↓               ↓               ↓
    Search           Filters         Recent
       │               │
       ↓               ↓
  Document         Inbox / Favorite
       │
 ┌─────┼─────┐
 ↓     ↓     ↓
Body Highlight Note
       │
       ↓
     Reader
```

而这一切必须建立在：

```text
用户文件
    ↓
稳定 Domain Model
    ↓
可重建 Index
```

之上。

**M3 的唯一核心指标：**

> **当 Reverie 的资料开始真正“多起来”以后，用户依然能快速、可靠地找到并重新进入自己过去保存和阅读过的内容。**