# Library — 资料库视图（M3）

> Library = 全部有效资料的统一入口。数据原则：文件是真相，视图/统计全部来自可重建的派生索引。

## 1. 视图

| 视图 | 定义 | 排序 |
| --- | --- | --- |
| 全部资料 | 当前 Library 中所有有效 Document | 捕获时间倒序（可切标题/最近打开） |
| Inbox | `inbox = true`，等待处理/整理的资料 | 同 All |
| 未读 | `read = false` | 同 All |
| 收藏 | `favorite = true` | 同 All |
| 最近阅读 | `last_opened_at` 存在的文档 | 最近打开倒序 |
| 标签 | `tags ⊇ {选中标签}`（多标签 AND） | 同 All |

计数（Inbox N / 未读 N / 收藏 N）由索引**即时计算**，不是存储状态（M3 §91）。

## 2. 独立状态（M3 §9/11）

`read`、`favorite`、`inbox` 三者**完全独立**，任意组合合法；
Mark as Read 不会自动移出 Inbox。持久化在 Library 内的
`user-state.json`（见 [USER-STATE.md](USER-STATE.md)）。

## 3. 过滤与组合

过滤是可组合谓词（`LibraryQuery`：text / read / favorite / inbox / tags / sort / limit / offset），
支持任意组合（如 未读 + tag:Rust、收藏 + tag:AI）——搜索语法中的
`tag: is: in: author:` 与视图过滤走同一执行路径。

## 4. 列表项（M3 §44/45）

高信息密度列表（不做卡片墙）：标题、来源 host、作者、日期、已读圆点、
收藏星、Inbox 标记、标签 chips；操作：打开 / 收藏切换 / 已读切换 / Inbox 切换 /
删除（需确认，明确列出将删除的内容）/ 文件夹定位 / 标签编辑（输入+回车，点 × 移除）。

## 5. 删除（M3 §35/36）

用户显式操作 + 确认框（列明将删除 Article/Annotations/Tags/State/Assets）；
删除后：目录移除、用户状态清除、索引同步移除——**无幽灵搜索结果**（有测试）。
无批量删除（M3 §83）。

## 6. 空状态（M3 §76）

每个视图有专属空文案（Inbox 空 ≠ 资料库空 ≠ 搜索无结果）。

## 7. 键盘（M3 §77-79）

Ctrl+K 聚焦搜索；搜索内 ↑↓ 选择、Enter 打开、Esc 返回；
列表项核心操作均可鼠标完成，搜索/打开链路键盘全程可达。
