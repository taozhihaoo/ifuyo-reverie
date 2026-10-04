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
