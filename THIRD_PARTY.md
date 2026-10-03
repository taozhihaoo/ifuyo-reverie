# THIRD_PARTY.md — 依赖与许可证审计

> M0 依赖审计（提示词 §30）。所有许可证信息均于 2026-10-04 通过
> `npm view <pkg> version license`（npm registry 元数据）核验，未依赖记忆。
> 引入任何新依赖前必须更新本表并复检（AI 纪律 §30.4）。

## 运行时依赖

| 依赖 | 版本 | 许可证 | 来源 | 用途 | 分发考量 |
| --- | --- | --- | --- | --- | --- |
| @mozilla/readability | 0.6.0 | Apache-2.0 | npm | 网页正文提取 | Apache-2.0 允许闭源分发；保留 NOTICE |
| foliate-js | 1.0.1 | MIT | npm | EPUB 引擎（阅读/CFI/分页） | MIT 允许闭源分发；保留版权声明 |
| pdfjs-dist | 6.4.299 | Apache-2.0 | npm | PDF 解析/渲染/文本层 | Apache-2.0 允许闭源分发；保留 NOTICE |
| dompurify | 3.4.16 | MPL-2.0 OR Apache-2.0 | npm | HTML 消毒 | 双许可，可选 Apache-2.0；保留声明 |

## 测试/开发依赖（不随应用分发）

| 依赖 | 版本 | 许可证 | 来源 | 用途 |
| --- | --- | --- | --- | --- |
| jsdom | 30.1.1 | MIT | npm | Node 侧 DOM（提取/EPUB CFI/消毒测试） |
| pdf-lib | 1.17.1 | MIT | npm | 生成合成 PDF fixtures（dev-only） |

## 传递依赖（直接影响分发物）

| 依赖 | 版本 | 许可证 | 说明 |
| --- | --- | --- | --- |
| construct-style-sheets-polyfill | 3.1.0 | MIT | foliate-js 唯一 npm 依赖 |

## foliate-js 内置 vendor 模块（随 foliate-js 一起分发）

| 模块 | 上游 | 许可证 | 说明 |
| --- | --- | --- | --- |
| vendor/zip.js | @zip.js/zip.js（上游 2.23.0 = BSD-3-Clause，npm registry 核验） | BSD-3-Clause（上游） | 压缩产物，含 fflate 原理代码；跟随 foliate-js 分发 |
| vendor/fflate.js | fflate | MIT（文件头声明） | 压缩产物 |

## 运行环境

| 组件 | 许可证 | 说明 |
| --- | --- | --- |
| Node.js | MIT | 开发与 Host 运行时；M11 将把 Host 打包为独立可执行 |
| 浏览器（Chromium/WebView，M1 定型） | 各自许可 | 桌面壳选型时补充审计 |

## 未来依赖预核验清单（未引入，仅记录计划）

| 候选 | 用途 | 待核验项 |
| --- | --- | --- |
| 桌面壳（Electron 等） | M1 桌面化 | 许可证、体积、更新机制、Chromium 版本策略 |
| SQLite 驱动（如 better-sqlite3） | M3 索引 | 许可证（MIT+Public Domain 部分）、native 二进制分发 |
| RSS 解析器 | M4 | 许可证、维护状态、XML 实体处理 |
| TTS | M8 | 仅 Windows 系统语音（无第三方模型/许可证负担） |

## 明确声明

- Reverie 不打包、不分发任何第三方受版权保护的网页内容、电子书或字体文件；
  测试语料全部为本仓库自写的合成内容（`tests/extraction/corpus/`、`tests/fixtures/`）。
- 本文件记录「当前事实」；未来商业化分发前须重新做一轮完整审计（提示词 §31 的定位）。
