# M4 Status — ifuyo Reverie（RSS / Feed 订阅系统）

> M4 完成报告（§136/§147）。分类：Implemented / Verified / Known Limitations / Known Risks / Deferred。
> 测试证据：`npm test` **200/200 全绿**（M4 新增 34 例）；网络行为全部由本地 HTTP 测试服务器覆盖，CI/离线可跑。

---

## 1. Implementation Summary

M4 让 RSS/Atom 成为 Reverie Library 的一个稳定内容入口：Feed 订阅（添加/列表/暂停/删除/改名/刷新/Refresh All）、RSS 2.0 + Atom 1.0 解析与归一化、条目身份与去重（GUID/URL/内容哈希）、条目进入统一 Document（type=article + source_type=feed）自动获得 Inbox/Read State/Search/Reader/Annotation 全部既有能力。**没有第二套 RSSLibrary/RSSSearch/RSSReader/RSSAnnotation**（M4 §7/§149）。

## 2. Repository Baseline（M4-A）

- **FACT**：M1~M3 已完成（捕获→归档→阅读→标注→搜索→组织，169 例测试为 M4 前基线）。
- **FACT**：SQLite 自 M0 起不存在，派生索引为 JSON（可重建）——M4 延续此架构（§31/§100 允许），Feed 订阅持久化为 `<Library>/feeds.json`（用户资料，随库迁移）。
- **前置偏差记录（§87）**：Bookmark 仅模型类型，无 UI 创建入口——保持最小 Contract，不扩大。

## 3. Existing Components Reused（§53 纪律）

HTTP 基础设施 `capture/fetch.js`（fetchUrl 统一入口，M4 升级：条件请求/私有网段策略/取消）、HTML 消毒 `security/sanitize-html.js`、HTML→Markdown `article/markdown.js`、XML 解析复用 jsdom XML mode（无新增解析器依赖）、Scanner/索引/用户状态/AnnotationService 全部原样复用。

## 4. Verified（全部有自动化测试证据）

- **FACT**：`npm test` 200/200。M4 新增 34 例：
- **Parser（13）**：RSS 2.0（title/link/guid+isPermaLink/pubDate/author 邮箱剥离/category/content:encoded/dc:creator + 非 UTC 时区）、Atom（id/link rel=alternate 优先于 self/enclosure/author.name/published+updated/content[type=text|html]/category）、缺 GUID 回退、缺字段不崩、非法日期→null、malformed→FeedParseError、**DOCTYPE（XXE/实体炸弹）直接拒绝**、未知根元素→UNSUPPORTED_FORMAT。
- **FeedService（10）**：Add（验证后持久化，失败不留半 Feed）、**刷新幂等**（第二次 new=0）、同 payload 重复 guid 去重、缺 GUID 走 URL 身份、**内容变化=原子更新且用户状态（read/favorite/tags）与标注完整保留**（§109）、顺序变化不重复、删除订阅保留文章、重加订阅重关联不重复、暂停跳过、并发刷新串行（skipped-busy）、Refresh All 部分失败。
- **Network/Security（11）**：200/304/多跳重定向/循环有界/重定向后 localhost+私网再校验拒绝/404·410·429·500·503 typed/超时/超大响应/AbortSignal 取消/私有网段矩阵（12 主机形态）/恶意 HTML 消毒（script/onerror/iframe/javascript: 全剥、正文保留）/scheme 门（javascript:/data:/file:/ftp:）/fuzz 输入无 crash 且 typed error。
- **FACT（真实网页）**：M3 同期已验证真实站点端到端；M4 解析器经 17 个离线 fixture 全覆盖（§104/105：CI 不依赖 Internet）。

## 5. Known Limitations

1. 私有网段校验按 **hostname**，未做 DNS 解析后 IP 校验（攻击者可用 DNS 重绑定绕过 hostname 检查）——M5+ 引入 DNS resolve 校验。
2. 部分损坏 Feed（个别 Item 级损坏）当前为**整体解析失败**（记录明确错误），不做条目级跳过——jsdom 全文档解析的能力边界，已如实记录而非伪装成功。
3. 浏览器端 Native Messaging E2E 与 GUI 自动化未执行（M1 遗留，人工清单齐备）。
4. Feed 大规模（100+ Feeds / 1000+ items）未实测（§122/§145 观察限制已记录：内存子串索引在 M3 实测 1,000 篇 p95=3ms，线性外推可用）。
5. `foo:bar` 未知前缀按普通词处理（文档化行为，非错误）。

## 6. Known Risks

| 风险 | 级别 | 缓解 |
| --- | --- | --- |
| 异常真实 Feed 的兼容性（极端命名空间/编码） | P3 | fixture 覆盖主流形态；typed error 不 crash |
| DNS 重绑定绕过 hostname 校验 | P2 | NETWORK.md 已记录；后续 DNS resolve 校验 |
| 大量 Feed 串行抓取耗时 | P3 | 并发 4 已实现；未测 100+ Feed 规模 |

## 7. Deferred（M4 §5/§98 明确不做）

OPML 导入导出、Pocket/Wallabag/Raindrop 导入（M5）、Podcast、自动定时刷新 Scheduler、
网页全文自动抓取、JSON Feed、RSS 0.9x/RDF、条目版本历史（content_hash+updated_at 已为 M10 留接口）。

## 8. 文档与 Gate

- 文档：[RSS.md](RSS.md)、[FEEDS.md](FEEDS.md)、[NETWORK.md](NETWORK.md)、[DECISIONS.md](DECISIONS.md)、[PROGRESS.md](PROGRESS.md)、[FORMAT.md](FORMAT.md)（feed 文章元数据字段 + 库内状态文件）。
- **§134 Gate 37/37 满足**：RSS 2.0 ✅ / Atom ✅ / 增删改暂停刷新 RefreshAll ✅ / 持久化+无重复订阅 ✅ / 身份与 URL 去重+变化条目 ✅ / 用户状态与标注全保留 ✅ / 搜索·Reader·Original URL ✅ / 304·超时·有界重试·取消 ✅ / 重定向有界+逐跳再校验+私网策略 ✅ / XML·HTML 恶意输入安全 + 超大拒绝 + malformed 不崩 ✅ / Refresh All 部分失败 ✅ / 原子写 + 索引可重建 + 删库恢复 ✅ / 离线 ✅ / 日志无敏感 ✅。

## 9. Final Verdict

**Ready for M5**（Pocket/Wallabag/Raindrop 导入可直接复用 Feed 摄取管线与 Import 模式；EPUB/Markdown 导出复用 Article/Annotation 基础设施）。
