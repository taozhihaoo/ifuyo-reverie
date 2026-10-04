# PDF — ifuyo Reverie（M7）

> PDF Reader 的使用说明与行为边界。架构细节见 docs/M7-STATUS.md 与
> docs/M7-EXPLORE.md；本文面向使用者与后续阶段开发者。

## 入库

- 侧栏 **+ 添加 PDF**（或 `reverie.pdfAdd(路径)`）→ 字节级复制到
  `<Library>/pdf/<documentId>/document.pdf`，原文件此后不可变（用户资产）。
- meta：`type:"pdf"`、`page_count`、`source.content_hash`（sha256，fingerprint）。
- 标题 fallback：PDF 元数据 Title → 文件名 → 未命名文档。
- **加密 PDF**：检测到密码保护时明确报错"此 PDF 受密码保护"（M7 不做密码输入，
  不做任何绕过）。

## 阅读

- 与文章/EPUB 共用 Unified Reader Shell：滚动式连续页面流，默认 fit-width。
- 工具栏：◀ ▶ 翻页（←/→ 键）、页码指示 `第 N / M 页（标签 L）`、缩放 50%–300%。
- 页面懒渲染：只渲染可视页邻近页，位图缓存有上限（LRU 6 页）且随时可丢弃——
  删除缓存后 PDF 与阅读进度完整恢复（缓存不是数据）。
- 某页渲染失败 → 该页显示"此页无法渲染"，其余页面不受影响。
- 大页/高倍缩放自动钳制渲染分辨率，避免内存爆炸。

## 文本能力

- 文本层来自 PDF 自带 Text Layer（pdf.js 提取）；**扫描件无文本层时**：阅读/翻页/
  缩放/书签/进度照常，搜索/选择/高亮不可用（不做 OCR）。
- 选中文本 → 高亮/笔记，与文章、EPUB 完全同体系（M2 标注核心，`annotations.jsonl`）。
- 书内搜索：阅读器目录面板中的搜索框；点击结果直达命中页并闪现定位。
- 全局搜索（M3）索引 PDF 正文（`pdf_body` 投影）；搜索结果点击直达命中页。

## 定位与状态

- **pageIndex（0-based 内部位置）是定位身份；PageLabel（PDF 页标签）仅用于显示**。
  进度、书签永远保存内部索引，不依赖显示页码。
- 阅读进度：`<Library>/user-state.json` 的 `last_location {page_index, scroll_ratio}`。
- 书签：type=bookmark 标注，reader-location 锚点；标注面板可跳转。
- PDF 被替换（fingerprint 变化）后：标注按引文重新解析，找不到即 orphaned 保留，
  绝不静默删除。

## 安全边界

- Reader 不执行 PDF 主动内容：JavaScript / Launch Action / 附件 / 表单 / 多媒体
  一律不解析不执行；不渲染链接注释层（外链不会触发）。
- 资源防线：文件 ≤200MB、页数 ≤20,000、单页渲染分辨率钳制、位图 LRU。
- 错误语义化：非 PDF / 损坏 / 加密 / 超大 / 超页各自有明确错误码与提示。

## 与其他里程碑的关系

- **M8 TTS**：canonical 文本 + `page_spans`（offset→页）+ `pages[].has_text` +
  `ReveriePdf.progressFromDom()` 已就绪，可直接构建朗读队列。
- **M9**：不做版式重排/豪华阅读（M7 只做 Reader）。
- **M11**：`npm run smoke:pdf`（CDP 驱动真实应用的运行时冒烟）可纳入发布前自检。
