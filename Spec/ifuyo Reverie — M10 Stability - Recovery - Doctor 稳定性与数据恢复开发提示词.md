# ifuyo Reverie — M10 Stability / Recovery / Doctor 稳定性与数据恢复开发提示词

> **阶段：M10**
>
> **目标：稳定性、数据一致性、异常恢复、格式迁移、自检与安全修复**
>
> **前置阶段：M0 → M9**
>
> **后续阶段：M11 Windows Productization**
>
> **核心原则：M10 不以增加用户功能为目标，而以让 Reverie 在长期使用、异常退出、数据损坏、升级迁移、文件移动、索引丢失等情况下依然可恢复、可诊断、可维护为目标。**

---

# 0. 执行身份

你现在不是单纯的代码实现 Agent，而是 **Reverie 项目的稳定性工程师、数据完整性工程师、恢复机制设计师和最终生产前审计者**。

本阶段必须严格遵守以下原则：

1. **文件是真相，SQLite 只是派生索引 / 缓存 / UI 状态**
2. **任何恢复机制都不得反客为主，不能让 SQLite 反向覆盖用户文件**
3. **任何 Repair 默认优先保守，不得静默删除用户数据**
4. **任何自动修复都必须明确记录修复前状态、修复动作、修复结果**
5. **无法可靠修复的问题必须标记为 unresolved，而不是伪造成功**
6. **异常退出不得导致半写入文件成为“正常文件”**
7. **格式升级不得因为版本变化而静默丢字段**
8. **索引损坏必须可以重新生成**
9. **用户数据即使脱离 Reverie，也必须尽可能保持可理解、可备份、可恢复**
10. **M10 重点不是“代码看起来更漂亮”，而是实际故障下数据是否安全**
11. **不要为了满足本提示词的文字结构而制造没有实际价值的抽象、框架、服务或数据库表**
12. **不要重复建立 M1～M9 已经存在的能力**
13. **优先复用现有 Data / Library / Reader / Annotation / Import / Export 基础设施**
14. **任何重大设计调整必须先证明现有实现确实不足**
15. **M10 完成后，Reverie 才具备进入 Windows Productization 的基础**

---

# 1. M10 的阶段目标

M10 的核心问题只有一个：

> **当 Reverie 遇到“坏掉、断掉、改过、移动过、升级过、删掉索引、异常退出”时，用户的数据还能不能回来？**

最终需要形成完整的：

```text
发现问题
   ↓
诊断问题
   ↓
分类问题
   ↓
判断是否可自动修复
   ↓
安全备份 / 快照
   ↓
执行修复
   ↓
重新验证
   ↓
更新派生索引
   ↓
记录修复结果
```

最终形成：

```text
Reverie
├── 正常运行
├── 异常退出恢复
├── 数据完整性检查
├── 索引重建
├── 数据修复
├── 格式迁移
├── 备份 / 安全副本
├── 故障诊断
├── 性能稳定性
├── 并发与取消
└── Doctor
```

---

# 2. M10 非目标

本阶段明确禁止把范围扩张到以下内容。

## 2.1 不做云同步

不实现：

- 云备份
- 云同步
- WebDAV 同步
- NAS 同步框架
- 账号系统
- 多设备同步
- 在线灾难恢复

---

## 2.2 不做商业化

不实现：

- Installer
- 自动更新
- 软件签名
- 商业授权
- License Server
- 在线激活
- 商业遥测
- 崩溃数据上传平台
- SaaS

这些属于 M11 或更后续阶段。

---

## 2.3 不重新开发 Reader

不在 M10 重写：

- Web Reader
- EPUB Reader
- PDF Reader
- Markdown Reader
- TXT Reader
- TTS

M10 只处理它们的：

- 生命周期稳定性
- 数据一致性
- 状态恢复
- 错误隔离
- Doctor 支持
- 回归验证

---

## 2.4 不重新设计 Annotation

M2 已经确定 Generic Annotation 模型。

M10 只负责：

- annotation 数据损坏检测
- orphan 检测
- anchor 无法解析检测
- 格式版本迁移
- 可恢复情况下的 re-resolve
- 不可恢复情况下的明确标记

---

# 3. 第一原则：重新确认数据真相模型

在开始写代码之前，必须先检查当前项目实际实现。

最终必须保证：

```text
User Files
   ↓
Source of Truth
   ↓
Library Scanner / Loader
   ↓
Derived Model
   ↓
SQLite Index
```

而不能变成：

```text
SQLite
   ↓
重新生成用户文件
```

除非用户明确执行：

- Export
- Repair
- Migration
- Rebuild Derived Data

---

# 4. M10 第一任务：全面 Explore 当前实现

不要立即开始编码。

首先全面检查：

```text
M0
M1
M2
M3
M4
M5
M6
M7
M8
M9
```

以及当前实际代码。

重点调查：

```text
Library
Storage
Persistence
FileSystem
JSON
JSONL
SQLite
Import
Export
Annotation
ReaderLocation
Web Capture
RSS
EPUB
PDF
TTS
Preferences
Document Metadata
Assets
Atomic Write
Temp Files
Caching
Concurrency
Cancellation
```

必须形成实际现状报告。

---

# 5. M10-Explore 检查内容

至少调查：

## 5.1 所有持久化文件

列出：

```text
articles/
books/
pdf/
exports/
annotations
metadata
preferences
feed subscriptions
reading state
user state
assets
database
cache
temporary files
```

明确每类数据：

| 数据 | Source of Truth | 是否可重建 | 是否重要 |
|---|---|---:|---:|
| Article Content | 文件 | 否 | 极高 |
| EPUB | 原文件 | 否 | 极高 |
| PDF | 原文件 | 否 | 极高 |
| Metadata | 文件 | 否 | 高 |
| Annotation | 文件 | 否 | 极高 |
| SQLite Index | SQLite | 是 | 中 |
| Thumbnail | Cache | 是 | 低 |
| Search Index | SQLite | 是 | 中 |
| Temporary Data | Temp | 是 | 低 |

不要机械照搬示例表，必须根据实际代码建立真实版本。

---

# 6. Persistence Audit

逐个调查现有写入路径：

```text
Create
Update
Delete
Move
Rename
Import
Export
Annotation
Bookmark
Progress
Feed Refresh
Metadata Update
Settings
```

每条写入路径都回答：

1. 是否 atomic
2. 是否存在 temp file
3. 是否存在 flush
4. 是否验证内容
5. 是否存在中断窗口
6. 是否可能留下 `.tmp`
7. 是否可能出现 0-byte file
8. 是否可能写半个 JSON
9. 是否可能 DB 已更新但文件未更新
10. 是否可能文件已更新但 DB 未更新
11. 是否可以重新扫描恢复
12. 是否需要 repair

---

# 7. 原子写入统一机制

如果项目中已经存在 Atomic Write：

> 不要重复创建第二套。

首先检查现有实现。

如果当前实现不足，统一为可复用机制：

```text
Prepare
 ↓
Write Temp
 ↓
Flush
 ↓
Validate
 ↓
Atomic Replace
 ↓
Verify
```

至少支持：

```text
temp filename
flush
file validation
atomic rename / replace
cleanup temp
```

---

# 8. Atomic Write 的失败语义

必须明确：

### 情况 A

原文件：

```text
valid
```

新文件写入失败。

结果必须：

