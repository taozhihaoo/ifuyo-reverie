# M9 Implementation Plan — Advanced EPUB Export / Web→EPUB

> 依据 docs/M9-EXPLORE.md。原则：单一 Export Pipeline；复用 M1 采集 / M5 zip /
> M6 验证 / M2 block 模型；零新依赖；原始文件不可变。

## Architecture

```
UI（阅读器"导出 EPUB"按钮 / 库视图"导出当前视图为 EPUB"）
      │ ipc export:epub {documentIds, options, destDir, mode}
      ▼
src/importexport/export/epub-export-service.js   ExportCoordinator
      collect(library files) → build → zip(makeZip) → validate → atomic write
      │ 注入纯函数
src/importexport/export/epub-builder.js          ExportModel + XHTML 渲染
      blocks → chapters（标题去重）/题名页/nav/manifest/spine/高亮附录
      │ 验证
src/reader/epub-book.js（M6 回读：container/OPF/spine/nav 真实解析）
      │ 网络路径（仅 Web→EPUB）
src/capture/pipeline.js runCapture（M1 全管线复用，fetchers 可注入）
```

## Interfaces

| 位置 | 内容 |
|---|---|
| `epub-builder.js` 新增 | `buildEpub({documents, options})` → `{files, chapterCount, assetCount, warnings}`；`markdownBlocksToXhtml(blocks, {resolveImage})`（strong/em/code/a/img 白名单渲染，img 经 resolveImage 映射到 `images/<sha>.<ext>`，失败→warning+摘除）；多文档章节标题去重 `原标题 (2)`；题名页（书模式）；Highlights/Notes 附录；deterministic identifier `urn:reverie:book-<sha1[:16]>`（按排序 documentIds+title） |
| `epub-export-service.js` 新增 | `exportDocumentsToEpub({libraryRoot, documentIds, destDir, fileName, options, signal})` → ExportResult `{success, outputPath, documentCount, chapterCount, assetCount, warnings, errors, skipped, durationMs}`；收集读 meta.json/article.md/annotations.jsonl/assets（**只读库文件**）；空文档 → skipped+warning（不整体失败，§42）；结构性失败 → 整体失败+清理；原子写 `<name>.epub.tmp` → validate → rename；AbortSignal 取消 |
| `web-to-epub.js` 新增 | `captureAndExportToEpub({url, libraryRoot, destDir, options})` = runCapture（M1）→ 新文档 id → exportDocumentsToEpub；失败返回结构化错误，成功可留在库中（文档即真相） |
| `epub-exporter.js` | `exportArticleToEpub` 标记 deprecated（保留，M5 单测继续守护） |
| `app/main.js` | IPC `export:epub`（merge/separate + options + destDir）；`export:documents` EPUB 分支迁移到新引擎（单篇） |
| `app/preload.cjs` | exportEpub(documentIds, options, destDir, mode) |
| `app/renderer/app.js` | 库视图头部"导出 EPUB"（当前视图全部文章 → 合并，题名默认"Reverie 导出 <视图名> <日期>"，对话框选择目标目录）；阅读器"导出 EPUB"按钮迁移新引擎 |

## Options（§62/63 最小集）

`{ includeImages: true, includeHighlights: false, includeNotes: false, generateToc: true, bookTitle?, author?, lang? }`

## Validation（§32/33）

1. 既有字符串级检查（mimetype 首 entry STORE 等）保留；
2. **M6 回读**：openEpubContainer → parseOpf → spine 数量 = 章节数 + nav 解析成功；
3. XHTML 每章 jsdom 解析无异常（抽样全量，内存允许）；
4. 任一失败 → 整体 Export Failed + 删除 tmp（§42 不产损坏 EPUB）。

## Determinism（§61/103）

identifier/章节顺序/文件名/内容确定；`dcterms:modified` 为 EPUB 规范必需的导出时刻
时间戳——确定性测试显式排除该字段并记录原因（§61 允许记录）。

## Tests（tests/export/epub-advanced.test.js + web-to-epub.test.js）

- 富渲染：加粗/斜体/行内码/链接（javascript: 剥离）/图片映射/缺失资产 warning。
- 多文档：标题去重、顺序稳定（输入顺序=用户选择顺序）、重复 id 去重（§69）。
- 书装帧：题名页、TOC、nav=spine=阅读顺序（§28）。
- 高亮/笔记附录（按 options，含日期与来源题名，无内部 id/路径泄漏 §39）。
- 原子写：目标已存在不被破坏；失败保留原文件；tmp 清理（§31/94）。
- 不可变：导出前后 SHA256(article.md/meta.json/annotations.jsonl)（§102）。
- index 删除重建后再导出一致（§60/101）。
- 确定性：同输入两次导出除 dcterms:modified 外逐字节一致（§103）。
- 取消：AbortSignal 在构建/写各阶段中断 + tmp 清理（§43/106）。
- Web→EPUB：loopback 服务器 capture→export 端到端；离线（本地已有文档）零网络导出
  （§90）；SSRF 私网拒绝继承 M1 行为。
- M6 回读：生成的 EPUB 被 Reverie Reader 打开（章节数/标题/正文搜索）（§109/Case 9）。

## Batches → Commits

1. EXPLORE/PLAN（本文档）
2. epub-builder（域模型+渲染器）+ 测试
3. epub-export-service（coordinator/验证/原子写）+ 测试（不可变/确定性/取消/重建）
4. main IPC + UI（库视图批量导出 + 阅读器迁移）+ web-to-epub + 测试
5. 回归 + M9-STATUS/EPUB-EXPORT.md + FORMAT/DECISIONS/PROGRESS 更新
