# Reverie Library Format — v1

> 本文档定义 Reverie 用户资料（Library）的开放文件格式。
> **文件是真相**：本文描述的所有文件是用户资料的唯一 Source of Truth；
> 数据库 / 索引 / 缓存只是派生数据，可以随时从这些文件完整重建。

设计原则：

```text
开放格式    — JSON / Markdown / JSONL / 原始文件，人类可读可编辑
可迁移      — 复制目录即完成备份与迁移，不依赖 Reverie 存在
可重建      — 索引、缓存可删除后由文件重建
有版本      — 每个带内容的文件都有 format_version，未来演进不静默破坏
原子写入    — 重要文件写入必须 tmp → flush → rename，崩溃不产生半文件
```

---

## 1. Library 目录结构

```text
Reverie Library/
├─ articles/
│  └─ <year>/                       # 按 capture 年份分桶
│     └─ <document-id>/
│        ├─ meta.json               # 元数据（必需）
│        ├─ article.md              # 提取后的正文（Markdown）
│        ├─ annotations.jsonl       # 标注（存在标注时）
│        ├─ source/                 # 原始捕获（存在来源时）
│        │  ├─ page.html            # 原始 HTML
│        │  └─ response-headers.json
│        └─ assets/                 # 本地化的图片等资源
│           └─ <sha256>.<ext>
│
├─ books/
│  └─ <document-id>/
│     ├─ meta.json
│     ├─ book.epub                  # 原始 EPUB（不可变）
│     └─ annotations.jsonl
│
├─ pdf/
│  └─ <document-id>/
│     ├─ meta.json
│     ├─ document.pdf               # 原始 PDF（不可变）
│     └─ annotations.jsonl
│
├─ markdown/                        # 用户导入的本地 Markdown
│  └─ <document-id>/
│     ├─ meta.json
│     ├─ document.md
│     └─ annotations.jsonl
│
├─ text/                            # 纯文本
│  └─ <document-id>/
│     ├─ meta.json
│     ├─ document.txt
│     └─ annotations.jsonl
│
└─ exports/                         # 导出产物的默认输出位置（可删）
```

规则：

- 每个 Document 一个独立目录，目录名 = `document_id`，**目录内文件不依赖路径中的位置信息**（整个目录可以移动、改名父路径）。
- `articles/<year>/` 中的 `year` 只是整理用的分桶；扫描器必须兼容任意深度/无年份的结构。
- 原始文件（`book.epub` / `document.pdf` / `source/page.html`）**默认不可变**；升级提取算法 = 重新提取生成新 `article.md` + 更新 `meta.json` 的 extractor 字段，绝不改写原始文件。
- 应用自身的索引、缓存、缩略图、临时数据放在**应用数据目录**（不在 Library 内）；索引只能读取 Library，**永远不允许写入 Library**（`exports/` 除外）。

---

## 2. 通用约定

| 约定 | 值 |
| --- | --- |
| ID | UUID v4，小写（RFC 4122） |
| 时间戳 | ISO 8601 UTC，带 `Z` 后缀（如 `2026-10-04T12:00:00.000Z`） |
| 编码 | 全部 UTF-8（无 BOM），JSONL 换行 `\n` |
| 版本字段 | `format_version`（整数，当前 `1`），出现在 `meta.json` 与每条 annotation 中 |
| 未知字段 | 读取时**必须保留并容忍**未知字段；写入时原样保留（forward compatible） |
| 可选字段 | 缺失即**省略字段**——禁止写 `null` / 空串（校验器会拒绝，M1 起强制） |
| 校验 | `content_hash` = `sha256-<hex>`，对正文文件字节计算 |

---

## 3. meta.json

每个 Document 目录必须有 `meta.json`。

```json
{
  "format_version": 1,
  "document_id": "5f0c9a6e-8e2b-4c1d-9a7f-3b2d1e0f4a5b",
  "type": "article",
  "title": "示例文章标题",
  "author": "作者名",
  "created_at": "2026-10-04T08:00:00.000Z",
  "captured_at": "2026-10-04T08:00:00.000Z",
  "updated_at": "2026-10-04T08:00:00.000Z",
  "source": {
    "original_url": "https://example.com/posts/hello?utm=x",
    "canonical_url": "https://example.com/posts/hello",
    "capture_time": "2026-10-04T08:00:00.000Z",
    "extractor": {
      "name": "readability",
      "version": "0.6.0"
    },
    "content_hash": "sha256-abcdef..."
  }
}
```

字段说明：

