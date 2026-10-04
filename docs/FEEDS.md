# Feeds — 订阅管理（M4）

> 实现：`src/feed/feed-store.js`（持久化）+ `feed-service.js`（编排）。

## 1. Feed Model

```json
{
  "feed_id": "<uuid>",              // Reverie 生成，不随 URL Redirect 变化
  "original_url": "用户输入的 URL",
  "canonical_url": "重定向后归一化 URL（去重键）",
  "custom_title": null,             // 用户改名（用户状态）
  "remote_title": "服务器提供的标题",
  "site_url": "...", "description": "...", "language": "...", "image_url": "...",
  "format": "rss | atom",
  "enabled": true,                  // 订阅开关（≠ inbox，≠ read）
  "etag": null, "last_modified": null,
  "last_fetched_at": null, "last_success_at": null,
  "last_error": { "code": "...", "message": "..." } | null,
  "created_at": "...", "updated_at": "..."
}
```

稳定元数据（title 等）与运行状态（etag/last_error/...）分离；
用户 `custom_title` 永不被 Feed 刷新覆盖（M4 §92/93）。

## 2. 持久化

`<Library>/feeds.json`（原子写入）。**订阅关系属于用户资料**：
删除派生索引 → Feed 与全部 RSS Article 原样恢复。

## 3. 操作规则

| 操作 | 规则 |
| --- | --- |
| Add | 先 Fetch+Parse 验证成功才持久化；失败不留半 Feed（§88/89） |
| Duplicate | canonical URL 相同 → 提示已订阅，不创建第二个（§90）；重定向归一后同源亦识别（§91） |
| Refresh | 仅用户触发；条件请求（ETag/Last-Modified）→ 304 = unchanged；有界重试（仅网络类 ×2） |
| Refresh All | 并发上限 4；**允许部分失败**（A 成 B 败 C 成），结构化结果（§69/70/120） |
| Pause | enabled=false → 刷新跳过；**已有文章保留在 Library**（§48） |
| Delete | 只删订阅；**已有文章保留**（§49）。重新添加同 Feed → 按身份/URL 重新关联，不产生重复文章（§50） |
| Rename | 写 `custom_title`，不覆盖 remote_title（§92） |
| Unread Count | 由 Document read state 查询得出（§94），不单独维护计数 |

## 4. RSS Article → Library

条目进入统一 Document（type=article + `source_type: "feed"` + feed_id/feed_title），
文件布局与 Web Capture 相同（article.md/meta.json/annotations.jsonl/source/feed-item.json），
自动进入 Inbox（unread + inbox=true）、Search、Reader、Annotation——
**没有第二套 RSSLibrary/RSSSearch/RSSReader**（M4 §7）。

## 5. Feed 更新与用户数据（§40/44）

刷新只更新 Source/Content：read/favorite/inbox/tags/标注/笔记**一概保留**（回归测试覆盖）。
内容变化 → 原子重写 article.md → 标注由 M2 Resolver 重定位（resolved 或 orphaned）。
Feed 删除条目 ≠ 删除用户文章。

## 6. 隐私与网络行为（§51/52/127）

- 仅用户触发的 Refresh/Add 访问网络；无启动自动抓取、无后台轮询（M4 无 Scheduler）。
- 每次请求可回答：为什么/哪个 URL/何时/结果/为何失败（feed_id + 状态码 + 时长入日志；
  不记录凭据/Cookie/Authorization）。
- 断网时 Library/Reader/Search/Annotation 全部正常，仅 Refresh/Add 失败。
