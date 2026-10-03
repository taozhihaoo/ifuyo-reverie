# ifuyo Reverie — M4 RSS / Feed 订阅系统开发提示词

你现在继续开发：

> **ifuyo Reverie**

当前进入：

> **M4 — RSS / Feed**

Reverie 是：

> **Windows 优先、本地优先、文件原生的个人阅读档案系统。**

当前阶段必须建立：

```text
RSS / Atom
+
Feed Management
+
Fetching
+
Parsing
+
Normalization
+
Deduplication
+
Inbox
+
Read State
+
Library Integration
+
Search Integration
```

最终形成：

```text
User adds Feed
        ↓
Feed
        ↓
Fetch
        ↓
Parse RSS / Atom
        ↓
Normalize
        ↓
Deduplicate
        ↓
Create / Update RSS Article
        ↓
Inbox
        ↓
Library
        ↓
Search
        ↓
Reader
        ↓
Highlight / Note
```

---

# 一、最高优先级原则

整个 M4 必须继续遵守 Reverie 总纲：

```text
文件是真相
SQLite 是派生索引
Reader 是统一阅读入口
Annotation 是独立基础设施
网络内容是不可信输入
```

必须保持：

```text
User Files
    ↓
Domain Model
    ↓
SQLite / Search Index
```

而不是：

```text
RSS API
    ↓
SQLite
    ↓
UI
```

更不能：

```text
Feed
    ↓
SQLite
    ↓
用户资料
```

SQLite 中的数据必须能够从用户文件重新建立。

删除 SQLite：

```text
删除 index.db
    ↓
扫描 Library
    ↓
重新建立 Index
    ↓
RSS Article / Read State / Inbox / Tags / Annotation
全部恢复
```

---

# 二、代码与文档谁是真相

执行时：

> **当前代码 + 当前测试 > 旧设计文档**

如果发现：

```text
文档说 A
代码实际是 B
```

不要为了迎合文档直接重构。

先判断：

```text
FACT
HYPOTHESIS
INFERENCE
```

然后：

```text
1. 调查
2. 判断实际行为是否正确
3. 尽量复用正确的现有实现
4. 只修改真正需要修改的部分
5. 更新文档
```

禁止为了 M4：

```text
大规模重写 M1
大规模重写 M2
大规模重写 M3
```

除非发现真实的：

```text
P0
P1
```

级阻塞问题。

---

# 三、M4 核心目标

M4 不是：

> “做一个 RSS 阅读器。”

真正目标是：

> **让 RSS 成为 Reverie Library 的一个稳定内容入口。**

完成后，用户可以：

```text
添加一个 RSS / Atom Feed
        ↓
主动刷新
        ↓
发现新文章
        ↓
自动进入 Inbox
        ↓
在 Library 中查看
        ↓
进入 Reader
        ↓
阅读
        ↓
Highlight
        ↓
Note
        ↓
Search
        ↓
未来重新找到
```

RSS 与手动保存网页必须最终进入同一个高层资料体系。

---

# 四、M4 必须完成

以下为本阶段核心功能。

```text
[A] RSS 2.0 解析
[A] Atom 1.0 解析

[A] Feed 添加
[A] Feed 列表
[A] Feed 编辑
[A] Feed 暂停 / 恢复
[A] Feed 删除
[A] Feed 手动刷新
[A] Refresh All

[A] Feed Metadata
[A] Feed Error State
[A] Feed Fetch State

[A] RSS Item Normalize
[A] Atom Entry Normalize

[A] GUID / ID 去重
[A] URL 去重
[A] Canonical URL 处理
[A] Content Hash

[A] 新条目进入统一 Document 模型
[A] RSS Article 进入 Library
[A] RSS Article 进入 Search Index
[A] RSS Article 默认 Inbox 行为
[A] RSS Article Read / Unread

[A] Feed Item → Reader
[A] Feed Item → Annotation
[A] Feed Item → Search

[A] 网络超时
[A] 网络失败
[A] HTTP 错误
[A] Redirect
[A] Retry
[A] Cancellation

[A] XML 安全
[A] HTML 安全
[A] URL 安全

[A] Feed persistence
[A] Feed rebuild / reindex
[A] RSS fixture tests
[A] Integration tests
[A] E2E tests
```

---

# 五、M4 严格不做

本阶段禁止膨胀。

不要提前实现：

```text
OPML Import / Export
Pocket Import
Wallabag Import
Raindrop Import

EPUB
PDF
TTS

AI Summary
AI Translation
AI Classification
AI Recommendation
Semantic Search
Embedding
Vector Database
Knowledge Graph
Backlinks
Graph View

Cloud Sync
Account
Social
Collaboration
Web Publishing

Podcast 专用播放器
Podcast 下载器

自动网页全文抓取系统
网页付费墙绕过
登录状态模拟
Cookie 抓取

Plugin System
Automation Platform
```

特别注意：

> **RSS 本身不是“网页抓取器”。**

M4 默认只消费 Feed 提供的：

```text
title
author
description
summary
content
link
guid / id
published
updated
category
```

等信息。

不要因为：

```text
Feed 只提供摘要
```

就自动进入网页重新抓取全文。

---

# 六、M4 与 M1 Web Capture 的边界

M1：

```text
Web Page
    ↓
Capture
    ↓
Extraction
    ↓
Article
```

M4：

```text
RSS / Atom
    ↓
Feed
    ↓
Entry
    ↓
RSS Article
```

两条路径最终汇聚：

```text
                ┌─ Web Capture
                │
Source ─────────┤
                │
                └─ RSS Feed
                       ↓
                 Document Model
                       ↓
                    Library
                       ↓
                    Reader
```

不要让：

```text
RSS Parser
```

直接依赖：

```text
Web Article Extractor
```

除非现有架构已经如此，而且有明确理由。

---

# 七、M4 与 M3 的关系

M3 已建立：

```text
Document
Library
Search
Tags
Read State
Favorites
Inbox
Recent
SQLite Index
```

M4 必须复用这些能力。

不要建立第二套：

```text
RSSLibrary
RSSSearch
RSSReadState
RSSInbox
```

这种平行体系。

正确：

```text
RSS
 ↓
Document
 ↓
LibraryService
 ↓
SearchService
 ↓
Reader
```

RSS 只是：

> **Document 的来源类型之一。**

---

# 八、Feed 与 Document 必须区分

必须明确：

```text
Feed
```

和：

```text
RSS Article / Document
```

不是同一个东西。

Feed 是：

```text
订阅源
```

例如：

```text
https://example.com/feed.xml
```

RSS Article 是：

```text
这个 Feed 中的一篇具体文章
```

因此：

```text
Feed
├─ Feed Metadata
├─ Fetch State
├─ Subscription State
└─ Items
       ├─ Document A
       ├─ Document B
       └─ Document C
```

不要把：

```text
Feed = Document
```

---

# 九、Feed Domain Model

建立最小但稳定的：

```text
Feed
```

建议至少包含：

```text
feed_id
url
canonical_url
title
site_url
description
image_url
format
language
enabled
created_at
updated_at
last_fetched_at
last_success_at
last_error
etag
last_modified
```

注意：

