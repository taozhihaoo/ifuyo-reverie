# RSS — Feed 内容规则（M4）

> 实现位于 `src/feed/`（parser + service）。订阅管理见 [FEEDS.md](FEEDS.md)，
> 网络策略见 [NETWORK.md](NETWORK.md)。边界声明：**RSS 不是网页抓取器**——
> Reverie 只消费 Feed 提供的内容（title/author/description/content/link/guid/
> published/updated/category），不做自动全文抓取（M4 §19），不做付费墙/登录绕过。

## 1. 支持的格式

| 格式 | 覆盖元素 |
| --- | --- |
| RSS 2.0 | channel(title/link/description/language/image)、item(title/link/description/guid+isPermaLink/pubDate/author/category) + content:encoded + dc:creator |
| Atom 1.0 | feed(title/subtitle/author/updated/link)、entry(id/title/updated/published/author/link×n/summary/content[type=text|html]/category) |

不在范围：RDF/RSS 0.9x、JSON Feed、OPML（导入导出属后续里程碑）。

## 2. Normalization 规则

- 全部经 `parseFeed(xml, {sourceUrl})` 输出统一 `NormalizedFeed` / `NormalizedFeedItem`；
  第三方 DOM 对象不泄漏到 UI（M4 §24/25）。
- **author**：RSS `<author>email (Name)` 剥离邮箱；`dc:creator` 与 Atom `author/name`
  归一为同一个 `author` 字段（Search 层不感知来源差异）。
- **时间**：RSS(RFC 822/1123) 与 Atom(ISO 8601) 统一为 ISO UTC；缺失 → null（不 crash）；
  非法 → null + 排序时退化为 ingestion time（明确标注非发布时间，M4 §76）。
- **title fallback**：link → `(无标题条目)`；绝不为 null。
- **排序**：按 published/updated 倒序，与 XML 顺序解耦（M4 §76/77）。

## 3. Content 优先级（M4 §18）

| 格式 | 优先级 |
| --- | --- |
| RSS | `content:encoded` > `description` |
| Atom | `content[type=html/text]` > `summary` |

只有摘要时：正文照存，meta 标记 `content_provenance: "feed-summary"`
（全文为 `"feed-content"`）——**不假装是全文**，也**不自动抓原网页**。

## 4. HTML 安全（M4 §20/21）

Feed HTML 视为不可信输入，入库前强制 `sanitizeArticleHtml`（DOMPurify +
FORBID script/style/iframe/... + URI 白名单）。已测：script/onclick/onerror/
javascript:/iframe 全部剥离；正文文本保留。渲染层再经 canonical-blocks DOM
构造（无 innerHTML），双层防御。

## 5. Identity 与去重（详见 RESOLUTION 之外的 §34-38/§108）

- Item 身份：`external_id`（RSS guid / Atom id，guid isPermaLink 语义保留于
  `external_id_type: guid-permalink | guid | atom-id`）。
- 去重优先级（同 Feed 内）：
  1. `feed_id + external_id`
  2. `feed_id + canonical URL`
  3. `feed_id + normalized URL`
- 无 guid/无 link 的条目：无法稳定识别 → 拒绝入库 + 记录 diagnostic（不静默丢）。
- **宁保留两个疑似重复，也不错误合并**（M4 §36）：仅 title/date 相同不合并。
- Refresh 幂等（§115）：同一 Feed 第二次刷新 new=0；内容变化的条目按身份识别为
  same item → 原子更新正文，用户状态/标注全部保留（§109 回归测试）。

## 6. URL 规则（M4 §32/33/84）

- `original_url`（item link 原样保存，Open Original 用）与 `canonical_url`
  （归一化，去重用）并存，不互相覆盖。
- 归一化：host 小写、去 hash、去尾斜杠、丢 utm_*/fbclid/gclid、参数排序。
  **不删除具业务意义的 query**（如 ?article=123）。
- `javascript:` / `data:` 等 scheme 在 URL 白名单处统一拒绝。

## 7. 更新规则（M4 §40-44）

- 同身份 + 内容哈希相同 → skip（unchanged）。
- 同身份 + 内容变化 → **只更新正文与内容元数据**（title/content_hash/updated_at），
  原子重写 article.md；read/favorite/inbox/tags/标注**一概不碰**（有回归测试）。
- 标注重定位交给 M2 Resolver（可能 resolved 或 orphaned，绝不删除）。
- Feed 中条目消失 ≠ 删除 Document（M4 §82/83）。

## 8. Error handling（M4 §60-63/71/72）

malformed XML / 缺 channel / 非 XML → `FeedParseError`（typed code），UI 显示
可理解错误；昨天成功今天 503 → 历史文章正常 + feed 状态 error，下次成功清除。
Refresh All 允许部分失败（A 成 B 败 C 成），结构化 `FeedRefreshResult`。
