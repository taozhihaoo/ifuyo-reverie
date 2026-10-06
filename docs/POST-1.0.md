# POST-1.0 — 已知问题与未来路线（1.0 冻结边界外）

> 2026-10-05 更新：K 清单中的「主题切换 + 中英文 UI」已作为 Post-1.0 第一批交付
> （1.1.0 主题系统 + i18n，见 docs/PROGRESS.md Post-1.0 段）。
>
> 2026-10-07 更新：真实使用暴露并修复浏览器采集四连缺陷（用户报告"右键保存后
> 应用里全是 0"），见下方「采集链路修复记录」。


## 采集链路修复记录（2026-10-07，真实使用驱动）

用户实际右键 "Save page to Reverie" 后应用全 0，定位出四个叠加缺陷，全部修复
并以真机端到端回归锁定（scripts/smoke-capture-live.mjs + smoke-packaged.mjs）：

1. **旧便携包在跑**：用户的 1.0.0 包早于全部 Post-1.0 修复（无自注册、无 i18n
   补键）。教训：修复合入后必须重新 `npm run package:portable` 并提醒换包。
2. **宿主模式在 Windows 上从未真正可用**：Electron 主进程 stdin 不产生 data
   事件；且 `runCaptureHost` 设置完监听即 resolve，启动器随即 `process.exit`。
   → 宿主模式下用 `ELECTRON_RUN_AS_NODE=1` 重_exec 为纯 Node 子进程（stdio
   直通），`main()` 等到 stdin 关闭且全部帧处理完毕才返回。
3. **Electron 启动期向 stdout 写 `\r\n`**（pinned 44.5.1 实测，应用代码无法阻
   止）→ Chrome 严格帧解析错位、永远等不到响应。→ 首帧对齐填充：子进程补齐
   长度前缀并发射一个 2573 字节的空白 JSON 填充消息
   （`{"reverie_padding":true}`），Chrome 解析后重新对齐；扩展端改用 port 长
   连接并忽略无 `status` 的帧（一次性 sendNativeMessage 只收得到填充帧）。
4. **运行中采集不进索引**：worker 只写 `articles/`，index/search-index 不重
   建 → 界面永远查不到新文章（重启才被启动期 refresh 兜底）。→ 主进程增加
   队列目录 fs.watch（500ms 去抖），处理后 rebuildIndex + refreshSearchIndex
   + 广播 library:changed。实测右键保存后 ~900ms 文章出现在运行中的界面。

附带修复：`autoRegisterNativeHost` 的 `execFile` 未导入（ESM 下抛 ReferenceError
被吞）、manifest 数据目录引用了不存在的 `root` 变量、dev 模式注册守卫（避免把
注册表指向 node_modules 的 electron.exe）。打包版真机验证 5/5：自注册键值 →
manifest 指向打包 exe → 采集 ACCEPTED → 实时入库。


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
