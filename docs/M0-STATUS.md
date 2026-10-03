# M0 Status — ifuyo Reverie

> M0 — Foundation & Risk Spikes 的工作文档与**最终报告**。
> 所有结论按 FACT / HYPOTHESIS / INFERENCE / UNKNOWN 标记。

---

## 1. Project Overview

- **产品**：ifuyo Reverie — Windows 优先、本地优先、文件原生的个人阅读档案系统。
- **核心闭环**：发现 → 保存 → 阅读 → 划线 → 记录 → 归档 → 搜索 → 再次阅读。
- **当前阶段**：M0 ✅ 已完成（见 §16 Final Report）。

## 2. Repository Structure

**FACT**：本仓库在 M0 启动时是一个空白仓库（无 commit、无代码、无依赖、无 CI、无测试），仅有 `Spec/` 与 `.zcodeignore`。

**FACT**：M0 建立了如下结构：

```text
/
├─ docs/                 M0 文档（本文件、RISKS、FORMAT、SECURITY）
├─ src/
│  ├─ core/              UUID、原子写入（tmp→fsync→rename）、meta.json 模型
│  ├─ annotation/        Annotation 模型、TextQuote Anchor、Resolver、jsonl store
│  ├─ capture/           Capture 消息契约（v1）、Native Messaging Host
│  ├─ extraction/        Readability 封装 + 结构化评估器
│  ├─ library/           Library 扫描器（只读，索引重建 PoC）
│  └─ security/          HTML 消毒、URL scheme 白名单、ZIP 防护
├─ spikes/               extraction / epub / pdf / recovery + 静态服务器
├─ extension/            最小 MV3 扩展（固定 key，ID 固定）
├─ native-host/          注册清单模板 + register/unregister 脚本 + 启动器
└─ tests/                node:test 测试（68 例）+ 15 类提取语料 + EPUB/PDF fixtures
```

## 3. Runtime

**FACT**：Windows 10.0.26200 x64，Git Bash，Node.js v24.19.0，npm 11.17.0，git 2.55.0；npm registry 可达（2026-10-04）。

**DECISION**：技术路线采用 Web 技术栈（Node + Chromium 系运行时）。理由：
1. 三个高风险点的一线成熟方案（Mozilla Readability、foliate-js、PDF.js）都是 Web/JS 生态，同栈复用；
2. 阅读器需要完整浏览器渲染能力（CSS/选择/Range）；
3. Native Messaging Host 与运行时无关，Node 可行。

**HYPOTHESIS**：Electron 作为桌面壳（M1 决策）——M0 的所有验证都不依赖具体壳。

## 4. Dependencies

**FACT**（详见 [THIRD_PARTY.md](../THIRD_PARTY.md)，全部经 npm registry 元数据核验）：

| 依赖 | 版本 | 许可证 | 用途 |
| --- | --- | --- | --- |
| @mozilla/readability | 0.6.0 | Apache-2.0 | 正文提取 |
| foliate-js | 1.0.1 | MIT | EPUB 引擎候选 |
| pdfjs-dist | 6.4.299 | Apache-2.0 | PDF 引擎候选 |
| jsdom | 30.1.1 | MIT | Node 侧 DOM |
| dompurify | 3.4.16 | MPL-2.0 OR Apache-2.0 | HTML 消毒 |
| pdf-lib | 1.17.1 | MIT | 生成 PDF fixtures（dev-only） |

无 copyleft 运行时依赖。

## 5. Architecture（M0 建立的边界）

**DECISION**：边界与依赖方向固定：

```text
App（桌面壳 / UI）          ← 禁止依赖具体 Reader Engine 内部 API
  ↓
Reader Shell ── Reader Adapter（Web / EPUB / PDF / Markdown）
  ↓                         ↓
Annotation Core      Shared Reader Services（Progress / Search / Bookmark）
  ↓
Library（文件原生层，Source of Truth）
  ↓
Infrastructure（索引 / 缓存 / 原子写入 / 日志）
```