```text
原文件仍然 valid
```

---

### 情况 B

temp 文件写完但 validation 失败。

结果：

```text
原文件不动
temp 清理 / 标记
```

---

### 情况 C

进程在 replace 前退出。

下次启动：

```text
原文件仍可读
```

---

### 情况 D

进程在 replace 后退出。

下次启动：

```text
新文件必须是完整有效文件
```

---

# 9. Orphan Temporary File Recovery

启动时必须检查：

```text
*.tmp
*.partial
*.bak
*.recovery
```

以及项目实际采用的其它临时文件命名。

对于发现的临时文件：

不要立即删除。

分类：

```text
ValidTemp
InvalidTemp
OrphanTemp
UnknownTemp
```

Doctor 可以：

```text
Keep
Delete
Restore
Inspect
```

但默认：

> 不自动把 temp 覆盖回正式文件。

除非存在明确、可靠、可验证的恢复规则。

---

# 10. Crash Recovery

设计真实异常退出场景：

```text
Save Article
Save Metadata
Save Annotation
Save Progress
Refresh Feed
Import
Export
Generate EPUB
Rebuild Index
Repair
Migration
```

分别模拟：

```text
正常完成
异常退出前
异常退出中
异常退出后
```

验证：

```text
source data
derived data
temp files
index
UI state
```

是否仍然一致。

---

# 11. SQLite 崩溃恢复

SQLite 必须明确：

> **SQLite 损坏不等于用户数据损坏。**

测试：

```text
delete index.db
delete journal
corrupt db
truncate db
partial db
lock db
readonly db
```

Reverie 必须能够：

```text
detect
disconnect
discard derived index
scan filesystem
rebuild temp database
validate
atomic replace
```

---

# 12. Index Rebuild

形成明确的：

```text
Index Rebuilder
```

但必须复用已有：

```text
Library Scanner
Document Loader
Metadata Loader
Annotation Loader
```

不得再次独立实现内容解析。

正确关系：

```text
Filesystem
   ↓
Library Scanner
   ↓
Canonical Domain Objects
   ↓
Indexer
   ↓
SQLite
```

而不是：

```text
Filesystem
 ├── Library Scanner
 ├── Search Parser
 ├── Index Parser
 └── Doctor Parser
```

---

# 13. Index Rebuild 的核心要求

删除：

```text
index.db
```

后：

```text
启动 Reverie
 ↓
发现 Index 缺失
 ↓
进入 Rebuild
 ↓
扫描 Library
 ↓
验证 Source Data
 ↓
建立临时 DB
 ↓
完成
 ↓
验证
 ↓
Atomic Replace
```

整个过程失败：

```text
旧 DB 如果存在 → 不覆盖
新 DB 不完整 → 不进入正式位置
```

---

# 14. Doctor 系统

M10 的核心产品资产：

# `Reverie Doctor`

Doctor 不是单纯的“数据库修复按钮”。

它应该是：

> **Reverie 数据健康检查、故障诊断、安全修复和恢复入口。**

---

# 15. Doctor 架构

优先采用现有架构，不制造巨型框架。

建议结构：

```text
Doctor UI / Command
        ↓
Doctor Coordinator
        ↓
Doctor Checks
        ↓
Doctor Findings
        ↓
Repair Planner
        ↓
Repair Executor
        ↓
Post-Repair Validator
        ↓
Report
```

---

# 16. Doctor Check 分类

至少覆盖：

```text
Filesystem
Metadata
Content
Annotations
Bookmarks
Progress
Assets
Feeds
References
Index
Exports
Version
Migration
```

---

# 17. Doctor Finding 模型

每个问题至少包含：

```text
CheckId
Severity
EntityType
EntityId
Path
Problem
Evidence
Repairability
SuggestedAction
```

Severity 至少：

```text
Info
Warning
Error
Critical
```

不要为了制造严重性而滥用 Critical。

---

# 18. Doctor 问题类型

至少检查：

## 文件

```text
missing
empty
unreadable
unexpected extension
duplicate identity
invalid path
```

## Metadata

```text
invalid JSON
missing required field
unknown version
invalid enum
invalid identifier
invalid timestamp
```

## Annotation

```text
missing target
invalid anchor
orphaned
invalid JSONL
duplicate annotation id
invalid range
unsupported version
```

## Library

```text
duplicate document
broken reference
document without metadata
metadata without document
asset without owner
owner without asset
```

## Index

```text
missing DB
stale DB
missing document row
extra document row
mismatched metadata
annotation index mismatch
orphan search result
```

## Feed

```text
invalid feed metadata
missing URL
duplicate subscription
invalid refresh state
```

## Export

```text
incomplete artifact
invalid generated EPUB
temporary output
broken export reference
```

---

# 19. Doctor 必须区分：

```text
Detected
Repairable
Automatically Repairable
Requires User Decision
Unrecoverable
```

例如：

```text
Missing thumbnail
→ Automatically Repairable
```

而：

```text
Missing source article
→ Cannot reconstruct source
```

不能伪装成：

```text
Repair Successful
```

---

# 20. Repair 原则

Repair 必须遵守：

> **宁可不修，也不能把正确数据修坏。**

Repair 前：

```text
Validate
Snapshot / Backup
Plan
```

然后：

```text
Apply
Validate
Commit
```

任何一个阶段失败：

```text
Rollback / Preserve original
```

---

# 21. Repair 分级

建议：

### Safe Repair

无需用户决策：

```text
rebuild SQLite
remove orphan temp
regenerate cache
recreate thumbnail
normalize derived index
```

### Conditional Repair

需要明确规则：

```text
metadata field migration
annotation re-anchor
duplicate merge
path relocation
legacy schema conversion
```

### Destructive Repair

必须显式用户确认：

```text
delete duplicate source
delete invalid user data
merge conflicting documents
overwrite metadata
discard unrecoverable annotations
```

默认禁止自动执行 Destructive Repair。

---

# 22. Doctor Repair Log

每次 Repair 必须有结构化记录。

至少：

```text
RepairId
StartedAt
CompletedAt
CheckId
Target
BeforeState
Action
AfterState
Result
```

结果：

```text
Success
Partial
Skipped
Failed
```

不能只有：

```text
Repair completed.
```

---

# 23. Repair 前安全副本

对于涉及：

```text
user metadata
annotation
reading state
bookmark
source content
```

的 Repair，优先创建安全副本。

建议：

```text
recovery/
backups/
doctor/
```

具体目录名以现有架构为准。

副本必须：

- 可识别
- 不覆盖已有副本
- 有时间戳
- 能追溯来源
- 不参与正常 Library 索引
- 不被 Doctor 当成新的用户资料

不要无限制制造备份。

---

# 24. 数据格式 Versioning

M10 必须正式审计所有：

```text
meta.json
annotations.jsonl
feed metadata
reading state
bookmark
preferences
export metadata
```

确认：

```text
schema version
```

是否存在。

---

# 25. Version Migration

必须支持明确的：

```text
v1 → v2
v2 → v3
...
```

迁移必须：

```text
Detect
 ↓
Validate old version
 ↓
Backup
 ↓
Migrate
 ↓
Validate new version
 ↓
Atomic Replace
```

不允许：

```text
打开旧文件
直接覆盖
发现失败后数据已无法恢复
```

---

# 26. Unknown Version

如果遇到：

