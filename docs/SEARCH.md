# Search — 全局搜索（M3）

> 实现位于 `src/search/`（query-parser / search-service）。架构决策与限制见文末。

## 1. 可搜索字段

| 字段 | 来源 | match type |
| --- | --- | --- |
| Title | meta.json | `title` |
| Author | meta.json | `author` |
| Body | article.md 的 canonical text（**非** source/page.html） | `body` |
| Highlight | annotations.jsonl quoted_text | `highlight`（含 annotation_id + status） |
| Note | annotations.jsonl note | `note`（含 annotation_id + status） |
| Tag | user-state tags | `tag` |
| URL | original_url / canonical_url | `url` |

明确不索引：`source/page.html`、assets 二进制、缓存、日志、临时文件（M3 §19）。

## 2. 查询语法

```text
rust ai 2026          全文词，词间 AND
"local first"         短语（保留空格）
tag:rust              标签过滤（多个 tag: 为 AND，M3 §51）
is:read is:unread     已读 / 未读
is:favorite           收藏
is:inbox  in:inbox    Inbox
author:gray           作者子串
```

容错：`tag:`（空值）、`foo:bar`（未知前缀按普通词处理）、引号不闭合 → 返回
**friendly error**（UI 显示提示），绝不抛异常、绝不静默空白（M3 §27）。

## 3. 分词与中文

**子串匹配（无分词器）**：查询词与索引文本统一小写后做 `includes`。
中文连续子串天然命中（“本地”命中“本地优先”）；英文大小写不敏感；
“SQLite”可命中“SQLite FTS5”。代价：中文短词可能有少量误命中——
已按 M3 §28-30 建立 benchmark（`npm run bench:m3` + `docs/PERF.md`），
当前规模（1,000 篇 p95 = 3ms）下这是最简单且足够好的方案；分词器/FTS5
留待真实规模证明必要时再引入。

## 4. 排序（确定性，M3 §54）

字段优先级：title(100) > author(80) > tag(60) > highlight(52) > note(50) > body(30) > url(20)；
文档得分 = 各命中字段优先级之和；平分按 document_id 升序（稳定 tie-breaker）。
搜索去重：**一篇文章一张卡**，多个命中以 match contexts 呈现（M3 §55）。

## 5. 结果模型与导航（M3 §22/§24/§85/§86）

```text
SearchResult { document_id, title, author, matches: [{type, snippet, term,
               annotation_id?, annotation_status?}] }
```

- snippet = 命中词前后 48 字符，UI 用 `<mark>` 突出（仅渲染层，不改原文）。
- Body 命中 → 打开文章 → 偏移定位 + 闪烁（ReaderAnchor）。
- Highlight / Note 命中 → 复用 **M2 Anchor** 定位到对应标注（不重建第二套定位）。
- orphaned 标注仍可搜索（status 可见）；导航时提示「无法定位到当前正文」。

## 6. 交互（M3 §57-59/§77-79）

- 输入 debounce 200ms；请求代际号（seq）保证旧结果不覆盖新结果。
- Ctrl+K 聚焦搜索；Esc 清空返回；↑↓ 移动结果；Enter 打开。
- 搜索为内存操作 + 异步 IPC，不阻塞 Reader。

## 7. 重建与一致性

- 索引文件：`REVERIE_HOME/search-index.json`（派生数据，原子替换）。
- 增量：按 article.md + annotations.jsonl + meta.json 的 mtime+size 指纹判定变化；
  用户状态（read/favorite/inbox/tags）变化走廉价字段刷新。
- 删除文档 → 索引同步移除（无幽灵结果，有测试）。
- 一致性契约：状态先写用户文件、后刷索引；索引损坏/删除 → 重建即恢复。

## 8. Known Limitations

- 中文无分词：短词误命中可能（benchmark 记录于 PERF.md）。
- 纯内存索引：万篇级以下无压力（见 PERF.md）；更大规模需评估 FTS5。
- 搜索不区分引文在文中的出现次数（首命中上下文）。
