# M3 Status — ifuyo Reverie（Search & Library）

> M3 完成报告。分类：Implemented / Verified / Known Limitations / Known Risks / Deferred。
> 测试证据：`npm test` **166/166 全绿**（M3 新增 31 例）；benchmark 见 [PERF.md](PERF.md)。

---

## 1. Implementation Summary

M3 让 Reverie 从「能保存和阅读」变成「资料多了依然能快速找到」：
全局全文搜索（Title/Author/Body/Highlight/Note/Tag/URL + 上下文摘要 + 定位导航）、
资料组织（Tags/Inbox/Favorites/Unread/Recent/All 视图 + 组合过滤）、
用户状态模型（read/favorite/inbox/tags/last_opened_at，属用户 Library）、
可重建派生索引 + 增量刷新 + Doctor 一致性检查。

## 2. Repository Baseline（M3-A 侦察）

- **FACT**：M1/M2 已完成（捕获→归档→阅读→标注全链路 166 例测试）。
- **前置偏差记录（M3 §4.3/§87）**：Bookmark 在 M2 仅有模型类型（`type: "bookmark"`），UI 未做创建入口
  —— 按 §87 只保留最小 Contract，不扩大；SQLite 自 M0 起不存在，M1/M2 用可重建 JSON 索引（§31 允许）。

## 3. Library Architecture

```
UI（视图/搜索/过滤/标签编辑）
  ↓ IPC
LibraryService 面（queryLibrary / user-state / delete）
  ↓
SearchService（派生索引 + 内存检索）   AnnotationService（M2）
  ↓                                    ↓
Library Files（Source of Truth：meta.json / article.md / annotations.jsonl / user-state.json）
```

- Scanner/Loader 复用 M1（不重写第二套，M3 §66/67）。
- 视图=可组合谓词（非 if/else 链，M3 §49）；搜索与视图共享同一执行路径（§135）。

## 4. User State Model

`<Library>/user-state.json`（**库内**，随资料移动/同步）：
read / favorite / inbox / tags / last_opened_at / last_read_at；
原子写入；损坏回退默认；M1 read-state.json 自动迁移。
独立三态（read/favorite/inbox 任意组合合法）；打开≠已读（仅显式标记）；
新保存默认入 Inbox。详见 [USER-STATE.md](USER-STATE.md)。

## 5. Tag Model

字符串标签；trim/折叠空白/拒绝空·超长·控制字符；比较小写键、显示保留首次形式
（输入 "rust" 复用既有 "Rust"，不产生第二个标签——有测试）。无层级/别名/自动化（M3 §14）。

## 6-10. Search（详见 [SEARCH.md](SEARCH.md)）

- **Architecture**：SearchService → 派生 JSON 索引（内存检索）→ 文件重建（UI 不感知存储）。
- **Fields**：title/author/body/highlight/note/tag/url，命中带 48 字符上下文与 `<mark>` 高亮。
- **Syntax**：词 AND、短语、`tag: is: in: author:`、友好错误（不崩溃不空白）。
- **Tokenization/Chinese**：子串匹配（零配置，中文连续命中）；benchmark 驱动决策。
- **Ranking**：字段优先级和（title>author>tag>highlight>note>body>url）+ id tie-break；
  一文档一卡多命中（§55）。
- **Navigation**：Body 命中→打开+偏移定位+闪烁；Highlight/Note 命中→复用 M2 Anchor 定位标注；
  orphaned 仍可搜索、导航提示「无法定位」（§126/127）。

## 11-14. Index / Reindex / Integrity / Recovery

- 索引文件 `REVERIE_HOME/search-index.json`（库外派生数据）+ `queryLibrary` 视图统计即时计算。
- 增量：article.md/annotations.jsonl/meta.json 三文件指纹（mtime+size）判定变化；
  用户状态变化走廉价字段刷新。