> 不要一次加入几十个未来字段。

例如暂时不要加入：

```text
AI category
AI summary
engagement score
recommendation score
popularity
social count
```

---

# 十、Feed URL

必须区分：

```text
original_url
canonical_url
```

例如用户输入：

```text
https://example.com/feed
```

经过 HTTP Redirect：

```text
https://example.com/rss.xml
```

需要能够记录：

```text
original_url
canonical_url
```

不要只保留最终 URL。

原因：

```text
用户输入来源
≠
服务器最终地址
```

这对诊断、迁移、修改订阅都很重要。

---

# 十一、Feed Identity

Feed ID 应为 Reverie 自己生成的稳定 ID：

```text
feed_id
```

不要直接使用：

```text
URL
```

作为内部主键。

例如：

```text
feed_01J...
```

Feed ID 不因为：

```text
URL Redirect
```

变化而变化。

---

# 十二、Feed 持久化

Feed 订阅本身属于用户数据。

因此：

> Feed 订阅关系不能只存在 SQLite。

至少必须存在可恢复的文件数据。

推荐保持类似：

```text
feeds/
    feed-id/
        meta.json
        state.json
```

实际目录结构以现有项目实现为准。

如果已有更合理的文件布局：

> 优先复用，不要为了形式强行重构。

---

# 十三、Feed Metadata 与 Feed Runtime State

尽量区分：

### Stable Metadata

```text
feed_id
url
canonical_url
title
site_url
description
language
image
```

### Runtime / Fetch State

```text
enabled
etag
last_modified
last_fetched_at
last_success_at
last_error
```

不要把：

```text
HTTP 缓存头
网络错误
瞬时状态
```

写入正文。

---

# 十四、RSS Article 必须进入统一 Document

Feed Item 最终应转换为：

```text
Document
```

Document Type：

```text
rss_article
```

或者如果当前代码已经存在：

```text
article
```

则优先复用现有模型。

不要为了 RSS 再造一个完全平行的：

```text
RssDocument
```

体系。

---

# 十五、RSS Article 最小 Metadata

建议至少记录：

```text
document_id
document_type
title
author
original_url
canonical_url
feed_id
feed_title
published_at
updated_at
captured_at
content_hash
source_type
```

并根据现有 Document Model 保持统一字段命名。

注意：

```text
feed_id
```

是来源关系。

不是：

```text
DocumentId
```

的替代品。

---

# 十六、RSS Article 文件

继续保持：

> **用户可见资料以文件为真相。**

推荐最终仍然类似：

```text
articles/
    YYYY/
        document-id/
            article.md
            meta.json
            annotations.jsonl
            source/
                ...
```

RSS Article 不应该：

```text
只存 SQLite
```

也不应该：

```text
只存一份 RSS XML
```

而应该形成真正的 Reverie Document。

---

# 十七、RSS 原始来源数据

为了诊断与恢复，可以考虑保留：

```text
source/
    feed-item.xml
```

或者：

```text
source/
    source.json
```

具体采用哪一种，以当前文件格式设计为准。

但必须注意：

> 不要为了“保留原始资料”而无限保存每次 Feed 刷新的完整 XML。

M4 不需要建立版本控制系统。

---

# 十八、RSS 内容来源优先级

对 RSS：

```text
RSS 2.0
```

如果同时存在：

```text
content:encoded
description
```

优先使用更完整的内容。

Atom：

```text
content
summary
```

优先：

```text
content
```

然后：

```text
summary
```

如果只有摘要：

> 不应该假装它是全文。

Document 中必须明确这是：

```text
Feed-provided content
```

而不是：

```text
Captured full webpage
```

---

# 十九、禁止自动全文抓取

M4 不得形成：

```text
RSS
 ↓
发现 URL
 ↓
自动调用网页 extractor
 ↓
抓取全文
```

除非这是用户明确触发的现有 M1 Capture 行为。

默认：

```text
RSS Item
 ↓
使用 Feed 提供内容
```

用户点击：

```text
Open Original
```

才通过系统浏览器打开原网页。

---

# 二十、HTML → Markdown / Reverie Content

如果 RSS 内容包含 HTML：

```text
content:encoded
Atom content[type=html]
```

需要进入安全的：

```text
HTML Sanitization
        ↓
Normalization
        ↓
Markdown / Reverie Content
```

不要未经处理直接把任意第三方 HTML 当作可信应用 UI。

---

# 二十一、RSS HTML 安全

必须阻止或过滤：

```text
<script>
<script src>
onload
onclick
onerror
javascript:
data:
危险 iframe
危险 embed
object
```

具体策略应根据 Reader 当前实现决定。

必须验证：

```text
恶意 Feed HTML
```

不会：

```text
执行任意脚本
修改应用状态
访问本地文件
窃取凭据
调用本地接口
```

---

# 二十二、Reader 集成

M4 不应该创建：

```text
RssReader
```

来重复实现阅读功能。

优先：

```text
RSS Article
    ↓
Document
    ↓
Existing Reader Shell
    ↓
Existing Reader Adapter
```

RSS 与 Web Article 的阅读体验应尽量统一。

---

# 二十三、Reader 中的来源信息

RSS Article 可以显示：

```text
标题
作者
发布时间
Feed
原始来源
```

并提供：

```text
Open Original
```

但不能因为：

```text
“这是 RSS”
```

就绕过已有 Reader 安全策略。

---

# 二十四、RSS Parser

建立独立：

```text
RssParser
AtomParser
```

或者统一：

```text
FeedParser
```

根据实际代码复杂度决定。

目标输出不是第三方 XML Library 对象。

错误：

```text
UI
 ↓
RSS XML Object
```

正确：

```text
RSS XML
 ↓
Parser
 ↓
NormalizedFeed
 ↓
Reverie Domain Model
```

---

# 二十五、Normalized Feed

建立统一：

```text
NormalizedFeed
```

至少：

```text
feed metadata
feed items
format
source url
```

Feed Item：

```text
NormalizedFeedItem
```

至少：

```text
external_id
title
author
link
published_at
updated_at
summary
content
categories
```

第三方 XML parser 类型不得泄漏到 UI。

---

# 二十六、RSS 2.0 必须处理

至少测试：

```text
<rss>
<channel>
<item>
<title>
<link>
<description>
<guid>
<pubDate>
<author>
<category>
```

以及常见扩展：

```text
content:encoded
dc:creator
```

具体支持哪些 namespace：

> 以真实语料和实际需要决定。

不要因为“RSS 有很多扩展”而无限扩张。

---

# 二十七、Atom 必须处理

至少覆盖：

```text
<feed>
<entry>
<id>
<title>
<updated>
<published>
<author>
<link>
<summary>
<content>
```

重点处理：

```text
link rel="alternate"
link rel="self"
link rel="canonical"
```

等可能出现的关系。

不要简单：

```text
取第一个 href
```

---

# 二十八、Feed Title

Feed 标题来源优先：

```text
channel.title
```

Atom：

```text
feed.title
```

如果不存在：

```text
合理 fallback
```

但不能因为缺少标题导致整个 Feed 丢失。

---

# 二十九、Article Title

RSS：

```text
item.title
```

Atom：

```text
entry.title
```