| 字段 | 必需 | 说明 |
| --- | --- | --- |
| `format_version` | ✅ | 格式版本，当前 `1`；读取时不认识的更大版本 → 报「需要升级」而不是猜测 |
| `document_id` | ✅ | UUID，与目录名一致 |
| `type` | ✅ | `article` \| `book` \| `pdf` \| `markdown` \| `text`（M4 起增 `feed` 相关元数据，不改本表已有语义） |
| `title` | ✅ | 字符串 |
| `author` | ❌ | 字符串；缺失/未知 → 省略字段，不写空串 |
| `published_at` | ❌ | 文章发布时间（ISO 8601；来源页面声明） |
| `language` | ❌ | BCP-47 语言标签（如 `zh-CN`） |
| `description` | ❌ | 摘要（提取器提供时） |
| `site_name` | ❌ | 站点名（提取器提供时） |
| `capture_warnings` | ❌ | 采集降级警告数组，如 `[{code:"asset_download_failed", url, error_code}]`；文章本身有效 |
| `created_at` | ✅ | 目录创建时间 |
| `captured_at` | ❌ | 网页捕获时间（web 来源） |
| `updated_at` | ✅ | 元数据最后一次修改时间 |
| `source` | ❌ | 来源信息块（web 来源强烈建议存在） |
| `source.original_url` | ✅* | 用户实际保存的 URL（含 utm 等参数），*有 source 块时必需 |
| `source.canonical_url` | ❌ | 页面声明的 canonical URL；与 original 并存，**不互相替代** |
| `source.capture_time` | ✅* | 捕获时间，*有 source 块时必需 |
| `source.extractor` | ✅* | `{ name, version }`，提取器标识，*有 source 块时必需 |
| `source.content_hash` | ❌ | 提取正文（article.md）的 sha256 |

**原始内容与提取结果必须同时保存**：web Document 的 `source/page.html` 与 `article.md` 共存；
只有 Markdown 而没有原始来源视为格式违规（Reverie 不制造这种目录，`folio doctor` 类工具将报告它）。

---

## 4. annotations.jsonl

一个 Document 的所有标注存于其目录下的 `annotations.jsonl`，每行一个独立 JSON 对象（JSONL）。

```json
{"format_version":1,"annotation_id":"9e3a...","document_id":"5f0c...","type":"highlight","created_at":"...","updated_at":"...","quoted_text":"被选中的原文","prefix":"引文前 ~32 字符","suffix":"引文后 ~32 字符","locator":{"kind":"text-quote","position":{"start":1207,"end":1221}},"note":"","tags":[],"status":"resolved"}
```

字段说明：

| 字段 | 必需 | 说明 |
| --- | --- | --- |
| `format_version` | ✅ | `1` |
| `annotation_id` | ✅ | UUID |
| `document_id` | ✅ | 所属 Document |
| `type` | ✅ | `highlight` \| `note` \| `bookmark` |
| `created_at` / `updated_at` | ✅ | ISO UTC |
| `quoted_text` | highlight ✅ | 划线原文 |
| `prefix` / `suffix` | ❌ | 引文前后各 ≤32 字符上下文，用于消歧重定位 |
| `locator` | ✅ | 定位信息块，见 §5 |
| `note` | ❌ | 笔记文本（highlight 可带 note；`type:"note"` 的独立笔记必有） |
| `tags` | ❌ | 字符串数组 |
| `status` | ✅ | `resolved` \| `orphaned` |

**损坏容忍**：解析时跳过无法解析的行并告警，**绝不让一条坏行导致整库不可用，更不回写重排整个文件**；
修复（重写文件去掉坏行）只能由用户明确触发的工具完成。

**绝静默删除原则**：定位失败的标注 `status` 置 `orphaned` 并保留；删除只能由用户显式操作。

---

## 5. Locator（多重定位）

`locator` 至少包含一种定位方式；不同 Document 类型的格式特有定位放在同块的补充键里。

| 类型 | locator |
| --- | --- |
| 文本类（article/markdown/text） | `{"kind":"text-quote","position":{"start":N,"end":N},"quote":{...可省，见下}}` |
| EPUB | `{"kind":"epub-cfi","cfi":"epubcfi(...)","range_cfi":"epubcfi(...)"}` + 顶层 quote/prefix/suffix 兜底 |
| PDF | `{"kind":"pdf-page-quote","page":N,"text_quote":{...}}`（坐标仅作显示参考，**不作为唯一依据**） |

规则：

- `position.start/end` 是**加速缓存**，不是真相；解析器必须允许它失效。
- 重定位优先级：position（校验命中）→ quote 全文搜索（prefix/suffix 消歧）→ 空白归一化匹配 → 失败置 `orphaned`。
- 未来版本可以新增 `kind`；读取时遇到未知 `kind` → 尝试 quote 重定位，不行则 `orphaned`，**不删除**。

---

## 6. 原子写入

所有元数据与标注写入必须：

```text
write <path>.tmp-<rand>  →  flush + fsync  →  rename 到最终路径
```

JSONL 追加使用 append + fsync。崩溃残留的 `*.tmp-*` 文件由工具清理，不参与读取。

---

## 7. 索引（派生数据）

```text
Library Files ──→ Indexer ──→ index.db（应用数据目录）
       ↑                            │
       └────── Rebuild ←── 删除/损坏 ┘
```

- 索引只读 Library；索引不存在/损坏/版本不符 → 全量重建，不视为数据损失。
- 索引内容（M3 定稿）：id、type、title、author、urls、tags、created/captured、read/favorite/inbox 状态、正文与标注的可搜索文本。

---

## 8. 版本与迁移

- `format_version` 递增时必须在本文档记录变更与迁移规则。
- 迁移 = 生成新文件、校验、再替换（原子）；迁移工具先备份原文件。
- 读取到更高版本：工具与索引拒绝猜测，提示升级；**永不静默丢弃不认识的字段**。
