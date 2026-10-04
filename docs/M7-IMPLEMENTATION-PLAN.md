# M7 Implementation Plan — PDF Reader

> 依据 docs/M7-EXPLORE.md 的事实结论。原则：优先复用 M2/M3/M5/M6 现有体系，
> PDF 只新增 Adapter 层；零新运行时依赖（pdfjs-dist 已在 deps）。

## Architecture

```
Unified Reader Shell (app/renderer/app.js, type=pdf 分支)
        │
        ├── app/renderer/pdf-view.js        ← 渲染层唯一 pdfjs 入口
        │     (canvas 懒渲染 + LRU、TextLayer 文本层、outline、缩放、页导航)
        │
        ▼ IPC (plain JSON / TypedArray)
app/main.js  loadArticle pdf 分支 / pdf:get-data / pdf:add / dialog:pick-pdf
        │
        ▼
src/reader/pdf-reader-core.js              ← 主进程唯一 pdfjs 入口
        openPdfDocument (typed errors + caps)
        extractPdfPages (canonical 页文本契约)
        extractPdfMeta / extractPdfOutline / pdfCanonicalText
        │
        ▼
src/reader/pdf-library.js  addPdfBook → pdf/<id>/document.pdf (字节不可变) + meta(type=pdf)
        │
        ▼
既有: scan.js (pdf_body 投影) / search-service / M2 AnnotationService / user-state
```

## Data Flow

打开：Library → openArticle(id) → main `loadArticle`（pdf 分支：openPdfDocument +
extractPdfPages meta + canonicalText + outline + last_location）→ 渲染层拿 payload →
`pdf:get-data` 拿字节 → pdf.js getDocument → 逐页：占位盒（按页宽高+scale）→
IntersectionObserver 懒渲染 canvas（LRU≤8）→ TextLayer 文本层（懒建、建后保留）。

标注：选中文本层 → ReaderAnchor.selectionParts（全局 offset）→ 既有 annotation:create →
M2 service（canonical=页文本拼接）→ applyHighlights 经 rangeForOffsets 恢复。

## Interfaces（新增/修改）

| 位置 | 内容 |
|---|---|
| `src/reader/pdf-reader-core.js` 新增 | `openPdfDocument`（PdfError: NOT_PDF/CORRUPTED/PASSWORD_REQUIRED/TOO_LARGE/PAGE_LIMIT）、`extractPdfPages`（{index,text,width,height,rotation}，单页失败局部容错）、`extractPdfMeta`、`extractPdfOutline`（嵌套→{title,page_index,children}，节点级 try/catch）、`pdfCanonicalText`（Σ页文本 join('')）、`pdfPageSpans`（offset→页映射） |
| `src/reader/pdf-library.js` 新增 | `addPdfBook(libraryRoot, src, {title,author,now})` → `pdf/<id>/document.pdf`，meta: type=pdf, source.content_hash, page_count；`pdfDocumentPath(docDir)` |
| `src/library/scan.js` | type=pdf → 投影 `pdf_body`（200KB 上限，同 book_body） |
| `src/search/search-service.js` | buildSearchableDocument：body 取 book_body ?? pdf_body |
| `src/library/user-state.js` | last_location 校验接受 chapter_index 或 page_index（整数≥0），保持原字段形状 |
| `app/main.js` | loadArticle type=pdf 分支（pages meta + canonicalText + outline + labels + last_location）；IPC `pdf:get-data`（Uint8Array）、`dialog:pick-pdf`、`pdf:add` |
| `app/preload.cjs` | pdfGetData / pickPdf / pdfAdd |
| `app/renderer/pdf-view.js` 新增 | initPdfViewer(loaded)：pdfjs 装载（worker 失败自动 fake worker）、懒渲染循环、TextLayer 构建、zoom（0.5–3.0 + fit-width）、页导航、outline 面板、单页渲染失败隔离 |
| `app/renderer/app.js` | openArticle pdf 分支；页码工具栏（N/M + label）；进度保存/恢复按 page_index；书内搜索页名渲染；书签跳转按页 |
| `app/renderer/style.css` | .pdf-page（占位盒）、.pdf-text-layer（pdf_viewer.css 裁剪版）、.pdf-page-error、页码指示 |