不能为空时：

```text
使用安全 fallback
```

禁止：

```text
null
```

直接导致 UI 崩溃。

---

# 三十、Author Normalize

可能出现：

```text
author
dc:creator
Atom author.name
```

应该统一成：

```text
author
```

不要让 Search 层知道：

```text
dc:creator
AtomAuthor
RSSAuthor
```

---

# 三十一、时间 Normalize

RSS 和 Atom 时间格式可能不同。

统一为 Reverie 使用的时间模型。

至少测试：

```text
RFC 822 / RFC 1123 风格 RSS 日期
ISO 8601 Atom 日期
timezone
missing date
invalid date
```

非法日期：

```text
不能 crash
```

可以：

```text
null
```

并记录诊断。

---

# 三十二、URL Normalize

保存：

```text
original_url
canonical_url
```

不要修改用户看到的：

```text
original URL
```

Normalize 用于：

```text
Deduplication
Comparison
Index
```

---

# 三十三、URL Normalize 规则

至少定义：

```text
trim
scheme normalization
host casing
default port
fragment handling
percent encoding
path normalization
```

但是：

> 不要擅自删除具有业务意义的 query parameter。

尤其不要粗暴：

```text
删除所有 query
```

因为：

```text
?article=123
```

本身可能决定内容。

---

# 三十四、GUID / Atom ID

RSS：

```text
guid
```

Atom：

```text
id
```

是最重要的稳定身份候选之一。

但不能假定所有 Feed 都可靠。

必须支持：

```text
GUID 存在
GUID 缺失
GUID 改变
GUID 相同但 URL 改变
```

---

# 三十五、GUID isPermaLink

RSS：

```text
guid isPermaLink="true"
```

与：

```text
guid isPermaLink="false"
```

语义不同。

不要直接：

```text
guid == URL
```

必须保留：

```text
external_id
external_id_type
```

等必要信息。

---

# 三十六、Deduplication 总原则

去重必须：

> **宁可保留两个疑似重复条目，也不要错误合并两个不同文档。**

尤其不能仅凭：

```text
title
```

合并。

---

# 三十七、同 Feed 去重优先级

建议：

```text
1. Feed + stable external id
2. Feed + canonical URL
3. Feed + normalized URL
4. Feed + strong content identity
```

例如：

```text
feed A
guid=123
```

第二次抓到：

```text
guid=123
```

必须识别为：

```text
existing item
```

而不是：

```text
new document
```

---

# 三十八、缺 GUID 的 Feed

如果：

```text
guid missing
```

则不能直接判定：

```text
duplicate
```

可以回退到：

```text
canonical URL
normalized URL
```

如果仍无法判断：

> 使用保守策略。

不要仅凭：

```text
title + date
```

进行高置信合并。

---

# 三十九、Content Hash

为正常化内容建立：

```text
content_hash
```

用途：

```text
判断 Feed 是否真的发生变化
```

而不是：

```text
Document ID
```

的唯一来源。

---

# 四十、重复 Item 与内容变化

例如：

第一次：

```text
guid=123
title=A
content=X
```

第二次：

```text
guid=123
title=A
content=Y
```

应该识别：

```text
same item
content changed
```

不能：

```text
new article
```

同时也不能：

```text
静默覆盖一切用户数据
```

必须保护：

```text
Annotation
Note
Tags
Favorite
Read State
Inbox
Bookmark
```

---

# 四十一、RSS 更新与 Annotation

如果 RSS 内容改变：

```text
Old Content
    ↓
New Content
```

M2 的 Annotation 必须继续存在。

然后：

```text
Anchor Resolver
    ↓
重新定位
```

可能结果：

```text
resolved
```

或者：

```text
orphaned
```

绝不能：

```text
content changed
→ delete highlight
```

---

# 四十二、RSS 更新策略

更新文档时必须：

```text
validate new content
        ↓
write temp
        ↓
atomic replace
```

不要直接：

```text
open article.md
truncate
write
```

因为程序崩溃可能导致：

```text
半个文章
```

---

# 四十三、Revision 是否需要

不要在 M4 直接实现大型：

```text
Git-like document history
```

但必须考虑：

```text
旧 RSS 内容
是否有必要保留
```

如果当前项目已有 Revision / Snapshot 能力：

> 直接复用。

如果没有：

> 不要因为理论上的“未来可能需要”而引入大型版本系统。

至少确保：

```text
content_hash
updated_at
source metadata
```

足以支持后续 M10 Stability / Recovery 演进。

---

# 四十四、Feed 更新不得覆盖用户状态

Feed Refresh：

```text
只负责 Source / Content 更新
```

不得重置：

```text
read
unread
favorite
inbox
tags
annotations
notes
bookmarks
```

例如：

```text
用户已读
+
Feed 刷新
```

结果仍：

```text
已读
```

---

# 四十五、Read State

必须复用 M3。

默认规则保持一致：

```text
RSS Item 新进入 Library
→ unread
```

而：

```text
打开文章
```

不能擅自改变为：

```text
read
```

除非 M3 当前已经定义了自动标记规则。

始终以现有 M3 行为为准。

---

# 四十六、Inbox

新 RSS Article 默认：

```text
inbox = true
```

除非当前产品已有明确不同策略。

Feed Item 一旦进入 Library：

```text
Inbox
+
Unread
```

形成最自然的待处理状态。

但：

```text
Inbox
```

与：

```text
Unread
```

必须保持独立。

例如：

```text
Read + Inbox
Unread + No Inbox
```

都必须合法。

---

# 四十七、Feed Subscription 与 Inbox 不要混淆

Feed：

```text
enabled
```

表示：

> 是否继续订阅 / 获取。

Inbox：

```text
inbox
```

表示：

> 这篇文章是否仍在待处理列表。

二者完全不是一个概念。

---

# 四十八、Feed Pause

暂停 Feed：

```text
enabled = false
```

后：

```text
不刷新
```

但不能删除：

```text
已有 RSS Articles
```

已有文章继续属于 Library。

---

# 四十九、删除 Feed

删除订阅源时：

> **不能默认删除已经保存的 RSS Article。**

正确：

```text
Delete Subscription
        ↓
Feed removed
        ↓
Existing Articles remain
```

原因：

> Feed 是来源订阅，Article 是用户自己的档案。

---

# 五十、重新添加相同 Feed

如果用户：

```text
删除 Feed
```

然后：

```text
重新添加同一个 Feed
```

不能导致所有历史 Item 全部重新生成重复文章。

应尽量使用：

```text
canonical URL
external ID
existing document identity
```

恢复已有关系。

---

# 五十一、Feed Refresh

提供：

```text
Refresh Feed
```

和：

```text
Refresh All
```

用户明确操作时才执行网络请求。

M4 默认不要做：

```text
启动时偷偷联网
后台无限刷新
用户没有请求却访问 Feed
```

---

# 五十二、网络行为必须可解释

每一次网络行为至少能够回答：

```text
为什么请求？
请求哪个 URL？
什么时候请求？
结果是什么？
为什么失败？
```

日志可以记录：

```text
feed_id
request start
response status
redirect
duration
result
```

但不要记录：

```text
凭据
Cookie
Authorization
Secret
Token
```

