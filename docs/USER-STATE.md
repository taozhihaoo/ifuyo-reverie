# User State — 用户状态（M3）

> 用户明确产生的状态属于 **用户 Library**（随资料库移动/同步），绝不只存在于数据库。
> 实现：`src/library/user-state.js`；存储：`<Library>/user-state.json`（原子写入）。

## 1. 字段

| 字段 | 含义 | 默认 | 更新规则 | 失败处理 |
| --- | --- | --- | --- | --- |
| `read` | 用户已完成基本阅读 | `false` | 仅显式 Mark as Read/Unread；打开文章**不**自动已读（M3 §8） | 写失败 → UI 回滚 + 提示「无法保存此更改」；索引标记 dirty 后续刷新 |
| `favorite` | 系统级收藏（≠ tag） | `false` | 仅显式 Add/Remove Favorite | 同上 |
| `inbox` | 等待处理/整理 | **`true`**（新保存即入 Inbox） | 仅显式切换；Mark Read 不自动移出（M3 §11/134） | 同上 |
| `tags` | 用户标签（字符串数组） | `[]` | 显式添加/移除；规范化见下 | 同上 |
| `last_opened_at` | 最近打开时间（Recent 依据） | `null` | 打开文档时写入一次（M3 §131） | 失败仅影响 Recent 排序，可忽略 |
| `last_read_at` | 最近标记已读时间 | `null` | 随 read=true 写入 | 同上 |

三态独立性（M3 §9/11）：read / favorite / inbox 任意组合合法；
UI 不做「已读→移出 Inbox」之类的隐式联动。

## 2. 文件格式

```json
{
  "schema_version": 1,
  "states": {
    "<document_id>": {
      "read": true, "favorite": false, "inbox": false,
      "tags": ["Rust", "AI"],
      "last_opened_at": "2026-10-05T00:00:00.000Z",
      "last_read_at": "2026-10-05T00:00:00.000Z",
      "updated_at": "..."
    }
  }
}
```

- 位置：`<Library>/user-state.json`（env `REVERIE_USER_STATE` 可覆盖；测试用）。
- 写入：tmp → fsync → rename 原子替换（崩溃后只能是旧文件或新文件）。
- 损坏：文件不可解析 → 回退默认值 + 后续写入重建；**绝不丢失其他用户资料**。
- 迁移：M1 的 `read-state.json`（REVERIE_HOME）首次加载时自动迁移 read 状态。

## 3. Tag 规范化（M3 §15/16）

- trim + 折叠内部空白；空串 / 纯空白 / >64 字符 / 含控制字符 → 拒绝。
- 比较用小写键；**显示保留第一次创建的形式**（"Rust" 创建后输入 "rust" 复用既有标签，不产生第二个）。
- 无层级、无别名、无自动标签（M3 §14 纪律）。

## 4. 与索引的关系（M3 §72/73/89）

```text
UI → user-state.json（原子写，Source of Truth）
        ↓ 成功后
    派生索引刷新（增量）→ UI refresh
```

索引刷新失败：用户文件仍正确，索引短暂 dirty，后续 refresh/重建恢复（有测试）。
