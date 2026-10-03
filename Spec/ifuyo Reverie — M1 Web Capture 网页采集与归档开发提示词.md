# ifuyo Reverie — M1 Web Capture 网页采集与归档开发提示词

你现在开始实施 **ifuyo Reverie M1：Web Capture（网页采集与本地归档）**。

## 一、阶段定位

M1 是 Reverie 的第一个真正产品功能阶段。

M0 已经完成或应当完成：

- 项目与仓库摸底
- 高风险技术验证
- 数据格式初稿
- 安全基线
- 测试基础设施
- 浏览器 Extension → Native Messaging 的技术 Spike
- Web Article Extraction 的验证
- Universal Reader / Adapter 边界的确定

本阶段不要重新设计整个项目，也不要提前实现 RSS、EPUB、PDF、TTS、AI、复杂阅读模式等后续功能。

**M1 的唯一主线：**

> 从浏览器中保存一个普通网页，并在 Reverie 本地形成一个完整、稳定、可再次打开、可恢复的个人归档。

核心链路：

```text
Browser Extension
        ↓
Capture Request
        ↓
Native Messaging
        ↓
Reverie Capture Host / App
        ↓
Capture Queue
        ↓
Web Capture
        ↓
Article Extraction
        ↓
Normalize
        ↓
Persist
        ↓
Index
        ↓
Library
        ↓
Reader
```

最终必须做到：

> “我在浏览器里点击保存 → Reverie 接收到任务 → 网页被提取 → 本地文件形成归档 → Reverie 能看到它 → 能重新打开阅读 → 重启应用后数据仍然存在。”

---

# 二、M1 的核心原则

## 1. 文件是真实数据源

Reverie 的长期数据不能依赖 SQLite 才能存在。

必须继续遵守：

```text
Source of Truth = Library Files
SQLite = Derived Index / Cache / Search State
```

禁止：

```text
网页 → SQLite blob → UI
```

作为唯一持久化链路。

推荐：

```text
网页
 ↓
article.md
meta.json
annotations.jsonl
assets/
source/page.html
 ↓
SQLite Index
 ↓
UI
```

数据库损坏以后，理论上应该可以通过重新扫描 Library 恢复核心索引。

---

## 2. 保存网页 ≠ 保存 URL

M1 的目标不是简单记录：

```json
{
  "url": "https://example.com/article"
}
```

而是保存一个真正属于用户自己的本地快照。

至少包含：

```text
original_url
canonical_url
capture_time
source_title
author
published_at
extractor_version
content_hash
article content
assets
```

必要情况下还保存：

```text
original page snapshot
```

因此：

> 原网页未来消失，并不应该导致用户已经保存的文章一起消失。

但不要宣传成：

> “可以保存所有网页”。

必须承认网页结构、反爬、登录墙、动态渲染、地区限制等现实限制。

也禁止任何绕过 DRM、付费墙、登录保护或访问控制的实现。

---

# 三、M1 功能范围

## M1 必须完成

### A. 浏览器保存入口

Extension 至少支持：

```text
Save Current Page
```

发送：

```text
CaptureRequest
```

到 Native Messaging Host。

请求至少具备：

```text
protocol_version
request_id
url
title
source
capture_mode
created_at
```

其中：

```text
capture_mode
```

可以预留：

```text
article
full_page
selection
```

但 M1 首先实现：

```text
article
```

不要为了未来功能提前实现大量模式。

---

# 四、Capture Request 协议

M0 已经验证过 Native Messaging，因此 M1 要把 Spike 升级成真正协议。

建议建立明确版本：

```text
protocol_version = 1
```

请求：

```json
{
  "protocol_version": 1,
  "request_id": "...",
  "url": "...",
  "title": "...",
  "source": "browser",
  "capture_mode": "article",
  "created_at": "..."
}
```

响应必须可机器解析。

建议至少区分：

```text
accepted
processing
completed
failed
duplicate
```

错误必须具有稳定错误码，而不是依赖自由文本。

