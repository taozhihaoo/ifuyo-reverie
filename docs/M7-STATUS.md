# M7 Status — ifuyo Reverie（PDF Reader）

> M7 完成报告。测试证据：`npm test` **263/263 全绿**（M7 新增 23 例）+
> `npm run smoke:pdf` **真实 Electron 运行 11/11 检查通过**（§100 实跑验证）。

## M7 Goal

PDF 成为与 Web Article / EPUB 同等级的一等 Document：入库、阅读、搜索、定位、
进度、书签、选中文本、高亮、笔记全部可用，且用户状态独立于原始 PDF、派生索引
与渲染器持久存在。

## Scope / Non-Goals

- **Scope**：PDF 入库（pdf/<id>/document.pdf 不可变副本）、pdf.js 渲染（懒渲染+LRU）、
  文本层（canonical parity）、Outline、书内/全局搜索、标注（复用 M2）、书签、进度。
- **Non-Goals（明确排除）**：OCR、PDF 编辑/写注回文件、密码输入 UI（检测并明确提示）、
  PDF JavaScript/Action/附件执行（永不）、AcroForm 编辑、签名、多媒体、3D、Layers、
  PDF→PDF 转换、复杂版式重排（M9）。

## Current Architecture

```
Unified Reader Shell (app/renderer/app.js, type=pdf 分支)
        └── app/renderer/pdf-view.js        ← 渲染层唯一 pdfjs 入口（模块）
              canvas 懒渲染 + LRU≤6 + renderTask.cancel
              pdf.js TextLayer 文本层（建后保留 = canonical 的 DOM 形态）
              outline / 页导航 / 缩放 / 单页失败隔离
        ▼ IPC（plain JSON / TypedArray）
app/main.js  loadArticle(type=pdf) / pdf:get-data / pdf:vendor-data / pdf:add / dialog:pick-pdf
        ▼
src/reader/pdf-reader-core.js               ← 主进程唯一 pdfjs 入口（Node legacy build）
        openPdfDocument + typed errors / extractPdfPages / Meta / Outline / pdfCanonicalText
src/reader/pdf-library.js  addPdfBook → pdf/<id>/document.pdf（字节不可变）+ meta(type=pdf)
        ▼
既有：scan.js(pdf_body 投影) / search-service / M2 AnnotationService / user-state(last_location.page_index)
```

## Renderer Choice

**pdfjs-dist 6.4.299**（M0 spike 已验证；Apache-2.0；纯 JS 零 native）。渲染在 Electron
renderer（Chromium canvas），文本提取在主进程 Node legacy build。第三方 API 只出现在
两个 adapter 文件，Library/Annotation/Search 数据模型全部 plain JSON（M7 §7 边界）。

## Document Integration

- 入库镜像 M6：`addPdfBook` → `pdf/<id>/document.pdf` 字节级副本 + meta
  (type=pdf, page_count, source.content_hash)；标题 fallback 元数据→文件名→未命名（§54）。
- scan 投影 `pdf_body`（200KB 上限）+ `page_count` 入派生索引；user-state `last_location`
  接受 `{page_index, scroll_ratio}`（chapter_index 语义原样保留）。
- meta 新增可选字段：`page_count`（FORMAT.md 已更新）；pdf 信息字典字段进
  `meta.pdf_meta`（title/author/subject/keywords/creator/producer/creation_date/modification_date）。

## Metadata / Rendering / Navigation / Outline

- 元数据：info dict 八字段，缺失即省略（可省不可 null）。
- 渲染：页节固定宽高比占位（无布局跳动）→ IntersectionObserver 懒渲染可见页 ±1 →
  canvas LRU≤6（位图即弃缓存，删缓存可完整恢复阅读，§13）；单页 canvas 像素钳制 ≤2^24；
  全部几何经 pdf.js viewport（含 rotation），无手写 x*zoom（§49）。
- 导航：上一页/下一页/指定页（点击 TOC/搜索/书签）+ ←/→ 键；0-based page_index 为身份、
  PageLabel 仅用于显示（§30），工具栏显示"第 N / M 页（标签 L）"。
- Outline：getOutline 嵌套树 → {title, page_index, children}；named/explicit dest 双态解析；
  损坏节点保留标题、禁用跳转（局部失败不阻塞文档，§19）；无 outline 时回退页列表。

## Search / Text Layer