```text
future version
unknown schema
```

必须：

```text
Read-only / Unsupported
```

而不是：

```text
try best effort
然后覆盖
```

核心原则：

> **Reverie 不应该因为不知道某个新字段是什么意思，就把用户文件重写成旧格式。**

---

# 27. Forward Compatibility

检查当前序列化实现是否会：

```text
读取旧文件
重新保存
→ 删除未知字段
```

如果存在这种风险，需要修正。

对于用户重要文件，应尽量：

```text
preserve unknown fields
```

或者至少阻止不安全的 rewrite。

---

# 28. Data Migration 测试

至少建立：

```text
Legacy Fixtures
Current Fixtures
Malformed Fixtures
Future-Version Fixtures
```

测试：

```text
old → current
current → read
future → safely reject
invalid → safely reject
```

---

# 29. Annotation Recovery

重点验证：

```text
M2 Annotation
M6 EPUB
M7 PDF
M4 RSS
M5 Import
M9 Export
```

之间的 Annotation 生命周期。

必须保证：

```text
source changed
   ↓
resolve
   ↓
success → keep
failure → orphan
```

绝不能：

```text
resolve failed
↓
delete annotation
```

---

# 30. Annotation Repair

可恢复：

```text
exact range
structural locator
quote/context
normalized text
```

按已有 M2 设计重新尝试。

必须记录：

```text
old locator
new locator
match method
confidence / status
```

但不要重新发明第二套 Locator 系统。

---

# 31. Orphan Annotation

Orphan 必须成为：

> 正常、明确、可管理的数据状态。

Doctor 应能够显示：

```text
Orphaned Annotation
```

并说明：

```text
Target Document
Old Location
Saved Quote
Saved Context
Possible Recovery
```

但不要伪造恢复。

---

# 32. Duplicate Detection

M10 需要正式审计重复资料。

重复身份优先级继续沿用项目已有身份规则：

```text
Stable External ID
Canonical URL
Normalized URL
Strong Content Identity
Content Hash
```

禁止：

```text
Title only
```

作为唯一重复判断依据。

---

# 33. Duplicate Repair

不要默认自动删除。

建议：

```text
Candidate Duplicate
      ↓
Show Comparison
      ↓
User Decision / deterministic merge
```

对于真正可以确定为重复且只是派生索引重复：

可以自动修复。

对于两个真实 Source File：

必须保守。

---

# 34. Broken Asset Detection

针对：

```text
Web Article
EPUB
PDF
Export
```

检查：

```text
missing image
missing local asset
broken relative path
invalid URI
invalid mime
unreadable file
```

但要区分：

```text
critical resource
optional resource
```

---

# 35. Asset Repair

例如：

```text
thumbnail missing
→ regenerate

cached preview missing
→ regenerate

original article image missing
→ do NOT fabricate

EPUB exported image missing
→ regenerate export OR mark export invalid
```

---

# 36. Web Article Integrity

M1/M4 保存的 Web Article 重点检查：

```text
article.md
meta.json
annotations.jsonl
source/
assets/
```

保证关系：

```text
Document
 ├── content
 ├── metadata
 ├── annotations
 ├── source
 └── assets
```

不会出现大量无法解释的孤立引用。

---

# 37. EPUB Integrity

M6/M9 之后必须检查：

```text
.epub
metadata
annotations
```

但不要把 EPUB 导出的临时文件误识别为源书籍。

特别检查：

```text
incomplete export
0-byte epub
invalid zip
invalid container
invalid OPF
missing spine
missing resources
```

---

# 38. PDF Integrity

PDF 的 Source of Truth 始终是：

```text
original PDF
```

Doctor 可以检查：

```text
file existence
readability
fingerprint
metadata
annotation relationship
```

但不要因为 Reader Parser 出错就重写用户 PDF。

---

# 39. Index Consistency Checker

必须正式实现：

```text
Source → Index
Index → Source
```

双向检查。

例如：

```text
Source exists
Index missing
```

↓

```text
Reindexable
```

而：

```text
Index exists
Source missing
```

↓

```text
stale index / missing source
```

必须明确标记。

---

# 40. Index Staleness

Index 不能假设永远正确。

检查：

```text
mtime
size
content hash
document fingerprint
metadata version
```

以当前架构支持的最稳定方式为准。

最终能够判断：

```text
Current
Stale
Missing
Corrupt
Unknown
```

---

# 41. Reindex Strategy

不要每次启动都全量扫描。

正常情况：

```text
incremental
```

异常 / Doctor / 用户明确操作：

```text
full rebuild
```

提供明确入口：

```text
Rebuild Library Index
```

---

# 42. Library Root 移动

这是 Windows 环境非常重要的真实场景。

测试：

```text
D:\Reverie
→ E:\Reverie
```

或者：

```text
Old Folder
→ New Folder
```

必须确认：

- Source files 可访问
- Relative references 不失效
- SQLite 不保存无法恢复的绝对路径依赖
- Assets 仍可解析
- Annotation 不因路径改变直接失效
- Library 可以重新扫描

---

# 43. 用户手工修改文件

Reverie 是 file-native 软件。

因此必须考虑：

```text
user edited meta.json
user deleted image
user moved file
user renamed directory
user restored backup
user copied library from another PC
```

Reverie 不可以把用户文件视为“只能通过软件修改”的私有数据库。

---

# 44. External File Change Detection

检查现有系统是否能够发现：

```text
Modified
Deleted
Created
Moved
```

如果已有 File Watcher：

复用。

没有必要为了 M10 引入重量级同步框架。

---

# 45. External Modification 处理

用户修改源文件后：

```text
Detect
 ↓
Validate
 ↓
Reload
 ↓
Update Derived State
 ↓
Resolve Annotation
```

失败：

```text
preserve source
mark issue
```

不要自动覆盖用户修改。

---

# 46. Read State / Progress Recovery

M3/M6/M7/M8 已经定义了阅读状态。

M10 重点验证：

```text
progress write
bookmark write
tts current location
reader state
```

异常退出后：

```text
last valid state
```

应当优先恢复，而不是：

```text
0%
```

---

# 47. Progress 高频写入审计

重点检查：

```text
scroll
page change
TTS segment
EPUB chapter
PDF page
```

是否导致：

```text
大量磁盘写入
```

M10 不需要重新实现 Progress。

需要的是：

```text
debounce
coalesce
atomic persistence
shutdown flush
```

具体策略以现有实现为准。

---

# 48. Shutdown Recovery

应用关闭时明确处理：

```text
active read
pending save
active import
active export
active index build
active repair
active TTS
```

正确处理：

```text
Cancellation
Flush
Finalize
Cleanup
```

不能：

```text
shutdown
→ fire-and-forget task
→ process exits
→ data lost
```

重点审计：

```text
async void
unobserved task
fire-and-forget
background worker
cancellation token misuse
```

---

# 49. Concurrency Audit

检查：

```text
Import
Refresh
Search
Indexing
Reader
Annotation Save
Progress Save
Doctor
Export
```

之间是否存在：

```text
race condition
double write
stale state
lost update
deadlock
file lock conflict
SQLite lock
```

---

# 50. Generation / Cancellation Consistency

延续 M3/M4/M8 中已有的：

```text
Cancellation
Generation
Debounce
```

确认：

```text
old operation
```

不会在：

```text
new operation
```

