# M6 Status — ifuyo Reverie（EPUB Reader）

> M6 完成报告。测试证据：`npm test` **240/240 全绿**（M6 新增 13 例，
> 含"书籍高亮创建→重启→恢复"端到端集成测试）。

---

## 1. Implementation Summary

EPUB 正式接入 Unified Reader Shell 成为普通 Document（type=book）：
主进程 EpubContainer/Parser/BookModel + 渲染层章节阅读（复用文章阅读管线）+
TOC/进度/高亮/笔记/书签/书内搜索全部走既有 M2/M3 体系。

**高亮链路闭环（§33 canonical 契约）**：主进程 canonical 章节文本 =
渲染层将插入的同一份 DOMPurify 净化输出的 textContent（fragment 语义，
`div.innerHTML` 后取值）——两侧行级字节一致，标注的 offset 在主进程与
渲染层之间直读直写，`ReaderAnchor.rangeForOffsets` 无需转换。

## 2. Architecture（关键决定）

- **EPUB 解析器 = 自研（jsdom XML mode）**，复用 foliate-js vendor zip.js 读容器——
  依赖仅 foliate-js（MIT，M0 已核验）+ 已有 jsdom，无新增第三方。
  M0 Spike 曾验证 foliate-js 浏览器渲染路径；M6 漂移决定：**渲染采用"章节流 + 滚动"**
  （复用文章 Reader 全管线），foliate-js paginator 视图推迟（记录为 M6+ 增强）。
- **EPUB 标注锚 = text-quote（M2 复用）而非 CFI**：整书 canonical text = 章节文本顺序
  无分隔拼接（与渲染层 DOM 拼接结果一致），锚点与文章标注完全同构；
  CFI 升级推迟（M2 fallback 链已覆盖稳定性需求，漂移已记录）。
- **canonical 一致性的两个陷阱**（集成测试锁定）：
  1. 章节标题不额外插入渲染 DOM（标题只出现在 TOC 面板），否则 DOM 文本超出 canonical；
  2. canonical 用 fragment 解析（`innerHTML`）而非 document 解析——后者会丢弃首部
     空白文本节点，与渲染层 `innerHTML` 语义不一致。
- **进度** = user-state `last_location { chapter_index, scroll_ratio }`，与渲染解耦
  （M6 §26）；渲染层滚动防抖 400ms 持久化，换书时旧监听器被置换（不写脏进度）。
- **书签（§38）** = type=bookmark 标注，locator `{kind:'reader-location', location}`，
  不做文本锚定（listResolved 恒 resolved）；面板显示"第 N 章"并可跳转。
- **书内搜索（§28-30 最小实现）** = 渲染层在 canonical text 上本地查找
  （忽略大小写，上限 200 条），结果带章节名 + 片段，点击即 `rangeForOffsets` 闪现定位
  （offset 与 DOM 直通，正是 §33 契约的直接收益）。
- 原始 book.epub **不可变**：标注/进度均存库内旁文件（M6 §17，测试断言字节级不变）。

## 3. Verified

- Container：5 个 fixture 全过 mimetype/container/OPF 门；不安全条目名、超大条目、总量上限、
  非 zip、缺 mimetype 全部 typed 拒绝。
- OPF：EPUB 2/3 metadata/manifest/spine/ncx fallback（spine 无 toc= 属性时按 media-type 找 ncx）。
- TOC：EPUB 3 nav 与 EPUB 2 NCX（含嵌套 navPoint、DOCTYPE 策略：无 SYSTEM/ENTITY 的 DTD 声明安全放行）双通道。
- openBookSession：metadata/章节顺序/脚本样式剔除/书搜索正文。
- 书库：addEpubBook 字节级复制、book.epub 不可变（字节断言）、标注通过 M2 核心
  （canonical text = 全书章节文本）、书正文进入全局搜索、last_location 往返。
- **端到端**（tests/reader/book-annotation-flow.test.js）：渲染层 DOM（真实
  ReaderAnchor + 真实 renderBookChapters 结构）textContent === canonical 字节一致 →
  选中→rangeForOffsets→selectionParts→主进程 createHighlight → 重启（全新 session/service）→
  listResolved 恢复同一 offset，恢复的 range 再映射回 DOM；书签位置往返；
  book.epub 字节不变；重建索引后书内文本仍可搜。
- 全量回归：240/240（M1~M5 全部既有能力无回归）。

## 4. Known Limitations

1. 渲染为**滚动式章节阅读**，非 foliate-js 分页视图——翻页动画/自定义分页留待增强
   （M0 Spike 已证明 foliate-js 可行，接入为渐进增强）。
2. EPUB 锚点为 text-quote（非 CFI）——M2 fallback 语义一致；CFI 升级推迟。
3. 键盘导航（§40）与阅读设置（§41 字号/主题/行距）：未实现，阅读器当前以鼠标/滚动为主。
4. Fixed Layout / Media Overlays / RTL 精排（M6 §62-65）：未实现，属"真实需求出现再做"。
5. 私有网段/DRM：加密 EPUB（encryption.xml）当前解析失败并报错（不支持 DRM，符合边界）。
6. 图片资源：章节内图片按相对路径引用 book.epub 内部资源——当前渲染层以文本为主，
   图片显示依赖浏览器对相对路径的解析，跨章图片资源显示为已知限制。
7. 书内搜索为渲染层本地实现（打开书籍时才可用）；全局搜索覆盖书籍正文（M3 索引），
   但点击书籍搜索结果只打开书籍不直接跳转命中章节。

## 5. Deferred

CFI 锚点升级、foliate-js 分页视图、键盘导航、阅读设置、Fixed Layout、Media Overlays、
RTL 精排、字体资源定制、OPDS。

## 6. Gate（§86 Architecture Acceptance）

- Q1 Adapter 独立注册 ✅（type=book 分支 + epub-reader-core，零 Library 架构改动）
- Q2 删索引后可读 ✅（解析直读 book.epub）
- Q3 原文件不可变 ✅（字节断言）
- Q4 标注复用 Generic Annotation ✅（M2 core，text-quote locator + bookmark reader-location）
- Q5/Q6 进度与渲染解耦 ✅（user-state last_location；渲染层只做保存/恢复）
- 搜索协同 ✅（书正文进入 M3 索引 + 书内本地搜索）
- 测试 ✅ 240/240
