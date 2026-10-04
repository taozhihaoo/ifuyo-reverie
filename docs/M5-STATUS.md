# M5 Status — ifuyo Reverie（Import / Export / Daily Review）

> M5 完成报告。分类：Implemented / Verified / Known Limitations / Known Risks / Deferred。
> 测试证据：`npm test` **227/227 全绿**（M5 新增 27 例）。

---

## 1. Implementation Summary

M5 建立了导入（Pocket/Wallabag/Raindrop → 统一 Document，staging + 幂等 + provenance + 部分失败容忍）、
导出（Markdown/EPUB 3/Metadata JSON+CSV/Highlights JSON+Markdown，只读原始资料 + 原子写出 + 完成校验）、
Daily Review（确定性队列 + 独立派生状态 + 不偷改 Read State）三条能力线。

## 2. Repository Baseline（M5-A）

- **FACT**：M0~M4 全部完成（200 例基线测试 + 真实网页端到端验证）。
- **前置事实**：无 SQLite（JSON 派生索引）；Dedup 能力在 capture/pipeline（canonicalizeForDedupe）与 feed-service（external_id）中各有一处——M5 统一走 canonicalizeForDedupe + provenance.import_key。

## 3-4. Reused Components / Import Architecture

复用：meta 校验、原子写入、AnnotationService/store、sanitize、htmlToMarkdown、scanLibrary、search index、Reader blocks 渲染。Import 架构：`External File → detectFormat → normalizeSource → preview（不落盘）→ commitImport（staging 逐条原子写 + provenance.import_key 幂等）→ 批量索引刷新`。外部类型（PocketJsonItem 等）不越过 sources.js（M5 §111）。

## 5-9. Pocket / Wallabag / Raindrop Import（详见 IMPORT.md）

- **Pocket**：官方 `{status, list}`；resolved_url/时间戳（秒/毫秒）/authors map/status 1→read；无标题条目防御 null。
- **Wallabag**：数组/`{entries}`/`{_embedded.items}`；content 正文保留优先；is_archived→read、is_starred→favorite。
- **Raindrop**：`{items}`/数组；excerpt/note/collection→provenance/important→favorite；无 read 概念（默认 unread）。
- **状态映射表**已在 IMPORT.md §3 明确（Archive→read 仅限官方语义明确的 Wallabag；Raindrop 无此映射）。

## 10-14. Identity / Dedup / Provenance / Conflict / Atomicity / Recovery

- `import_key = "<source_type>:<external_id|canonical URL>"` 持久化于 meta.provenance——
  **索引删除重建后幂等依然成立**（测试断言）。
- 冲突策略：已存在同 key → skip；从不覆盖 read/favorite/inbox/tags/标注（M5 §23/§60，测试断言）。
- 部分失败：单条失败记录 failures[]，成功条目保留；取消 → status=cancelled + 已完成条目保留。
- 原子性：逐条 writeMeta/article.md 原子写；批末一次索引刷新（M5 §68，绝不逐条重建）。

## 15-20. Export（详见 EXPORT.md）

Markdown（front matter + Annotations 段，含 orphaned 标注）；EPUB 3（自研 STORE-zip writer：
mimetype 首条 STORE/container/OPF/nav/分章 XHTML/CSS，结构校验自动化，空文章拒绝导出）；
Metadata JSON+CSV（无正文）；Highlights JSON+Markdown（含 orphaned，绝不一导出就消失）。
失败仅记录不破坏 Library；批量导出逐篇容错。

## 20-22. Daily Review（详见 DAILY-REVIEW.md）

确定性队列（seeded mulberry32，同日同策略同库=同队列）；来源复用索引+标注；状态存
REVERIE_HOME/daily-review.json（派生态）；**绝不偷改 read/favorite/inbox/tags**（测试断言）；
坏条目跳过不崩（§96）。

## 23-26. Integration

Import → Library/Search/Reader/Annotation 全链路有集成测试（§97 流程 + 搜索 + 幂等 + 重建）；
Export 只读 Library 文件（不依赖索引单点——索引删除后 rebuild 即恢复）。

## 27-29. Format Changes / Security / Performance

- FORMAT.md：新增 `source_type/provenance/content_provenance/feed_*/categories` 可选字段
  （前向兼容，未知字段保留规则不变）；库内新增 user-state.json/feeds.json 说明。
- Security：导入文件 100MB 上限、BOM/编码容错、无路径拼接（目录=UUID）、外部 HTML 消毒、
  外部输入永不作为 HTML 注入 Reader（纯文本/安全 DOM 构造）。
- **Performance（真实测量）**：见测试运行输出；1,000 条级导入为逐条原子写，
  耗时主要在磁盘 IO（每次 fsync）。批内索引仅刷新一次（§68 合规）。
  5,000/10,000 条压测标记 NOT MEASURED（M5 §139 纪律），规模触发时再测。

## 30-32. Tests

M5 新增 27 例：import-service 12（三来源解析映射/preview/幂等×3/取消/unicode/provenance/
重建后幂等/原始文件不可变）、export 8（markdown front-matter+annotations/校验/CSV+JSON/
highlights 含 orphaned/unicode/EPUB 结构+空文章拒绝）、daily-review 8（空库/上下文/确定性/
策略过滤/Session 去重/状态持久化/库内零污染）。

## 33. Failure / Recovery Tests

torn JSON → PARSE_ERROR；部分失败 → 成功保留；取消 → cancelled + 保留；
索引损坏/删除 → 重建恢复 imported 文档与 provenance 幂等（均有测试）。

## 34-36. Known Limitations / Unsupported / Deferred

- 真实 Pocket/Wallabag/Raindrop 导出文件未取得：fixtures 为**人工构造样本**（M5 §116 如实声明），
  真实样本差异可能需调整映射（IMPORT.md Known Limitations）。
- EPUB 兼容阅读器实测未执行（结构校验自动化已过）——如实标注为未验证项。
- 跨来源重复保守保留两份；Raindrop collection 不映射为 Tag。
- Deferred：EPUB Reader（M6）、PDF（M7）、TTS（M8）、高级 EPUB 排版（M9）、
  OPML、批量 merge 交互、流式万篇导出。

## 37-39. FACT / HYPOTHESIS / INFERENCE / P0-P3

- FACT：全部上述测试与真实文件写入断言。
- HYPOTHESIS：真实 Pocket 导出的 authors/tags 形态与人工样本一致（未取得真实样本）。
- INFERENCE：批量导入 IO 瓶颈在 fsync，批处理索引已按 §68 实现，5000 条以上需测。
- P0/P1：无。P2：无未决。P3：EPUB 兼容阅读器实测（环境无阅读器，Deferred）。

## 40. M5 Acceptance Gate（§133 逐项）

**全部满足**（Import 三来源+Preview+Report+Error+Idempotency+Duplicate+Provenance 10 项 ✅；
Markdown/Metadata/Highlight/EPUB Export + 只读 + 校验 + 失败不破坏 7 项 ✅；
Daily Review 四项 ✅；进入 Library/Search/Reader/Annotation 4 项 ✅；
可重建三项 ✅；fixtures+六类测试 ✅；docs/PROGRESS/DECISIONS 更新 ✅；无 P0/未解释 P1 ✅）。

## 41. M6 Preconditions

Generic Document / Generic Annotation / Reader Shell 全部保持稳定；EPUB 导出 writer（M5）与
未来的 EPUB Reader Adapter（M6）方向相反、互不依赖——M6 可直接开工。