## Persistence

- 新增文件仅 `pdf/<id>/document.pdf` + `meta.json` + `annotations.jsonl`（M2）；
- 进度/书签 = 既有 `user-state.json` / annotations（零新状态文件，§91 满足）；
- pdf.js 运行缓存（canvas LRU）纯内存、可丢弃、可重建（§13 满足）。

## Renderer（关键约束）

1. **canonical 契约**：页文本 = `items.map(i=>i.str).join('')`；全书 = 页间无分隔；
   TextLayer 渲染的 DOM textContent 与之字节一致（源码级确认，集成测试双侧锁定）。
   reader-content 内不插入任何额外文本节点。
2. **懒渲染 + LRU**：占位盒先占位（无布局跳动）；IntersectionObserver 渲染可见页 ±1；
   canvas LRU≤8；renderTask.cancel() 取消（zoom 变更/换文档）。
3. **资源钳制**：单页 canvas 像素 ≤ 2^24（超出降 scale）；zoom ∈ [0.5, 3]。
4. **隔离**：单页渲染失败 → 该页显示错误占位（"第 N 页无法渲染"），其余页正常。

## Search

- 全局：pdf_body 入 M3 索引（title/author/tag/highlight/note 同文章）。
- 书内：复用 book-search UI（结果单位=页，canonical offset→页→定位文本）。
- 搜索结果→Reader：pdf 结果点击 → openArticle → offset→页 span → 滚动到页 →
  rangeForOffsets flash（页文本层就绪后）。

## Annotation / Location / Security

见 EXPLORE §13/§15。新增防线清单（Batch 9 落测试）：
大小/页数/canonical 总量上限；PASSWORD_REQUIRED 语义化错误；malformed 不崩溃；
渲染失败页隔离；pdf.js 无 JS 执行（isEvalSupported:false + 默认无 scripting）；
不渲染 AnnotationLayer（外链不触发）。

## Test Matrix（P0 面）

| 组 | 覆盖 |
|---|---|
| pdf-reader-core.test | 打开/meta/页提取（含 CJK、无文本层、混合尺寸、旋转）/outline（嵌套+损坏容错）/typed errors（非 PDF/损坏/加密/超大/超页）/caps |
| pdf-library.test | 字节不可变复制/scan pdf_body/全局搜索/索引重建存活 |
| pdf-flow.test（集成） | canonical↔渲染层 DOM parity（双侧同 fixture）→ 创建高亮 → 重启解析 → 书签/进度往返 → fingerprint 变更→orphaned → 搜索跳页 |
| 全量回归 | M1–M6 全部既有测试无回归 |

## Performance

bench:m7：100 页文档入库（meta+索引提取）耗时、canonical 提取耗时、内存（canvas LRU 上限验证）、
搜索延迟。记录进 M7-STATUS（关注"能否快速开始阅读"，不追 benchmark 数字）。

## Migration / Rollback

No migration required（当前无 PDF 文档形态）。Rollback = M7 提交 revert 即可，
无数据格式变更（meta/annotations/user-state 均为既有 v1 schema 的超集扩展，
旧代码忽略未知字段）。

## Batches → Commits

1. EXPLORE/PLAN 文档 + fixture 扩充（CJK/outline/mixed/rotated/password）
2. pdf-reader-core + pdf-library + scan/search/user-state 接线（主进程全链路 + 测试）
3. main.js IPC + preload + 渲染层 pdf-view + app.js 集成（功能面）
4. 安全/资源钳制 + 集成测试（flow/fingerprint/password/malformed）
5. bench + 文档（M7-STATUS/PDF.md/FORMAT/DECISIONS/PROGRESS）