例如：

```text
INVALID_REQUEST
UNSUPPORTED_PROTOCOL
INVALID_URL
NETWORK_ERROR
EXTRACTION_FAILED
PERSIST_FAILED
ASSET_DOWNLOAD_FAILED
DUPLICATE
SECURITY_REJECTED
UNKNOWN_ERROR
```

不要让 UI 直接依赖异常字符串。

---

# 五、Capture Queue

这是 M1 非常重要的基础设施。

不要设计成：

```text
点击保存
 ↓
同步等待整个网页处理完
 ↓
浏览器一直等
```

而应该：

```text
Browser
 ↓
Submit Request
 ↓
Queue
 ↓
Worker
 ↓
Capture
```

需要持久化任务状态。

最少支持：

```text
queued
running
completed
failed
```

建议支持：

```text
retry_count
last_error
created_at
updated_at
```

每个任务必须具备唯一：

```text
request_id
```

必要情况下增加：

```text
capture_id
```

---

## Capture Queue 必须处理：

### 1. 应用重启

例如：

```text
queued
running
```

时程序突然退出。

重新启动以后：

- queued 可以继续
- running 需要根据实现决定是否重新进入 queue
- 不得永久卡死

---

### 2. 重复请求

同一个网页连续点击保存两次，不能简单生成两个完全重复的 Archive。

优先考虑：

```text
canonical_url
+
normalized URL
+
content hash
```

组合判断。

但不要把“同 URL”直接等价于“同内容”。

同一个网页可能已经更新。

所以数据模型应该能够容纳：

```text
same source
different capture
```

暂时不需要实现复杂版本管理 UI。

---

### 3. 失败重试

网络错误等临时错误可以重试。

例如：

```text
attempt 1
attempt 2
attempt 3
```

但对于明确不可恢复的问题：

```text
SECURITY_REJECTED
INVALID_URL
UNSUPPORTED
```

不要无限重试。

---

# 六、Web Capture Pipeline

建立明确 Pipeline，不要把所有逻辑塞进一个巨大函数。

推荐边界：

```text
Fetch
 ↓
Validate
 ↓
Extract
 ↓
Normalize
 ↓
Sanitize
 ↓
Asset Resolve
 ↓
Persist
 ↓
Index
```

建议分别具有清晰职责。

---

## 1. Fetch

负责：

- HTTP / HTTPS
- timeout
- redirects
- response status
- content type
- encoding
- basic response metadata

禁止默认信任远程内容。

至少限制：

```text
scheme
content type
redirect
response size
timeout
```

---

## 2. URL Validation

默认只接受：

```text
http://
https://
```

明确拒绝：

```text
file://
javascript:
data:
vbscript:
其他危险或未知 scheme
```

不要因为“网页解析方便”而开放任意协议。

---

## 3. Extraction

调用 M0 已验证的 Article Extraction 能力。

核心输出至少包含：

```text
title
author
published_at
canonical_url
body
description
language
images
links
```

必要时增加：

```text
site_name
```

但不要因为字段可能有用就无限扩张模型。

---

# 七、文章正文模型

M1 不应该把网页正文直接作为一团 HTML 存下来。

推荐建立一个稳定的 Reverie Article Document 表示。

例如逻辑结构：

```text
Document
├─ metadata
├─ blocks
│  ├─ paragraph
│  ├─ heading
│  ├─ quote
│  ├─ code
│  ├─ list
│  ├─ image
│  ├─ link
│  └─ ...
└─ source
```

但具体内部结构不要为了理论完整性无限设计。

优先保证：

> HTML → Reverie Document → Markdown / Reader

能够稳定转换。

---

# 八、article.md

M1 的主正文文件使用：

```text
article.md
```

但需要明确：

**Markdown 是用户可读的稳定持久化格式，而不是把所有网页语义都强行压成 Markdown。**

对于 Markdown 无法自然表达的内容：

- 图片
- 表格
- 代码
- 链接
- 引用
- 标题层级

