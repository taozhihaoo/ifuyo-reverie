# M7 Explore — PDF Reader（Phase A 产物）

> 原则：FACT 全部来自当前仓库代码 / node_modules 实测；HYPOTHESIS / INFERENCE 显式标注。
> 探索时间：2026-10-05（M6 已完成，240/240 全绿）。

## 1. 当前 Reader Shell 能复用什么？

- **FACT**：Reader Shell = `app/renderer/app.js` 的 `openArticle(documentId)` + `#reader-view`。
  按 `loaded.type` 分支渲染：`book`（章节 innerHTML）/ article（blocks）。M7 增加 `pdf` 分支。
- **FACT**：选中→高亮链路（`reader-content` mouseup → `ReaderAnchor.selectionParts` →
  `annotation:create` IPC → M2 service）与格式无关，直接复用。
- **FACT**：高亮渲染 = CSS Custom Highlight（`applyHighlights`），对 `reader-content` 全局
  offset 调 `ReaderAnchor.rangeForOffsets`——只要 PDF 的 DOM 文本与 canonical 字节一致即可复用（见 §13）。
- **FACT**：标注面板（renderPanel）、书签（`book:add-bookmark` IPC + type=bookmark 标注 +
  "跳转"）、进度（user-state `last_location`，防抖持久化 + 换书置换监听器）、TOC 侧栏
  （#book-toc）、书内搜索（canonical 本地查找 + 点击 rangeForOffsets）全部已按 EPUB 落地，
  PDF 仅有"位置单位不同"的差异。
- **FACT**：M3 全局搜索跳转（结果卡 body 命中 → `textIndex(reader-content)` + indexOf +
  rangeForOffsets + flash）依赖 DOM 文本齐全——PDF 文本层按需构建后同样成立。

## 2. M6 EPUB 实现哪些结构可复用？

- **FACT**：入库模式（`src/reader/book-library.js`）：字节级复制 → `books/<id>/book.epub` +
  meta(type=book, source.content_hash=sha256)。PDF 镜像为 `pdf/<id>/document.pdf`，
  meta type=pdf（scan.js 的 `DOC_TYPES` 已预留 `'pdf'` 目录名）。
- **FACT**：canonical 契约（M6 §33，集成测试锁定）：canonical = 渲染层同一文本来源的
  textContent；全书 = 章节文本无分隔拼接；渲染层不插入 canonical 之外的文本节点。
- **FACT**：`chapterSanitizedXhtml`（主进程提取、渲染层直接插入）在 PDF 中不需要——
  PDF 不渲染 HTML，渲染层用 pdf.js 自绘 canvas + 文本层。

## 3. M2 Annotation 哪些接口可直接复用？

- **FACT**：`createAnnotationService` 注入 `getReaderContext → {canonicalText}`，与文档格式无关。
  PDF 传入"整书 canonical"（页文本无分隔拼接）后 createHighlight/updateNote/delete/repair/
  listResolved 全部原样可用。ANNOTATION_TYPES 已含 bookmark。
- **FACT**：resolver 五步 fallback（exact → hash-position → quote → collapsed → flexible）+
  ambiguous→orphaned 守卫直接复用；PDF 无需新 resolver。
- **INFERENCE**：PDF 高亮的"视觉恢复"由 CSS Custom Highlight 在文本层 span 上完成
  （无需在 locator 存 normalized rects——§31 要求的 quote/context/range 已全有，
  rects 在 PDF 渲染体系里等价于"文本层 DOM 自身"，比像素坐标更稳定）。

## 4. M3 Search 哪些接口可直接复用？

- **FACT**：scan 已为 book 投影 `book_body`；search-service `buildSearchableDocument`
  优先取 `entry.book_body`。PDF 同构：scan 投影 `pdf_body`（页文本拼接，200KB 上限），
  buildSearchableDocument 增加 pdf_body 分支。全局搜索/搜索结果跳 Reader 全链路复用。
- **FACT**：书内搜索（渲染层 canonical 本地查找）对 PDF 原样可用，结果单位从"章节"变"页"。

