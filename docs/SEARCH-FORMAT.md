# Search Format — 派生索引（M3）

> **这不是用户数据格式。** 本文档描述 Reverie 内部派生索引（可随时删除重建），
> 用户资料的公开格式见 [FORMAT.md](FORMAT.md)。实现：`src/search/search-service.js`。

## 1. 位置与生命周期

- 路径：`REVERIE_HOME/search-index.json`（env `REVERIE_SEARCH_INDEX` 覆盖）。
- 写入：tmp → fsync → rename **原子替换**；重建失败不损坏旧索引。
- 删除此文件 → 下次加载自动从 Library 全量重建（M3 §65 的答案是 YES）。

## 2. Schema（index_version = 1）

```json
{
  "index_version": 1,
  "built_at": "2026-10-04T12:00:00.000Z",
  "documents": [
    {
      "document_id": "<uuid>",
      "path": "articles/2026/<id>",
      "type": "article",
      "title": "...",
      "author": "...",
      "url": "https://...",
      "tags": ["rust"],
      "read": false, "favorite": false, "inbox": true,
      "last_opened_at": null,
      "captured_at": "...",
      "content_hash": "sha256-...",
      "body": "article.md 的 canonical text（≤200KB 截断）",
      "annotations": [
        { "annotation_id": "...", "type": "highlight", "status": "resolved",
          "quoted_text": "...", "note": "...", "position": { "start": 0, "end": 0 } }
      ],
      "file": { "mtimeMs": 0, "size": 0, "stamp": "mtime:size|mtime:size|mtime:size" }
    }
  ]
}
```

- `body` 来自 article.md 的 canonical text（`src/reader/markdown-reader.js`），
  **不是** source/page.html。
- `file.stamp` 覆盖 article.md / annotations.jsonl / meta.json 三文件的 mtime+size，
  是增量刷新的变化检测依据（M3 §34）。

## 3. 查询生成（无 SQL）

- 查询解析（`query-parser.js`）→ `SearchQuery{terms, phrases, tags, read,
  favorite, inbox, author}` → 内存谓词过滤 + 子串匹配 + 确定性排序。
- **没有任何 SQL 拼接面**：用户输入永不进入查询语言之外的位置。
- 未来若引入 SQLite FTS5（schema + migration 另行文档化），
  `SearchService` 接口（search / queryLibrary / rebuild / refresh）保持不变。

## 4. 重建与迁移

- 全量重建 = 扫描 Library → 逐文档构建 → **原子替换**索引文件；失败不损坏旧索引。
- 增量 = 文件指纹比对，仅重读变化的文档。
- `index_version` 升级时：旧文件视为不兼容 → 自动全量重建（派生数据无需迁移）——
  这是「数据库 migration ≠ 用户数据 migration」（M3 §112）的体现：用户数据迁移
  走 FORMAT.md 的版本规则，派生索引直接重建。
