# M0 Status — ifuyo Reverie

> M0 — Foundation & Risk Spikes 的工作文档。
> 记录仓库现状、架构边界、Spike 结论。所有结论按 FACT / HYPOTHESIS / INFERENCE / UNKNOWN 标记。
> **纪律：禁止把未经验证的能力写成 FACT。Spike 完成后回填结论。**

---

## 1. Project Overview

- **产品**：ifuyo Reverie — Windows 优先、本地优先、文件原生的个人阅读档案系统。
- **核心闭环**：发现 → 保存 → 阅读 → 划线 → 记录 → 归档 → 搜索 → 再次阅读。
- **当前阶段**：M0。目标是在大规模开发前验证九大风险（见 [M0-RISKS.md](M0-RISKS.md)），不追求产品 UI。

## 2. Current Repository Structure

**FACT**：本仓库在 M0 启动时是一个空白仓库（无 commit、无代码、无依赖、无 CI、无测试）。
仅有 `Spec/`（总纲领 + M0～M12 开发提示词，中文）与 `.zcodeignore`。

**FACT**：M0 期间建立如下结构：

```text
/
├─ docs/                 M0 文档（本文件、RISKS、FORMAT、SECURITY）
├─ src/
│  ├─ core/              ID、原子写入、Document 元数据模型
│  ├─ annotation/        Annotation 模型、Text Anchor、Resolver
│  ├─ capture/           Capture 消息契约、Native Messaging Host
│  ├─ extraction/        正文提取封装（Readability）
│  ├─ library/           Library 扫描 / 索引重建 PoC
│  └─ security/          HTML sanitize、URL scheme 过滤、ZIP 解压防护
├─ spikes/               各风险 Spike（extraction / epub / pdf / recovery）
├─ extension/            最小浏览器扩展（MV3）
├─ native-host/          Native Messaging 注册清单与安装脚本
└─ tests/                node:test 测试 + extraction corpus
```

## 3. Current Runtime

**FACT**：开发环境为 Windows 10.0.26200 x64，Git Bash，Node.js v24.19.0，npm 11.17.0，git 2.55.0。

**FACT**：npm registry 可达（`npm ping` PONG，2026-10-04）。

**DECISION（基于事实的选型）**：
M0 及后续桌面端候选路线采用 **Web 技术栈（Node.js + Chromium 系运行时）**，理由：

1. 正文提取（Mozilla Readability）、EPUB 引擎（foliate-js）、PDF 引擎（PDF.js）三者都是 Web/JS 生态的一线成熟方案，同栈可直接复用。
2. 阅读器需要完整浏览器级渲染能力（CSS、选择、Range）。
3. Native Messaging Host 可以是任何可执行程序，Node 运行时可行。

Electron 作为具体壳方案是 **HYPOTHESIS**（M0 不集成完整桌面壳，待 M1 决策）；M0 的 Spike 全部在 Node + 浏览器层独立验证，不被壳方案绑死。

## 4. Current Dependencies

**FACT**（均经 `npm view` 核验版本与许可证，详见 [THIRD_PARTY.md](../THIRD_PARTY.md)）：

| 依赖 | 版本 | 许可证 | 用途 | 类型 |
| --- | --- | --- | --- | --- |
| @mozilla/readability | 0.6.0 | Apache-2.0 | 正文提取 | runtime |
| foliate-js | 1.0.1 | MIT | EPUB 引擎候选 | runtime |
| pdfjs-dist | 6.4.299 | Apache-2.0 | PDF 引擎候选 | runtime |
| jsdom | 30.1.1 | MIT | Node 侧 DOM（提取/解析测试） | dev/runtime(测试) |
| dompurify | 3.4.16 | MPL-2.0 OR Apache-2.0 | HTML 消毒 | runtime |
| pdf-lib | 1.17.1 | MIT | 生成合成 PDF 测试文件 | dev-only |

## 5. Existing Architecture（M0 建立的边界）

**DECISION**：M0 明确以下模块边界与依赖方向（只建立边界，不预建空模块）：

```text
App（桌面壳 / UI）          ← 不依赖具体 Reader Engine 内部 API
  ↓
Reader Shell ── Reader Adapter（Web / EPUB / PDF / Markdown）
  ↓                         ↓
Annotation Core      Shared Reader Services（Progress / Search / Bookmark）
  ↓
Library（文件原生层，Source of Truth）
  ↓
Infrastructure（索引 / 缓存 / 原子写入 / 日志）
```

规则：

- `Reader Adapter` 之外的代码禁止直接 import `foliate-js` / `pdfjs-dist` 的内部对象。
- `SQLite（未来）= Index / Cache / Derived State`，可删除可重建；用户资料只在文件里。
- Capture（扩展 → Native Host → 队列）与 Reader 解耦，通过消息契约通信。

## 6. Existing Tests

**FACT**：M0 启动时无任何测试。M0 建立 `node:test`（Node 内置 runner，零测试框架依赖）测试体系，
覆盖：文件格式 round-trip、Annotation/Anchor、正文提取评估、Native Host 协议、安全边界、索引重建。

## 7. Known Risks / Unknowns

见 [M0-RISKS.md](M0-RISKS.md)（随 Spike 推进更新验证状态）。

## 8. M0 Work Plan

| # | 任务 | 状态 |
| --- | --- | --- |
| 1 | Repository Reconnaissance + 现状文档 | ✅ |
| 2 | Risk Inventory（R1–R8） | ✅ |
| 3 | FORMAT.md + core（ID / 原子写入 / Document 模型） | ⏳ |
| 4 | Extraction Spike（harness + corpus + 评估） | ⏳ |
| 5 | Annotation Spike（Anchor round-trip + orphan） | ⏳ |
| 6 | Index Recovery PoC | ⏳ |
| 7 | EPUB Spike（fixtures + CFI round-trip + 浏览器页面） | ⏳ |
| 8 | PDF Spike（文本层 / 搜索 / 扫描件） | ⏳ |
| 9 | Native Messaging Spike（协议 + host + 扩展） | ⏳ |
| 10 | Security Baseline（SECURITY.md + 测试） | ⏳ |
| 11 | THIRD_PARTY.md + 最终报告 | ⏳ |

## 9. Spike 结论

待各 Spike 完成后回填：

- **Web Extraction**：⏳
- **Annotation Anchor**：⏳
- **EPUB**：⏳
- **PDF**：⏳
- **Native Messaging**：⏳
- **Index Recovery**：⏳