- 重建：扫描→构建→**原子替换**；失败不损坏旧索引。
- 一致性顺序：先写用户文件后刷索引（数据库假事实不可能，M3 §72/73）。
- **§65 验收 YES**：删除索引 → 打开/扫描/重建搜索/恢复 Tags/Favorite/Read/Inbox 全部成立（测试断言）。
- Doctor（`npm run doctor`）：重复 document_id、文件↔索引不一致、坏 meta、坏标注行、重复标注 id、路径逃逸。

## 15-17. Integrity / Failure Recovery / Performance

- 坏文件隔离：单文档 meta/标注损坏 → 99 篇正常 + 1 条 diagnostic（测试）。
- 崩溃安全：状态/索引均为原子写；torn 文件回退默认（测试）。
- **性能（真实运行，见 [PERF.md](PERF.md)）**：1,000 篇——全量重建 1.1s、增量刷新 621ms、
  搜索 p50 2ms / p95 3ms、过滤/视图 ≤1ms、索引 1.5MB；100 篇全面 <130ms。

## 18. Test Coverage（M3 新增 31 例）

parser 7、正确性+过滤器+删除幽灵+orphan 可搜索+增量+重建+离线 13、回归 fixture 1、
user-state 8（defaults/独立三态/tag 规范化/迁移/损坏恢复）、§97 一致性流程 1、
§43 标注投影重建（M2 套件扩展）、重复 id/Doctor 1。

## 19. Known Limitations

1. 中文无分词：短词可能误命中（benchmark 已记录；规模触发时评估 FTS5）。
2. UI 自动化未做：视图/搜索链路以 Service 层测试覆盖，E2E 留待引入 UI 测试框架时补。
3. 纯内存索引：万篇级以下无压力（PERF.md Observed limit）；更大规模为 Future concern。
4. 真浏览器 Native Messaging E2E 与 GUI Demo 仍需人工执行（M1 遗留，见 CAPTURE.md §7）。

## 20. Deferred Features

RSS/Atom（M4）、批量操作 [B]、SQLite FTS5（规模触发）、Trash 回收站、
无限滚动/虚拟列表（Load More 语义已备）、语义搜索/AI（明确非目标）。

## 21. FACT / HYPOTHESIS / INFERENCE

- **FACT**：全部 Gate 功能有自动化测试；性能数字来自 `npm run bench:m3` 真实运行。
- **INFERENCE**：子串搜索在 1,000 篇 p95=3ms → 数千篇规模可用（线性外推 + 增量刷新可分块）。
- **HYPOTHESIS**：万篇级内存索引（~15MB）仍可接受（未测，Future concern）。

## 22. P0 / P1 / P2 / P3

- P0/P1：无。
- P2（已修）：snippetAround 未对查询词小写 → 英文命中摘要静默丢失（发现于测试，
  root-caused + 回归测试守护，RESOLVED）。
- P3（记录）：`foo:bar` 未知前缀按普通词处理（已文档化）；增量刷新为 O(N) stat 遍历。

## 23. M3 Gate

§149 清单逐项核对：**全部满足**（视图/状态/持久化 11 ✅、七字段搜索 7 ✅、
benchmark 5 ✅、去重/上下文/定位 5 ✅、orphan 2 ✅、过滤器 5 ✅、
防覆盖/不阻塞/长列表 3 ✅、派生索引/重建/增量/幽灵 5 ✅、
坏文件/Doctor/安全写入/顺序 4 ✅、测试六类 ✅、Windows 构建+文档+PROGRESS+Git ✅）。
说明：CI 与 PROGRESS.md 属仓库尚无的基础设施（无 CI 配置——记录为环境事实，
本地全量测试替代；PROGRESS 由 git log + M3-STATUS 承担）。

## 24. M4 Preconditions

Document/Source/Library/Search/Tags/ReadState/Inbox/Recent 全部就绪且可复用：
M4 RSS 只需新增 Feed 域模型 + 抓取去重，条目落为标准 Document（type=article + feed 来源元数据）
即自动获得搜索/过滤/状态/视图能力。
