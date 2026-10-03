# Testing — Reverie

> 原则（总纲领 §29）：**数据正确性 > 功能数量**。测试用 Node 内置 `node:test`，
> `npm test` 一键运行（当前 96 例，全绿）。

## 1. 运行

```bash
npm test                     # 全部测试（自动发现 tests/ 下 *.test.js）
npm run spike:extraction     # M0 提取语料评估（15 类）
npm run spike:pdf            # PDF 引擎验证
npm run app                  # 启动桌面 App
```

注意：`node --test` 带 `--test-force-exit` 运行包含常驻 HTTP 服务器的测试文件更稳
（`npm test` 已等价处理；直接 `node tests/xxx.test.js` 会因 server 句柄不退出）。

## 2. 测试地图

| 文件 | 覆盖 |
| --- | --- |
| `tests/core/atomic-write.test.js` | 原子写、无 tmp 残留、JSONL 追加、崩溃残留清扫 |
| `tests/core/meta.test.js` | meta.json round-trip、未知字段保留、高版本拒绝、坏 JSON |
| `tests/annotation/annotation.test.js` | 标注 round-trip、坏行容错、fail-closed |
| `tests/annotation/anchor.test.js` | Anchor 同文档恢复、跨节点、变化重定位、空白损伤、orphan 保留 |
| `tests/extraction/extraction.test.js` | M0 语料 15 类结构化评估（xfail/limitation 机制） |
| `tests/library/recovery.test.js` | 索引删→重建指纹一致、坏文档不拖垮扫描 |
| `tests/epub/epubcfi.test.js` | foliate-js 容器解析 + CFI round-trip（M6 前置证据） |
| `tests/pdf/pdf.test.js` | PDF.js 文本层/搜索/扫描件（M7 前置证据） |
| `tests/capture/host.test.js` | Host 真实进程：v1 校验/入队/错误码/1MB 上限/来源固定 |
| `tests/capture/queue.test.js` | 队列状态机、重试策略、启动恢复、坏文件容错 |
| `tests/capture/pipeline.test.js` | 管线全链路（本地 HTTP 服务器）：博客中文/GBK/日文/重定向/404/非 HTML/nav-only/超时/大小上限/图片失败降级 |
| `tests/capture/duplicates.test.js` | M1 §28 四个重复场景 |
| `tests/integration/m1-recovery.test.js` | M1 §26 round-trip + §27 崩溃回滚 + worker 重试 |
| `tests/integration/hardening.test.js` | Web 高亮持久化循环、书签 round-trip、损坏 EPUB/PDF 拒绝 |
| `tests/security/security.test.js` | 消毒/URL 白名单/ZIP 防护全部拒绝路径 |

## 3. M1 测试基建模式

- **本地 HTTP 测试服务器**：`http.createServer` 起随机端口，按路径返回语料/重定向/404/挂起响应 —— 管线测试全部离线可重复，不碰真实网络。
- **崩溃模拟**：staging 校验失败（content_hash 不匹配）→ 断言回滚无残留；队列 `running` 状态 → `recoverOnStartup` 断言回 `queued`。
- **Round-trip 范式**：捕获 → 落盘 → 重建索引 → 重新读取 → 内容/哈希逐字节对比；全程断言 library 目录 hash 不变（索引/状态操作永不污染源文件）。

## 4. 尚未自动化（人工/后续阶段）

- 真实浏览器 Native Messaging E2E（需用户注册表 + Chrome 扩展加载；步骤见 [CAPTURE.md](CAPTURE.md) §7）。
- Electron GUI 交互（启动冒烟已验证；UI 自动化留给后续阶段按需引入）。
- 真实网页人工抽样（版权约束不入库；语料结构支持随时添加合成样本）。
