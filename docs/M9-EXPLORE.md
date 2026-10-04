# M9 Explore — 高级 EPUB Export / Web→EPUB（Phase A 产物）

> FACT 来自当前仓库代码实测；HYPOTHESIS/INFERENCE 显式标注。（2026-10-05）

## 1. M5 EPUB Export 审计（§5.1）

**FACT**（src/importexport/export/epub-exporter.js，~180 行）：
- `exportArticleToEpub`：**单篇文章** → EPUB 3（mimetype STORE 首 entry、container.xml、
  OPF、nav.xhtml、按 H1 分章 XHTML、极简 CSS），经共享 STORE zip writer（src/core/zip-writer.js）。
- deterministic identifier 已有：`urn:reverie:<documentId>` ✓（§14）。
- `validateEpubBuffer`：zip 魔数/mimetype 首 entry STORE/三个关键文件存在性（字符串级，弱）。
- **缺口**（Relative to M9 §11-47）：无图片资产（markdown 渲染丢 img/a/strong/em）、
  无多文档合并、无书装帧（题名页/封面）、无 Highlights/Notes 附录、无目录层级（仅章）、
  验证弱（未实际解析）、**调用方 main.js 直接 fsp.writeFile 非原子**（§31 违规）、
  CSS 极简但基本可用（§19 可扩充）。
- **可复用**：zip-writer、XHTML 转义、H1 分章思路、OPF/nav 模板形状、validateEpubBuffer 骨架。

## 2. M6 EPUB Model（§6）

**FACT**：`src/reader/epub-book.js` 的 `openEpubContainer/parseOpf/extractToc` 是完整 EPUB
读取模型（容器/manifest/spine/nav 双通道/安全门）。**M9 验证器直接用 M6 Reader 打开
生成的 EPUB** = 真实兼容性验证（§33"验证生成的 EPUB 而非自写 parser"），零新模型、
零新依赖。不重新定义 EPUB domain model（§6 满足）。

## 3. Web Capture 可复用面（§15/§52）

**FACT**：M1 `runCapture(request, {libraryRoot, fetchPageImpl, fetchAssetImpl, limits})`
= 完整"URL → 规范化 Document"管线（fetch→Readability→DOMPurify→assets sha256→markdown→
staging 原子 promote），fetchers 可注入（测试用 loopback 服务器模式已在 M1 测试建立）。
**Web→EPUB = runCapture（全套复用）→ M9 Export Engine**，不写第二套 HTTP/解析/清洗
（§15 明确禁止）。
**FACT**：已入库文章的图片即 `assets/<sha256>.<ext>` 本地文件 → **离线导出天然成立**
（§89/90，引擎只读本地文件，绝不回抓原网页）。

## 4. Asset 系统（§21-25）

**FACT**：资产文件名 = sha256 hex → 内容寻址天然去重（§22 满足：同图多章只存一份）；
丢失/损坏文件 → 收集 warning、从 XHTML 摘除 img、继续导出（§23）。下载防护直接继承
M1 limits + M4 fetchUrl SSRF 策略（仅 Web→EPUB 路径涉及网络；已入库导出零网络）。

## 5. Annotation / ReaderLocation（§35-38/§73）

**FACT**：annotations.jsonl 的 quoted_text/note/created_at 即导出所需全部内容；
按"已保存内容"导出（不重解析、不渲染器重选），原文件字节不动（§58/不变量）。
ReaderLocation 体系零接触。Bookmark 默认不导出（§72）。

## 6. Aurora / 现有 Web→EPUB（§77）

**FACT**：仓库无任何 Aurora 命名或 Web→EPUB 实现（grep 全库）——不制造品牌化命名，
核心资产 = Export Pipeline。

## 7. 第三方库（§113）

**FACT**：零新增。zip = 自研 STORE writer（M5）；HTML 解析 = 既有 jsdom + M2 block
模型（markdown-reader blocks 已含 strong/em/code/a/img segments——导出渲染器按 block
模型走，不碰原始 HTML）；验证 = M6 容器解析器。无 validator runtime（§33 允许，
记录为"外部 epubcheck 未接入"限制）。

## 8. 重复系统风险（§123.3）

- 第二套 HTML sanitizer：**不复刻**——入库文章已是净化后 markdown；markdown→XHTML
  渲染器只输出白名单标签，属性全转义。
- 第二套 URL resolver：导出只面对 `assets/...` 本地相对引用 + http(s) 外链白名单，
  不需要通用 resolver（§50 记录差异与理由）。
- 五套 Exporter（§75）：**单一管线**——新引擎成为唯一活跃 EPUB 管线；M5 旧函数保留
  为 deprecated（其单测继续守护基础行为），main.js 调用方全部迁移。

## 9. Existing / Missing / Duplicate / Reusable / Risk

- Existing：zip-writer、OPF/nav 形状、deterministic id 思路、validate 骨架、runCapture、
  assets 内容寻址、annotations 存储。
- Missing：富文本 XHTML 渲染（strong/em/a/img）、多文档合并/书装帧、Highlights 附录、
  原子写、深度验证（M6 回读）、ExportRequest/Result 模型、批量选择 UI。
- Duplicate：无（审计确认）。
- Reusable：上表全部。
- Risk：大文档内存（makeZip files[] 全内存）——记录限制：单次导出内容量级 MB，
  超大语料（100+ 篇带图）实测观察；不为此重写流式 zip（§82 记录理由）。

## 10. M9 最小可行路径（§130.10）

1. Export 域模型 + 富 block→XHTML 渲染器 + 多文档 builder（纯函数，全测）。
2. Coordinator：从库文件收集 → build → zip → validate（字符串 + M6 回读）→ 原子写 →
   结构化 ExportResult/报告。
3. main.js EPUB 分支迁移到新引擎 + IPC `export:epub`（merge/separate）+ 库视图
   "导出当前视图为 EPUB" + 阅读器"导出 EPUB"按钮走新引擎。
4. Web→EPUB = runCapture 复用 + 导出（本地服务器 fixture 测试 + 离线导出测试）。
5. 回归（M1-M8）+ 确定性/不可变/index 删除测试 + 文档。