## 5. M5 File / Import / Export 哪些可复用？

- **FACT**：导出（Highlights JSON/MD、Metadata、Markdown）走 scan 投影 + annotations.jsonl，
  PDF 标注自动进入，无需改导出代码（§95 自动满足）。
- **FACT**：Daily Review 基于 annotation 投影，PDF 高亮自动成为候选（§96 自动满足）。
- **FACT**：无既有 PDF import pipeline（§92：No migration required）。

## 6-7. PDF Library 候选与选择

- **FACT**：候选 = pdfjs-dist（Mozilla, Apache-2.0）/ PDF.js-Electron 集成 / pdf-lib（只写不读）/
  原生（PDFium 等，需 native 绑定）。M0 已做 spike 并记入 DECISIONS：
  **pdfjs-dist 成立**（parse/text/search/render 四问全部 PASS）。
- **FACT**：`package.json` 已有 `pdfjs-dist@6.4.299`（dependency）+ `pdf-lib@1.17.1`（devDep，
  仅 fixture 生成）+ `@napi-rs/canvas`（devDep，仅 Node 渲染 spike）。
- **FACT**（node_modules 实测 v6.4.299）：导出 `getDocument / TextLayer / Util /
  setLayerDimensions / getOutline / getPageLabels / getMetadata / getDestination /
  getPageIndex / PasswordException / InvalidPDFException / RenderingCancelledException`；
  `legacy/build/pdf.mjs` 可在 Node 运行（M0 spike 佐证 + 本次复核）；Node fake-worker 自动回退。
- **FACT**：许可 Apache-2.0（node_modules/pdfjs-dist/LICENSE），纯 JS，无 native 依赖，
  Windows/x64 无额外部署项。
- **决定**：pdfjs-dist。渲染 = Electron renderer（Chromium）内 canvas；文本提取 = 主进程
  legacy build（搜索索引/annotation canonical）。零新增运行时依赖。

## 8. Renderer API 如何隔离？

- **FACT/设计**：UI 只接触 `type=pdf` 的 plain-domain payload（pages/canonicalText/outline）
  与 pdf.js canvas 渲染调用点集中在 `app/renderer/pdf-view.js`（新文件，唯一 import pdfjs 的
  渲染层文件）；主进程侧 pdfjs 只出现在 `src/reader/pdf-reader-core.js`。第三方类型不进入
  annotation/search/library 数据模型（locator/meta 全为 plain JSON）。

## 9-11. Text Layer / Selection / Outline 如何获取？

- **FACT**（源码级确认，pdf.mjs#L15160-15260）：`TextLayer` 对每个 item 建
  `<span>` 且 `textDiv.textContent = geom.str`（原文，无归一化）；`hasEOL` 追加 `<br>`
  （不产生 textContent）。**因此 DOM textContent = `items.map(i => i.str).join('')` 字节相等**。
- **FACT**：`TextLayer({textContentSource, container, viewport})` + `setLayerDimensions` +
  `--total-scale-factor` CSS 变量实现百分比定位 + calc 缩放——span 位置与缩放解耦，
  zoom 只需更新 CSS 变量（不需重建文本层）。
- **FACT**：selection = 浏览器原生（透明文本层覆盖在 canvas 上，`user-select:text`），
  跨页选区经 ReaderAnchor 全局 offset 映射（与文章/EPUB 同机制）。
- **FACT**：`getOutline()` 返回嵌套 {title, dest, items[]}；dest 经
  `getDestination/getPageIndex` 解析为页码。损坏 outline 逐节点 try/catch（局部失败）。
- **FACT**：`getPageLabels()` 返回 label 数组或 null。

## 12. Page Coordinate 如何处理？

- **FACT/设计**：单一转换点 = `viewport = page.getViewport({scale, rotation})`（pdf.js 官方
  封装了 PDF space → device space，含 rotation）；文本层由 TextLayer 内部用同一 viewport
  处理（百分比定位）。渲染层不手写 `x * zoom`。归一化坐标（若将来需要）以
  viewport.viewBox + rotation 为基准，记为后续增强。

