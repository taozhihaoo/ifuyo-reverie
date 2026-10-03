# M1 Status — ifuyo Reverie（Web Capture）

> M1 完成报告。状态分类：Implemented / Verified / Known Limitations / Known Risks / Deferred。
> 所有结论按 FACT / HYPOTHESIS / INFERENCE 标记；测试证据以 `npm test`（96 例全绿）与真实网页验证为准。

---

## 1. 阶段目标回顾

> 从浏览器中保存一个普通网页，在 Reverie 本地形成完整、稳定、可再次打开、可恢复的个人归档。

## 2. Implemented（已实现）

| 能力 | 实现位置 | 说明 |
| --- | --- | --- |
| Capture 协议 v1 | `src/capture/protocol.js` | request（source/capture_mode/created_at）+ 稳定错误码 + 状态字段 |
| Native Messaging Host（入队即响应） | `src/capture/native-host.js` | 来源固定 + 校验 + 入队 + `accepted`；1MB 上限；永不联网 |
| 持久化 Capture Queue | `src/capture/queue.js` | 一任务一文件；queued/running/completed/failed/duplicate；重试策略；启动恢复 |
| Capture Worker | `src/capture/worker.js` | App 启动时驱动队列；失败分级重试 |
| Fetch 阶段 | `src/capture/fetch.js` | http(s) 逐跳校验、超时、大小/重定向上限、content-type 门禁、charset 解码 |
| Extraction 接入 | `src/extraction/`（M0 验证） | Readability + metadata（title/byline/published/lang/canonical/description/site_name） |
| Sanitize | `src/security/sanitize-html.js` | DOMPurify + FORBID + URI 白名单（管线内强制） |
| Assets | `src/capture/assets.js` | 并发下载 → `assets/<sha256>.<ext>`；失败降级记录 `capture_warnings` |
| article.md 序列化 | `src/article/markdown.js` | 显式 HTML→Markdown 规则（标题/列表/表格/代码/引用/图片/链接） |
| 原子持久化 | `src/library/persist.js` | `.tmp-` staging → 校验（hash/asset 引用/非空）→ 原子 promote |
| 派生索引 + 阅读状态 | `src/library/index.js` | `index.json` / `read-state.json`（REVERIE_HOME 内，可重建，绝不写回 library） |
| Electron App | `app/` | Library 列表（Open/Delete/Reveal/已读切换）+ Reader（安全 Markdown 渲染、图片 file:// 白名单、外链交系统浏览器）+ 启动即处理队列 |
| 扩展 v1 | `extension/` | 协议 v1 字段 + SAVED/FAILED 徽章；保存入口 = 工具栏点击 + 右键菜单 |

## 3. Verified（已验证，全部有自动化测试或真实运行证据）

**FACT**：`npm test` 96/96 通过。关键场景：

- **普通网页归档**（场景 1）：中文博客页 → completed；meta（title/author/canonical/hash）正确；图片本地化且被 article.md 引用；source/page.html 保留。
- **重启后数据仍在**（场景 2）：队列任务落盘 → 「重启」→ recover + process → completed → 索引含该文章（§26 round-trip 测试）。
- **原网页失效仍可读**（场景 3）：正文/图片全部本地文件；测试断言不依赖网络二次访问。*（架构保证 + 本地文件断言；真实站点下线场景由本地测试服务器模拟）*
- **网络异常无假成功**（场景 4）：404 / 超时 / 断连 → `failed` + `NETWORK_ERROR`，无任何目录产生。
- **重复保存**（场景 5）：§28 四用例全部按预期（同 URL→duplicate；query 顺序→duplicate；canonical 同源→duplicate；内容变化→合法新 Capture，旧文不动）。
- **索引损坏重建**（场景 6）：删 `index.json` → 重建 → 条目一致；重建前后 library 目录 **byte 级不变**（测试断言）。
- **编码**：中文（UTF-8 与 GBK 声明页）、英文、日文均正确解码保存。
- **错误注入**（§27/§29）：Extract 后崩溃（staging 回滚零残留）、坏 JSON 行、1MB 超帧、nav-only 页 → `EXTRACTION_FAILED` 不落盘。
- **Electron 冒烟**：临时 REVERIE_HOME 启动运行 15s 无主进程/渲染错误。