完成后把旧结果写回来。

---

# 51. Doctor 与并发

Doctor 运行期间必须明确：

```text
read only
```

还是：

```text
exclusive repair
```

建议：

### Diagnose

允许读取。

### Repair

对目标资源获得必要的独占控制。

不要让：

```text
Doctor Repair
```

同时与：

```text
Import
Feed Refresh
Annotation Save
Export
```

修改同一对象。

---

# 52. Safe Mode 思路

如果项目结构允许，可增加轻量级：

```text
Recovery Mode
```

目的：

当正常启动失败时：

```text
disable nonessential cache
skip damaged index
load minimal configuration
enter Doctor / Rebuild
```

但：

> 不要因此制造完整第二启动框架。

只有在实际启动失败问题存在时才实现必要部分。

---

# 53. Configuration Recovery

Preferences / Settings 出现：

```text
invalid JSON
unknown field
bad enum
invalid path
```

必须：

```text
fallback to defaults
```

但不要影响：

```text
Library data
Annotations
Documents
Reading State
```

---

# 54. Configuration Backup

修改关键配置前应尽可能保留：

```text
previous valid state
```

避免一次配置写坏后应用永远无法启动。

---

# 55. Import Recovery

重点测试 M5：

```text
Import
```

异常退出：

```text
10 files imported
11th file crashed
```

最终必须允许：

```text
already-valid 10 files remain
```

而不是整个 Library 回滚或全部损坏。

---

# 56. Import Idempotency

重复执行同一个 Import：

```text
Import
Import again
Import again
```

不得产生：

```text
unbounded duplicates
```

继续沿用 M5 的 Identity / Dedup 规则。

---

# 57. Export Recovery

重点测试：

```text
Export
→ process killed
```

最终不应出现：

```text
半个正式文件
```

应采用：

```text
temp output
 ↓
validate
 ↓
atomic finalize
```

例如 EPUB：

```text
book.epub.tmp
 ↓
validation
 ↓
book.epub
```

---

# 58. Export Artifact 与 Source 分离

必须确保：

```text
Export failure
```

不会修改：

```text
source article
source epub
source pdf
annotations
metadata
```

---

# 59. M9 Web→EPUB Recovery

特别测试：

```text
Web Article
 ↓
Web→EPUB
 ↓
large asset
 ↓
broken asset
 ↓
invalid HTML
 ↓
cancel
 ↓
crash
```

都不能破坏原 Web Archive。

---

# 60. M8 TTS Recovery

重点检查：

```text
TTS
 → Reader
 → Progress
```

关系。

异常退出：

```text
TTS state
```

不能造成：

```text
corrupt reading progress
```

也不能产生第二套 Progress。

---

# 61. Logging

M10 必须审计日志。

日志应能回答：

```text
发生了什么？
在哪个对象？
哪个阶段？
为什么失败？
是否修改了用户数据？
结果是什么？
```

但不能把：

```text
全文
完整 PDF 文本
完整 EPUB 内容
完整用户笔记
```

大量写入日志。

---

# 62. Error Classification

建立统一错误分类，优先复用现有错误体系。

建议：

```text
ValidationError
PersistenceError
CorruptionError
MigrationError
IndexError
ResourceError
SecurityError
Cancellation
ConcurrencyError
UnsupportedVersion
```

不要为了枚举数量而制造类型。

---

# 63. Doctor Report

最终 Doctor 应输出：

```text
Health Summary
Total Checks
Passed
Warnings
Errors
Critical
Repairable
Unrecoverable
```

并提供：

```text
Details
```

例如：

```text
Library
  124 documents

Healthy
  118

Warnings
  4

Repairable
  2

Unrecoverable
  0
```

实际 UI 不必照这个文字实现，但语义必须完整。

---

# 64. Doctor UI

Doctor UI 至少需要：

```text
Scan
Results
Severity
Details
Repair
Repair Preview
Repair Result
Export Report
```

建议支持：

```text
Scan Only
Safe Repair
```

不要把：

```text
Repair All
```

做成无脑按钮。

---

# 65. Repair Preview

在实际执行 Repair 前，尽可能展示：

```text
Target
Problem
Proposed Repair
Files Affected
Backup
Risk
```

例如：

```text
2 stale index records

Action:
Rebuild index

User source files:
0 modified
```

---

# 66. Report Export

Doctor 报告建议支持：

```text
human-readable
machine-readable
```

例如：

```text
DoctorReport.json
DoctorReport.md
```

但不要把完整用户文章内容塞进报告。

---

# 67. Integrity Hash

审计现有 Hash / Fingerprint 使用。

需要区分：

```text
File Identity
Content Integrity
Export Determinism
Index Freshness
```

不能拿一个 Hash 解决所有问题。

---

# 68. Source Immutability Tests

以下操作前后必须验证：

```text
Import
Search
Read
Highlight
Note
Bookmark
TTS
Doctor Scan
Index Rebuild
EPUB Export
PDF Reader
Web→EPUB
```

source 文件 hash 不应无故改变。

只有明确的用户修改 / Migration / Repair 才允许变化。

---

# 69. Fault Injection

M10 不应该只测试 happy path。

必须主动制造：

```text
write failure
permission denied
file locked
disk full simulation
invalid JSON
truncated JSONL
missing asset
missing document
corrupt DB
crash during atomic write
crash during migration
crash during import
crash during export
cancel during scan
cancel during repair
```

注意：

不能依赖真实破坏开发者工作目录。

必须使用：

```text
isolated test fixture
temporary library
```

---

# 70. Crash Simulation

对于关键 Persistence Pipeline，加入测试级 fault injection：

例如：

```text
BeforeTempWrite
AfterTempWrite
BeforeFlush
AfterFlush
BeforeValidation
AfterValidation
BeforeReplace
AfterReplace
BeforeIndexUpdate
AfterIndexUpdate
```

不要求生产环境保留所有测试钩子。

可以：

```text
DEBUG / TEST only
```

---

# 71. Property / Fuzz Testing

对以下数据优先做：

```text
JSON
JSONL
HTML
RSS XML
EPUB OPF
metadata
annotation
search query
path
URI
ReaderLocation
```

至少确保：

```text
random malformed input
```

不会：

```text
crash entire application
```

或者：

```text
corrupt source data
```

---

# 72. Recovery Invariants

M10 必须正式定义关键不变量。

至少：

### Invariant 1

```text
SQLite loss != source data loss
```

### Invariant 2

```text
Index rebuild != source mutation
```

### Invariant 3

```text
Failed write != partial source replacement
```

### Invariant 4

```text
Failed annotation resolve != annotation deletion
```

### Invariant 5

```text
Export failure != source mutation
```

### Invariant 6

```text
Unknown schema != destructive rewrite
```

### Invariant 7

```text
Doctor failure != data loss
```

### Invariant 8

```text
Cancellation != corrupted persistent state
```

---

# 73. Backup / Restore Test

至少测试：

```text
Copy Library
 ↓
Delete original
 ↓
Restore copy
 ↓
Open in Reverie
 ↓
Rebuild Index
 ↓
Read
 ↓
Search
 ↓
Annotations
 ↓
Progress
```

这是 M10 极其重要的验收场景。

---

# 74. Cross-Machine Portability

Windows-first 但仍要测试：

```text
Machine A
Library
 ↓
copy to Machine B
 ↓
open
```

