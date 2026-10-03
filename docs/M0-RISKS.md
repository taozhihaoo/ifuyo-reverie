# M0 Risk Inventory — ifuyo Reverie

> M0 的九类核心风险清单。每项包含：风险描述、验证方式、验证状态。
> 状态取值：`PENDING` → `IN PROGRESS` → `VERIFIED` / `VERIFIED-WITH-RISKS` / `BLOCKED`。

---

## R1 Web Extraction

**风险**：不同网站正文提取质量差异巨大；接入提取库 ≠ 问题解决。

**验证方式**：建立 Extraction Test Harness + 可扩展 Corpus（合成语料为主，真实网页仅本地人工测试，不提交版权内容）。对每类语料做结构化断言（title / author / date / canonical / body / images / links / code / tables）。

**检查覆盖**：blog、news、documentation、GitHub、forum、newsletter、technical article、long article、image-heavy、table-heavy、code-heavy、malformed HTML、minimal HTML。

**状态**：`VERIFIED-WITH-RISKS`

---

## R2 Annotation

**风险**：Highlight 若只依赖 DOM offset / 字符 offset，重开、重新提取、内容变化后失效；失败被静默删除。

**验证方式**：实现 GenericTextAnchor（quote + prefix + suffix + position）与 Resolver；测试链路：
Create → Store Anchor → Close → Reopen → Resolve → Restore；
文档轻微变化后重定位；无法定位时标记 orphaned 且绝不删除。

**状态**：`VERIFIED`

---

## R3 EPUB

**风险**：候选阅读引擎（foliate-js）能否支持 Open / TOC / Chapter / Select / Highlight / Bookmark / Progress / Search，尤其是 **Highlight Anchor Persistence**。

**验证方式**：
1. Node + jsdom：epubcfi Range→CFI→Range round-trip。
2. 浏览器自测页：Open → TOC → Select → Highlight → Store Anchor → Reopen → Restore。

**状态**：`VERIFIED`

---

## R4 PDF

**风险**：PDF 技术路线（PDF.js）是否成立；Text Layer 与视觉文本一致性；Highlight 定位；大文件性能。

**验证方式**：Node 侧验证 Open / 页模型 / 文本提取 / 跨页搜索；合成文本 PDF、多栏 PDF、100 页长 PDF、扫描 PDF 四类样本；扫描件记录 `OCR = Not Supported in M0`。

**状态**：`VERIFIED-WITH-RISKS`

---

## R5 Browser Extension

**风险**：浏览器能否可靠地向 Reverie 提交 Capture Job（Native Messaging 在 Windows 的安装、manifest、通信、路径、权限）。

**验证方式**：最小 MV3 扩展 + Node Native Host；长度前缀 JSON 协议 standalone 自动化测试；注册脚本与文档；真浏览器 E2E 视环境执行或记为 OPEN QUESTION。

**状态**：`VERIFIED-WITH-RISKS`

---

## R6 File Format

**风险**：文件原生设计是否足以支撑 Article / Metadata / Source / Assets / Highlight / Note / Bookmark / Progress 的全部未来需求。

**验证方式**：FORMAT.md v1 + core 实现（meta.json / annotations.jsonl / article.md / source / assets），全部 round-trip 测试 + 损坏行容错测试 + 原子写入测试。

**状态**：`VERIFIED`

---

## R7 Search

**风险**：资料结构是否适合在不修改原始资料的前提下建立搜索索引（Title / Body / Author / Note / Highlight / Tags / URL）。

**验证方式**：M0 不做正式搜索；由 Index Recovery PoC 证明「从文件重建索引数据」可行，结构不阻碍 M3。

**状态**：`VERIFIED`

---

## R8 Security

**风险**：外部内容（HTML / EPUB / PDF / ZIP / URL / Native Messaging 消息）是不可信输入，任何一处处理不当即是漏洞。

**验证方式**：SECURITY.md 威胁模型 + 自动化测试：HTML sanitize（script/事件/javascript: 剥离）、URL scheme 过滤、ZIP Zip-Slip / 超大条目防护、Native Messaging 消息大小与契约校验。

**状态**：`VERIFIED`

---

## R9 Index Recovery

**风险**：SQLite（索引/缓存）损坏或删除后，用户数据能否完整恢复；重建过程不得覆盖源文件。

**验证方式**：Delete Index → Read Source Files → Rebuild PoC；断言源文件 byte 级未变、重建结果一致。

**状态**：`VERIFIED`