- 全局：pdf_body 入 M3 索引（中英 CJK 实测）；索引删除后 rebuild 即恢复（§57，测试锁定）。
- 书内：TOC 面板搜索框对 canonical 本地查找 → 点击 revealOffset（页 span 映射）→
  文本层就绪后 rangeForOffsets 闪现（§25/§26 渲染层本地实现，不阻塞 UI）。
- 全局搜索结果 → 打开 PDF → 定位命中页与文本（§97，smoke 验证）。
- 文本层：pdf.js TextLayer 每页一容器；`span.textContent = item.str`、EOL=`<br>`（不产生
  文本）→ **DOM textContent 与主进程 canonical 字节一致**（真实 TextLayer 代码路径在
  jsdom + 真实应用双锁定）。

## Selection / Highlight / Note / Bookmark / Progress / ReaderLocation

- 选择 = 浏览器原生（透明文本层）；跨页选区经 ReaderAnchor 全局 offset 映射。
- 标注复用 M2 Generic Annotation（text-quote locator，quote/prefix/suffix/position）——
  无第二套体系（§35）；Note 走 M2 updateNote；导出/每日回顾自动兼容（§95/§96）。
- 书签 = type=bookmark + `{page_index, scroll_ratio}` reader-location；面板显示"第 N 页"跳转。
- 进度 = last_location 持久化（滚动防抖）；恢复链 = page_index → 页首（§41）。
- 无法定位的标注按 M2 语义 orphaned，绝不静默删除（§33，fingerprint 替换测试锁定）。

## Security / Resource Limits / Failure Isolation / Cancellation / Concurrency

- **Reader 不执行 PDF 主动内容**：`isEvalSupported:false`、不启用 scripting、不渲染
  AnnotationLayer（外链/JS/Launch 自然不触发）；EmbeddedFile/Form/Multimedia 不解析执行。
- 资源上限：文件 200MB、页数 20,000、canonical 20M 字符、索引投影 200KB、canvas 像素
  2^24/页、位图 LRU 6；密码 PDF → `PASSWORD_REQUIRED` 语义化错误（不伪装 parse 失败）。
- typed errors：NOT_FOUND / NOT_PDF / CORRUPTED / PASSWORD_REQUIRED / TOO_LARGE /
  PAGE_LIMIT / PARSE_ERROR（双拼写 code+error_code）。
- 失败隔离：单页提取/渲染失败 → 该页占位提示，其余页正常（§52）；outline 节点级容错。
- 取消：renderTask.cancel()（换页/缩放/换文档/退出阅读器）；关闭阅读器 dispose 全部位图。
- 并发：换文档置换监听器 + destroyed 标志丢弃迟到回调；书内搜索为本地同步查找。

## Performance / Benchmark Results / Memory / Cache

（数量级参考，个人阅读场景以"能否快速开始阅读"为准；详细数字见 docs/PERF.md 增补）
- 100 页 PDF：入库+索引提取秒级；随机页提取毫秒级（M0 spike + M7 复测）。
- 首屏：打开→首画布渲染 < 1s（smoke 实测 5 页文档 <2.5s 完成页挂载+首画布）。
- 内存：位图 LRU≤6 页（钳制后单页 ≤16.7MP）；文本层为文本节点（量级 MB）。
- 缓存：位图即弃运行时缓存；删除后 PDF+用户状态完整恢复阅读（架构保证）。

## Tests / Fixtures / Regression / Restart / Index Rebuild

- fixtures：cjk（simhei 嵌入 ToUnicode）/outline（嵌套+链接指针）/mixed-size/rotated/
  encrypted（/Encrypt 检测件）+ M0 的 text/long/columns/scanned。
- 单元+集成 23 例：页模型/canonical/outline/混合尺寸/旋转/CJK/扫描件/加密/损坏/
  非 PDF/缺失/大小上限/页数上限/入库不可变/扫描投影/全局搜索/索引重建/进度往返/
  **高亮创建→重启→恢复（真实 TextLayer）**/CJK parity/fingerprint 替换→orphaned。
- 回归：M1–M6 全部 240 例无回归（263/263）。
- **真实运行验证（§100）**：`npm run smoke:pdf` — CDP 驱动真实 Electron 应用：
  打开→懒渲染→实时 DOM/canonical parity（10,182 字符相等）→选区→弹出→高亮→
  CSS Highlight 上屏→进度落盘→重启→位置恢复（第 4 页）+高亮恢复重绘→书内搜索跳转→
  outline 渲染。11/11 通过。