检查：

```text
absolute paths
machine-specific paths
cache assumptions
native dependencies
font assumptions
thumbnail assumptions
```

不能让用户数据绑定到某台机器。

---

# 75. Portable Library Test

最终需要验证：

```text
Library Folder
```

可以：

```text
Copy
Backup
Restore
Inspect
Re-index
```

用户不需要：

```text
copy SQLite internals
copy application cache
copy temp
```

才能恢复自己的资料。

---

# 76. Missing SQLite Test

这是 M10 必须通过的硬验收：

```text
关闭 Reverie

删除 index.db

重新打开

系统检测到 Index Missing

执行自动 / 手动 Rebuild

Library 恢复

Search 恢复

Filters 恢复

Annotations 可查询

Reader 正常

Progress 正常
```

---

# 77. Corrupt SQLite Test

测试：

```text
invalid db
```

必须：

```text
detect
isolate
rebuild
```

而不是：

```text
fatal startup error
```

---

# 78. Missing Source Test

删除一个 Article Source：

```text
index still exists
```

启动：

```text
detect missing source
```

必须：

```text
mark unavailable
remove stale derived state
```

但：

> 不得自动创建假的 source。

---

# 79. Metadata Corruption Test

例如：

```text
meta.json = invalid JSON
```

必须：

```text
Doctor finds it
```

如果无法安全恢复：

```text
quarantine / report
```

但：

```text
不覆盖为默认 metadata
```

除非有明确的、可逆的修复规则。

---

# 80. Annotation Corruption Test

例如：

```text
annotations.jsonl
```

出现：

```text
line 27 malformed
```

不要简单：

```text
delete whole file
```

应研究是否可以：

```text
parse valid lines
identify invalid line
preserve original
produce repairable result
```

任何 destructive recovery 必须极其谨慎。

---

# 81. Partial File Recovery

对于 JSONL 等适合逐条处理的格式：

优先采用：

```text
record-level recovery
```

而不是：

```text
whole-file discard
```

但：

> 是否实施必须由实际数据格式和语义安全性决定。

---

# 82. Quarantine

对于明确损坏且无法进入正常 Library 的用户文件，可以设计：

```text
quarantine/
```

但：

- 不能静默移动用户文件
- 必须记录原因
- 必须保留原路径
- 必须可恢复
- 不进入普通索引
- 不与正常 Library 混在一起

---

# 83. Security Review

M10 必须对 M0～M9 再做一次横向安全审计。

重点：

```text
Path Traversal
ZIP Bomb
Huge ZIP
Huge XML
Entity Expansion
XXE
HTML Injection
Script Execution
External Resource Loading
SSRF
Local File Access
UNC Path
Absolute Path
Symlink / Junction
Malformed File
Resource Exhaustion
```

---

# 84. Windows 特有路径测试

重点覆盖：

```text
C:\
D:\
UNC
\\server\share
spaces
Chinese path
emoji
very long path
reserved names
special characters
case differences
```

并根据项目目标 Windows 环境实际确认哪些能力需要支持。

---

# 85. Junction / Symlink

如果实际运行环境涉及：

```text
junction
symbolic link
```

必须明确：

```text
follow
reject
limit
```

否则容易导致：

```text
扫描整个磁盘
循环
越权访问
```

不要默认无限递归。

---

# 86. Large Library Stress Test

构造：

```text
100
1,000
10,000
50,000
```

级别的数据规模（根据实际性能能力调整）。

测试：

```text
startup
scan
index
search
Doctor
rebuild
library UI
```

重点不是追求理论极限，而是找到：

```text
实际性能拐点
```

---

# 87. Large Document Stress Test

覆盖：

```text
very long HTML
very long Markdown
large EPUB
large PDF
large annotations
many images
many search results
```

检查：

```text
memory
CPU
UI blocking
temporary storage
rebuild time
```

---

# 88. Memory Stability

重点寻找：

```text
memory leak
unbounded cache
event subscription leak
reader lifecycle leak
TTS lifecycle leak
image cache growth
search result retention
Doctor result retention
```

特别是：

```text
open → close
document A → B → C → A
```

循环测试。

---

# 89. Long Running Test

模拟：

```text
4h
8h
24h
```

长时间使用（条件允许时）。

反复执行：

```text
open document
search
highlight
note
navigate
switch reader
TTS
refresh RSS
import
export
```

观察：

```text
memory
CPU
disk
file handle
thread/task
SQLite connection
```

是否不断增长。

---

# 90. UI Freeze Audit

Doctor / Index / Import / Export / Refresh / TTS preparation 不应长时间阻塞 UI。

检查：

```text
main thread
worker
async
cancellation
progress
```

不要为了“异步”而把所有代码都 Task 化。

重点是：

> UI 可响应 + 操作可取消 + 生命周期正确。

---

# 91. Crash Boundary

明确：

哪些错误：

```text
Document-level
```

哪些错误：

```text
Library-level
```

哪些错误：

```text
Application-level
```

理想行为：

```text
Bad EPUB
→ EPUB Reader fails

Bad PDF
→ PDF Reader fails

Bad RSS feed
→ feed fails

Bad Article
→ article unavailable

Bad index
→ rebuild

```

不要因为一个坏文档导致整个 Reverie 崩溃。

---

# 92. Fault Isolation

最终形成：

```text
Document Failure
Feed Failure
Export Failure
Index Failure
Reader Failure
TTS Failure
```

之间互相隔离。

---

# 93. Startup Recovery Strategy

重新审计启动流程。

建议逻辑：

```text
Boot
 ↓
Load minimal config
 ↓
Validate Library root
 ↓
Validate / Load Index
 ↓
If invalid → Recovery / Rebuild path
 ↓
Load Library
 ↓
Normal UI
```

不要在 startup 阶段执行重量级全库 Repair。

---

# 94. 不要让启动依赖 SQLite

SQLite 如果不存在：

```text
Application must still boot.
```

SQLite 损坏：

```text
Application must still have recovery path.
```

SQLite rebuilding：

```text
must not make user source inaccessible.
```

---

# 95. Doctor 不依赖 SQLite

这是一个非常关键的设计约束：

> Doctor 必须能够在 SQLite 已经损坏或不存在时工作。

正确：

```text
Filesystem
   ↓
Doctor
```

而不是：

```text
SQLite
   ↓
Doctor
```

---

# 96. Doctor 的数据来源

Doctor 必须优先读取：

```text
filesystem
canonical parsers
source metadata
annotations
```

SQLite 只能作为：

```text
additional evidence
```

不能作为最终真相。

---

# 97. Repair 不允许基于过期 Index

例如：

```text
Index says document exists
Filesystem says missing
```

Repair 必须以：

```text
Filesystem
```

为准。

---

# 98. Doctor Check Order

建议：

```text
1. Storage Root
2. Filesystem Structure
3. Source Documents
4. Metadata
5. Annotations
6. Assets
7. References
8. Reader State
9. Feeds
10. Export Artifacts
11. SQLite
12. Cross-Consistency
```

理由：

> 先确认 Source，再检查 Derived Data。

实际顺序可根据现有代码调整，但不能反过来依赖数据库决定文件是否正确。

---

# 99. Repair Order

建议：

```text
1. Preserve originals
2. Repair source-adjacent safe metadata
3. Repair references
4. Repair annotations
5. Repair derived assets
6. Rebuild index
7. Revalidate everything
```

