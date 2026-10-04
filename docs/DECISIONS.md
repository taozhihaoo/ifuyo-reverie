# DECISIONS — 关键设计决定记录

> 只记录有长期价值的设计决定（M4 §140）。每条含决定与理由。

## M0

| 决定 | 理由 |
| --- | --- |
| Web 技术栈（Node + Chromium 系运行时） | 三大引擎（Readability/foliate-js/PDF.js）同栈复用；阅读器需完整浏览器渲染 |
| 原子写入 = tmp → fsync → rename | 崩溃只留 `*.tmp-*`，绝不产生半文件（全库统一实现） |
| SQLite 推迟；先 JSON 派生索引 | 在全文搜索（M3）证明需要之前不引入原生依赖；重建语义先行验证。M3 起以 JSON 索引承载；SQLite 引入时 SearchService 接口不变 |
| Annotation 状态命名 `resolved/orphaned`（设计稿为 active） | 以实现为准；orphaned 表达"解析失败但数据存在" |
| 提取器 Mozilla Readability（Apache-2.0） | 一线成熟方案；不 gate 在 isProbablyReaderable 上，minTextLength 启发式拒绝壳页 |

## M1

| 决定 | 理由 |
| --- | --- |
| document_id = UUID v4，目录名 = document_id | 标题/URL/路径都不是身份（M1 §15、M3 §103-106） |
| 原始网页与提取结果同时保存 | 重新提取/追溯/诊断的前提 |
| 图片资产 sha256 命名 + 下载失败降级 | 可去重可校验；单图完整性 < 整篇可用性 |

## M2

| 决定 | 理由 |
| --- | --- |
| Anchor = quote + prefix/suffix + position(缓存) + source_content_hash | 单一 offset 在内容变化后失效；多信息确定性重定位，无 AI |
| 高亮渲染 = CSS Custom Highlights overlay | 不修改 article.md、支持重叠、崩溃后由解析结果重建 |
| annotations.jsonl：创建=追加，更新/删除=整文件原子重写 | 追加廉价且崩溃安全；重写有原子性保证 |

## M3

| 决定 | 理由 |
| --- | --- |
| 搜索 = 内存子串匹配（无分词器）+ 字段优先级排序 | 1,000 篇 p95=3ms（PERF.md）；中文零配置连续命中；FTS5/分词器推迟到规模证明必要 |
| 用户状态存 `<Library>/user-state.json`（库内） | 随资料库移动/同步——"用户状态属于 Library 而非数据库"（M3 §7） |
| read/favorite/inbox 三态独立 | 任意组合合法（M3 §9/11）；Mark Read 不自动移出 Inbox |
| 视图过滤 = 可组合谓词（LibraryQuery） | Inbox+Favorite+Unread 是合法组合，禁止 if/else 链（M3 §49） |

## M4

| 决定 | 理由 |
| --- | --- |
| RSS/Atom 解析 = 手写解析器 over jsdom XML mode（无新依赖） | 项目已有 jsdom（M0 起）；满足 RSS 2.0+Atom 1.0 所需元素与命名空间（content:encoded/dc:creator）；jsdom 不解析外部实体 + DOCTYPE 直接拒绝 = XXE/实体炸弹防线（M4 §132：优先复用现有依赖） |
| Feed 持久化 = `<Library>/feeds.json` 单文件原子写 | 订阅关系是用户资料，必须随库迁移、删除索引后可恢复（M4 §12） |
| feed_id = Reverie UUID；item 身份 = feed_id+external_id，回退 canonical URL | URL/标题都不是身份；GUID 可能缺失/改变/非全局唯一（M4 §34-38 宁留疑似重复不错误合并） |
| Document 复用 type=article + `source_type:"feed"` 元数据扩展 | 不造平行 RssDocument 体系（M4 §7/14）；FORMAT.md v1 前向兼容字段 |
| Content 优先级：content:encoded > description；Atom content > summary；摘要标注 `content_provenance` | Feed 只提供摘要时不假装全文、不自动抓网页（M4 §18/19） |
| Feed Fetcher 复用 capture/fetch.js（fetchUrl 统一入口） | 单一 HTTP 基础设施：scheme/私有网段/重定向/大小限制一处实现（M4 §53） |
| 私有网段默认拒绝；显式策略开放（env / per-call 主机白名单） | SSRF 防线（M4 §57）；已知限制：hostname 级判断，未做 DNS-IP 校验 |
| 刷新仅用户触发（Refresh / Refresh All），无后台 Scheduler | M4 §51/98/127：默认不偷偷联网 |
| 更新策略：同身份内容变化 → 原子重写 article.md，用户状态/标注不碰 | 内容更新与用户资料分离（M4 §40/44）；标注重定位交给 M2 Resolver |
| 删除订阅保留文章 | Feed 是订阅，Article 是用户档案（M4 §49） |

