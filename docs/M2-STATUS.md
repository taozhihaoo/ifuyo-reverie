# M2 Status — ifuyo Reverie（Annotation Core）

> M2 完成报告。分类：Implemented / Verified / Known Limitations / Known Risks / Deferred。
> 测试证据：`npm test` **135/135 全绿**（M2 新增 39 例）。

---

## 1. Implementation Summary

M2 建立了与阅读格式解耦的标注核心（`src/annotation/`）+ 共享规范化文本层（`src/reader/`）
+ Web Reader 全套标注 UI（选中→高亮、面板、导航、笔记、orphaned/修复）。
标注是独立一等数据（annotations.jsonl），不是写进正文的 UI 状态。

## 2. Architecture

```text
app/renderer（选中/面板/overlay）──IPC──▶ app/main ──▶ AnnotationService
                                              │            ├── resolver.js（确定性五步）
Reader blocks（canonical text）◀──────────────┤            ├── anchor.js（DOM 映射）
        src/reader/markdown-reader.js          │            └── store.js（JSONL）
                                               ▼
                                    annotations.jsonl（Source of Truth）
```

- 引擎无关：Annotation Core 不知道 DOM；渲染端只做偏移映射（`reader-anchor.js`）。
- 第三方隔离不变：Readability/DOMPurify/Electron 各守其层（grep 可验证）。

## 3. Annotation Data Model

`{format_version:1, annotation_id(UUIDv4), document_id, type(highlight|note|bookmark),
status(resolved|orphaned), created_at/updated_at, quoted_text, prefix, suffix,
locator{kind:text-quote, position{start,end}}, note, tags, source_content_hash}`
— 与 [ANNOTATION-FORMAT.md](ANNOTATION-FORMAT.md) 一致。

**文档漂移记录（以代码为准）**：设计稿的 `active`→实现为 `resolved`、`selected_text`→`quoted_text`、
`schema_version`→`format_version`（语义等价，M0 v1 格式沿用）。

## 4. Persistence Format

annotations.jsonl：创建=原子追加；更新/删除/修复=整文件原子重写（tmp→fsync→rename）。
坏行/重复 id/文档不一致 → 逐行诊断，绝不自动清空。详见 ANNOTATION-FORMAT.md。

## 5. Anchor Strategy

TextQuote 多重锚：quote + prefix/suffix(32 字符) + position(加速缓存) + source_content_hash。
quote 一律来自 canonical text（markdown-reader 唯一来源，DOM textContent 由测试强制等于它）。
跨块选择 = canonical 文本上的普通区间（原生支持，含 heading→paragraph 测试）。

## 6. Resolution Strategy

五步确定性解析（hash-position → 精确 → 上下文消歧 → 空白折叠 → 弹性空白 → orphaned）；
**多命中且上下文全不匹配 = AMBIGUOUS → orphaned，绝不误定位**（§16，有测试）。
详见 [ANNOTATION-RESOLUTION.md](ANNOTATION-RESOLUTION.md)。

## 7. Orphan / Repair Strategy

orphaned 保留引文/笔记、面板 ⚠ 展示、可删除可修复；
修复 = 用户重选原文 → 替换锚点 → **annotation_id 不变**（测试强制）→ resolved。
无自动智能修复（无 LLM/embedding）。

## 8. Web Reader Integration

选中弹窗（高亮/修复）、CSS Custom Highlights overlay（零 DOM 修改、支持重叠、不碰 article.md）、
标注面板（quote+note+状态+跳转+删除+修复）、导航=滚动+短闪、创建即时持久化（先存后显，无假成功）。

## 9. SQLite Projection

M1 的 JSON 索引投影标注摘要（id/type/status/时间/引文）；
**§43 验收**：删除索引 → 重建 → 标注完整恢复（数据源 annotations.jsonl，测试断言源文件未动）。
SQLite 本体继续推迟至 M3（全文搜索），边界一致。

## 10. Tests

135/135。M2 新增 39 例：存储语义 8、resolver+§38 场景+§46 变化矩阵 15、服务生命周期 7、
canonical 契约+ReaderAnchor 往返（含跨块）3、§43 重建+全循环+性能+状态隔离 4、渲染层回归若干。

## 11. Performance

**FACT**（测试内实测，i7/Windows）：200 段长文（13K 字符）+ 500 标注：创建 ~1.9s（≈4µs/个，含每次落盘），
全量重解析+持久化 **3ms**。结论：个人规模（数百标注）远低于可感知阈值，无需引入数据库/多线程（§49 纪律）。

## 12. Security

note/quoted_text 按不可信文本处理：渲染走 textContent/DOM 构造，永不 innerHTML；
纯文本笔记（无富文本）；标注不引入特殊 URL scheme；沿用 M0/M1 其余边界。

## 13. Known Limitations

1. GUI 端到端（选中→高亮→重启→恢复）未做浏览器自动化：核心链路全部自动化测试覆盖，Electron 冒烟启动通过；人工 Demo 按 M2 §60 清单执行（几分钟）。
2. `note`/`bookmark` 独立类型：模型支持，UI 仅提供 highlight+note（范围纪律）。
3. 高亮渲染依赖 Chromium 的 CSS Custom Highlights（Electron 内建支持）；极旧内核降级为面板可见（无内联底色）。
4. canonical text 依赖 markdown-reader 与渲染器 blocks→DOM 的结构一致性——由契约测试守护，新增块类型时须同步。

## 14. Deferred Items

EPUB/PDF Annotation Adapter（M6/M7）、标签系统、复杂颜色、SQLite 全文投影（M3）、
Annotation Migration（跨快照迁移，记录为未来能力 M?）、富文本/Markdown 笔记。

## 15. FACT / HYPOTHESIS / INFERENCE

- **FACT**：round-trip、§38 A-D、§46 变化矩阵、ambiguous 防误定位、§43 重建、repair 保 id、性能数字——全部自动化测试。
- **INFERENCE**：canonical 契约测试 + 创建时校验使「创建/重开不一致」在当前渲染路径不可能静默发生。
- **HYPOTHESIS**：CSS Custom Highlights 在未来渲染规模（万段文档）下仍流畅（M6/M7 复核）。

## 16. P0 / P1 / P2 Issues

- P0/P1：无。
- P2（已处理）：resolver 多命中零上下文误定位风险 → AMBIGUOUS 守卫 + 测试（RESOLVED）。
- P2（记录）：canonical 一致性依赖契约测试（CONFIRMED，可接受；渲染路径集中单一文件）。

## 17. M2 Exit Criteria

§61 清单 36 项全部满足（各项证据对应上文各节与测试地图）；其中「SQLite」项以 M1 既定的
可重建 JSON 索引等价实现（漂移已记录，M3 引入 SQLite 时边界不变）。

## 18. Recommended M3 Preconditions

- 索引投影已含标注摘要 → 全文搜索可直接纳入 note/quote 字段；
- annotations.jsonl 是稳定数据源 → FTS 重建语义与 M1 library 重扫一致；
- 建议先做：SQLite 引入选型（better-sqlite3 许可证/二进制审计）+ 一次 Library 规模 benchmark。