---

# 五十三、HTTP Client

RSS Fetcher 应统一使用项目现有 HTTP 基础设施。

不要每个模块自己建立：

```text
HTTP client
```

禁止：

```text
FeedFetcher
自己一套 HttpClient

ArticleCapture
又一套 HttpClient

Future Import
再一套 HttpClient
```

如果已有 Network / HTTP Service：

> 直接复用。

---

# 五十四、HTTP Timeout

Feed 请求必须有：

```text
connect timeout
request timeout
read timeout
```

不能：

```text
无限等待
```

具体数值：

> 根据现有基础设施和真实测试确定，并记录在 `DECISIONS.md`。

---

# 五十五、HTTP Redirect

支持有限 Redirect。

必须：

```text
限制最大跳转次数
```

并且：

> 每次 Redirect 后重新执行 URL Policy。

不能：

```text
trusted feed URL
→ redirect
→ localhost
→ private network
```

还继续请求。

---

# 五十六、URL Scheme

只允许：

```text
http
https
```

禁止：

```text
file:
javascript:
data:
ftp:
custom:
未知 protocol
```

RSS Feed 不是任意协议加载器。

---

# 五十七、SSRF / Private Network

必须考虑：

```text
localhost
127.0.0.1
::1
private IPv4
link-local
特殊 IPv6
```

以及 DNS resolve 后的地址。

Redirect 后必须再次判断。

如果项目确实需要局域网 Feed：

> 必须通过明确的用户行为和明确的 policy 开放，而不是默认放开。

---

# 五十八、响应大小限制

Feed 是不可信网络输入。

必须设置合理：

```text
maximum response size
```

防止：

```text
超大 XML
内存耗尽
恶意响应
```

达到上限：

```text
FetchError::BodyTooLarge
```

而不是：

```text
OutOfMemory
```

---

# 五十九、XML 安全

RSS / Atom Parser 必须防止：

```text
XXE
External Entity
DTD Abuse
Entity Expansion
Billion Laughs
Excessive Nesting
Huge Text Node
Malformed XML
```

原则：

> 第三方 Feed XML 永远是不可信输入。

---

# 六十、XML Parser Error

以下都不能导致应用崩溃：

```text
malformed XML
unexpected EOF
invalid UTF-8
invalid namespace
missing root
missing channel
missing feed
```

错误应该变成：

```text
FeedParseError
```

并展示用户可理解的错误。

---

# 六十一、Malformed Feed

例如：

```xml
<rss>
  <channel>
    <item>
```

缺少闭合标签。

结果：

```text
解析失败
```

而不是：

```text
App Crash
```

---

# 六十二、部分损坏的 Feed

如果：

```text
Feed metadata 正常
Item A 正常
Item B 损坏
Item C 正常
```

是否能够：

```text
跳过 B
保留 A/C
```

应通过实际 parser 能力决定。

如果 parser 只能：

```text
整个 XML 失败
```

必须：

```text
记录明确错误
```

不要伪装成成功。

---

# 六十三、HTTP Status

至少区分：

```text
2xx
3xx
4xx
5xx
```

典型：

```text
200 OK
304 Not Modified
404 Not Found
410 Gone
429 Too Many Requests
500 Server Error
503 Service Unavailable
```

这些不能全部变成：

```text
Unknown Error
```

---

# 六十四、304 Not Modified

如果服务器支持：

```text
ETag
Last-Modified
```

应该支持条件请求：

```text
If-None-Match
If-Modified-Since
```

服务器：

```text
304
```

意味着：

> 内容没有变化。

不应该重新解析已有内容。

---

# 六十五、ETag / Last-Modified

这些属于：

```text
Feed Fetch State
```

可以持久化。

例如：

```text
etag
last_modified
```

不要把它们写进：

```text
article.md
```

---

# 六十六、Retry

仅对适合重试的错误进行：

```text
bounded retry
```

例如：

```text
timeout
connection reset
5xx
```

不要对：

```text
404
400
invalid XML
unsupported protocol
```

无限重试。

---

# 六十七、Retry 上限

必须：

```text
有限次数
有限退避
```

不能：

```text
while true
```

也不能因为一个 Feed 出错：

```text
整个 Refresh All 卡死
```

---

# 六十八、Cancellation

用户：

```text
Cancel Refresh
```

必须能够取消：

```text
pending request
parsing
normalization
ingestion
```

至少网络请求必须可取消。

---

# 六十九、Refresh All

执行：

```text
Refresh All
```

时：

> 一个坏 Feed 不应该让全部 Feed 失败。

例如：

```text
Feed A success
Feed B timeout
Feed C success
Feed D parse error
```

结果应该：

```text
A = success
B = failed
C = success
D = failed
```

而不是：

```text
Refresh All = total failure
```

---

# 七十、Feed Refresh Result

建立结构化结果，例如：

```text
FeedRefreshResult
```

至少：

```text
feed_id
status
fetched
new_items
updated_items
duplicate_items
unchanged
error
duration
```

UI 不应该通过：

```text
message.contains("timeout")
```

判断状态。

必须使用：

```text
typed status / error code
```

---

# 七十一、Feed Error State

Feed 应记录：

```text
last_error
last_error_at
last_success_at
```

但：

> 网络失败不能删除过去已经成功保存的文章。

---

# 七十二、错误恢复

例如：

```text
昨天成功
今天 503
```

应该保持：

```text
历史文章正常
Feed 状态 = error
```

下次成功：

```text
error cleared
last_success_at updated
```

---

# 七十三、Feed Item Normalize

RSS：

```text
Raw XML
```

必须经过：

```text
Parse
 ↓
Normalize
 ↓
Validate
 ↓
Deduplicate
 ↓
Persist
```

不要：

```text
Parse
 ↓
直接写数据库
```

---

# 七十四、Item Validation

至少验证：

```text
title
identity
URL
content
date
```

但必须允许：

```text
title missing
author missing
published missing
description missing
```

只要：

> Item 仍然能够可靠识别和保存。

---

# 七十五、什么情况下拒绝 Item

可以拒绝：

```text
完全没有任何稳定 identity
无法形成合法 Document
恶意超大字段
无法通过安全 Sanitization
```

但必须：

```text
记录 diagnostic
```

不得静默丢失。

---

# 七十六、Feed Item 时间排序

Feed 页面通常：

```text
newest first
```

但不能假设：

```text
XML 顺序 = 发布时间顺序
```

应尽量使用：

```text
published_at
updated_at
```

形成稳定排序。

缺失时间时：

```text
使用 ingestion time
```

并明确：

> 这不是原始发布时间。

---

# 七十七、Feed 更新时 Item 顺序改变

某个 Feed 可能：

```text
第一次：
A B C

第二次：
D A B C
```

不能因为整体顺序变化而：

```text
重复创建 A/B/C
```

Identity 必须与顺序解耦。

---

# 七十八、Feed 内容更新

RSS Feed 可能对已有 Item 进行：

```text
title update
content update
date correction
link correction
```

必须根据：

```text
external identity
```

识别为：

```text
existing item
```

而不是：

```text
new article
```

---

# 七十九、Search 集成

M3 已经定义搜索：