---

# 100. Rebuild 是最终保险机制

必须形成思想：

```text
SQLite
Cache
Thumbnail
Search Index
Derived UI State
```

这些东西都不是用户真正应该担心的数据。

理想模型：

```text
Delete Derived Data
       ↓
Re-scan Source
       ↓
Regenerate
       ↓
Reverie returns to usable state
```

---

# 101. Doctor Full Scan

最终需要一个完整：

```text
Scan Library
```

操作。

输出：

```text
Healthy
Warnings
Repairable
Errors
Unrecoverable
```

并可以：

```text
Save Report
```

---

# 102. Doctor Incremental Scan

不要默认每次都全量跑。

如果项目架构适合：

```text
Quick Check
```

可以只检查：

```text
index
recently modified files
known pending issues
```

而：

```text
Deep Scan
```

才做完整遍历。

---

# 103. Doctor 性能

Doctor 必须有：

```text
progress
cancellation
bounded memory
```

对于大型 Library：

不要：

```text
load all documents into RAM
```

应该：

```text
stream / incremental
```

---

# 104. Doctor 可重复执行

同一个健康 Library：

```text
Doctor
Doctor
Doctor
```

结果不应不断产生新问题。

尤其 Repair 应当：

```text
idempotent
```

---

# 105. Repair Idempotency

例如：

```text
Repair Index
```

执行一次：

```text
fixed
```

第二次：

```text
no-op
```

而不是继续：

```text
rewrite
duplicate
move
backup
```

制造新的变化。

---

# 106. Recovery Determinism

相同输入：

```text
same corrupted fixture
```

应该得到：

```text
same diagnosis
same repair plan
same repair outcome
```

除时间戳等不可避免信息外。

---

# 107. Migration Determinism

同一个：

```text
legacy fixture
```

多次迁移：

结果必须稳定。

不能：

```text
v1
→ v2
→ v2'
→ v2''
```

不断变化。

---

# 108. Database Schema Migration

SQLite 本身也必须支持：

```text
schema version
migration
rebuild
```

但需要遵守：

> 因为 SQLite 是 Derived Data，所以无法迁移时优先考虑重建，而不是复杂的救援式 DB 修复。

---

# 109. Index Schema Evolution

例如：

```text
M3
→ M4
→ M5
→ M6
→ M7
→ M9
→ M10
```

必须检查：

```text
旧 index
```

在新版本：

```text
是否可以直接 migrate
或者
是否应该直接 rebuild
```

如果 rebuild 更可靠：

> 不要为了“保留数据库”制造复杂 migration。

---

# 110. User State 与 Index 分离

特别检查：

```text
Read State
Favorite
Inbox
Bookmark
Annotation
Progress
```

到底属于：

```text
source / user state
```

还是：

```text
index
```

如果某项实际上属于用户数据：

> 不能只存在 SQLite。

---

# 111. User State Loss Test

删除：

```text
index.db
```

后验证：

```text
Read State
Favorite
Inbox
Bookmark
Annotation
Progress
```

是否符合项目既定数据架构。

如果某项因此丢失：

> 立刻记录为 P0/P1 风险，并优先修复。

---

# 112. Search Recovery

删除数据库后：

```text
Search
```

必须重新可用。

并验证：

```text
Title
Author
Body
Highlight
Note
Tag
URL
```

以及 M3 已定义的查询语义。

---

# 113. Annotation Search Recovery

Index rebuild 后：

```text
Highlight
Note
```

应重新进入搜索索引。

特别验证：

```text
Orphaned Annotation
```

是否仍然按照设计可查询。

---

# 114. Reader State Recovery

Index rebuild 后：

```text
open document
restore progress
restore bookmark
restore annotations
```

不能因为重新生成索引而丢失。

---

# 115. Daily Review Recovery

验证 M5 Daily Review：

```text
queue
history
state
```

不会因为：

```text
index rebuild
```

出现：

```text
duplicate review
lost history
silent read mutation
```

---

# 116. Import → Doctor

测试：

```text
Import
↓
Doctor
```

Doctor 不应该把合法导入的数据误报为异常。

---

# 117. Export → Doctor

测试：

```text
Export
↓
Doctor
```

正常 Export：

```text
Healthy
```

中断 Export：

```text
temporary / incomplete artifact
```

Doctor 应能够识别。

---

# 118. EPUB Export → EPUB Import

继续 M9 的 round-trip：

```text
Reverie
 ↓
EPUB Export
 ↓
EPUB Import
 ↓
New Reverie Document
```

检查：

```text
content
metadata
TOC
assets
annotations
```

不存在因为 M10 recovery 改动而产生的回归。

---

# 119. PDF Regression

M10 不增加 PDF 功能，只测试：

```text
open
search
bookmark
highlight
note
progress
```

在：

```text
index loss
restart
Doctor
```

后是否正常。

---

# 120. TTS Regression

测试：

```text
Reader
→ TTS
→ restart
→ reopen
```

不能让：

```text
ReaderLocation
Progress
```

发生异常回退。

---

# 121. Web Capture Regression

测试：

```text
Capture
Save
Restart
Read
Search
Export
Doctor
```

整个生命周期完整走通。

---

# 122. RSS Regression

测试：

```text
Feed
Refresh
Article
Read
Annotation
Search
Doctor
Rebuild
```

确保：

```text
Feed metadata
```

不会因 Doctor / rebuild 丢失。

---

# 123. Security Regression

至少将此前：

```text
M4 RSS Security
M6 EPUB Security
M7 PDF Security
M9 EPUB Export Security
```

所有测试重新跑一遍。

---

# 124. Performance Baseline

M10 必须建立基线：

```text
Cold Start
Warm Start
Library Scan
Index Build
Full Rebuild
Global Search
Doctor Scan
Safe Repair
EPUB Export
Web→EPUB
```

记录：

```text
time
peak memory
CPU
temporary disk
```

不要求达到绝对性能指标。

重要的是：

> 建立可重复的基线，知道优化前后是否真的改变。

---

# 125. Regression Harness

如果项目已有测试基础设施，建立：

```text
M10 Stability Test Suite
```

分类：

```text
Persistence
Recovery
Migration
Doctor
Index
Security
Performance
Reader Regression
Import Regression
Export Regression
```

---

# 126. Test Fixture Library

建立专门的：

```text
fixtures/
```

或者使用现有测试资源体系。

包括：

```text
valid
invalid
corrupt
legacy
future
large
minimal
empty
unicode
Windows-path
```

---

# 127. Test Isolation

所有破坏性测试必须：

```text
temporary directory
```

禁止：

```text
test code
```

直接修改开发者真实 Reverie Library。

---

# 128. Recovery E2E Scenarios

至少建立以下 E2E：

### Scenario A

```text
Create Article
Highlight
Note
Favorite
Bookmark
Progress
Restart
```

### Scenario B

```text
Delete SQLite
Restart
Rebuild
Everything restored
```

### Scenario C

```text
Corrupt metadata
Doctor
Repair
Read
```

### Scenario D

```text
Interrupt Export
Doctor
Cleanup
Re-export
```

### Scenario E

```text
Import
Interrupt
Restart
Import same file again
```

### Scenario F

```text
Modify source externally
Restart
Doctor
Index
Read
```