## M7

| 决定 | 理由 |
| --- | --- |
| PDF 渲染/提取 = pdfjs-dist 6.4（Apache-2.0，M0 spike 已验证） | 零 native 依赖、Node legacy build 与 Chromium 渲染层同一实现——canonical 契约可双侧锁定；纯 JS 无部署项（M7 §6） |
| **canonical 契约**：页文本 = `Σ item.str` 无分隔拼接，与 pdf.js TextLayer DOM 字节一致（span.textContent=item.str，EOL=`<br>` 无文本） | 与 M6 §33 同构——M2 锚定/M3 搜索/进度零新体系；源码级确认 + 真实 TextLayer 集成测试 + 真机 parity 三重锁定 |
| 渲染 = 懒渲染位图（LRU≤6、可取消）+ 文本层建后保留 | 位图是可弃运行时缓存（§12/13）；文本层是 canonical 的 DOM 形态，是锚定/搜索的前提，不是缓存 |
| 定位 = page_index（内部身份）+ PageLabel 仅显示；进度/书签 `{page_index, scroll_ratio}` | §30：显示页码非稳定身份；复用 user-state last_location（扩展 page_index 分支） |
| 第三方隔离 = 主进程 pdf-reader-core / 渲染层 pdf-view 各为唯一 pdfjs 入口 | UI/Core 数据模型全 plain JSON；换渲染器只需重写两个 adapter 文件（M7 §7/8） |
| CSP 不放宽：cmaps/fonts/wasm 经 `pdf:vendor-data` IPC（目录+扩展名白名单）供给 | 沙箱渲染层无法 fetch file://；connect-src 'none' 是 M0 安全基线，不为便利让步 |
| 密码 PDF = 检测 + PASSWORD_REQUIRED 明确提示；不做密码输入 | §17 允许；个人归档场景受保护 PDF 显式 Unsupported，绝不绕过 |
| OCR/编辑/链接层/表单/多媒体 = 明确 Unsupported | §60-62：Reader 不是 Editor；不渲染链接层 = 外链/JS/Launch 自然不触发（安全默认） |

## M8

| 决定 | 理由 |
| --- | --- |
| TTS Provider = Web Speech API（speechSynthesis，Chromium→Windows SAPI 本地桥） | 零新依赖/零网络/零 native 部署（local-first §3.1）；真机 PoC 验证语音枚举/中英文/rate/取消全部可用（M8-EXPLORE §1） |
| 暂停 = 段级暂停（cancel + 段首重读），不用引擎 pause | PoC 证实 `speechSynthesis.paused` 标志不可信且 Windows 引擎 pause 可靠性存在版本差异；§9 最小可靠单位 = 句子；可在 Node 全测 |
| 定位/高亮 = canonical 偏移段 + ReaderAnchor + CSS Highlight `reverie-tts` | 三格式 canonical 契约（M2/M6/M7）直接复用——不建第二套 ReaderLocation（不变量 3） |
| Sections = 格式 payload 推导（blocks/章节/页），段落 = 句子 | Reader 决定读什么（§5/§17）；code block 默认跳读（§47） |
| 控制器 DOM-free + Provider 注入（UMD shim） | 状态机/队列/并发在 Node 完整测试（FakeProvider），第三方 API 只在 tts-provider.js（M8 §12） |
| 设置存 localStorage（voiceId+rate） | 无独立数据库/无新数据格式（§36/§58）；本地即弃性质 |
| 选区朗读 = 一次性队列，不滚动不写进度 | §25：朗读选区不得移动 Progress、不产生标注 |

