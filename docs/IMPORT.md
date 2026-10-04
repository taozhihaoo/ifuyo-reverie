# IMPORT — 导入（M5）

> 实现：`src/importexport/sources.js`（格式解析/归一）+ `import-service.js`（staging/去重/落盘）。
> 数据安全总纲：**Import ≠ Overwrite**——导入只新增/跳过，绝不覆盖用户已有资料（M5 §23）。

## 1. 支持的来源与输入格式

| 来源 | 输入格式 | 检测 |
| --- | --- | --- |
| Pocket | 官方导出 JSON `{status, list: {id: item}}` | `list` 对象 |
| Wallabag | 官方导出 JSON（条目数组 / `{entries}` / `{_embedded:{items}}`） | 条目含 `is_archived/is_starred/uuid` |
| Raindrop | 官方导出 JSON `{items: [...]}` 或裸数组 | 其余数组形态（空数组=Raindrop） |

真实样本优先（M5 §116）：当前 fixtures 为**人工构造样本**（基于官方格式说明），
位于 `tests/fixtures/import/`；未声称覆盖真实世界全部形态（见 Known Limitations）。

## 2. Normalization / 字段映射

统一输出 `NormalizedImportRecord`：title/author/url/excerpt/content_html/tags/
read/favorite/archived/created_at/published_at/collection/note。

- Pocket：`resolved_title ?? given_title ?? excerpt纯文本`；status 1 = archived→read；
  authors map → 首个 name；time_added/time_published（秒/毫秒自适应）。
- Wallabag：`content` 保留正文；`is_archived`→read、`is_starred`→favorite（**Archive ≠ Read**
  的映射在 Wallabag 语境下按官方语义执行并写入 provenance——其余系统不套用）；tags。
- Raindrop：excerpt/note/collection(title→provenance)/important→favorite；无正文（content_html=null）。
- 未知字段：忽略不失败；字段类型异常：防御性忽略。

## 3. 状态映射（M5 §19 明确表）

| 外部 | Reverie | 说明 |
| --- | --- | --- |
| Pocket status=1 (archived) | read=true | Pocket 语义=已读 |
| Pocket favorite | favorite=true | |
| Wallabag is_archived | read=true | 同左 |
| Wallabag is_starred | favorite=true | |
| Raindrop important | favorite=true | |
| Raindrop collection.title | provenance.collection | **不**映射为 Tag（避免把外部信息架构塞进 Reverie） |
| 其余 archived/unknown | 不映射 | 记录在 provenance |

## 4. 身份 / 去重 / 幂等（M5 §10/§20/§90）

- `import_key = "<source_type>:<external_id 或 canonical URL>"` 持久化于 meta.provenance。
- 已存在同 key → **skip**（不覆盖、不重建）→ 幂等：同文件导入 N 次文档数不变（有测试）。
- URL 去重复用 M1 canonicalizeForDedupe；不引入第二套。
- 跨来源同 canonical URL：目前保守保留两份（宁可疑似重复，不可错误合并，M5 §21/§121）。

## 5. Provenance（M5 §11）

meta.provenance = `{ source_type, source_item_id, source_url, imported_at,
import_session_id, import_key }`——持久化在 meta.json，删索引重建后仍可知道来源。

## 6. Staging / 部分失败 / 取消（M5 §8/§24/§25/§93）

- 逐条写入（writeMeta/article.md 原子写），单条失败仅记录 `report.failures`，
  成功条目保留；报告含 total/created/skipped/duplicate/failed + failures[]。
- AbortSignal 取消：已完成条目保留，状态明确 `cancelled`。
- 摄取完成后批量刷新搜索索引（一次/批，M5 §68）。

## 7. 安全（M5 §70-74）

- 输入文件 100MB 上限；BOM 剥离；JSON 解析失败 → PARSE_ERROR。
- 无路径拼接：文档目录 = document_id（UUID），title 仅展示。
- 无网络行为：导入不触发网页抓取（M5 §19/§77 与 Web Capture 是两个动作）。
- 外部 HTML 一律消毒后才转 Markdown。

## 8. Limitations

- 真实导出样本未取得：fixtures 为人工构造（官方格式说明），未覆盖全部真实形态。
- 跨来源同 URL 保守保留两份（未来可提供 merge 交互）。
- 不导入外部系统的阅读进度（Reverie 尚无进度字段）。