必须有明确转换规则。

如果某些高级 HTML 结构无法无损转换：

> 优先可读性与稳定性，而不是伪装成“100% 无损”。

---

# 九、meta.json

每篇文章至少包含：

```json
{
  "id": "...",
  "type": "article",
  "original_url": "...",
  "canonical_url": "...",
  "title": "...",
  "author": "...",
  "published_at": "...",
  "captured_at": "...",
  "language": "...",
  "source": "web",
  "extractor_version": "...",
  "content_hash": "...",
  "schema_version": 1
}
```

注意：

### `schema_version`

必须存在。

未来格式升级时可以：

```text
schema_version 1
schema_version 2
...
```

不要通过猜测文件结构来兼容未来格式。

---

# 十、原始网页保存

M1 建议实现：

```text
source/page.html
```

但必须明确它与正文的关系。

推荐：

```text
article.md
    = cleaned user-facing article

source/page.html
    = captured original source
```

两者用途不同。

原始网页用于：

- 调试 extractor
- 后续重新提取
- 数据追溯
- 出错分析

而不是直接拿原始 HTML 当 Reader 内容。

---

# 十一、Assets

文章引用的本地资源建议：

```text
assets/
```

保存至少：

```text
images
```

必要时再扩展其他类型。

每个 Asset 要考虑：

```text
original_url
local_path
mime_type
content_hash
```

重点解决：

```text
https://example.com/a.jpg
```

最终变成：

```text
assets/<hash>.jpg
```

文章正文引用本地 asset。

---

# 十二、图片下载策略

M1 不需要追求“所有图片 100% 成功”。

需要有明确策略：

### 成功

保存：

```text
asset
```

### 失败

不要导致整篇文章失败。

应当：

```text
article remains readable
missing asset recorded
```

例如：

```text
asset_download_failed
```

写入 capture result / metadata / diagnostic information。

不要 silently swallow。

---

# 十三、网页安全

这一阶段必须认真处理不可信输入。

网页 HTML、脚本、CSS、URL、SVG、图片、重定向等都应视为不可信内容。

至少做到：

### HTML

- 移除 script
- 移除危险事件处理器
- 清理危险 URL
- Reader 中不执行第三方脚本

### URL

清理：

```text
javascript:
vbscript:
data:
```

等危险 scheme。

---

### 外部链接

文章里的：

```text
<a href="...">
```

只作为外部链接。

点击后交给：

```text
system browser
```

不要让外部网页在 Reverie Reader 中直接执行。

---

### SVG

谨慎处理。

不要因为“SVG 是图片”就默认完全可信。

---

# 十四、Library 目录结构

M1 至少落地：

```text
Reverie Library/
└─ articles/
   └─ 2026/
      └─ <article-id>/
         ├─ article.md
         ├─ meta.json
         ├─ source/
         │  └─ page.html
         └─ assets/
```

M1 暂时不需要：

```text
books/
pdf/
exports/
```

它们留给后续阶段。

---

# 十五、Article ID

ID 不应依赖标题。

禁止：

```text
"How to Build a Good App"
```

直接作为目录名。

推荐稳定唯一 ID。

可以采用：

```text
UUID
```

或经过验证的 deterministic ID。

但要明确：

> Capture ID ≠ URL。

因为一个 URL 可能产生多个不同时间的 Capture。

---

# 十六、Atomic Write

文章保存过程不能出现：

```text
meta.json 已写入
article.md 写了一半
程序崩溃
assets 还没完成
```

最终 Library 里留下“看起来像成功、实际已经损坏”的内容。

推荐：

```text
temporary directory
 ↓
write all files
 ↓
validate
 ↓
atomic rename
```

类似：

```text
<article-id>.tmp
        ↓
validation
        ↓
<article-id>
```

必须考虑程序异常退出。

---

# 十七、Capture 完成后的验证

写入以后立即执行最基本的一致性检查：

