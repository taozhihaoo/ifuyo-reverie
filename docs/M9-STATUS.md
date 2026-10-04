# M9 Status — 高级 EPUB Export / Web→EPUB

> M9 完成报告。测试证据：`npm test` **299/299 全绿**（M9 新增 17 例）+
> `npm run smoke:epub` **真实 Electron 运行 8/8 检查通过**（UI 点击批量导出 →
> 真实捕获的资料 → 自包含 EPUB → M6 Reader 回读验证）。

## 1. Goal / 完成回答（§127 逐项）

### Export
- 单篇 EPUB ✅（阅读器"导出 EPUB"按钮 → M9 引擎）
- 多篇 EPUB ✅（库视图"导出 EPUB（N 篇合并）"→ 合并成书；separate 模式在 API/IPC 层完成）
- Web → EPUB ✅（captureAndExportToEpub = M1 runCapture 全管线复用 → 引擎导出）
- Offline Web → EPUB ✅（已入库文章零网络导出——引擎只读本地文件，测试锁定）
- Batch Export ✅（去重 §69 / 空文档 skipped / 部分失败报告 §42 / 稳定顺序=视图显示顺序 §68）

### EPUB
- EPUB3/OPF/Navigation/Spine ✅（M6 容器解析器真实回读验证，§32/33——不是自写 parser 自证）
- XHTML ✅（M2 block 模型 → 白名单渲染；`javascript:` 剥离；实体全转义）
- CSS ✅（Reverie EPUB CSS：阅读友好、无网页布局耦合，§19/20/54）
- Asset ✅（内容寻址 images/<sha>，跨文档去重 §22；缺失→warning+摘除+manifest 同步 §23/29）

### Content
- CJK ✅（题名/正文/文件名 Unicode；M6 回读断言中文章节序）
- Code Block ✅（pre 逐字保留换行/转义，§52）；Table = Unavailable*（markdown-reader
  无 table block，记录限制）；Image ✅；Link ✅（外链保留+清洗，内链锚点保留）

### Annotation
- Highlight/Note ✅（附录章，按已存 quoted_text/note/日期导出，无内部 id/路径 §39）
- 不修改原始 Annotation ✅；ReaderLocation 体系零接触 ✅（不变量 3/4）

### Safety
- HTML sanitize ✅（净化后 markdown 输入 + 白名单输出双层）；SSRF ✅（仅采集路径联网，
  继承 M1/M4 全部防线，测试锁定）；Resource limit ✅（继承 M1 limits）；ZIP safety ✅
  （自研 STORE writer，固定顺序无路径注入面）

### Reliability
- Atomic ✅（tmp→rename，失败/取消清理 tmp，测试+smoke）；Cancellation ✅（AbortSignal）；
- Partial failure ✅（skipped+报告；结构性失败整体失败不产损坏文件 §42）；Crash safety ✅
  （staging promote 是 M1 既有；导出 tmp 独立命名不会伪装成功 §95）

### Data
- 原始文件 immutable ✅（SHA256 前后断言 §102）；SQLite 删除后仍可导出 ✅（服务只吃
  文件扫描 entries §59/60/101）；Cache 删除后可运行 ✅（无新增缓存，§83）

### Compatibility
- M6 Reader ✅（每个导出都经 openEpubContainer/parseOpf 回读 + smoke M6 打开章节/TOC/CJK）
- 外部 Reader ✅ 标准结构（epubcheck 未接入为已知限制，§33 允许）；CJK/大型 EPUB 见 §9

### Performance
- 3 篇合并导出 89ms（真机 IPC 实测）；100+ 篇为架构容量外推（files[] 全内存 zip，
  单次导出量级 MB——流式 zip 记录为技术债，§82 理由已记录）；取消延迟 = 事件循环级

### Architecture
- 复用 Web Capture ✅（runCapture 全管线）；复用 M6 model ✅（验证直接用 M6 解析器）；
- 零重复系统 ✅（单一活跃管线；M5 旧函数 deprecated 保留供其单测）；第三方库零新增 ✅

## 2. 关键架构

