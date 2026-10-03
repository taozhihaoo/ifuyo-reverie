# Capture — 网页采集（M1）

> 本文档是 Web Capture 子系统的运行手册：协议、队列、管线、持久化、重复判定。
> 实现位于 `src/capture/`（协议/队列/管线）与 `src/library/`（持久化/索引）。

---

## 1. 链路总览

```text
Browser Extension (协议 v1)
    ↓ Native Messaging（4 字节 LE 长度 + UTF-8 JSON）
Reverie Capture Host        ← 只做：校验 → 入队 → 回 accepted
    ↓
REVERIE_HOME/queue/<request_id>.json（持久化队列，一任务一文件）
    ↓
App 启动时 Worker：recoverOnStartup → claimNext → runCapture
    ↓
Library 文章目录 → index.json（派生，可重建）→ UI
```

要点：**Host 永远不联网抓取**；App 关闭时任务在队列里等待，下次启动自动处理（M1 §5.1）。

## 2. 协议 v1

### CaptureRequest

```json
{
  "protocol_version": 1,
  "request_id": "<uuid-v4>",
  "url": "https://example.com/post",
  "title": "页面标题",
  "source": "browser",
  "capture_mode": "article",
  "created_at": "2026-10-04T08:00:00.000Z"
}
```

- `capture_mode` 目前只有 `article`；`full_page` / `selection` 是协议占位，禁止提前实现。
- 限制：url ≤ 2KB、title ≤ 512B、单消息 ≤ 1MB。

### CaptureResponse

```json
{ "protocol_version": 1, "request_id": "...", "status": "accepted",
  "article_id": null, "error_code": null, "message": null, "responded_at": "..." }
```

- Host 阶段只回 `accepted` 或 `failed`；`completed / duplicate` 由队列最终状态体现（App 内可见）。
- 稳定错误码（UI 只看 `status` + `error_code`，绝不解析 message）：
  `INVALID_REQUEST` `UNSUPPORTED_PROTOCOL` `INVALID_URL` `NETWORK_ERROR`
  `EXTRACTION_FAILED` `PERSIST_FAILED` `ASSET_DOWNLOAD_FAILED` `DUPLICATE`
  `SECURITY_REJECTED` `UNKNOWN_ERROR`。

## 3. 队列

- 状态机：`queued → running → completed | failed | duplicate`。
- **重试策略**：仅 `NETWORK_ERROR` 重试（默认最多 3 次，`retry_count` 记录）；`INVALID_URL` / `UNSUPPORTED_PROTOCOL` / `SECURITY_REJECTED` / `EXTRACTION_FAILED` / `PERSIST_FAILED` 一律不重试。
- **崩溃恢复**：启动扫描把 `running` 置回 `queued`（worker 死了 → 任务重来；永不卡死）；坏文件跳过。
- **一任务一文件**：写入是单文件原子替换，崩溃最多影响那一个任务。

## 4. 抓取管线

```text
Fetch → Extract → Sanitize → Assets → Markdown → Duplicate? → Persist → Verify
```

| 阶段 | 规则 |
| --- | --- |
| Fetch | 仅 http(s)（重定向每一跳都校验）；15s 超时；5MB 上限；≤5 次重定向；非 HTML 拒绝；按 Content-Type charset 解码（GBK/Big5 等） |
| Extract | M0 验证的 Mozilla Readability；产出 title/byline/published_time/lang/canonical/正文 HTML |
| Sanitize | DOMPurify + FORBID（script/style/iframe/form/…）；URI 白名单（http/mailto/data:image） |
| Assets | 并发 4 下载文章图片 → `assets/<sha256>.<ext>`；单图 10MB；**失败不致命**：记入 `meta.capture_warnings`，正文保留原 URL |
| Markdown | 明确转换规则（见 `src/article/markdown.js` 头注释）：可读性优先，不伪装无损 |
| Duplicate | 归一化 URL（去 utm_*/fbclid/gclid、参数排序、host 小写、去 #）+ canonical + content_hash；**同源同内容 = duplicate；同源不同内容 = 合法的新 Capture** |
| Persist | `.tmp-<id>` staging → 写全部文件 → 校验（meta 可解析 / article.md 非空 / content_hash 匹配 / 引用的 asset 齐全）→ 原子 rename 提升；崩溃只留 `.tmp-*`（扫描器忽略点目录） |
| Verify | 提升后重读 meta + 校验 hash 才标记 `completed` |

## 5. 目录与字段

```text
REVERIE_HOME/
├─ library/articles/<年>/<document-id>/   ← Source of Truth
│  ├─ article.md / meta.json / source/page.html / assets/
├─ queue/<request_id>.json                ← 持久化队列
├─ index.json                             ← 派生索引（可重建）
└─ read-state.json                        ← 阅读状态（App 级，绝不写入正文）
```

`meta.json` 遵循 [FORMAT.md](FORMAT.md) v1；M1 新增可选字段：`published_at`、`language`、`description`、`site_name`、`capture_warnings`（前向兼容：读取方保留未知字段）。可选项**缺省即省略**，不写 null。

## 6. 环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `REVERIE_HOME` | `%LOCALAPPDATA%/Reverie` | 队列/索引/阅读状态 |
| `REVERIE_LIBRARY` | `<REVERIE_HOME>/library` | 用户资料库（可指到任意目录，如 OneDrive 内） |

## 7. 手工验收清单（对应 M1 §38 Demo）

1. `powershell -File native-host/register.ps1`（注册 Chrome/Edge）
2. `chrome://extensions` → 开发者模式 → 加载 `extension/`（ID 固定为 `ngfmioeinapcphpbgboaajachhhdgajg`）
3. `npm run app` 打开 Reverie
4. 浏览器打开任意文章 → 点 Reverie 图标 → 徽章 `SAVED`
5. App 列表出现文章 → 打开阅读 → 关闭 App 重开 → 文章仍在
6. 删掉 `REVERIE_HOME/index.json` → App 内「重建索引」→ 列表恢复
7. 断网保存 → 任务 `failed` + `NETWORK_ERROR`，无假成功
