# Final Architecture — ifuyo Reverie 1.0

## 栈

Electron 44（Chromium/Node 内置，sandboxed renderer + contextIsolation + CSP
`default-src 'none'`）· Node 24 · 纯 JS 依赖（pdfjs-dist 唯一运行时第三方库）。
Windows x64；TTS = 系统 SAPI；无原生 DLL、无外部服务。

## 数据模型（不变量）

```
用户库（用户自选目录，全相对路径，整库可复制）
├── articles/<year>/<id>/  article.md + meta.json + annotations.jsonl + assets/ + source/
├── books/<id>/            book.epub（字节不可变）+ meta/annotations
├── pdf/<id>/              document.pdf（字节不可变）+ meta/annotations
├── feeds.json / user-state.json   （订阅与用户状态 = 用户资料）
└── .recovery/             修复日志/备份/隔离区（Doctor）

REVERIE_HOME（%LOCALAPPDATA%/Reverie，派生）
├── index.json             库索引（可重建）
├── search-index.json      搜索索引（可重建）
├── app-settings.json      应用设置（库位置/窗口状态）
└── logs/ queue/           有界日志 / 采集队列
```

文件是真相；一切派生数据可删除后由扫描重建。版本守卫：未来格式文件只读保护、
拒绝降级覆写。

## Reader Shell + Adapter

统一 Shell（app/renderer/app.js）+ 三 Adapter：
- Web Article：markdown blocks → 富 DOM（M2 canonical 契约）
- EPUB：章节流（DOMPurify XHTML innerHTML，M6）
- PDF：pdf.js canvas 懒渲染 + TextLayer 文本层（M7，与主进程 canonical 字节一致）

跨格式共享：ReaderAnchor 偏移映射（高亮/搜索跳转/TTS 段定位）、CSS Custom
Highlights、TTS Provider（Web Speech）、书签/进度（reader-location，各格式自有
identity：offset / chapter_index / page_index）。

## 导出

单一 EPUB 管线（M9 builder/service）：M2 blocks → 富 XHTML，内容寻址资产去重，
确定性 identifier，M6 回读验证，原子写。另有 Markdown/Metadata/Highlights 导出。
导入：Pocket/Wallabag/Raindrop（幂等 + provenance）。

## 恢复

Doctor v2：11 项文件系统优先检查 → findings（severity/repairability）→ safe
repair（预览→备份→执行→重扫，幂等）→ 结构化日志/报告。原子写全覆盖；
staging 崩溃恢复；未来版本只读保护。

## 产品化

Portable 打包（零网络，checksums+manifest）/ NSIS（配置就绪）；单实例 + 文件
参数；有界日志 + 崩溃钩子；`npm run doctor / package:portable` + 6 个真机 smoke。

## 测试与验证资产

309 Node 测试（unit/integration/fault-injection/portability）+ 7 个真机 CDP 冒烟
（pdf/tts/epub/doctor/release/journey + 隐含回归）。全部离线可重复。
