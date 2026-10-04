# M10 Implementation Plan — Stability / Recovery / Doctor

> 原则：复用 writeFileAtomic / scanLibrary / readAnnotationsFile / rebuildIndex；
> 收敛而非膨胀（§138）；不制造框架（§137）。

## Batch 2 — 未来版本保护（P1-1/P1-2）

| 文件 | 修改 |
|---|---|
| src/library/user-state.js | 版本 > 当前 → 返回 `{unsupported:true}` 标记态；`updateUserState/forgetDocument` 拒绝写（抛 UnsupportedVersionError）；loadUserState 不再走 legacy 迁移覆盖 |
| src/feed/feed-store.js | 同构：`loadFeeds` 返回 unsupported 标记；`saveFeeds` 拒绝写 |
| src/core/errors.js 新增 | `UnsupportedVersionError extends Error`（code='UNSUPPORTED_VERSION'） |

验收：未来版本文件字节不变 + 写入被拒 + Doctor 可见（§26/§72-Invariant 6）。

## Batch 3 — 恢复原语（src/library/recovery.js）

- `sweepTmpFilesRecursive(root)`：递归清扫 `*.tmp-*` / `*.epub.*.tmp`（返回清扫清单）。
- `findStagingCandidates(root)`：`articles/*/.tmp-<id>` 且含 meta.json+article.md → 候选。
- `recoverStaging(root)`：校验通过 → promote 到 `articles/<year>/<id>`（目标已存在→跳过）；
  校验失败 → 移入隔离区 `<root>/.recovery/quarantine-<ts>/`（附 reason.json，§82：
  可恢复/有记录/不入索引）。
- 全部动作写 `.recovery/repair-log.jsonl`（结构化 §22）。

## Batch 4 — Doctor v2（src/library/doctor.js 重写）

- Findings：`{checkId, severity: info|warning|error|critical, entityType, entityId, path,
  problem, repairability: safe|conditional|manual|none, suggestedAction}`。
- Checks（§98 顺序）：① 根目录/结构 ② 文档扫描错误 ③ 重复 id ④ meta 校验（经 scan 错误）
  ⑤ 标注坏行/重复 id（**conditional repair**：备份原文件→重写有效行→隔离坏行，§80/§81）
  ⑥ 双向索引一致性 ⑦ 孤儿 tmp ⑧ staging 候选 ⑨ 未来版本状态文件（P1-1/2 可见）
  ⑩ 订阅表校验（重复 feed id/URL）⑪ 导出残件（`*.epub.*.tmp`）。
- `repairSafe(libraryRoot, {dryRun, signal})`：只执行 repairability==='safe'：
  清扫 tmp、重建双索引、staging 恢复；之前对将改动文件做 `.recovery/backup-<ts>/` 副本；
  结束后重跑 scan 验证（§20 Validate→Apply→Validate）；全程写修复日志。
- Report：`{summary{documents, bySeverity, repairable}, findings, generatedAt}` +
  `reportToMarkdown(report)` / JSON（§66，不含正文内容 §61）。
- **幂等**（§104/105）：健康库连续 scan/repair 零新 findings、repair 二次 no-op。
- **不依赖索引**（§95）：检查全部先跑文件侧，索引仅作一致性证据。

## Batch 5 — 接线

- `doctor:run` 返回新 report；新增 `doctor:repair {dryRun}`；preload `doctorRepair`。
- UI：侧栏「Doctor」按钮 → `#doctor-panel`（发现列表按严重度着色 + 「安全修复」
  （confirm 预览：目标/动作/影响，§65）+ 「导出报告」.md）。
- CLI：`npm run doctor [-- --repair]` 输出新报告（人读文本）。

## Batch 6 — 稳定性测试（tests/stability/stability.test.js + recovery.test.js）

1. 未来版本保护：user-state/feeds 塞 schema_version=99 → 读不受影响、写被拒、文件字节
   不变（不变量 6）；Doctor 报 critical/error finding。
2. writeFileAtomic 故障注入（TEST 钩子 failAt='before-rename'|'before-flush'）：
   原文件完好 + tmp 残留 → sweep 清理（不变量 3/8）。
3. staging 恢复：完整 staging → promote；缺 article.md → 隔离区+日志。
4. Doctor：构造损坏 fixture 库（坏 meta 目录/坏 jsonl 行/孤儿 tmp/staging/未来版本/
   重复 feed id）→ findings 逐项断言；repairSafe 修复 safe 项 + 备份 + 日志；
   **幂等**（二次运行零 findings）；标注 JSONL 记录级修复（坏行隔离、好行保留）。
5. 索引损坏：index.json 写入垃圾字节 → loadIndex 自动重建 + 旧文件备份
   （不变量 1/2）；删除索引后 user-state/feeds/annotations/进度全部幸存（§111）。
6. 库可移植：复制整个库目录到新路径 → scan/搜索/标注全部可用（§73/§74）。
7. Daily Review / 标注在 Doctor scan 前后不变（§115/§68 只读保证）。

## Batch 7 — 回归 + 文档

- 全量回归（M1–M9）+ docs（合并为 M10-STATUS/RECOVERY-AND-DOCTOR.md，含持久化地图、
  失败语义、检查清单、修复规则、验收矩阵 §143）+ DECISIONS/PROGRESS。

## 风险与边界

- 不做 File Watcher（增量刷新+手动重建已覆盖 §44）；不做全量自动修复（破坏性修复一律
  报告给用户）；大库压力引用既有 bench（1,000 篇 1.1s 全量重建基线），10k+ 留实测记录。