- **FACT**：foliate-js / pdfjs-dist 目前只出现在 `spikes/`（将来的 Reader Adapter 层），核心模块零依赖它们。
- **FACT**：SQLite 在 M0 完全不存在；索引 PoC 用 JSON 文件演示，边界不变（删除→重建一致）。

## 6. Tests

**FACT**：`npm test`（node:test，零测试框架依赖）— **68 例全部通过**（约 1.2s）。
覆盖：原子写入、meta round-trip、Annotation/Anchor round-trip + orphan、提取语料 15 类、EPUB 容器 + CFI、PDF 四类样本、Native Host 协议（真实进程 spawn）、安全全部拒绝路径、索引重建。

## 7. Spike 结论

| Spike | 结论 | 证据 |
| --- | --- | --- |
| Web Extraction | ✅ 成立 | 15 类语料 107/108 硬检查通过 + 1 个根因明确的 XFAIL（见 §10） |
| Annotation Anchor | ✅ 成立 | 同文档 round-trip / 变化重定位 / 空白损伤 / orphan 保留全部有测试 |
| EPUB (foliate-js) | ✅ 成立 | Node 容器解析 5/5 + CFI round-trip；**真浏览器**全流程自测 PASS（CFI 逐字符一致） |
| PDF (PDF.js) | ✅ 成立 | 四类样本全过：解析/文本层/坐标/跨页搜索（100 页 50ms）/扫描件零文本不报错 |
| Native Messaging | ✅ Host 成立；浏览器 E2E 为 OPEN QUESTION | 真实进程协议测试 7 例；注册脚本已备 |
| Index Recovery | ✅ 成立 | 删索引→重建指纹一致；源文件 byte 级不变（测试断言） |
| Security | ✅ 边界确立 | SECURITY.md 威胁模型 + 15 例安全测试（消毒/scheme/zip-slip/炸弹） |
| File Format | ✅ v1 定稿 | FORMAT.md + round-trip/损坏容错/原子写入测试 |

## 8. M0 Work Plan（完成状态）

| # | 任务 | 状态 |
| --- | --- | --- |
| 1 | Repository Reconnaissance + 现状文档 | ✅ |
| 2 | Risk Inventory（R1–R9） | ✅ |
| 3 | FORMAT.md + core | ✅ |
| 4 | Extraction Spike | ✅ |
| 5 | Annotation Spike | ✅ |
| 6 | Index Recovery PoC | ✅ |
| 7 | EPUB Spike | ✅ |
| 8 | PDF Spike | ✅ |
| 9 | Native Messaging Spike | ✅ |
| 10 | Security Baseline | ✅ |
| 11 | THIRD_PARTY.md + 最终报告 | ✅ |

## 10. Web Extraction 详细结果

- **FACT**：`isProbablyReaderable` 只是 UI 提示（长度敏感，<500 字符即拒绝），不能做提取开关；改为始终 `parse()` + `minTextLength≥40` 启发式后，15 类语料 13 类全过、1 类正确拒绝（nav-only 壳页不再被当正文归档）、1 类 XFAIL。
- **XFAIL（根因已定位）**：malformed HTML —— 未闭合的 `<h1>` 按 HTML5 解析规则吞掉后续全部段落，Readability 找不到候选。已有 xfail 协议跟踪：若提取能力改善导致 XFAIL 变 XPASS，测试会失败提示升级 fixture。
- **LIMITATION（量化记录）**：newsletter（table 布局邮件）主文提取成功，但灰色侧栏框内容丢失（`known_loss_contains` 跟踪）。
- **INFERENCE**：真实网页的主要失败模式预期与合成语料一致（模板噪声、懒加载、无限滚动需浏览器渲染——后者属 M1 Capture 决策范围）。

## 11. Annotation 详细结果

