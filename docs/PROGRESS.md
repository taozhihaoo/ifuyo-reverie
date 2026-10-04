# PROGRESS — 里程碑进度

> 按 M4 §141 要求：核对清单 + Known Limitations + Deferred。状态以测试证据为准（npm test 200/200）。

## M0 — Foundation & Risk Spikes ✅

风险验证（提取/标注/EPUB/PDF/格式/安全）全部完成，见 docs/M0-STATUS.md。

## M1 — Web Capture ✅

保存→提取→归档→阅读闭环；原子持久化；Queue；Native Messaging Host（浏览器端 E2E 待用户注册）。

## M2 — Annotation Core ✅

标注模型/Anchor/Resolver/orphaned/修复/面板；canonical text 契约；500 标注性能实测。

## M3 — Search & Library ✅

七字段搜索 + 过滤 + 视图 + 用户状态 + 可重建索引 + Doctor；1,000 篇 p95=3ms。

## M4 — RSS / Feed

| 组件 | 状态 |
| --- | --- |
| RSS 2.0 parser | ✅（title/link/description/guid+isPermaLink/pubDate/author/category + content:encoded + dc:creator） |
| Atom 1.0 parser | ✅（id/title/updated/published/author/link rel 优先级/summary/content[type=text,html]/category） |
| Feed Storage | ✅（<Library>/feeds.json，原子写入，删索引可恢复） |
| Fetcher | ✅（复用 capture/fetch.js；条件请求 304；重定向限 5 跳逐跳校验；20s 超时；5MB 上限；AbortSignal 取消） |
| Retry | ✅（仅 NETWORK_ERROR ×2；4xx/安全拒绝/解析失败不重试） |
| Dedup | ✅（feed+external_id > feed+canonical URL > feed+normalized URL；同身份内容变化=原子更新） |
| RSS Article → Document/Library | ✅（type=article + source_type=feed + feed 关系字段；source/feed-item.json 留档） |
| Inbox / Read State | ✅（复用 M3：新条目 unread+inbox；刷新不碰用户状态——§109 回归测试） |
| Search | ✅（自动进入 M3 索引；七字段可搜；orphaned 标注仍可搜索） |
| Reader | ✅（复用 Reader Shell；Feed 来源元信息 + Open Original 走系统浏览器） |
| Annotation | ✅（高亮/笔记走 M2 核心，刷新后重定位） |
| Security | ✅（DOCTYPE 拒绝=XXE/实体炸弹防线；HTML 消毒；URL scheme 白名单；私有网段默认拒绝；5MB 上限；fuzz 无 crash） |
| Tests | ✅（34 例新增：parser 13 / feed-service 10 / network-security 11） |

### Known Limitations

- 私有网段校验按 hostname，未做 DNS 解析后 IP 校验（SSRF 防线之一，非全部）。
- 部分损坏 Feed（Item B 损坏）：XML 级整体失败（记录明确错误），不做条目级跳过。
- 浏览器端 Native Messaging E2E 与 GUI 自动化未执行（人工清单在 CAPTURE.md §7）。

### Deferred

OPML 导入导出、Podcast、自动定时刷新（Scheduler）、网页全文自动抓取、
JSON Feed、RSS 条目版本历史（content_hash+updated_at 已为 M10 留接口）。

## M5 — Import / Export / Daily Review ✅

Pocket/Wallabag/Raindrop 导入（幂等+provenance+部分失败容忍）、Markdown/EPUB 3/Metadata/Highlights 导出、
Daily Review（确定性队列）；1,000 条导入 9.4s/条均写、幂等重导 607ms（PERF.md）。

## M6 — EPUB Reader ✅

EPUB 2/3 解析（自研 over jsdom，DOCTYPE/XXE 防线）、TOC 双通道（nav+NCX）、
书库（books/<id>/book.epub 不可变）、滚动式章节阅读、全书 text-quote 标注（复用 M2）、
进度 last_location（user-state，与渲染解耦）、书签（reader-location）、
书内搜索（canonical 直读 offset）、书正文进入全局搜索。
高亮链路闭环：canonical = 渲染层同一净化输出的 textContent（fragment 语义），
主/渲染层偏移直读（集成测试锁定）。
限制：滚动式而非 foliate-js 分页视图、text-quote 而非 CFI（漂移已记录）、
键盘导航/阅读设置/FL/Overlays 未做。

## M7 — PDF Reader ✅

PDF 一等 Document：pdfjs-dist 6.4（零新运行时依赖）、入库 pdf/<id>/document.pdf 字节不可变、
懒渲染+LRU 位图缓存、pdf.js TextLayer 文本层（DOM 与主进程 canonical 字节一致——与
M2/M3/M6 全链路复用）、Outline/页导航/缩放、全局+书内搜索（CJK 实测）、书签/进度
（page_index 定位）、密码/损坏/超限 typed 错误、单页失败隔离。
真实运行验证：npm run smoke:pdf（CDP 驱动真实 Electron，11/11——含高亮重启重绘、
进度恢复、实时 parity）。263/263 测试。
限制：链接层未渲染（外链默认不触发，安全默认）、无旋转 UI、无缩略图栏、
扫描件无文本层时正文能力明确降级（OCR 永久排除）。详见 docs/M7-STATUS.md 能力表。

## M8 — TTS 有声阅读 ✅

TTS = Unified Reader Shell 共享能力：Web Speech API（Windows 本地语音，零依赖零网络）、
句子级 ReadingSegments（canonical 偏移，三格式统一）、段级暂停/语速/语音语言匹配、
从当前位置朗读、选区朗读（不碰进度）、自动连读 + 蓝色高亮跟随、导航即中断。
真实运行验证：npm run smoke:tts（真实语音引擎 7/7）。282/282 测试。
限制：Markdown/TXT 随 Reader 支持自动到位；暂停为句级重读（引擎 pause 不可靠）；
扫描 PDF 明确不可朗读。

## M9 — 高级 EPUB Export / Web→EPUB ✅

单一 EPUB 导出管线：M2 block 模型→富 XHTML（加粗/斜体/行内码/链接/图片内容寻址去重）、
多文档合并成书（题名页/目录/章节标题去重/确定性 identifier）、标注与笔记附录、
原子写+M6 回读验证、取消/部分失败报告；Web→EPUB 复用 M1 采集全管线（已入库文章
离线零网络导出）。真机验证：npm run smoke:epub（8/8——UI 批量导出→M6 回读）。299/299 测试。
真机修复：els.queueHint 缺失（重建索引按钮真机静默失败，M3 遗留）、libraryView 缺 type 投影。
限制：表格不导出、流式 zip 留技术债、外部 validator 未接入（标准结构+M6 回读背书）。

## M10-M12

未开始（顺序见总纲领：PDF → TTS → 导出增强 → 稳定性 → 产品化 → 自用 1.0）。