```text
meta.json 可解析
article.md 存在
article-id 一致
content_hash 正确
assets 引用存在或被明确标记为 missing
```

只有验证通过后：

```text
Capture = completed
```

否则：

```text
Capture = failed
```

---

# 十八、Library 基础 UI

M1 不需要制作最终版漂亮 UI。

但是必须有可用的：

## Library

显示：

```text
文章标题
来源
保存时间
阅读状态
```

至少支持：

```text
Open
Delete
Reveal in Explorer
```

---

## Article Reader

至少可以：

```text
打开文章
滚动阅读
显示标题
显示来源
显示正文
显示图片
点击链接
返回 Library
```

这一阶段不需要：

```text
复杂高亮
笔记
全文搜索
RSS
TTS
Aurora
```

这些后续完成。

---

# 十九、阅读状态

可以在 M1 建立最小：

```text
unread
reading
read
```

或者至少：

```text
unread
read
```

但必须注意：

> 阅读状态属于 App State，不应污染文章正文。

因此可以：

```text
SQLite
```

或者独立 metadata/state 文件记录。

不要把：

```text
read=true
```

直接写进 `article.md`。

---

# 二十、索引

M1 建立最小 Index。

例如：

```text
article_id
title
author
canonical_url
captured_at
published_at
language
content_hash
path
read_state
```

SQLite 只是：

```text
index/cache
```

不是 source of truth。

必须能够从 Library 重新建立。

M1 暂时不需要复杂全文搜索算法。

只需要为：

```text
Library list
basic lookup
```

提供基础索引。

---

# 二十一、Reader 与 Web Adapter 的边界

继续保持 M0 确认的架构：

```text
Reader Shell
      ↓
Document Model
      ↓
Web Reader Adapter / Document Provider
```

禁止：

```text
Reader UI
 ↓
直接调用 ArticleExtractor
```

禁止 Reader 直接依赖具体第三方 extractor API。

未来：

```text
Web
EPUB
PDF
Markdown
```

最终都应该能够进入类似：

```text
Reader Shell
```

---

# 二十二、Browser Extension

M1 实现浏览器端最小版本即可。

至少：

```text
Current Page
    ↓
Save to Reverie
```

保存成功应给用户反馈：

```text
Saved
```

失败：

```text
Failed
```

不要在 Extension 中复制整个网页解析系统。

Extension 的主要职责是：

```text
用户交互
当前页面信息
发送请求
显示结果
```

而核心 Capture 应由 Reverie 侧处理。

---

# 二十三、Native Messaging

最终链路：

```text
Browser Extension
        ↓
Native Messaging
        ↓
Reverie Native Host
        ↓
Reverie Core
```

不要：

```text
Extension
 ↓
调用一堆 Reverie 内部服务
```

Browser 只应该看到稳定协议。

这样未来才能：

```text
Chrome
Edge
Firefox
```

各自成为不同的前端 Adapter。

---

# 二十四、Capture Result

完成后，至少向前端返回：

```json
{
  "protocol_version": 1,
  "request_id": "...",
  "status": "completed",
  "article_id": "...",
  "title": "...",
  "message": "..."
}
```

失败：

```json
{
  "protocol_version": 1,
  "request_id": "...",
  "status": "failed",
  "error_code": "EXTRACTION_FAILED",
  "message": "..."
}
```

UI 不允许依赖 message 判断逻辑。

必须使用：

```text
status
error_code
```

---

# 二十五、网页采集测试

M0 有 Extraction Corpus。

M1 必须把它真正接入 Capture Pipeline。

至少覆盖：

```text
普通博客
新闻
技术文章
论坛文章
GitHub 页面
多栏布局
包含大量图片
包含代码
包含表格
长文章
缺作者
缺日期
无 canonical
canonical 与原 URL 不同
复杂 URL
重定向
404
超时
HTML 不完整
非 HTML
图片下载失败
```

再加入：

```text
中文
英文
日文
```

至少验证正文保存与编码没有问题。

