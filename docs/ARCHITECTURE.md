# Architecture — Reverie

> 模块边界与依赖方向（M0 确立，M1 首次全链路落地）。改动任何边界前先读本文。

## 1. 分层

```text
┌────────────────────────────────────────────────────────┐
│ Extension (browser)      独立前端，只见协议 v1           │
└──────────────┬─────────────────────────────────────────┘
               │ Native Messaging
┌──────────────▼──────────────┐
│ Capture Host                src/capture/native-host.js │
│ 校验 → 入队 → accepted      （永不联网、永不碰 UI）      │
└──────────────┬──────────────┘
               │ queue/*.json
┌──────────────▼─────────────────────────────────────────┐
│ App (Electron)               app/                      │
│ 窗口 + IPC + 队列 Worker 驱动                            │
└──────┬──────────────────────┬──────────────────────────┘
       │                      │
┌──────▼───────────┐   ┌──────▼───────────────────────┐
│ Library/Index    │   │ Capture Pipeline             │
│ src/library/     │   │ src/capture/pipeline.js      │
│ 文件层=真相       │   │ fetch→extract→sanitize→      │
│ index.json=派生   │   │ assets→markdown→persist      │
└──────┬───────────┘   └──────┬───────────────────────┘
       │                      │
┌──────▼──────────────────────▼───────────────────────┐
│ Core / Infrastructure                                │
│ src/core: 原子写入、UUID、meta、paths                 │
│ src/extraction: Readability 封装                     │
│ src/security: 消毒 / URL 白名单 / ZIP 防护            │
│ src/annotation: (M2) 格式无关标注核心                 │
└──────────────────────────────────────────────────────┘
```

## 2. 依赖方向规则

1. **App → Core 单向**。`app/` 只做窗口/IPC/装配；业务规则全部在 `src/`，可独立于 Electron 测试（现有测试即证据）。
2. **Reader 不碰 Extractor**。Reader 只消费 `article.md`（经安全 DOM 渲染）；禁止 Reader UI 调用 extraction（M1 §21）。
3. **第三方引擎隔离**。`@mozilla/readability` 只在 `src/extraction/` 出现；DOMPurify 只在 `src/security/`；Electron 只在 `app/`。全局 grep 可验证。
4. **文件是真相**。`library/` 外的任何东西（queue/index.json/read-state.json）都可删除重建；索引器对 library **只读**。
5. **协议对外稳定**。Extension 只认 `protocol_version` 契约；未来 Firefox 前端 = 新 Adapter，不触碰 Core。

## 3. 目录索引

| 路径 | 职责 |
| --- | --- |
| `src/core/` | UUID、原子写入（tmp→fsync→rename）、meta 校验、目录布局 |
| `src/capture/` | 协议、队列、Host、fetch、assets、pipeline、worker |
| `src/extraction/` | Readability 封装 + 结构化评估器 |
| `src/article/` | HTML→Markdown 序列化（显式规则） |
| `src/library/` | 扫描、staging 持久化、派生索引、阅读状态、删除 |
| `src/security/` | HTML 消毒、URL scheme 白名单、ZIP 防护 |
| `src/annotation/` | （M2 起启用）标注核心 |
| `app/` | Electron 主进程 / preload / 渲染层 |
| `extension/` | 浏览器扩展（MV3，固定 key） |
| `native-host/` | 注册清单模板 + register/unregister + Windows 启动器 |
| `tests/` | node:test 套件（单元 + 集成 + 语料） |
| `spikes/` | M0 风险验证遗产（保留作证据与回归参考） |

## 4. 关键决策记录

| 决策 | 理由 | 时期 |
| --- | --- | --- |
| 派生索引用 JSON 而非 SQLite | M1 只需列表/查找；零原生依赖；重建语义已在 M0 验证。SQLite 推迟到 M3（全文搜索），边界不变 | M1 |
| Host 只入队不做抓取 | UI/浏览器关闭都不丢任务；Host 生命周期与 Chrome 端口绑定，不能承担长任务 | M1 |
| article.md 为唯一正文格式 | 用户可读可迁移（文件是真相）；Reader 只读它，不读原始 HTML | M1 |
| 图片哈希命名 + 失败不致命 | 可去重、可校验；整篇可用性 > 单图完整性（M1 §12） | M1 |
| 可选元字段缺省即省略 | FORMAT.md 纪律：禁止 null 字段（校验器拒绝） | M1 |