---

# 129. Disaster Simulation

至少模拟：

```text
Application crash
Power-loss equivalent write interruption
Disk-space failure
Permission failure
File lock
Unexpected external modification
Database corruption
Partial export
```

不要求真正拔电。

可以通过：

```text
fault injection
```

模拟。

---

# 130. “用户数据永远可拿出来”验收

这是 Reverie 最核心的产品价值之一。

必须测试：

```text
Reverie Library
 ↓
copy
 ↓
open files directly
```

验证：

```text
Article content readable
Metadata understandable
Annotations understandable
Exports usable
EPUB usable
```

---

# 131. Doctor 不应成为新的数据黑盒

Doctor 自身产生的数据必须尽量：

```text
human-readable
structured
portable
```

不能把：

```text
所有修复状态
```

只写进 SQLite。

---

# 132. Documentation

M10 新增：

```text
docs/M10-EXPLORE.md
docs/M10-IMPLEMENTATION-PLAN.md
docs/M10-STATUS.md
docs/RECOVERY.md
docs/DOCTOR.md
docs/DOCTOR-CHECKS.md
docs/DOCTOR-REPAIR.md
docs/PERSISTENCE.md
docs/ATOMIC-WRITE.md
docs/MIGRATION.md
docs/DATA-INTEGRITY.md
docs/FAILURE-MODES.md
docs/RECOVERY-TESTING.md
```

根据实际需要合并文档，不要为了数量制造空文件。

---

# 133. 更新全局文档

必须同步更新：

```text
FORMAT.md
LIBRARY.md
SEARCH.md
USER-STATE.md
ANNOTATION.md
IMPORT.md
EXPORT.md
RSS.md
EPUB-EXPORT.md
WEB-TO-EPUB.md
DECISIONS.md
PROGRESS.md
```

实际文件名以项目当前结构为准。

重点记录：

```text
Source of Truth
Recovery Semantics
Migration Rules
Doctor Rules
Repair Rules
Index Rebuild Rules
```

---

# 134. M10 Decision Log

对于真正发生过的架构决策记录：

```text
Decision
Context
Options
Selected
Reason
Trade-offs
Impact
```

尤其记录：

```text
为什么可以 rebuild
为什么不能 repair
为什么某些问题只能人工处理
为什么某些字段属于 Source
为什么某些字段属于 Derived
```

---

# 135. M10 实现批次

严格建议分批执行，不允许一口气生成几十个文件然后一次性提交。

## Batch 1 — Explore

完成：

```text
代码现状
持久化地图
Failure Surface
```

---

## Batch 2 — Persistence Audit

完成：

```text
Atomic Write
Save
Delete
Move
Shutdown
```

---

## Batch 3 — Recovery Foundation

完成：

```text
temp handling
cleanup
recovery primitives
```

---

## Batch 4 — Index Recovery

完成：

```text
index validation
rebuild
atomic database replacement
```

---

## Batch 5 — Doctor Core

完成：

```text
Doctor Coordinator
Findings
Severity
Report
```

---

## Batch 6 — Doctor Checks

完成：

```text
filesystem
metadata
annotation
reference
asset
index
```

---

## Batch 7 — Repair

完成：

```text
safe repair
repair preview
repair log
backup
post-validation
```

---

## Batch 8 — Migration

完成：

```text
versioning
migration
legacy fixture
future fixture
```

---

## Batch 9 — External Modification

完成：

```text
changed file
missing file
moved library
portable library
```

---

## Batch 10 — Fault Injection

完成：

```text
write failures
crash simulation
cancel
concurrency
```

---

## Batch 11 — Stress / Performance

完成：

```text
large library
large document
long running
memory
UI responsiveness
```

---

## Batch 12 — Full Regression

完整运行：

```text
M1
M2
M3
M4
M5
M6
M7
M8
M9
```

---

## Batch 13 — Final Audit

执行：

```text
Architecture Review
Data Integrity Review
Security Review
Recovery Review
Documentation Review
```

---

# 136. Git 提交原则

M10 禁止：

```text
all-in-one commit
```

应该按照逻辑边界提交。

例如：

```text
M10: persistence audit and recovery foundation
M10: index rebuild reliability
M10: doctor checks
M10: safe repair pipeline
M10: migration support
M10: recovery tests
M10: stability regression and docs
```

提交信息必须反映实际内容。

---

# 137. 不要制造无意义抽象

尤其禁止为了所谓：

```text
Enterprise Architecture
Clean Architecture
Future Proof
Scalability
```

而无证据创建：

```text
RecoveryPlatform
RepairOrchestrationEngine
UniversalMigrationFramework
HealthSubsystem
DataGovernanceLayer
```

除非现有复杂度确实证明有必要。

---

# 138. 对现有代码进行收敛，而不是膨胀

M10 很容易变成：

```text
又加 10 个 Service
又加 20 个 Manager
```

正确目标应该是：

```text
发现重复
 ↓
统一
 ↓
复用
 ↓
减少特殊路径
```

尤其检查：

```text
File IO
Atomic Write
Validation
Serialization
Index rebuild
ReaderLocation
Metadata
Error handling
```

是否已经有多个版本。

---

# 139. 代码质量审查重点

不要评价：

```text
class 名字好不好看
namespace 漂不漂亮
文件数量多不多
```

重点评价：

```text
data correctness
failure handling
ownership
lifetime
cancellation
race condition
persistence consistency
error propagation
resource disposal
```

---

# 140. Audit 输出规范

整个 M10 审计统一使用：

```text
FACT
HYPOTHESIS
INFERENCE
```

例如：

```text
FACT:
annotations.jsonl 位于用户 Library。

FACT:
SQLite 可以删除后重新生成。

INFERENCE:
Annotation 不应该只存在 SQLite。

RISK:
当前实现若 Bookmark 只写入 SQLite，则存在数据丢失风险。
```

---

# 141. P0 / P1 只基于证据

### P0

只用于：

```text
实际数据丢失
不可恢复损坏
启动后无法访问 Source
安全边界突破
严重一致性错误
```

### P1

用于：

```text
高概率数据损坏
可靠恢复机制缺失
严重异常场景无法恢复
大规模 Library 实际不可用
```

不要因为：

```text
代码不够优雅
```

就定义 P1。

---

# 142. 最终审计必须回答

```text
1. 如果 SQLite 消失怎么办？
2. 如果 SQLite 损坏怎么办？
3. 如果 JSON 损坏怎么办？
4. 如果 JSONL 部分损坏怎么办？
5. 如果程序写入中崩溃怎么办？
6. 如果 Export 中断怎么办？
7. 如果 Import 中断怎么办？
8. 如果用户手工移动 Library 怎么办？
9. 如果用户手工修改文件怎么办？
10. 如果 Annotation 无法重新定位怎么办？
11. 如果升级遇到旧格式怎么办？
12. 如果遇到未来格式怎么办？
13. 如果文件缺失怎么办？
14. 如果资源缺失怎么办？
15. 如果磁盘权限失败怎么办？
16. 如果文件被其他程序占用怎么办？
17. 如果用户把 Library 复制到另一台电脑怎么办？
18. 如果 Doctor 自己执行失败怎么办？
19. 如果 Repair 执行一半崩溃怎么办？
20. 如果用户删除所有派生数据怎么办？
```

每项都必须有：

