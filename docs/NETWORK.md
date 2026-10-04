# Network — 网络策略（M4）

> HTTP 基础设施统一位于 `src/capture/fetch.js`（fetchPage / fetchUrl / fetchAsset）——
> Web Capture、Feed Fetcher、未来 Import 全部复用同一实现（M4 §53）。

## 1. 允许的 Scheme

仅 `http:` / `https:`；每一跳重定向后重新校验（含降级检测）。
拒绝：file: / javascript: / data: / ftp: / 未知协议。

## 2. 超时（记录于 DECISIONS.md）

| 项 | 值 |
| --- | --- |
| 请求超时（网页） | 15s |
| 请求超时（Feed） | 20s |
| 资源超时 | 10s |
| 取消 | AbortSignal 贯穿（fetchUrl signal 参数 + 用户取消传播） |

## 3. 重定向

- 上限 5 跳；每跳重新执行：scheme 校验 + 私有网段校验（M4 §55/57）。
- 30x 无 location → NETWORK_ERROR；循环 → "too many redirects"。

## 4. 重试（M4 §66/67）

- 仅瞬时错误（NETWORK_ERROR：超时/连接失败/5xx）重试，Feed 刷新最多 2 次、退避 1s/2s。
- 4xx / 非 XML / 安全拒绝 / EXTRACTION_FAILED **永不重试**。
- 单 Feed 失败不阻塞 Refresh All（并发 4、结果彼此独立）。

## 5. 响应大小

- HTML/Feed 5MB、单资源 10MB；超限 → 明确错误（"exceeds N bytes"），非 OOM。

## 6. 私有网段策略（M4 §57）

默认拒绝（本机开发/测试通过 `REVERIE_ALLOW_PRIVATE_NETWORK=1` 或
per-call 主机白名单显式开放）：localhost、*.localhost、*.local、.internal、
127.0.0.0/8、10/8、172.16/12、192.168/16、169.254/16、::1、fc00::/7、fe80::/10。
已知限制：按 hostname 判断，未做 DNS 解析后 IP 校验（见 M4-STATUS Known Limitations）。

## 7. 条件请求（M4 §64/65）

Feed 刷新携带 `If-None-Match`（ETag）/`If-Modified-Since`；304 → unchanged，
不重新解析。ETag/Last-Modified 持久化于 feeds.json（Fetch State），不写入 article.md。

## 8. 日志与隐私（M4 §52/114/115）

可记录：feed_id、请求开始/时长、HTTP 状态、重定向、结果（成功/失败/原因 code）。
不记录：完整 URL query、凭据、Cookie、Authorization、Note/Highlight 内容、正文。
默认无遥测；搜索/阅读/标注完全离线可用。