## 13. PDF ReaderLocation 如何设计？

- **决定**：与 EPUB 同构，零新体系——
  - canonical = 各页文本（`Σ item.str`）无分隔拼接（与渲染层 DOM 拼接结果字节一致）；
  - 标注 = M2 text-quote（quote/prefix/suffix/position 全局 offset）→ 页码由 offset→页 span
    映射推导（main 与 renderer 各自持有同一 span 映射：页文本长度累加）；
  - 进度/书签 = `last_location {page_index, scroll_ratio}`（user-state 校验从 chapter_index
    扩展为 chapter_index | page_index 任一即可）；
  - **FACT**：pageIndex（0-based 内部位置）为身份；PageLabel（getPageLabels）仅用于显示。
  - **HYPOTHESIS**：同一 pdf.js 大版本内 getTextContent 输出稳定（主进程 legacy build 与
    renderer web build 同版本同算法）→ canonical 契约成立；集成测试锁定（同 fixture 双侧比对）。

## 14. Password PDF 如何处理？

- **FACT**：pdf.js 抛 `PasswordException`（name='PasswordException'）。映射为 typed 错误
  `PASSWORD_REQUIRED`，UI 明确提示"此 PDF 受密码保护"（不伪装成 parse 失败）。
  M7 不实现密码输入 UI（个人归档场景，受保护 PDF 记录为 Unsupported——§17 允许）。
  不做任何绕过。

## 15. Security 风险有哪些？

- **FACT**：pdf.js 默认不执行 PDF JavaScript（`isEvalSupported:false` 已在 M0 spike 使用；
  scripting 需要 `enableScripting:true` 才启用，默认 false）。EmbeddedFile/Form/Multimedia
  不主动解析执行。外链注释：M7 渲染层不渲染 Link annotation 的可点击区（最小实现不启用
  AnnotationLayer）→ 外链自然不触发；未来启用时仅放行 http/https 走 `openExternal`。
- **资源防线**（对齐 M6 zip 防线）：文件大小上限（200MB）、页数上限（20,000）、
  单页 canvas 像素上限（~2^24 px，超出按比例钳制 scale）、文本提取总量上限（索引 200KB +
  canonical 20MB）、渲染 LRU 上限（8 页 canvas）、renderTask 可取消。
- **路径**：PDF 字节经 IPC 传输（无路径暴露给渲染层）；`pdf:get-data` 只读库内
  `pdf/<id>/document.pdf` 固定文件名，无用户输入路径成分。

## 16. 性能风险有哪些？

- **FACT**（M0 spike）：100 页 PDF 随机页提取毫秒级；全 100 页搜索 1-2s 量级（Node 串行）。
- **INFERENCE**：索引提取按页增量 + 总量上限，1,000 页文档首次入库为秒级；渲染按
  IntersectionObserver 懒渲染 + LRU，内存有界。文本层 DOM 全保留（文本节点，量级 MB），
  记为已知取舍（保证 canonical/DOM parity）。

## 17. 哪些 PDF 能力明确不支持？

OCR（§61）、PDF 编辑/写注释回文件（§59/60）、密码输入 UI（记录 Unsupported）、
PDF JavaScript / 自动 Action / 附件自动打开（§14/16 永不）、AcroForm 编辑、签名、
多媒体、3D、Layers（§62 detect+ignore）。

## 18. M7 blocker？

无。pdfjs-dist 双侧（Node legacy + Chromium）能力、M2/M3/M6 复用面、文本层 parity
契约均已证实。唯一运行时风险 = Electron file:// 下 ESM worker 加载（pdf.js 失败时自动
回退 fake worker，功能不受损，仅渲染稍慢）——smoke 运行验证后如实记录。

## 19. 可以留到以后？

CFI 式页内精确定位（当前 offset 已够用）、normalized rects 导出、Link annotation 层、
缩略图栏、旋转 UI、页内 TTS 分句（M8 时基于 canonical+页 span 映射实现）。