- **FACT**：Anchor 模型 `{quote, prefix, suffix, position}`（FORMAT.md §5）。
- **FACT**：同文档 round-trip（DOM Range 边界完全一致）、跨节点选择、文档变化后按 quote+context 重定位、空白弹性匹配、歧义消解（prefix 评分）全部通过自动化测试。
- **FACT**：quote 消失 → `status: orphaned`，保留不删（回归测试）。
- **FACT**：annotations.jsonl 坏行跳过并报告，文件不被读者重写。

## 12. EPUB 详细结果

- **FACT**：foliate-js@1.0.1（MIT）容器/OPF/NCX/NAV 解析在 Node（jsdom DOM globals + 其自带 vendor zip.js）下 5/5 fixtures 全开：元数据、章节数、TOC 标签、章节内容全部正确。
- **FACT**：epubcfi Range→CFI→Range round-trip 通过（含跨段落 Range）；内容编辑后旧 CFI 指向错误位置 → 证明 quote+context 兜底是必需设计（FORMAT.md 已如此规定）。
- **FACT**：**真浏览器（ZCode 内嵌 Chromium）全流程自测 PASS**：
  Open multi-chapter.epub → TOC 5 项 → 程序化选择「阅读是一种把时间变成自己的方式」→ `draw-annotation` 高亮绘制 → CFI `epubcfi(/6/2!/4/4,/1:4,/1:19)` 持久化 → reload → 重新打开 → `addAnnotation` 恢复高亮 → `goTo(cfi)` → 从活 DOM 重建 CFI **与原值逐字符一致**。
- **FACT（集成注意事项）**：paginator 不自动渲染（需显式 goToFraction）；View 持有 closed shadow root，`renderer.getContents()` 是公开访问面；标注事件名为 `draw-annotation`。
- **HYPOTHESIS**：paginator 渲染质量的阅读体验（行宽/翻页动画/主题）待 M6 评估。

## 13. PDF 详细结果

- **FACT**：pdfjs-dist 在 Node 下：文本 PDF 5 页解析、文本层 2047 字符、24 个带坐标 item、跨页搜索全 5 页命中；100 页文档打开 5ms、随机页访问 2ms、全文档搜索 50ms。
- **FACT**：双栏 PDF 文本层完整，栏 x 坐标可区分；**item 顺序 = 内容流顺序而非视觉阅读顺序**（搜索无影响；连续朗读/导出顺序是 M7 已知风险）。
- **FACT**：扫描 PDF（纯图形）零文本项、不报错 —— `OCR = Not Supported in M0`。
- **FACT**：文本 item 在词边界任意切分，朴素拼接会断词 —— 搜索需空白归一化（已实现）。
- **HYPOTHESIS**：canvas 渲染与 Text Layer 的视觉对齐（PDF.js 标准用法）待 M7 在浏览器内验证。

## 14. Native Messaging 详细结果

- **FACT**：Host 协议（4 字节 LE 长度 + UTF-8 JSON）真实进程测试通过：合法请求→入库→accepted；`bad_url`（javascript: 拒绝）；`version_mismatch`；畸形 JSON 后继续服务；1MB 超限退出码 3；无 origin / 未知扩展 origin 退出码 2。
- **FACT**：队列落盘为 JSONL（`native-host/data/`，gitignored），原子 append。
- **FACT**：扩展端（MV3，固定 key → ID `ngfmioeinapcphpbgboaajachhhdgajg`）+ Chrome/Edge HKCU 注册脚本（绝对路径自动物化）已就绪。
- **OPEN QUESTION**：真浏览器端到端（加载 unpacked 扩展 → 点击 → 队列出现任务）需在用户浏览器注册（写注册表），M0 未执行；脚本与步骤已写入 register.ps1 输出。

## 15. 数据 / 恢复 / 格式

- **FACT**：FORMAT.md v1 定稿：Library 布局、meta.json（format_version=1，未知字段保留，更高版本显式拒绝）、annotations.jsonl（坏行容错）、locator 多重定位规则、原子写入、索引=派生数据。
- **FACT**：删除索引 → 重扫 → 指纹一致；重建前后 Library **byte 级不变**；坏文档不拖垮整体扫描（测试断言）。

