# M10 Status — Stability / Recovery / Doctor

> M10 完成报告。测试证据：`npm test` **309/309 全绿**（M10 新增 10 例稳定性测试）+
> `npm run smoke:doctor` **真实 Electron 运行 10/10 检查通过**（注入真实损坏 →
> 真实 UI 扫描/修复 → 磁盘验证）。

## 1. Goal（§1）

> 当 Reverie 遇到"坏掉、断掉、改过、移动过、升级过、删掉索引、异常退出"时，
> 用户的数据还能不能回来？

**回答（§142 的 20 问，全部有证据）**：能。详见 docs/RECOVERY-AND-DOCTOR.md 的
故障语义表与验收矩阵（§143 按真实实现重写）。

## 2. Persistence Audit（§6，完整表见 M10-EXPLORE.md §2）

- 全部关键写入路径走 `writeFileAtomic`（tmp + fsync + rename + 失败清理）——单一机制，
  无第二套（§7 ✓）。
- 失败语义（§8 A-D）：原文件在写失败/校验失败/replace 前崩溃时保持完好；
  tmp 残留可清扫（`sweepTmpFilesRecursive`，M10 接通——此前实现存在但**零调用**）。
- 采集管线 staging（M1）：崩溃残留 `.tmp-<id>` 现在可被 Doctor **恢复**（有效→promote，
  无效→隔离区附原因）。

## 3. P1 修复（真问题，非架构偏好）

1. **user-state.json 未来版本被静默重置** → 现在：只读保护态，读取照常、写入拒绝
   （`UnsupportedVersionError`）、文件字节不变；Doctor 报 error。（测试+断言锁定）
2. **feeds.json 版本不匹配被清空**（订阅=用户资料）→ 同构保护。（测试锁定）
3. **标注 JSONL 记录级修复缺失** → `repairAnnotationsFile`：备份原文件 → 保留全部
   有效行（未知字段随对象保留，§27 ✓）→ 坏行/重复行移入隔离区 → 刷新搜索索引 →
   修复日志。（测试+真机锁定）
- Invariant 6（未知格式 ≠ 破坏性覆写）自此对**所有**用户数据文件成立。

## 4. Doctor v2（核心资产，§14-§23）

- **文件系统优先**（§95）：所有检查先跑文件侧；索引仅作交叉证据——索引损坏/缺失时
  Doctor 完全可用。
- **11 项检查**（§98 顺序）：根目录 → 文档扫描 → 重复 id → 标注坏行/重复 → 空正文 →
  孤儿 tmp → staging 候选 → 未来版本文件 → 订阅表（重复 id/URL）→ 索引双向一致性
  （坏路径/陈旧行/缺失行）→ 索引可读性。
- **Findings 模型**：`{checkId, severity(info|warning|error|critical), entityType,
  entityId, path, problem, repairability(safe|conditional|manual|none), suggestedAction}`。
- **Safe Repair**（`repairSafe`，dryRun 预览 → 备份 → 执行 → 重扫验证）：清扫 tmp、
  staging 恢复、重建双索引——顺序按 §99（源相邻恢复在前，派生重建最后）；用户源文件
  0 改动（预览明示）。**幂等**（§104/105，测试锁定）。
- **Conditional Repair**：标注记录级修复（独立入口 + 预览确认 + 备份 + 隔离 + 日志）。
- **修复日志**：`.recovery/repair-log.jsonl`（结构化 §22：checkId/target/before/after/
  result）；**备份**：`.recovery/backup-<ts>/`；**隔离区**：`.recovery/quarantine-<ts>/`
  （附 reason，可还原，不入索引，§82）。
- **报告**：summary（文档/检查/分级/可修复）+ Markdown 导出（不含正文内容 §61/66）。

## 5. 接线

- IPC：`doctor:run`（新 report 形状）、`doctor:repair {dryRun}`、
  `doctor:repair-finding {checkId, docDir, dryRun}`、`report:write`。
- UI：侧栏「🩺 Doctor 体检」→ 面板（发现按严重度着色 + 安全修复（confirm 预览 §65）+
  标注"记录级修复"按钮 + 导出报告 .md）。
- CLI：`npm run doctor [-- --repair]`（预览 + 执行 + 剩余计数）。

## 6. Tests / Regression / Smoke

- **10 例稳定性测试**（tests/stability/）：未来版本保护（字节不变断言）×2、
  原子写故障注入（原文件完好+tmp 残留+清扫）、staging 恢复（promote+隔离+日志+幂等）、
  Doctor（损坏库逐项 findings、dryRun 计划、safe 修复、幂等、健康库零动作）、
  标注记录级修复（备份/隔离/日志/未知字段保留）、库可移植（整库复制后诊断一致+
  修复可用）、索引损坏自动重建+搜索恢复。
- **回归**：M0–M9 全部 299 例无回归（309/309）。
- **真机 smoke 10/10**（npm run smoke:doctor）：注入 4 类真实损坏 → UI 扫描（5 findings
  分级正确）→ 安全修复（清扫/staging/索引）→ 条件修复（坏行隔离）→ 磁盘逐项验证
  （.recovery 日志/备份/隔离区、未来版本文件原样）→ 重扫幂等 → 报告导出。

## 7. 按既有架构确认的归属（§110/§111）

Read State/Favorite/Inbox/Tags/Progress = `user-state.json`（库内）；Bookmark/Annotation =
annotations.jsonl（库内）；订阅 = feeds.json（库内）；Feed 派生统计/搜索/索引 = 派生。
**删除全部派生索引后**：上述用户数据全部幸存（测试锁定，Invariant 1）。

## 8. Known Issues / Deferred（不掩盖）

- 大库压力：沿用既有基线（1,000 篇全量重建 1.1s，PERF.md）；10k+/50k 与 24h 长跑
  未自动化（记录为 M11 前的人工观测项，条件性技术债）。
- File Watcher 未引入（增量刷新 + Doctor/重建入口已覆盖 §44 的实际需求）。
- epubcheck 等 Doctor 外部验证器未接入（与 M9 同一边界）。
- Windows 长路径/UNC 专项扫描未做（现有路径处理全部相对 + 安全门，记录为 M11 观测项）。
- P0：无。P1：三项已全部修复（见 §3）。

## 9. M11 Dependencies

- 启动序列已满足 §93/§94（不依赖 SQLite，索引缺失自动重建）——M11 的安装器/更新器
  可直接复用 Recovery 语义。
- `npm run doctor` CLI 与 smoke:doctor 可纳入发布前自检清单。
