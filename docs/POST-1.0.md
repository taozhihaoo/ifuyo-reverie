# POST-1.0 — 已知问题与未来路线（1.0 冻结边界外）

> 2026-10-05 更新：K 清单中的「主题切换 + 中英文 UI」已作为 Post-1.0 第一批交付
> （1.1.0 主题系统 + i18n，见 docs/PROGRESS.md Post-1.0 段）。


> 1.0 冻结核心架构与产品边界。以下全部为 **Future**——记录 ≠ 进入开发。

## Known Issues（已知、不阻塞 1.0）

| # | 问题 | 级别 |
|---|---|---|
| K1 | 未签名 → SmartScreen 首次运行提示 | P3（SIGNING.md 有签名路径） |
| K2 | NSIS Setup.exe 需联网生成（Portable 已覆盖交付） | P3 |
| K3 | Markdown/TXT 无阅读器（数据层已就绪） | P2 |
| K4 | PDF 扫描件无 OCR（明确提示，不计划） | Wonfix（产品边界） |
| K5 | EPUB 导出不带表格；流式 zip 未实现（超大语料内存） | P3 |
| K6 | TTS 暂停为句级重读（引擎 pause 不可靠） | P3 |
| K7 | 10k+/50k 库与 24h 长跑未自动化压测 | P3 观测项 |
| K8 | 搜索 UI 无高亮/笔记类型过滤的专属入口（tag:/is: 已覆盖） | P3 |
| ~~K9~~ | ~~界面主题单一~~ → **已交付**：浅/深/系统主题 + 4 强调色（Post-1.0 第一批） | 已完成 |
| ~~K10~~ | ~~界面仅中文~~ → **已交付**：中英文切换（Post-1.0 第一批） | 已完成 |

## Future Features（全部 Future）

- Markdown/TXT Reader（跟随真实需求）
- 阅读统计、更高级导出（EPUB 封面/表格）、更丰富 Reader 功能（注释面板增强）
- File Watcher 自动感知外部修改、OPDS、更多 Windows Integration（jump list 等）
- OCR（若扫描件成为真实主力资料）
- macOS / 移动端
- AI 功能（总结/问答/标签——仅当本地模型成熟且符合 local-first）
- 同步（仅当多机自用成为真实痛点；文件原生库天然适合 Syncthing 类工具，无需自建）

## Backlog 清理记录（M12 §17 扫描结果）

- src/importexport/export/epub-exporter.js `exportArticleToEpub`：deprecated 保留
  （M5 单测守护），调用方已全部迁移 M9 管线 → **有意保留**。
- src/core/atomic-write.js `sweepTmpFiles`：M10 起由 Doctor 递归清扫使用 → 必需。
- 无 TODO/FIXME 遗留（全库扫描 0 条）；PoC spikes 保留为历史证据（dev-only）。
- foliate-js / @napi-rs/canvas / pdf-lib / @pdf-lib/fontkit：dev-only（fixture 与
  spike），不入发布包 → 保留。