```text
Title
Author
Body
Highlight
Note
Tag
URL
```

RSS Article 自动进入同一 Search Pipeline。

不要增加：

```text
RSSSearchService
```

---

# 八十、Feed Name Search

M4 不要为了方便直接改变 M3 的基础全文字段定义。

如果用户需要：

```text
按 Feed 筛选
```

优先采用：

```text
source filter
feed filter
```

而不是偷偷把：

```text
Feed Name
```

塞进 Body。

---

# 八十一、RSS 与 Annotation

用户可以：

```text
打开 RSS Article
 ↓
选择文本
 ↓
Highlight
 ↓
Note
```

这些必须进入现有：

```text
Annotation Core
```

不能建立：

```text
RssHighlight
RssNote
```

---

# 八十二、RSS Item 删除 / 过期

Feed 中某篇文章以后：

```text
不再出现
```

不能理解成：

```text
删除 Document
```

Feed refresh 不允许删除用户已经保存的文章。

Feed 中“不再发布”：

> 不等于用户资料“不存在”。

---

# 八十三、Feed 中不存在的历史文章

Reverie 的 Library 是长期个人档案。

因此：

```text
Feed 删除文章
```

不影响：

```text
Reverie saved Article
```

---

# 八十四、Feed Item 与 Original URL

RSS Article 必须保存：

```text
original_url
```

方便：

```text
Open Original
```

同时：

```text
canonical_url
```

用于 dedup。

两者不要混为一谈。

---

# 八十五、Feed Image

RSS 可能提供：

```text
image
logo
icon
```

M4 可以支持显示。

但：

> 图片不是 M4 的核心资料。

不要因为 Feed Image 而提前建立复杂：

```text
Media Management
Image CDN
Thumbnail Pipeline
```

如果资源是远程地址：

```text
Reader 不能因为图片加载失败而导致文章失败。
```

---

# 八十六、远程资源

Feed Item 内容中的：

```text
<img src="https://...">
```

不要默认下载全部资源。

这样可以避免 M4 变成：

```text
RSS + Web Crawler
```

M4 重点是：

```text
Feed Content
```

而不是：

```text
Web Archiver
```

---

# 八十七、Feed List UI

建立最小可用 Feed 管理界面。

至少：

```text
Feed Title
Feed URL
Unread Count
Last Updated
Status
Refresh
Pause
Delete
```

不要追求最终视觉设计。

M4 优先：

```text
可靠
清晰
稳定
可操作
```

---

# 八十八、Add Feed

至少支持：

```text
输入 Feed URL
        ↓
Validate URL
        ↓
Fetch
        ↓
Parse
        ↓
确认 Feed Metadata
        ↓
Create Subscription
```

不要：

```text
输入 URL
 ↓
先写数据库
 ↓
以后再说
```

应尽量：

```text
验证成功
 ↓
持久化
```

---

# 八十九、Add Feed 失败

例如：

```text
404
timeout
not RSS
invalid XML
blocked
unsupported URL
```

应该：

```text
Add Feed Failed
```

不能留下：

```text
半个 Feed
```

---

# 九十、Feed Duplicate

用户再次添加相同 Feed：

```text
same canonical URL
```

应提示：

```text
already subscribed
```

而不是创建第二个 Feed。

---

# 九十一、Feed URL Redirect Duplicate

例如：

```text
https://a.com/feed
```

和：

```text
https://b.com/rss.xml
```

实际上 Redirect 到同一个 Feed。

必须尽量识别：

```text
same canonical feed
```

避免重复订阅。

---

# 九十二、Feed Rename

用户修改本地 Feed 名称时：

> 这是用户状态，不应覆盖服务器提供的真实 Feed Metadata。

因此，如果产品需要：

```text
custom_name
```

应该作为单独用户字段存在。

不要覆盖：

```text
remote_title
```

---

# 九十三、Feed Metadata Refresh

Feed refresh 可以更新：

```text
title
description
site_url
image
```

但不要覆盖用户自定义状态：

```text
custom_name
enabled
```

---

# 九十四、Unread Count

Feed UI 可以显示：

```text
Unread Count
```

但它必须来自：

```text
Document Read State
```

而不是单独维护另一套：

```text
rss_unread_count
```

否则很容易出现：

```text
Feed Count = 20
实际 Unread = 18
```

正确：

```text
Document State
    ↓
Query
    ↓
Unread Count
```

---

# 九十五、Feed Library View

建议加入：

```text
Feeds
```

入口。

进入 Feed：

```text
Feed Header
    ↓
Feed Items
```

但 Feed Items 仍然是：

```text
Library Documents
```

而不是另外一套 UI 数据。

---

# 九十六、Feed Item Filter

至少支持：

```text
All
Unread
Read
```

必要时：

```text
Inbox
```

继续复用 M3。

不要重新实现 filter engine。

---

# 九十七、Refresh UI 状态

刷新时应明确：

```text
Refreshing
Success
Partial Success
Failed
Cancelled
```

禁止 UI 长时间停留：

```text
Loading...
```

而不知道发生了什么。

---

# 九十八、后台任务

M4 不要建立复杂 Scheduler。

不要提前实现：

```text
cron
calendar
automation
smart refresh
AI refresh strategy
```

先保证：

```text
manual refresh
refresh all
```

可靠。

如果后续确实需要定时刷新：

> 在独立阶段或后续设计中加入。

---

# 九十九、Offline 行为

断网时：

```text
Library
Reader
Search
Annotation
```

仍然应该正常工作。

只有：

```text
Refresh
Add Remote Feed
```

等网络动作失败。

Reverie 不能因为：

```text
Internet unavailable
```

而无法打开已有资料。

---

# 一百、SQLite

M4 可以扩展 SQLite Index。

例如：

```text
feeds
feed_items
```

但必须记住：

> SQLite 只是派生数据。

不要让：

```text
feed_items table
```

成为唯一的 RSS Article 存储。

---

# 一百零一、Index Rebuild

执行：

```text
Rebuild Index
```

必须能够恢复：

```text
RSS Articles
Read State
Inbox
Tags
Annotations
Feed relationship
```

其中：

```text
Feed subscription
```

是否可以完整恢复，应根据实际文件格式验证。

最终报告必须写清：

```text
哪些来自用户文件
哪些无法从索引恢复
为什么
```

---

# 一百零二、M4 最重要的数据一致性测试

必须测试：

```text
Add Feed
→ Fetch
→ Create Articles
→ Close App
→ Restart
→ Feed remains
→ Articles remain
→ Read State remains
→ Inbox remains
→ Search finds Article
```

---

# 一百零三、删除 SQLite 测试

执行：

```text
delete index.db
```

然后：

```text
rebuild
```

必须验证：

```text
Feed Article
仍然存在

Highlight
仍然存在

Note
仍然存在

Read State
仍然存在

Inbox
仍然存在
```

---

# 一百零四、Feed Parser Fixture

测试必须使用离线 Fixture。

不得：

```text
cargo test
→ 访问真实 RSS
```

CI 不得依赖：

```text
Internet
```

真实网站只用于：

```text
Optional Integration Test
```

---

# 一百零五、RSS Fixtures

至少建立：