```text
Current Behavior
Expected Behavior
Evidence
Implementation
Test
```

---

# 143. M10 最终验收矩阵

至少形成：

| 场景 | Source | Index | Doctor | Repair | Recovery |
|---|---|---|---|---|---|
| SQLite Missing | Safe | Rebuild | Pass | Yes | Yes |
| SQLite Corrupt | Safe | Rebuild | Pass | Yes | Yes |
| Invalid Metadata | Safe | Block/Stale | Detect | Conditional | Yes |
| Missing Source | Missing | Stale | Detect | No/Manual | Partial |
| Corrupt Annotation | Safe | Partial | Detect | Conditional | Yes/Partial |
| Interrupted Save | Safe | Rebuild/Update | Detect | Yes | Yes |
| Interrupted Export | Safe | Partial Artifact | Detect | Cleanup | Yes |
| Interrupted Import | Partial valid data | Rebuild | Detect | Continue | Yes |
| External File Change | User-owned | Refresh | Detect | Reindex | Yes |
| Legacy Data | Safe | Rebuild | Detect | Migrate | Yes |
| Future Version | Safe | Ignore | Detect | No | Safe Reject |
| Library Move | Safe | Rebuild | Detect | Reindex | Yes |
| Permission Failure | Safe | Unchanged | Report | Retry/Manual | Yes |

最终矩阵必须根据真实实现更新，而不是照抄模板。

---

# 144. M10 完成标准

只有满足以下条件，才能宣布 M10 完成：

### 数据

- Source files 明确是真相
- SQLite 明确是 Derived Data
- 所有关键用户状态有明确持久化归属
- Atomic Write 经实际验证
- Crash Recovery 经测试
- Migration 经测试

### Doctor

- 可以完整扫描 Library
- 可以检测关键异常
- 可以区分 Warning / Error / Critical
- 可以识别 Repairability
- Safe Repair 可执行
- Repair 有记录
- Repair 后会重新验证
- Doctor 不依赖 SQLite 才能工作

### Recovery

- 删除 SQLite 可恢复
- SQLite 损坏可恢复
- 临时文件可诊断
- 部分写入不会静默污染 Source
- Import/Export 中断有明确恢复语义
- Annotation 不会因解析失败被静默删除

### Portability

- Library 可以独立复制
- 可以在另一目录重新建立
- 尽量不依赖绝对路径
- 用户不需要携带 SQLite / Cache / Temp 才能恢复资料

### Stability

- 大 Library 测试
- 大文档测试
- 长时间测试
- Concurrency 测试
- Cancellation 测试
- Fault Injection
- Security Regression

### Regression

M1～M9 全部保持通过。

---

# 145. M10 与 M9 的边界

## M9 负责：

```text
EPUB Export
Web→EPUB
Export correctness
Export validation
```

## M10 负责：

```text
Export interruption
Recovery
Corrupted artifacts
Persistence
Doctor
Migration
System-wide stability
```

不要在 M10 重新增加新的 EPUB Export 功能。

---

# 146. M10 与 M11 的边界

M10：

```text
数据稳定
恢复可靠
错误可诊断
文件可迁移
Library 可备份
Doctor 可工作
```

M11：

```text
Windows Productization
Installer
Packaging
Runtime Dependencies
Release Build
UX polish
Application identity
File Associations
Uninstall
Distribution readiness
```

不要提前把 M11 拉进 M10。

---

# 147. M10 的最终产品定义

完成 M10 后，Reverie 应该从：

> “一个功能比较完整的本地阅读软件”

进入：

> **“一个即使发生异常、数据损坏、索引丢失、版本升级、文件迁移，用户仍然敢长期存放自己阅读资料的本地文件型系统。”**

---

# 148. 最终执行要求

开始工作时：

```text
先 Explore
再输出现状
再制定 Implementation Plan
再分 Batch 实现
每个 Batch 独立验证
最后完整回归
```

禁止：

```text
一上来重构
一上来写 Doctor UI
一上来创建大量类
一上来修改数据格式
一上来迁移 SQLite
```

尤其是：

> **先证明现有 Persistence / Storage / Data Model 哪些地方真正存在恢复性缺陷，再决定改什么。**

---

# 149. 最终交付物

M10 完成时至少应有：

```text
M10-EXPLORE.md
M10-IMPLEMENTATION-PLAN.md
M10-STATUS.md
RECOVERY.md
DOCTOR.md
DOCTOR-CHECKS.md
DOCTOR-REPAIR.md
PERSISTENCE.md
ATOMIC-WRITE.md
MIGRATION.md
DATA-INTEGRITY.md
FAILURE-MODES.md
RECOVERY-TESTING.md
```

以及：

```text
Reverie Doctor
Index Rebuild
Recovery primitives
Migration system
Repair pipeline
Fault-injection tests
Regression tests
Stress tests
```

具体文件数量允许根据现有项目结构合并。

---

# 150. M10 最终验收宣言

请以以下原则完成本阶段：

> **文件是真相。**
>
> **数据库可以丢。**
>
> **缓存可以丢。**
>
> **索引可以重建。**
>
> **临时文件可以清理。**
>
> **导出失败可以重来。**
>
> **异常退出不应该毁掉用户资料。**
>
> **Annotation 无法恢复时可以成为 Orphan，但不能被偷偷删除。**
>
> **未知格式可以拒绝，但不能粗暴覆盖。**
>
> **Repair 可以失败，但不能以“成功”掩盖数据风险。**
>
> **Doctor 的意义不是让报告看起来健康，而是真正告诉用户：哪些资料安全、哪些资料有问题、哪些能修、哪些已经无法恢复。**
>
> **最终目标不是“程序不出错”，而是“即使出错，用户的数据仍然有路可走”。**

---

# 151. 开始执行

现在开始：

### Step 1
全面 Explore 当前代码与 M0～M9 实现。

### Step 2
输出：

```text
M10-EXPLORE.md
```

必须至少包含：

```text
1. Current Architecture
2. Persistence Map
3. Source of Truth Map
4. Derived Data Map
5. Failure Surface
6. Existing Recovery
7. Existing Atomic Write
8. Existing Migration
9. Existing Validation
10. Existing Tests
11. Missing Recovery Capabilities
12. P0/P1 Risks
13. Recommended M10 Scope
```

### Step 3
输出：

```text
M10-IMPLEMENTATION-PLAN.md
```

明确：

```text
Batch
Goal
Files
Dependencies
Tests
Risks
Acceptance
```

### Step 4
先实现：

```text
Persistence / Recovery Foundation
```

再实现：

```text
Index Recovery
Doctor
Repair
Migration
```

### Step 5
最后运行：

```text
Full Regression
Fault Injection
Stress Test
Security Regression
Portable Library Test
```

### Step 6
最终输出：

```text
M10-STATUS.md
```

明确：

```text
Implemented
Verified
Known Issues
Deferred
P0
P1
M11 Dependencies
```

---

**特别强调：**

不要为了完成本提示词而强行加入“恢复框架”“企业级数据治理”“复杂备份系统”等没有实际需求的东西。

**先看真实代码，再修真实问题。**

Reverie M10 的唯一核心判断标准是：

> **当用户最害怕的事情发生——文件损坏、程序崩溃、数据库丢失、升级、迁移——他的阅读资料是否仍然处在可理解、可诊断、可恢复的状态。**