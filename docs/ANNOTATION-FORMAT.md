# Annotation Format — annotations.jsonl v1

> 标注是用户资料的 Source of Truth（与 article.md 同级）。
> 实现位于 `src/annotation/`；schema 纪律与 [FORMAT.md](FORMAT.md) 一致。

## 1. 文件与行

- 位置：`<library>/articles/<年>/<document-id>/annotations.jsonl`
- 一行一个 JSON 对象 = 一个标注；UTF-8 无 BOM；换行 `\n`。
- **创建** = 尾部追加（原子 append + fsync）；**更新/删除/修复** = 整文件原子重写
  （tmp → fsync → rename，崩溃后只能是旧文件或新文件，绝无半个 JSON）。
- 损坏策略：坏行跳过并诊断（`invalid`），重复 `annotation_id` 诊断（`duplicates`），
  **绝不自动清空/重写整个文件**（M2 §45）。

## 2. 字段（format_version = 1）

```json
{
  "format_version": 1,
  "annotation_id": "<uuid-v4>",
  "document_id": "<uuid-v4>",
  "type": "highlight",
  "status": "resolved",
  "created_at": "2026-10-04T08:00:00.000Z",
  "updated_at": "2026-10-04T08:00:00.000Z",
  "quoted_text": "被选中的原文",
  "prefix": "引文前 ≤32 字符",
  "suffix": "引文后 ≤32 字符",
  "locator": { "kind": "text-quote", "position": { "start": 1207, "end": 1221 } },
  "note": "纯文本笔记",
  "tags": [],
  "status": "resolved",
  "source_content_hash": "sha256-<创建时 canonical text 的哈希>"
}
```

| 字段 | 必需 | 说明 |
| --- | --- | --- |
| `format_version` | ✅ | 当前 `1`；更高版本 → 诊断报告，不猜测 |
| `annotation_id` | ✅ | UUID v4，稳定唯一；修复/移动不改变它 |
| `document_id` | ✅ | 所属文章快照；不一致行按损坏诊断 |
| `type` | ✅ | `highlight` \| `note` \| `bookmark`（M2 UI 只产出 highlight+note） |
| `status` | ✅ | `resolved` \| `orphaned`（设计文档中的 active == resolved，以实现为准） |
| `created_at` / `updated_at` | ✅ | ISO 8601 UTC |
| `quoted_text` | highlight ✅ | 用户选中的 canonical 文本（非原始 DOM 串） |
| `prefix` / `suffix` | ❌ | 前后各 ≤32 字符上下文（实测够用；用途见 RESOLUTION 文档） |
| `locator` | ✅ | 定位块：M2 落地 `kind: "text-quote"` + `position{start,end}`；epub-cfi / pdf-page-quote 为后续阶段保留 |
| `note` | ❌ | 纯文本（不做富文本/Markdown，安全最简） |
| `tags` | ❌ | 数组（模型保留，UI 未暴露） |
| `source_content_hash` | ❌ | 创建时文档哈希；与当前哈希一致时 position 可直用 |

## 3. 兼容性原则

- 未知字段：读取保留、写入原样（forward compatible）。
- 未知 `locator.kind`：不删除——尝试 quote 重定位，失败置 `orphaned`。
- 可选字段缺失即省略，禁止 `null`。
- `position` 只是加速缓存；允许失效，解析器永不盲信（见 RESOLUTION 文档）。