```text
rss-minimal.xml
rss-full.xml
rss-content-encoded.xml
rss-no-guid.xml
rss-duplicate.xml
rss-updated-item.xml
rss-missing-fields.xml
rss-invalid-date.xml
rss-malformed.xml
rss-large.xml
```

---

# 一百零六、Atom Fixtures

至少：

```text
atom-minimal.xml
atom-full.xml
atom-multiple-links.xml
atom-content-html.xml
atom-content-text.xml
atom-missing-id.xml
atom-malformed.xml
```

---

# 一百零七、Parser Test

至少断言：

```text
title
author
url
id
published
updated
summary
content
categories
```

全部按预期 Normalize。

---

# 一百零八、Dedup Tests

必须覆盖：

```text
same GUID
same Atom ID
same URL
same canonical URL
different GUID + same URL
same GUID + changed content
missing GUID
duplicate item order changed
```

并验证：

```text
不会产生意外重复
```

---

# 一百零九、State Preservation Test

先：

```text
Feed Item
→ mark read
→ favorite
→ tag
→ highlight
→ note
```

然后：

```text
Feed refresh
```

验证：

```text
read unchanged
favorite unchanged
tag unchanged
highlight unchanged
note unchanged
```

这是 M4 的关键回归测试。

---

# 一百一十、Annotation Re-anchor Test

构造：

```text
RSS Article v1
```

创建：

```text
Highlight
```

然后 Feed 更新成：

```text
RSS Article v2
```

验证：

```text
Annotation still exists
```

并：

```text
resolved
```

或者：

```text
orphaned
```

都必须是合法结果。

绝不能：

```text
annotation silently deleted
```

---

# 一百十一、Network Fixture

HTTP 测试至少覆盖：

```text
200
304
301
302
404
410
429
500
503
timeout
connection reset
malformed response
body too large
redirect loop
redirect to forbidden address
```

---

# 一百十二、Security Tests

至少测试：

```text
XXE
DOCTYPE
entity expansion
deep nesting
huge XML
huge field
javascript URL
data URL
file URL
localhost redirect
private IP redirect
malicious HTML
script tag
event handler
iframe
```

断言：

```text
不会执行危险内容
不会读取本地文件
不会无限消耗资源
不会 crash
```

---

# 一百十三、Fuzz Testing

对：

```text
RSS XML
Atom XML
HTML fragment
URLs
Feed metadata
```

进行 fuzz / property testing。

目标不是：

```text
100% fuzz coverage
```

而是确保：

```text
arbitrary malformed input
→ no panic
→ bounded resource use
→ typed error
```

---

# 一百十四、Property Tests

至少考虑：

```text
normalize(normalize(x)) == normalize(x)
```

以及：

```text
same stable identity
→ same dedup identity
```

还有：

```text
refresh twice with unchanged feed
→ zero duplicate documents
```

---

# 一百十五、Refresh Idempotency

这是 M4 非常重要的性质。

：

```text
Feed A
```

第一次：

```text
new = 20
```

第二次：

```text
new = 0
duplicate = 20
```

不应该：

```text
Article count +20
```

每次 Refresh 必须尽量接近：

> **幂等。**

---

# 一百十六、Concurrency

用户可能连续点击：

```text
Refresh
Refresh
Refresh
```

不能导致：

```text
same item inserted 3 times
```

应该：

```text
serialize
coalesce
cancel stale
```

具体方案以当前架构为准。

但必须有测试证明：

> 并发刷新不会破坏数据一致性。

---

# 一百十七、Atomic Ingestion

创建 RSS Article 时：

```text
Prepare
 ↓
Validate
 ↓
Write temp
 ↓
Flush
 ↓
Atomic replace
 ↓
Update index
```

不要：

```text
先写 SQLite
后写 article.md
```

因为：

```text
DB success
+
file failure
```

会产生：

```text
幽灵文章
```

---

# 一百十八、Index Failure

如果：

```text
Article file write success
Index update failure
```

正确结果：

```text
Document exists
Index marked stale / rebuildable
```

不能：

```text
delete document
```

---

# 一百十九、Refresh Failure

如果：

```text
Feed fetch success
Article A write success
Article B write failed
```

必须有明确策略。

不要：

```text
整个 Library 回滚成未知状态
```

也不要：

```text
静默丢掉 B
```

必须：

```text
记录 failure
保留成功资料
允许后续恢复
```

---

# 一百二十、Partial Failure

Refresh All 的成功状态必须允许：

```text
A success
B failed
C success
```

而不是只能：

```text
all success
all failed
```

---

# 一百二十一、Feed Diagnostic

至少记录：

```text
Feed ID
URL
Timestamp
Operation
HTTP status
Parser error
Item count
New count
Updated count
Failure reason
```

但是：

```text
日志不能包含敏感信息。
```

---

# 一百二十二、性能目标

不要伪造 benchmark。

必须实际测量：

```text
1 Feed
10 Feeds
50 Feeds
100+ Feeds
```

以及：

```text
10 items/feed
100 items/feed
500 items/feed
```

记录：

```text
parse time
normalize time
dedup time
ingestion time
indexing time
memory usage
```

---

# 一百二十三、不要盲目并发

不要因为：

```text
Feed 很多
```

就：

```text
spawn 1000 requests
```

应该有限制：

```text
concurrency limit
```

避免：

```text
本机资源耗尽
服务器压力过大
```

---

# 一百二十四、Fetch Ordering

Refresh All 不要求：

```text
按 UI 顺序严格执行
```

但必须保证：

```text
结果彼此独立
状态正确
最终 Library 一致
```

---

# 一百二十五、Feed Rate Behavior

不要实现：

```text
aggressive polling
```

M4 优先：

```text
user-triggered refresh
```

同时尊重：

```text
Retry-After
HTTP 语义
```

不要无限重试。

---

# 一百二十六、Feed Content 与合法边界

Reverie 允许：

```text
用户主动订阅公开 RSS / Atom
```

但不要实现：

```text
付费墙绕过
登录 Feed 抓取
Cookie theft
私有内容绕过
受保护 API 绕过
```

Reverie 只处理：

> **用户有权访问和保存的内容。**

---

# 一百二十七、Privacy

默认：

```text
用户没有主动请求
→ 不请求网络 Feed
```

不要：

```text
启动应用
→ 自动访问所有 Feed
```

除非已有明确、可见、用户开启的自动刷新功能，而且该能力已经被正式纳入产品设计。

M4 不需要偷偷增加这种机制。

---

# 一百二十八、Feed Source Attribution

RSS Article 应尽可能保留：

```text
Feed Title
Site URL
Original Article URL
Published Time
Author
```

使用户未来即使：

```text
Feed 消失
```

也知道：

```text
这篇资料来自哪里。
```

---

# 一百二十九、Reader 中原文入口

提供：

```text
Open Original
```

使用：

```text
系统默认浏览器
```

而不是：

```text
Reverie Reader
```

直接执行未经处理的远程网页。

---

# 一百三十、M4 Architecture Boundary

推荐边界：