---

# 二十六、最重要的 Round-trip Test

M1 必须建立完整 Round-trip：

```text
Web
 ↓
Capture
 ↓
Persist
 ↓
Restart App
 ↓
Load Library
 ↓
Open Reader
 ↓
Read Same Content
```

这个测试的重要性高于很多 UI 测试。

---

# 二十七、Crash / Recovery Test

人为注入：

```text
Fetch 过程中崩溃
Extract 后崩溃
写 article.md 时崩溃
写 meta.json 时崩溃
下载 asset 时崩溃
Index 时崩溃
```

验证：

```text
不会产生半成品正式目录
不会污染已有文章
不会产生无法恢复的 queue
不会永久卡住
```

---

# 二十八、Duplicate Test

至少测试：

### Case 1

同一 URL连续保存两次。

### Case 2

URL query 顺序不同。

### Case 3

canonical URL 相同、original URL 不同。

### Case 4

同一 URL内容发生变化后再次保存。

目标不是机械“禁止重复”。

目标是：

> 能区分真正重复与合法的再次 Capture。

---

# 二十九、Extraction Failure Test

模拟：

```text
extractor returns empty body
extractor throws exception
metadata incomplete
malformed HTML
unsupported page
```

系统不能：

```text
生成一篇空文章
然后 UI 显示 Saved
```

必须明确：

```text
capture failed
```

或者经过明确降级策略后：

```text
capture completed with degraded extraction
```

如果实现第二种状态，必须让用户能意识到内容可能不完整。

---

# 三十、M1 不要做的事情

明确禁止本阶段扩大范围：

```text
❌ RSS
❌ Pocket Import
❌ Wallabag Import
❌ Raindrop Import
❌ EPUB
❌ PDF
❌ TTS
❌ AI 摘要
❌ AI 问答
❌ 向量搜索
❌ 知识图谱
❌ 云同步
❌ 账号系统
❌ 社交
❌ 多用户
❌ 在线服务
❌ 移动端
❌ 复杂 Aurora 阅读模式
❌ 复杂标签体系
❌ 高级全文搜索
```

尤其禁止因为：

> “以后可能需要”

而现在提前建立大量抽象。

---

# 三十一、M1 的产品验收标准

M1 完成的最低标准不是“代码写完”。

而是：

## 场景 1：普通网页

用户打开：

```text
一个普通文章页面
```

点击：

```text
Save to Reverie
```

最终 Reverie 中出现：

```text
文章
标题
正文
图片
来源
时间
```

且可以再次打开。

---

## 场景 2：关闭并重新打开

完成保存：

```text
退出 Reverie
重新启动
```

文章仍然存在。

---

## 场景 3：原网页失效

保存完成后：

```text
原 URL 不可访问
```

本地文章依然能够阅读。

---

## 场景 4：网络异常

保存过程中网络失败：

```text
任务失败
有明确错误
不会出现假成功
```

---

## 场景 5：重复保存

再次保存同一文章：

```text
不会无控制地产生垃圾重复
```

同时不能误伤合法的重新 Capture。

---

## 场景 6：数据库损坏

删除 / 重建 SQLite Index：

```text
Library 文件仍然存在
```

然后能够：

```text
Reindex
```

恢复基础列表。

---

# 三十二、M1 的工程实施流程

严格执行：

```text
1. Repository Recon
2. 对照 M0 结果确认边界
3. 设计最终 Capture Protocol
4. 设计 Library Persistence
5. 设计 Queue
6. 实现 Capture Pipeline
7. 接入 Extraction
8. 接入 Asset 管理
9. 接入 Native Messaging
10. 实现 Extension 最小 UI
11. 实现 Library
12. 实现最小 Reader
13. 接入 Index
14. 完成 Recovery
15. 完成自动化测试
16. 手工真实网页验证
17. M1 Code Review
18. M1 Documentation
```

禁止一开始就从 UI 开始堆。

正确顺序应当优先保证：