## Unsupported Features / Known Limitations / Technical Debt

| Capability | Supported | Partial | Unsupported |
|---|---:|---:|---:|
| PDF Open | ✅ | | |
| Metadata | ✅ | | |
| Page Render | ✅ | | |
| Zoom | ✅（0.5–3.0，fit-width 基准） | | |
| Navigation | ✅ | | |
| Outline | ✅ | | |
| Search（全局+书内） | ✅ | | |
| Text Selection | ✅ | | |
| Highlight / Note | ✅ | | |
| Bookmark | ✅ | | |
| Progress | ✅ | | |
| Internal Links | | | ❌（未渲染链接层，M7 记录） |
| External Links | | | ❌（同上——不渲染即不触发，安全默认） |
| Password PDF | | 检测+明确提示 | 密码输入 |
| Scanned PDF | 可读/翻页/缩放/书签/进度 | | 正文搜索/选择/高亮（无文本层，明确降级） |
| OCR | | | ❌（永久排除，非 M7 范围） |
| PDF JavaScript | | | ❌（永不执行） |
| Embedded Files | | | ❌（不自动打开/导入） |
| Forms | | | ❌（不解析） |
| Multimedia | | | ❌ |
| 页面旋转 | 渲染按页面 rotation 正确呈现 | 无手动旋转 UI | |
| 缩略图栏 | | | 未实现（§51 非核心） |

已知取舍：文本层 DOM 建后保留（canonical parity 所需，文本节点量级 MB）——超大文档
（数千页）DOM 规模线性增长，记录为已知限制；旋转页的选区几何以 viewport 变换为准，
极端旋转版式的选区精度未专项验证。

## Migration

No migration required（此前无 PDF 文档形态；meta 为既有 v1 schema 超集扩展）。

## M8 Dependencies（TTS 需要的既有接口）

- `canonicalText`（整书文本）+ `page_spans`（offset→页映射）——article:load(type=pdf)
  已返回；`pages[].has_text` 标记可朗读页；`ReveriePdf.progressFromDom()` 提供当前位置。
  M8 可在其上实现 GetTextForRange/CurrentPage，无需改 M7 数据模型。

## M9 Dependencies

无阻塞。M7 未做任何版式重排/豪华阅读模式（§66 边界遵守）。

## RESOLVED

- canonical 契约跨格式统一：PDF 与 Article/EPUB 共用同一套 M2 锚定/M3 搜索/进度体系。
- 密码/损坏/非 PDF/超限输入全部 typed 错误化，malformed 不崩溃应用（测试+实跑）。
- Electron 沙箱渲染层 CSP（connect-src 'none'）下 pdf.js 运行时资源（cmaps/fonts/wasm）
  通过 IpcBinaryDataFactory + `pdf:vendor-data`（目录+扩展名白名单）安全供给。

## CONFIRMED（经真实运行/测试确认）

263/263 测试；smoke 11/11（含实时 parity 10,182 字符、高亮重启重绘、进度第 4 页恢复、
CJK 全文搜索）；book.epub→document.pdf 字节不可变断言；索引重建后 PDF 可搜。

## REMAINING RISKS

- 真实世界"脏 PDF"长尾（怪字体/损坏图片流）依赖 pdf.js 自身容错——单页失败已隔离，
  但未对海量变异样本做扫描（风险低：渲染器是业界主用实现）。
- pdf.js worker 在 file:// 沙箱下的加载若被 Chromium 策略拦截，pdf.js 自动回退 fake
  worker（主线程渲染，功能等价、稍慢）——smoke 环境未观察到拦截，记录为环境依赖。
- 派生索引 index.json 挂在 REVERIE_HOME 下（M1 既有设计，单一库假设）：换库指向需
  重建索引——属既有架构，M7 不动（§89），M10/M11 稳定性阶段再评估。

## P0

无。

## P1

无。（smoke 发现的三个缺陷已在 M7 内修复：export:documents 重复注册导致启动期 IPC
注册中断；article:load 从 read-state.json 读 last_location 的错误来源；openArticle
尾部 scrollTo 与阅读器位置恢复的竞态。均有修复说明与回归证据。）

## NOT BLOCKING

缩略图栏、旋转 UI、内外链接层、CFI 式页内精确定位、normalized rects 导出、
巨型 PDF 文本层 DOM 规模优化。