## M9

| 决定 | 理由 |
| --- | --- |
| 单一活跃 EPUB 管线：epub-builder + epub-export-service（M5 旧函数 deprecated 保留供单测） | §75 防五套 Exporter；调用方全部迁移到新引擎 |
| 验证 = 真实 M6 回读（openEpubContainer/parseOpf）而非自写 parser 自证 | §33：验证生成的 EPUB 本身；零新依赖零 validator runtime；外部 epubcheck 留 Adapter 边界未接入（记录） |
| 章节 = Article（§12 优先），合并书才加题名页；单篇不再按 H1 裂章 | 捕获文章的 H1 是标题本身，裂章产生空首章（真机实测发现）；Article=Chapter 语义最直白 |
| 图片 = 内容寻址 images/<sha256>.<ext>，跨文档去重；缺失→warning+摘除+OPF 同步 | §22/§23：资产身份即内容哈希；manifest 永不宣称 zip 里不存在的资源（§29） |
| identifier = urn:reverie:book-<sha1(sorted docIds+title)[:16]> | §14 禁止随机 GUID；同内容同配置导出身份稳定 |
| 原子写 = <name>.epub.<ts>.tmp → 校验 → rename；失败/取消必清 tmp | §31/§43/§94/§95：绝不半成品、绝不静默覆盖 |
| Web→EPUB = runCapture（M1 全管线）→ scanLibrary 文件定位 → 导出 | §15/§59：零第二套 HTTP/解析/清洗；导出永不依赖索引 |
| 离线优先：已入库文章导出零网络，只读本地 assets | §89/§90：断网可导出是核心验收（测试锁定） |
| 批量顺序 = 当前视图显示顺序（用户所见即所得）；重复 id 去重；空文档 skipped | §68/§69/§42：稳定、可解释、不静默 |
| UI 书名 = 默认名直出（无 prompt 对话框） | Electron 渲染层无 window.prompt（真机踩坑）；§64 第一次导出应简单 |

## M10

| 决定 | 理由 |
| --- | --- |
| 未来版本用户文件 → 只读保护 + 拒绝写（UnsupportedVersionError） | §26/不变量 6：审计发现 user-state/feeds 版本不匹配会被静默重置（P1 数据丢失）——升级是恢复路径，降级覆写永远不做 |
| 暂停/清扫/隔离走 `.recovery/`（日志 jsonl + backup-<ts>/ + quarantine-<ts>/） | §22/§82：可识别、可还原、不入索引；不制造独立备份系统 |
| staging 崩溃残留 = Doctor 可恢复数据（完整→转正/无效→隔离），不是垃圾 | §10：其中可能是真实文章；sweepTmpFiles 零调用是审计发现的 Gap |
| Doctor v2 findings = {checkId, severity, repairability, ...}，safe/conditional/manual 分级 | §19/§21：Safe 自动、Conditional 带预览确认、Manual 只报告——绝不伪造修复成功 |
| Doctor 文件系统优先，索引仅作交叉证据 | §95-§97：索引坏/删时 Doctor 必须可用；Repair 永不基于过期索引 |
| 标注 JSONL 修复 = 记录级（备份→保留好行→隔离坏行→刷新索引） | §80/§81：不整文件丢弃；serializeAnnotation 全对象序列化→未知字段天然保留（§27） |
| 索引 schema 演进策略 = 重建而非迁移 | §108/§109：派生数据修复成本为零，复杂 DB 迁移无价值 |
| 不引入 File Watcher | §44：增量刷新 + Doctor/重建入口已覆盖实际需求，不加重力级框架 |