```text
Data
 ↓
Capture
 ↓
Persistence
 ↓
Recovery
 ↓
Index
 ↓
UI
```

---

# 三十三、AI Coding 工作规则

你可以大量使用 AI 编码，但必须控制代码膨胀。

### 每次修改之前

先告诉我：

```text
当前问题
相关代码
拟修改文件
修改原因
风险
```

### 实现以后

必须检查：

```text
是否产生重复 abstraction
是否绕过已有接口
是否违反 M0 boundary
是否引入新的第三方依赖
是否把 UI 逻辑塞进 Core
是否把数据库变成 Source of Truth
是否产生 god class
```

---

# 三十四、事实、假设、推断

整个 M1 持续采用：

```text
FACT
HYPOTHESIS
INFERENCE
```

尤其涉及：

```text
网页解析质量
重复判定
浏览器兼容性
Native Messaging
第三方库行为
```

不要把：

```text
“理论上应该”
```

写成：

```text
“已经验证”
```

凡是 M0 没实际验证过的能力，都需要再次通过代码 / 实际运行 / 测试确认。

---

# 三十五、依赖管理

任何新增第三方依赖都必须先确认：

```text
用途
版本
许可证
是否必要
是否存在更简单实现
维护状态
是否适合 Reverie 的长期数据模型
```

更新：

```text
THIRD_PARTY.md
```

不要为了一个小功能引入重量级依赖。

---

# 三十六、文档产物

M1 完成后至少更新：

```text
docs/M1-STATUS.md
docs/CAPTURE.md
docs/FORMAT.md
docs/ARCHITECTURE.md
docs/TESTING.md
```

M1-STATUS 必须明确：

```text
Implemented
Verified
Known Limitations
Known Risks
Deferred
```

不要写：

```text
TODO
```

然后假装已经完成。

---

# 三十七、M1 Review

完成代码后不要立即进入 M2。

先进行一次独立 Review。

重点检查：

### P0

只有真正影响数据可靠性 / 数据丢失 / 安全 / 无法正常使用的问题才允许列 P0。

### P1

重点关注：

```text
数据格式不可持续
Capture 无法恢复
网页保存结果不稳定
Queue 卡死
数据库不可重建
Reader / Core 边界失控
安全漏洞
```

不要把：

```text
代码风格
命名喜好
架构“更优雅”
```

包装成 P0/P1。

输出：

```text
FACT
EVIDENCE
IMPACT
STATUS
```

必要时标记：

```text
RESOLVED
CONFIRMED
WORSENED
NEW
```

---

# 三十八、最终 M1 验收 Demo

M1 最终应该可以完整演示：

```text
浏览器
  ↓
打开真实文章
  ↓
点击 Save to Reverie
  ↓
Reverie Capture Queue
  ↓
网页抓取
  ↓
正文提取
  ↓
图片下载
  ↓
写入 Library
  ↓
SQLite Index
  ↓
Library 中出现文章
  ↓
打开 Reader
  ↓
正常阅读
  ↓
关闭 Reverie
  ↓
重新打开
  ↓
文章仍然存在
```

然后执行：

```text
删除 / 重建 Index
  ↓
Reindex
  ↓
文章重新出现
```

最后测试：

```text
原网页失效
  ↓
本地文章仍然可读
```

达到上述状态，才可以进入：

```text
M2 Annotation Core
```

---

# 三十九、M1 最终完成定义

M1 的真正完成定义：

> **Reverie 已经拥有第一种属于自己的、可长期保存的数据：网页文章。**

并且这些数据满足：

```text
可捕获
可清洗
可保存
可恢复
可阅读
可重新索引
可脱离原网页继续存在
```

这一步完成以后，Reverie 才真正从：

```text
一个软件架构
```

变成：

```text
一个个人阅读资料库
```

不要追求 M1 功能数量。

**宁可只稳定保存 80% 的常见文章，也不要做出一个“支持 20 种模式但偶尔静默丢数据”的采集系统。**