**FACT（真实网页验证，2026-10-04）**：阮一峰博客周刊第 413 期（真实公网站点）端到端采集 → `completed`，标题/作者正确，35 张图片全部本地化，0 警告，正文 10.9KB。

## 4. Known Limitations

1. **真浏览器 Native Messaging E2E 未在本环境执行**（需用户级注册表写入 + Chrome 手动加载扩展）：Host 协议经真实进程测试，注册脚本与步骤齐备（`native-host/register.ps1`，见 CAPTURE.md §7）。剩余风险为浏览器侧安装细节（INFERENCE：低，协议与清单均按官方规范实现）。
2. **动态渲染页面（SPA 首屏 JS 拼内容）无法提取**：M1 无浏览器内渲染抓取（明确非目标）；此类页面走 `EXTRACTION_FAILED` 或降级，未来按需在 Capture 决策（HYPOTHESIS：无头渲染属 M3+/按需）。
3. **登录墙 / 付费墙 / 反爬页面不支持**（明确原则，不做绕过）。
4. **article.md 是有损转换**：复杂表格合并单元格、特殊嵌入内容按可读性规则降级（规则显式记录于序列化器）。
5. **Electron GUI 交互无自动化**：启动冒烟 + 渲染逻辑经 Core 测试覆盖；UI 自动化后续按需引入。
6. **本网络无法访问部分国际站点**（连接超时，网络环境事实）：管线行为= `NETWORK_ERROR` 如实失败。

## 5. Known Risks

| 风险 | 等级 | 缓解 |
| --- | --- | --- |
| 强模板/懒加载站点提取质量 | P2 | xfail/limitation 机制持续跟踪语料；真实网页本地人工测试通道已建立 |
| 图片热链站点拒绝外链下载 | P2 | 降级路径成熟（警告 + 原 URL 保留），文章不受影响 |
| 单文件队列目录在超大任务量下的扫描成本 | P3 | M1 规模（个人使用）无关紧要；M3/M10 复查 |
| Electron 安全基线（sandbox/contextIsolation/CSP）配置依赖人工纪律 | P2 | 已配置且加载本地文件；M11 安全审计复核 |

## 6. Deferred（明确推迟，未实现）

- SQLite 全文索引与搜索（M3）；当前 `index.json` 只服务 Library 列表/查找，边界一致。
- RSS / Pocket / Wallabag / Raindrop / EPUB / PDF / TTS / 标签 / 高级搜索 / Aurora（各属后续里程碑）。
- `capture_mode: full_page | selection`（协议已占位，M1 只实现 `article`）。
- Library 设置界面（当前用 `REVERIE_HOME` / `REVERIE_LIBRARY` 环境变量选择目录）。

## 7. M1 Review 结论（§37 自查）

- 无 P0。P1 逐项核查：数据格式可持续（format_version + 前向兼容）✅；Capture 可恢复（队列恢复 + staging 回滚测试）✅；Queue 不卡死（recoverOnStartup 测试）✅；索引可重建（byte 级测试）✅；Reader/Core 边界（业务全部在 `src/`，Electron 仅装配，引擎依赖隔离可 grep 验证）✅；安全（管线强制消毒 + CSP + 外链系统浏览器）✅。
- 与文档的有意偏差（以实际代码为准，均已记录）：
  1. 派生索引用 JSON 而非 SQLite（M1 只需列表/查找；SQLite 推迟 M3，边界不变）；
  2. Host 阶段不返回 `completed/duplicate`（异步队列设计：扩展秒回 `accepted`，最终状态在 App 呈现）——与 M1 §5 的队列要求一致，§24 的响应字段全部保留。

## 8. Final Verdict

**M1 COMPLETE — Ready for M2**（在 Known Limitations 第 1 项由用户环境完成一次真浏览器验收后，可视为完整闭环；该项不阻塞 M2 Annotation Core 的开发）。

下一步（M2）：把 M0 已验证的 Annotation Core 接入 Reader Shell —— 高亮/笔记/书签数据层已就绪。
