# ifuyo Reverie 1.0 — 最终审计（M12 Final Audit）

> 2026-10-05 · Reverie 1.0.0 · commit 031ad63 · windows-x64 · unsigned
> 证据：309/309 测试 + 6 个真机冒烟全过 + 1.0 RC 打包产物验证。

## Gate A — Build ✅

`npm run package:portable` → `Reverie-1.0.0-portable-win-x64.zip`（185MB，SHA-256 已
记录）；smoke-release 在打包产物内 8/8（脱离源码树/开发依赖）。NSIS Setup 配置就绪
（electron-builder.yml，需联网生成）。不依赖 IDE/SDK/开发机路径。

## Gate B — Data ✅

库 = 用户自选目录（articles/books/pdf + meta/annotations/feeds/user-state）；
应用运行时 = REVERIE_HOME。整库复制 → 新路径/新 REVERIE_HOME → 一切可用
（smoke-journey Day-2 + M10 可移植测试）。不变量 §38 全部由测试锁定。

## Gate C — Reader ✅

Web（M1 队列管线）✅ · RSS（M4）✅ · EPUB（M6）✅ · PDF（M7）✅。
Markdown/TXT：Reader 未实现，记录为 Post-1.0（导入/搜索/导出层已就绪）。
journey 覆盖：打开/渲染/滚动/进度恢复/TTS/搜索。

## Gate D — Annotation ✅

Highlight/Note/Bookmark 三类全格式可用；关闭重开恢复；搜索集成；EPUB 导出附录；
定位失败 → orphaned 不删除；M10 记录级修复。

## Gate E — Search ✅

后端 total 断言 + UI 卡片渲染（journey）；删除索引后重建恢复（M10）；1,000 篇
p95=3ms 基线（PERF.md）。

## Gate F — TTS ✅

中文朗读/语速/段级暂停/选区朗读/位置跟随；引擎差异在 Provider 层吸收
（smoke-tts 7/7）。

## Gate G — Recovery ✅

SQLite 丢失/损坏 → 自动重建；写入中断 → 原子写+tmp 清扫；标注坏行 → 记录级修复；
未来版本 → 只读保护；staging 崩溃残留 → 恢复/隔离（smoke-doctor 10/10）。

## Gate H — Windows ✅

Portable（基线）/NSIS（就绪）；单实例；文件参数打开；窗口状态持久化+可见屏校验；
有界日志；卸载不碰用户库。

## Gate I — Security ✅

M0–M10 全部安全测试回归通过（路径逃逸/ZIP 炸弹/XXE/SSRF/脚本执行/恶意输入）；
无已知 P0 安全问题；未签名的 SmartScreen 提示如实记录。

## Gate J — Real Use ✅

smoke-journey 11/11（真实 Electron 应用完整用户旅程，见 docs/M12-SELF-USE-LOG.md）。

## 验收矩阵（§143 按真实实现）

| 场景 | Source | 索引 | Doctor | Repair | Recovery |
|---|---|---|---|---|---|
| 索引缺失/损坏 | Safe | 自动重建 | Pass | Yes | Yes |
| meta/标注损坏 | Safe | 部分降级 | Detect | Conditional（备份+隔离） | Yes |
| 缺失源文件 | Missing | 陈旧标记 | Detect | 不伪造 | Partial |
| 写入/导出/采集中断 | Safe | tmp 清扫 | Detect | Yes | Yes |
| feed 刷新新文章 | Safe | 库+搜索双重建（M12 修复） | Pass | — | Yes |
| 外部修改 | 用户所有 | 刷新吸收 | Detect | Reindex | Yes |
| 未来版本 | 只读保护 | 拒绝写 | error | 手动（升级） | Safe Reject |
| 库移动/复制 | Safe | 重建 | Pass | Reindex | Yes |

## 二十五个问题的最终回答（§40）

1. 状态：**Reverie 1.0.0 RC，READY**。2. M0–M12 全部完成（详见 docs/PROGRESS.md）。
3. 格式：Web/RSS/EPUB/PDF（Markdown/TXT 数据层就绪、Reader 待 Post-1.0）。
4. Reader：统一 Shell + 三 Adapter（Web blocks/EPUB 章节/PDF 页），canonical 偏移
   跨格式统一。5. Annotation：M2 text-quote + 三种 reader-location，orphan 不删除。
6. Search：子串索引、字段优先级、可重建。7. RSS：手写解析器、SSRF 防线、
   M12 修复库索引重建 + 订阅 UI。8. Import/Export：Pocket/Wallabag/Raindrop 导入；
   Markdown/EPUB/Metadata/Highlights 导出；幂等+provenance。9. TTS：Web Speech
   本地合成。10. Library：文件原生、全相对路径。11. 索引：JSON 派生、可重建、
   损坏自动恢复。12. Recovery/Doctor：11 项检查 + 分级修复 + 备份/隔离/日志。
13. Windows：单实例/文件参数/窗口状态/库位置选择/有界日志/崩溃钩子。
14. Installer：Portable 基线 + NSIS 配置就绪。15. 升级/卸载/重装：覆盖安装 +
   数据保留语义（NSIS deleteAppDataOnDelete:false）。16. 备份/恢复/迁移：整库复制
   即备份，跨机验证。17. Security：无已知 P0。18. 依赖：Electron+pdfjs-dist
   （MIT/Apache-2.0），许可随包分发。19. Performance：1,000 篇扫描+重建 1.1s、
   搜索 p95=3ms。20. Real Self-Use：journey 11/11（见 SELF-USE-LOG）。
21. Known Issues：见 POST-1.0.md。22. P0=0；P1=0。
23. Post-1.0 Backlog：见 POST-1.0.md。24. **满足 1.0 Acceptance Gate（A–J 全过）**。
25. 最终建议：**可进入日常自用（Self-Use），启动 Post-1.0 反馈循环。**