```text
Reverie
│
├─ App
├─ Library
├─ Reader
├─ Annotation
├─ Search
├─ Capture
├─ Feed
│   ├─ FeedService
│   ├─ FeedRepository
│   ├─ FeedFetcher
│   ├─ FeedParser
│   ├─ FeedNormalizer
│   ├─ FeedDeduplicator
│   └─ FeedIngestor
│
└─ Infrastructure
```

实际目录：

> 以仓库当前结构为准。

不要因为这个图就创建：

```text
几十个空项目
几十个接口
几十个抽象
```

---

# 一百三十一、不要制造 God Object

禁止创建一个：

```text
FeedManager
```

然后塞进：

```text
HTTP
XML Parsing
HTML Sanitization
Dedup
Persistence
Index
UI
Retry
Logging
Security
```

变成：

```text
2000 lines
```

但也不要过度抽象：

```text
IFeedFetcherFactoryFactory
INormalizedFeedStrategy
FeedParserResolverProvider
```

目标：

> **最简单、最清晰、可测试的真实职责划分。**

---

# 一百三十二、第三方 Parser 依赖

如果引入 RSS / Atom parser：

必须记录：

```text
library name
version
license
purpose
security history
为什么不用现有依赖
```

完成后检查：

```text
license
advisory
dependency tree
```

如果项目已经有：

```text
XML parser
```

优先复用。

---

# 一百三十三、M4 实现顺序

严格按照以下顺序执行。

## M4-A — Repository Investigation

先检查：

```text
M0
M1
M2
M3
Document Model
Library
Search
Annotation
HTTP infrastructure
Storage
Index
Reader
```

建立：

```text
FACT
HYPOTHESIS
INFERENCE
```

不要直接写代码。

---

## M4-B — Feed Domain Model

建立：

```text
Feed
FeedSubscription
FeedItem
NormalizedFeed
NormalizedFeedItem
FeedRefreshResult
FeedError
```

具体模型根据现有代码裁剪。

---

## M4-C — Feed Persistence

建立：

```text
Feed file storage
Feed state
Feed metadata
```

保证：

```text
SQLite 删除后
Feed 数据仍然存在
```

---

## M4-D — RSS Parser

实现：

```text
RSS 2.0
```

先使用 Fixture。

---

## M4-E — Atom Parser

加入：

```text
Atom 1.0
```

并统一进入：

```text
NormalizedFeed
```

---

## M4-F — URL / Identity

实现：

```text
original URL
canonical URL
external ID
content hash
```

---

## M4-G — Deduplication

实现：

```text
same feed
same identity
same URL
same content
changed content
```

---

## M4-H — Feed Fetcher

实现：

```text
HTTP
redirect
timeout
304
ETag
Last-Modified
retry
cancellation
```

---

## M4-I — Security

实现并测试：

```text
XML security
HTML sanitization
URL policy
redirect policy
response limit
resource limit
```

---

## M4-J — RSS → Document

建立：

```text
Feed Item
 ↓
Document
 ↓
file
 ↓
index
```

---

## M4-K — Inbox / Read State

复用 M3：

```text
Unread
Inbox
Favorite
Tags
Recent
```

---

## M4-L — Library / Reader Integration

实现：

```text
Feed List
Feed Items
Open Reader
Mark Read / Unread
Open Original
```

---

## M4-M — Search Integration

确认：

```text
RSS Article
```

自动进入：

```text
Search Index
```

并支持：

```text
Title
Author
Body
URL
Highlight
Note
Tag
```

---

## M4-N — Rebuild / Recovery

验证：

```text
Delete SQLite
→ Rebuild
→ RSS Articles recover
→ states recover
→ annotations recover
```

---

## M4-O — Full Tests

执行：

```text
Unit
Integration
E2E
Security
Fuzz
Performance
```

---

## M4-P — Final Audit

最后才：

```text
更新文档
更新 PROGRESS
更新 DECISIONS
逻辑 commit
输出 M4 Final Report
```

---

# 一百三十四、M4 Acceptance Gate

进入 M5 前必须满足：

```text
[ ] RSS 2.0 works
[ ] Atom works
[ ] Feed add works
[ ] Feed remove works
[ ] Feed pause works
[ ] Feed refresh works
[ ] Refresh All works
[ ] Feed persistence works
[ ] No duplicate subscription
[ ] Stable item dedup works
[ ] URL dedup works
[ ] Changed item handled
[ ] Read State preserved
[ ] Inbox preserved
[ ] Favorite preserved
[ ] Tags preserved
[ ] Highlight preserved
[ ] Note preserved
[ ] Search sees RSS Article
[ ] Reader opens RSS Article
[ ] Original URL works
[ ] 304 works when supported
[ ] Timeout handled
[ ] Retry bounded
[ ] Cancellation works
[ ] Redirect bounded
[ ] Redirect revalidated
[ ] Private network policy works
[ ] XML malicious input safe
[ ] HTML malicious input safe
[ ] Oversized response rejected
[ ] Malformed Feed does not crash
[ ] Refresh All tolerates partial failure
[ ] Atomic file writes
[ ] Index remains rebuildable
[ ] SQLite deletion recovery verified
[ ] Offline tests pass
[ ] No secret leakage in logs
```

---

# 一百三十五、M4 必须做的 E2E

至少完整跑通：

```text
Add Feed
    ↓
Fetch
    ↓
Find New Item
    ↓
Create RSS Article
    ↓
Library
    ↓
Inbox
    ↓
Unread
    ↓
Open Reader
    ↓
Highlight
    ↓
Note
    ↓
Tag
    ↓
Favorite
    ↓
Search
    ↓
Find Article
    ↓
Restart App
    ↓
Everything restored
```

然后：

```text
Refresh Feed
```

验证：

```text
No duplicate
```

再：

```text
Delete SQLite
    ↓
Rebuild
```

验证：

```text
Everything restored
```

---

# 一百三十六、M4 文档

完成后至少维护：

```text
docs/M4-STATUS.md
docs/RSS.md
docs/FEEDS.md
docs/NETWORK.md
```

如果文件格式发生变化：

```text
docs/FORMAT.md
```

必须同步更新。

---

# 一百三十七、RSS.md 至少说明

必须写清：

```text
Supported RSS versions
Supported Atom versions
Normalization rules
Content priority
Identity rules
Dedup rules
URL rules
Update rules
Error handling
Security rules
```

不要写：

```text
“支持 RSS”
```

然后没有任何边界定义。

---

# 一百三十八、FEEDS.md 至少说明

```text
Feed Model
Feed Persistence
Feed State
Add Feed
Refresh
Refresh All
Pause
Delete
Duplicate Feed
Feed Errors
Unread Count
Feed → Library
```

---

# 一百三十九、NETWORK.md 至少说明

```text
Allowed schemes
Timeouts
Redirect limit
Retry policy
Body size limit
Private network policy
Cancellation
HTTP conditional requests
Logging policy
```

---

# 一百四十、DECISIONS.md

至少记录这些真正的设计决定：

```text
RSS / Atom parser
Feed storage location
Feed identity
Item identity
Dedup precedence
URL normalization
Content priority
RSS update strategy
Read State rule
Inbox rule
Refresh policy
Network security policy
Private network policy
```

不要记录：

```text
“我今天创建了一个文件”
```

这种没有长期价值的信息。