## 16. Final Report

### 1. Repository State
空白仓库 → 完整 M0 代码库：6 个边界模块、4 组 Spike、扩展 + Host、68 例测试、4 篇文档、THIRD_PARTY.md；11 笔逻辑提交。

### 2. Architecture
App → Reader Shell → Adapter → Engine 隔离；Annotation Core 独立于格式；Library 文件层唯一真相；基础设施可删可重建。Engine 库未泄漏进核心。

### 3. Technical Spikes

| Spike | 结果 |
| --- | --- |
| Web Extraction | 15 类语料：13 类全过、1 类正确拒绝、1 类 XFAIL（未闭合 h1 吞正文，根因明确）；newsletter 侧栏丢失量化记录 |
| Annotation | 同文档/跨节点 round-trip、变化重定位、空白损伤、歧义消解、orphan 保留 — 全部自动化测试覆盖 |
| EPUB | foliate-js 成立：Node 容器解析 + CFI round-trip；真浏览器全流程 PASS（CFI 逐字符一致） |
| PDF | PDF.js 成立：解析/文本层/坐标/搜索（100 页 50ms）/扫描件零文本不报错；多栏顺序为 M7 已知风险 |
| Native Messaging | Host 协议 + 契约 + 来源固定 + 大小上限全部真实进程验证；浏览器端 E2E 脚本就绪待用户注册 |

### 4. Data Format
FORMAT.md v1（meta.json / annotations.jsonl / source 保留 / assets / locator / 原子写入 / 版本迁移）。原始内容与提取结果必须同时保存已定为格式规则。

### 5. Security
SECURITY.md：威胁模型（8 类输入）、消毒策略、URL 白名单、ZIP 防护、Native Messaging 来源固定 + 大小上限、日志隐私（不记正文/查询串/划线）、明确不做 DRM 绕过。15 例安全测试。

### 6. Dependencies / Licenses
6 个直接依赖 + 2 个传递/vendor 全部核验（Apache-2.0 / MIT / MPL-2.0 OR Apache-2.0 / BSD-3-Clause vendor），无 copyleft 运行时依赖；THIRD_PARTY.md 建档。

### 7. Tests
68 / 68 通过（node:test，~1.2s）。Round-trip（meta/annotation）、错误注入（坏 JSON/坏行/半帧/超限帧/坏文档）、恢复（索引重建）均有自动化。

### 8. Benchmarks
量级观察（非正式目标）：PDF 100 页解析 5ms、随机页 2ms、全文搜索 50ms；提取单页数十 ms 级；EPUB fixture 打开即时。正式 benchmark 按 M3/M10 计划在真实规模上做。

### 9. Risks
见 M0-RISKS.md 状态列。无 BLOCKER。

### 10. FACT / HYPOTHESIS / INFERENCE
各节已逐条标记；未知项以 OPEN QUESTION 显式列出，未混入 FACT。

### 11. Blockers
无。

### 12. Changes Made
见 git log（M0 系列提交，按 baseline/format/annotation/extraction/recovery/epub/pdf/native-messaging/security/final 划分）。

### 13. Known Limitations
- 浏览器端 Native Messaging E2E 未在本环境执行（需用户级注册表写入）；
- EPUB/PDF 渲染体验与主题未评估（M6/M7）；
- 提取语料为合成内容，真实网页仅可本地人工测试（版权约束，语料结构支持随时扩充）;
- PDF fixtures 文本层为英文（pdf-lib 标准字体无 CJK），CJK 文本层属 M7 验证项。

### 14. M1 Prerequisites
- 桌面壳选型确认（Electron 候选，HYPOTHESIS）；
- Capture Queue 持久化从 PoC 转正式（复用 protocol.js）；
- Library UI 骨架 + Reader Shell + 沙箱 iframe 渲染路径（SECURITY.md §12）;
- Extension 正式打包（ID 已固定）。

### 15. Final Verdict

**Ready for M1**（known risks 已记录，无 blocker）。
