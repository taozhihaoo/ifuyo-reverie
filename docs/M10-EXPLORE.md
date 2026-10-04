# M10 Explore — Stability / Recovery / Doctor（Phase A 产物）

> FACT 来自当前仓库代码实测；HYPOTHESIS/INFERENCE 显式标注。（2026-10-05）

## 1. Current Architecture（不变量现状）

**FACT**：数据真相模型已成立——库文件（articles/books/pdf/markdown 目录 + meta.json +
article.md + annotations.jsonl + assets/source/）为真相；三个派生索引（library
index.json、search index、read-state 迁移产物）均可重建。loadIndex 在文件缺失/损坏时
自动 rebuild（catch → rebuildIndex）；search index 增量刷新 + 重建。

## 2. Persistence Map（真实写入路径 × 原子性审计，§6）

| 写入路径 | 机制 | 原子 | 中断窗口 | 评估 |
|---|---|---|---|---|
| meta.json | writeFileAtomic（tmp+fsync+rename） | ✅ | tmp 残留（可清扫） | 良好 |
| article.md / source/page.html / assets | staging `.tmp-<id>` → 校验 → promote | ✅ | staging 残留 = 真实数据待恢复 | **Doctor 需恢复** |
| annotations.jsonl 创建 | appendLine（fsync） | 行级 ✅ | 末行截断（读取端已容忍） | 良好 |
| annotations.jsonl 更新/删除 | writeFileAtomic 整文件 | ✅ | tmp 残留 | 良好 |
| serializeAnnotation = JSON.stringify(a) | 全对象序列化 | — | — | **未知字段保留**（§27 安全 ✓） |
| user-state.json | writeFileAtomic | ✅ | — | **版本守卫缺失（P1，见 §4）** |
| feeds.json | writeFileAtomic | ✅ | — | **版本守卫缺失（P1）** |
| library index.json | writeFileAtomic（rebuildIndex 内） | ✅ | — | 损坏→自动重建（但旧文件无隔离备份） |
| search index | writeFileAtomic | ✅ | — | 版本不匹配→重建（派生，可接受） |
| queue/*.json | writeFileAtomic + 启动 recoverOnStartup | ✅ | — | 良好（M1） |
| EPUB/导出 | 内存 zip → `.tmp` → 校验 → rename（M9） | ✅ | tmp 残留（M9 已清理） | 良好 |
| review/daily-review.json | writeFileAtomic | ✅ | — | 良好 |

**FACT**：writeFileAtomic（src/core/atomic-write.js）= tmp + fsync + rename + 失败清理，
符合 §7/§8 全部失败语义——**不新建第二套**。

## 3. Existing Recovery / Doctor

- **FACT**：doctor.js（M3）6 项检查：重复 document_id、meta 不可读/未来版本、双向
  索引一致性、坏路径、标注坏行/重复 id。**只读**（符合 §20 的检查边界）。
- **FACT**：`sweepTmpFiles` 已实现但**全仓库零调用**——孤儿临时文件清扫缺失（§9）。
- **FACT**：staging `.tmp-<id>` 目录残留（采集崩溃）**无任何恢复路径**——其中可能是
  完整文章（真实用户数据）。
- **FACT**：doctor:run IPC + `npm run doctor` CLI 已存在（旧 findings 形状
  {severity, code, detail}）。

## 4. P0/P1 Risks（§141，证据优先）

### P1-1：user-state.json 未来版本被静默重置（§26 违规）
**FACT**：`loadUserState` 对 `schema_version !== 1` 一律置 null → 走 M1 legacy 迁移 →
后续任何 updateUserState 写入**用空状态覆盖整个文件**。若文件来自未来版本（或升级工具），
用户的已读/收藏/Inbox/标签/进度**全部丢失**。

### P1-2：feeds.json 版本不匹配被静默清空（§26 违规）
**FACT**：`loadFeeds` 对 `feeds_version !== 1` 返回空表 → 下一次 addFeed/refresh 写入
**只剩新订阅**——订阅关系（用户资料，M4 §12）丢失。

### P1-3：标注 JSONL 无记录级修复（§80/§81）
**FACT**：坏行被跳过并报告（正确），但没有"保留原文件 + 重写有效行 + 隔离坏行"的
可执行修复——Doctor 只能报告不能修。

### 其余为 Gap 而非 Risk
孤儿 tmp 清扫缺失、staging 恢复缺失、Doctor findings 缺 severity 分级/repairability/
结构化报告/修复日志/备份、未来版本文件在 Doctor 中不可见。

## 5. Existing 汇总（§151 Step 2 清单）

1. Current Architecture：文件真相 + 三派生索引 + Electron 壳。 2. Persistence Map：上表。
3. Source of Truth Map：文章/书籍/PDF/标注/元数据/订阅/用户状态 = 文件；索引/搜索/统计 = 派生。
4. Derived Data Map：index.json、search-index.json、read-state 迁移、daily-review（REVERIE_HOME）。
5. Failure Surface：写中断（tmp 残留）、版本漂移、手工改文件、库搬迁、索引损坏、采集中断。
6. Existing Recovery：queue recoverOnStartup、loadIndex 自动重建、search 重建、标注坏行容忍。
7. Existing Atomic Write：writeFileAtomic/appendLine（fsync）。 8. Existing Migration：
   M1 read-state → user-state 一次性迁移；meta 未来版本拒绝（只读安全 ✓）。
9. Existing Validation：validateMeta/validateAnnotation/容器安全门/feed 校验。
10. Existing Tests：299 例（含故障注入式：损坏 meta/索引/加密 PDF/坏 ZIP 等）。
11. Missing Recovery：见 §4 三项 P1 + Gap 清单。
12. P0：无证据。P1：§4 三项。
13. Recommended Scope：未来版本保护 + 恢复原语（清扫/staging/隔离）+ Doctor v2
    （findings/safe-repair/备份/日志/报告）+ UI/CLI + 稳定性测试。**不做**：云同步、
    新框架、第二套原子写、Reader/Annotation 重写、File Watcher（增量刷新已覆盖，§44）。