```
UI（阅读器导出按钮 / 库视图「导出 EPUB（N 篇合并）」）
  → ipc export:epub {documentIds, destDir, fileName, options, mode}
  → epub-export-service.exportDocumentsToEpub
      collect（只读库文件：meta/article.md/annotations.jsonl/assets/）
      → epub-builder.buildEpub（M2 blocks→富 XHTML；章节去重；题名页；附录；确定性 id）
      → makeZip（M5 STORE writer）→ validate（M5 字符串门 + M6 回读）
      → 原子写（.tmp → rename）
  → ExportResult {success, outputPath, chapterCount, assetCount, assetsFailed, skipped, warnings, identifier, durationMs}
Web→EPUB：captureAndExportToEpub = runCapture（M1）→ scanLibrary 定位（文件非索引 §59）→ 导出
```

## 3. Options（§62/63）

`{ includeImages: true, includeHighlights: false, includeNotes: false, generateToc: true,
bookTitle?, author?, lang?, now? }`；UI 合并导出默认含高亮/笔记附录（个人归档场景）。

## 4. Determinism（§61/103）

identifier = `urn:reverie:book-<sha1(sorted docIds + title)[:16]>`；章节顺序/文件名/内容
全部确定性；zip 无时间戳（STORE writer）→ 固定 `now` 时**逐字节一致**（测试锁定）。
`dcterms:modified` 是 EPUB 3 规范必需的导出时刻字段——确定性比较排除它（§61 记录）。

## 5. Tests / Regression

- 17 例（tests/export/）：富渲染（bold/em/code/link/javascript 剥离/图片映射/缺失降级）、
  标题去重、确定性（字节相等+id 顺序无关）、代码块逐字、端到端（M6 回读+不可变+文件名
  清洗+无 tmp 残留）、合并书（题名页/去重序/附录）、重复 id/空文档、index 无关性、取消、
  覆盖保护、缺图降级、Web→EPUB 端到端（loopback 源站/图片内嵌/离线零网络/失败干净）。
- 回归：M0–M8 全部 282 例无回归（299/299）。
- **真机 smoke 8/8**（npm run smoke:epub）：真实捕获 3 篇 → 真实 app UI 点击批量导出 →
  无阻塞对话框 → 产物经 M6 Reader 回读（题名页+3 章+视图序+CJK+图片内嵌+TOC）。

## 6. 真机验证发现并修复的缺陷（全部有回归证据）

1. **`els.queueHint` 不存在**（M3 遗留）——"重建索引"按钮在真机上点击即抛 TypeError
   （静默失败）；新导出按钮继承同一模式后暴露。已补 els 定义。
2. **libraryView 结果缺 `type` 投影**——批量导出过滤文章类型时全部落空。已补投影。
3. **`window.prompt` 在 Electron 不存在**——初版书名对话框真机会崩；改为默认书名直出
   （§64 第一次导出应简单，文件可改名）。

## 7. Unsupported / Known Issues / Technical Debt

- epubcheck 等外部 validator 未接入（Validation Adapter 边界保留，§33）；表格导出不可用
  （上游 block 模型无 table）；zip 全内存（超大语料建议分批导出，流式 zip 留技术债）；
  separate 模式无 UI 入口（API 完整）；书装帧为轻量题名页（无封面图生成，§26 允许）。
- No migration required（M5 单篇导出文件与新引擎产物均为普通 EPUB，无状态迁移）。

## 8. RESOLVED / CONFIRMED / REMAINING RISKS

- **RESOLVED**：单一导出管线替代 M5 分支（§75）；原子写补齐（M5 直写违规已修）；
  验证从字符串嗅探升级为真实回读。
- **CONFIRMED**：299/299；smoke:epub 8/8；确定性/不可变/index 无关/取消/缺图降级/失败
  保护全部测试锁定。
- **REMAINING RISKS**：外部阅读器兼容性靠标准结构+M6 回读背书，未在多款第三方阅读器
  人工实测（环境限制，记录）；超大语料内存曲线未压测。
- **P0/P1**：无。
- **M10/M11 边界**：修复/恢复体系（M10）、安装/签名/崩溃上报（M11）未偷渡。
