# M12 Explore — Self-Use 1.0 状态冻结（Phase A）

> 2026-10-05。FACT 均来自当前仓库实测（309/309 测试 + 6 个真机冒烟）。

## 1. 基线

- 版本 0.1.0 → **1.0.0**（M12 起版本号独立于里程碑号，§21）。
- M0–M11 全部完成：309/309 测试；6 个真机冒烟（pdf 11 / tts 7 / epub 8 / doctor 10 /
  release 8 / journey 11）全部通过。
- 无未提交更改；M9+M10 的 6 笔提交已推送。

## 2. 功能完成矩阵（§7.1 冻结）

| 能力 | 状态 | 证据 |
|---|---|---|
| Web Capture（M1） | ✅ | 队列管线 + smoke-journey 采集 |
| Annotation（M2） | ✅ | 37+ 测试 + journey 高亮/笔记恢复 |
| Search/Library（M3） | ✅ | correctness 测试 + journey 搜索 |
| RSS（M4） | ✅ 解析/刷新/去重 | feed 测试 + journey 订阅刷新（**订阅 UI 为 M12 补齐**） |
| Import/Export/Daily Review（M5） | ✅ | 27 例 + journey 导出 |
| EPUB Reader（M6） | ✅ | reader 测试 + smoke-epub |
| PDF Reader（M7） | ✅ | reader 测试 + smoke-pdf |
| TTS（M8） | ✅ | 19 例 + smoke-tts |
| Advanced EPUB Export（M9） | ✅ | 17 例 + smoke-epub |
| Recovery/Doctor（M10） | ✅ | 10 例 + smoke-doctor |
| Windows Productization（M11） | ✅ | packaging + smoke-release |

## 3. 已确认的已知限制（1.0 不阻塞，POST-1.0 记录）

- Markdown/TXT Reader 未实现（入库/搜索/导出可用；阅读器待 Post-1.0）。
- PDF 扫描件无 OCR（明确提示）；表格不进 EPUB 导出。
- 未签名（SmartScreen 提示）；NSIS Setup 需联网生成（Portable 为基线交付）。
- TTS 引擎级 pause 不可靠 → 段级暂停（重读当前句）。
- 大库（10k+）与 24h 长跑未自动化压测（既有基线：1,000 篇 1.1s 全量重建）。

## 4. M12 发现并已修复

旅程测试（Batch 2）抓到 4 个真实缺陷（3 个 P1/P2 UI 缺陷 + 1 个 feed 刷新库索引
P1），全部修复并纳入 journey 回归：详见 docs/M12-SELF-USE-LOG.md。

## 5. M12 范围决定

- **做**：最终旅程 E2E、版本 1.0.0、README/CHANGELOG 收口、RC 打包、
  最终审计（门 A–J）、POST-1.0 记录。
- **不做**（§3）：AI/云/账号/新格式/大重构；OCR；File Watcher；自动更新。