---

# 一百四十一、PROGRESS.md

不要写：

```text
M4 done
```

必须明确：

```text
RSS parser      ✅
Atom parser     ✅
Feed Storage    ✅
Fetcher         ✅
Dedup           ✅
Inbox           ✅
Read State      ✅
Search          ✅
Reader          ✅
Security        ✅
Tests           ✅
```

以及：

```text
Known Limitations
Deferred
```

---

# 一百四十二、Git Commit

不要把整个 M4 压缩成一个巨型 commit。

建议按照实际代码变化拆分，例如：

```text
M4 feed domain model
M4 feed persistence
M4 RSS parser
M4 Atom parser
M4 feed fetching
M4 deduplication
M4 RSS document ingestion
M4 library integration
M4 search integration
M4 security hardening
M4 integration tests
M4 docs
```

具体 commit 数量以实际改动为准。

不要为了凑数量拆 commit。

---

# 一百四十三、代码质量

对于：

```text
network
XML
HTML
filesystem
external data
```

禁止无依据使用：

```text
unwrap
expect
panic
```

优先：

```text
Result
Option
typed error
validation
bounded resource
```

但不要为了“零 unwrap”而制造荒谬复杂代码。

内部已经证明的 invariant：

```text
```

可以保持合理断言。

---

# 一百四十四、P0 / P1 / P2 / P3

只有真实证据才能升级。

## P0

例如：

```text
RSS 数据导致本地文件损坏
任意 XML 导致代码执行
SSRF 能访问明确禁止资源
用户 Annotation 被静默删除
Refresh 导致大规模重复资料
SQLite 成为唯一 RSS 数据源
```

## P1

例如：

```text
RSS Article 无法保存
Atom 无法解析
Dedup 错误
更新内容覆盖用户状态
Restart 后 Feed 消失
Reader 无法打开 RSS Article
Reindex 无法恢复 RSS Article
```

## P2

例如：

```text
Refresh UI 卡顿
Feed 列表体验问题
较大 Feed 性能问题
```

## P3

例如：

```text
代码整理
命名改进
未来可扩展性
非核心 UI Polish
```

不要因为：

```text
“以后可能不好扩展”
```

直接判 P1。

---

# 一百四十五、Performance Benchmark

必须真实测量。

至少：

```text
1 feed
10 feeds
50 feeds
100 feeds
```

和：

```text
10 items
100 items
500 items
1000 items
```

记录：

```text
Fetch
Parse
Normalize
Dedup
Persist
Index
```

如果性能不好：

> 记录事实，不掩饰。

不要伪造：

```text
<10ms
```

之类数字。

---

# 一百四十六、FACT / HYPOTHESIS / INFERENCE

M4 Final Report 必须明确区分：

### FACT

代码和测试已经证明：

```text
RSS parser 支持哪些
Atom 支持哪些
Dedup 怎么工作
Refresh 怎么工作
数据如何持久化
```

### HYPOTHESIS

例如：

```text
某些异常 Feed 未来可能存在兼容性问题
```

但当前尚未验证。

### INFERENCE

例如：

```text
根据当前 benchmark
Feed 数达到某规模后可能需要并行抓取
```

不得把：

```text
猜测
```

写成：

```text
事实
```

---

# 一百四十七、M4 Final Report

完成后输出：

```text
# M4 Final Report

## 1. Implementation Summary

## 2. Repository Baseline

## 3. Existing M1/M2/M3 Components Reused

## 4. Feed Architecture

## 5. Feed Data Model

## 6. Feed Persistence

## 7. RSS Parser

## 8. Atom Parser

## 9. Normalization Rules

## 10. Identity Model

## 11. Deduplication Strategy

## 12. Update Strategy

## 13. Read State

## 14. Inbox

## 15. Library Integration

## 16. Reader Integration

## 17. Search Integration

## 18. Network Architecture

## 19. Redirect / Timeout / Retry

## 20. XML Security

## 21. HTML Security

## 22. URL / SSRF Policy

## 23. Failure Recovery

## 24. Index Rebuild

## 25. Performance Benchmark

## 26. Unit Tests

## 27. Integration Tests

## 28. E2E Tests

## 29. Fuzz / Property Tests

## 30. Known Limitations

## 31. Deferred Features

## 32. FACT / HYPOTHESIS / INFERENCE

## 33. P0 / P1 / P2 / P3

## 34. M4 Acceptance Gate

## 35. M5 Preconditions
```

---

# 一百四十八、M5 Preconditions

M4 完成后应该为 M5 留下：

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
Fetching
Deduplication
```

M5 再负责：

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

不要在 M4 提前实现这些功能。

---

# 一百四十九、最终产品边界

最终必须形成：

```text
                    Reverie Library
                         │
          ┌──────────────┼──────────────┐
          ↓              ↓              ↓
      Web Capture       RSS           Future Import
          │              │
          └───────┬──────┘
                  ↓
              Document
                  ↓
        ┌─────────┼─────────┐
        ↓         ↓         ↓
     Library    Search    Reader
        │                   │
        │              ┌────┼────┐
        │              ↓    ↓    ↓
        │           Highlight Note Bookmark
        │
     Inbox / Read / Favorite / Tags
```

最重要的架构结论：

```text
RSS
≠
第二套 Library

RSS
≠
第二套 Reader

RSS
≠
第二套 Search

RSS
≠
第二套 Annotation

RSS
```

只是：

> **Reverie 中另一种合法、可持久化、可搜索、可阅读的 Document 来源。**

---

# 一百五十、开始执行

现在立即开始：

```text
1. 检查当前仓库
2. 检查 M0~M3 实际实现
3. 建立 M4 Current State
4. 找出 Feed / HTTP / Document / Library / Search 现有能力
5. 建立 FACT / HYPOTHESIS / INFERENCE
6. 建立最小 Feed Domain Model
7. 设计 Feed 文件持久化
8. 实现 RSS Parser
9. 实现 Atom Parser
10. 实现 Normalize
11. 实现 Identity / Dedup
12. 实现 Feed Fetch
13. 实现 Security Policy
14. 接入 Document
15. 接入 Library
16. 接入 Inbox / Read State
17. 接入 Reader
18. 接入 Search
19. 完成 Rebuild
20. 完成 Security / Fuzz / Integration / E2E
21. 运行性能测试
22. 更新 docs
23. 更新 PROGRESS
24. 更新 DECISIONS
25. 分逻辑 commit
26. 输出 M4 Final Report
```

执行原则：

> **自主执行，不提问。**

遇到设计歧义：

```text
优先选择：
简单
可靠
容易测试
对现有代码侵入最小
对数据最安全
```

然后把真正重要的决定记录到：

```text
DECISIONS.md
```

永远不要为了完成 M4 而破坏：

```text
M1 Capture
M2 Annotation
M3 Search / Library
```

最终验收的核心不是：

> “RSS XML 能不能解析。”

而是：

> **用户订阅一个 Feed 后，未来几年产生的大量文章能够稳定进入自己的 Reverie Library；即使 Feed 下线、网络断开、SQLite 损坏、文章发生更新，自己的资料、阅读状态、Highlight、Note 仍然可靠存在。**