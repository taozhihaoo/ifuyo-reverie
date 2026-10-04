# MIGRATION — 数据流与迁移透明度（M5）

> M5 §81/§82 数据丢失透明原则：**不假装 100% 保留**。本文说明 Import/Export 的
> 完整数据流，以及哪些数据保留、转换、可能丢失、需要用户确认。

## 1. Import 数据流

```text
外部导出文件（只读，绝不修改）
    ↓ detectFormat + parse（JSON → 外部条目）
normalizeSource → NormalizedImportRecord（统一语义）
    ↓ preview（不落盘：new / skip / invalid 计数）
commitImport（逐条）：
    ├─ provenance.import_key 已存在 → skip（幂等）
    ├─ 缺 title/url/content → failed + failures[]（可诊断）
    └─ 有效 → sanitize(H content) → Markdown → writeMeta/article.md 原子写
    ↓ 批末
refreshSearchIndex（一次/批）→ Search / Reader / Annotation
```

## 2. Import 字段保留矩阵

| 外部字段 | Reverie 去向 | 状态 |
| --- | --- | --- |
| title / author / url / tags | meta.json 对应字段 | Preserved |
| content（HTML/纯文本） | article.md（消毒→Markdown）+ content_hash | Transformed |
| excerpt（无正文时） | article.md + `content_provenance:"import-summary"` | Transformed |
| read / archived (Pocket/Wallabag) | user-state read | Preserved |
| favorite / starred / important | user-state favorite | Preserved |
| created / published / updated 时间 | meta created_at/published_at | Preserved（无法解析→null） |
| collection / folder | meta.provenance.collection | Preserved（不映射为 Tag，M5 §18） |
| note（Raindrop 独立备注） | meta?—否：保留于 NormalizedRecord，未来映射为独立 Note 标注 | Partial（当前存 source/feed-item? 不适用——存 provenance 侧） |
| 未知字段 | 忽略 | Dropped（可诊断：解析器注释明示） |
| 阅读进度（外部） | 无对应字段 | Unsupported |
| 附件/图片（外部） | 不下载 | Unsupported |

## 3. Export 数据流

```text
Library Files（meta.json/article.md/annotations.jsonl）
    ↓ Document Loader（校验 content_hash）
Export Model（meta + body + annotations）
    ↓ Format Exporter（Markdown / EPUB / Metadata / Highlights）
staging 写入 → validate → 完成
```

Export 全程只读原始文件（测试断言），失败不产生半成品。

## 4. Export 保留矩阵

| 数据 | Markdown | EPUB | Metadata | Highlights |
| --- | --- | --- | --- | --- |
| 正文 | ✅ body | ✅ XHTML 分章 | — | — |
| title/author/时间/URL | ✅ front matter | ✅ OPF metadata | ✅ | ✅ 文档头 |
| Highlight/Note | ✅ Annotations 段 | —（M9 扩展） | ✅ 计数 | ✅ 全字段 |
| orphaned 标注 | ✅ 保留原样 | — | ✅ status | ✅ status |
| tags | ❌（front matter 可扩展） | ❌ | ✅ | ✅ |
| source/page.html 原始网页 | ❌ | ❌ | ❌ | ❌ |

## 5. 幂等与恢复

- Import 幂等键持久化于 meta.provenance.import_key——删索引重建后第二次导入仍 skip。
- Import 中断（取消/崩溃）：已完成条目有效，报告标注 cancelled，可重跑（幂等跳过已完成）。
- Export 失败：Library 零影响（只读流程）。
