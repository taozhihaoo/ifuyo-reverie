# Security Baseline — Reverie

> M0 已确认的安全边界。核心原则（总纲领 §18）：
> **所有外部内容都是不可信输入（Untrusted Input）。**
> Reader 不是浏览器；Reverie 不支持 DRM 破解、付费墙绕过或任何绕过访问控制的抓取。

---

## 1. 威胁模型

| 输入 | 载体 | 主要威胁 |
| --- | --- | --- |
| HTML | 网页捕获 / RSS 内容 | XSS（script、事件属性、javascript:）、恶意资源加载 |
| RSS XML | Feed 订阅 | XML 实体攻击、脚本注入、超大响应 |
| EPUB | ZIP 容器 | Zip Slip、压缩炸弹、内嵌脚本、外部资源回连 |
| PDF | 文档 | 嵌入 JS、内嵌文件、畸形解析器攻击 |
| 图片 / 字体 | 各处 | 解码器漏洞（交给 Chromium，不自行解码）、跟踪像素 |
| 外部 URL | 链接点击 | 协议滥用（javascript: 等）、Reader 内任意导航 |
| Native Messaging | 扩展 ↔ Host | 非 Browser 来源伪装、消息注入、超大消息、命令注入 |
| 文件路径 | Library / 下载 | 路径穿越、覆盖用户文件 |

## 2. HTML（保存的文章）

- 渲染前必须消毒：`src/security/sanitize-html.js`
  - DOMPurify（默认 allowlist）+ 显式 `FORBID_TAGS`（script、style、iframe、object、embed、form、input、link、meta、base、frame(set)、applet、audio、video、source、track、svg、math）
  - `FORBID_ATTR`：`style`、`srcset`（未来按需放宽，须先加测试）
  - URI 白名单：`https?:` / `mailto:` / `data:image/*` / 页内锚点
  - 已测：script、onclick/onerror、javascript:、iframe、form 均被剥离；正文结构（标题/列表/表格/代码/引用/图片/链接）保留
- Reader 最终渲染必须在**沙箱化 iframe**（无 `allow-scripts`，独立 origin）中执行 —— M1 落地；消毒层不是唯一防线。
- 外部 http(s) 链接默认走**系统浏览器**打开，Reader 不给任意网页执行环境。

## 3. URL Scheme

- `src/security/url.js`：仅 `http:` / `https:` / `mailto:` 允许外开；`javascript:` / `data:` / `file:` / `chrome:` / `vbscript:` / 协议相对地址 / 控制字符一律拒绝（含大小写混淆测试）。

## 4. EPUB

- **默认不允许执行任何脚本**。渲染容器 = 沙箱 iframe；EPUB 3 的 scripted 属性不授予特权。
- 外部资源默认阻断（隐私 + 安全），白名单机制留待 M6 论证。
- 解压必须走 `src/security/zip.js` 防护（见 §5）。
- 原始 EPUB 文件不可变；用户标注不写回 EPUB。

## 5. ZIP / 解压

- `src/security/zip.js`：
  - `isSafeEntryName`：拒绝绝对路径、盘符、UNC、`.`/`..` 组件、NUL/控制字符、超长名
  - `safeEntryPath`：解析结果必须落在目标目录内（Zip Slip 兜底）
  - `validateZipEntries`：条目数 ≤ 20000、单条 ≤ 1 GiB、总量 ≤ 4 GiB、大条目压缩比 > 1000 判为压缩炸弹
- 已有自动化测试覆盖上述全部拒绝路径。

## 6. PDF

- 使用 PDF.js 渲染；PDF 内嵌 JavaScript **不执行**（PDF.js 查看器默认不运行 PDF 脚本）。
- 内嵌文件（embedded files）不自动打开；密码保护 PDF 走用户输入，不缓存明文密码。
- 渲染上下文 = 沙箱 iframe（同 EPUB），M7 落地并在真实样本上复核。

## 7. Native Messaging

- **来源固定**：Host 校验调用方 origin 必须等于 `chrome-extension://<固定扩展 ID>/`，否则退出码 2；manifest 的 `allowed_origins` 只列该 ID。
- 消息契约（`src/capture/protocol.js`）：`protocol_version` 必须为 1；`request_id` 必须 UUID v4；URL 仅 http(s)；上限 url 2KB / title 512B / selected_text 10KB / 单消息 1MB（超限直接退出码 3，保持无歧义失败）。
- Host 由浏览器直接拉起（stdio），无网络监听、无 shell 拼接（Windows 启动器 `run-host.cmd` 仅固定转发 Node 脚本路径）。
- 队列写入为原子 append；失败返回 `queue_write_failed`，不静默丢弃。
- 日志只含 `request_id` 与 URL **origin**（不含 query、不含 selected_text、不含正文）。

## 8. 文件系统

- Library 元数据/标注写入 = tmp → fsync → rename 原子写（`src/core/atomic-write.js`），崩溃最多留下 `*.tmp-*` 残片，读者跳过。
- 索引/扫描器对 Library **只读**（M0 已有测试断言 byte 级不变）。
- 所有下载/解压目标路径必须经过 `safeEntryPath` 类校验后才落盘。

## 9. 日志与隐私

- 不记录：完整网页正文、Highlight/笔记内容、含 query 的完整 URL、用户文件内容。
- 可记录：事件类型、ID、URL origin、字节数、错误码。

## 10. 依赖

- 见 [THIRD_PARTY.md](../THIRD_PARTY.md)；全部许可证经核验（Apache-2.0 / MIT / MPL-2.0 OR Apache-2.0）。
- 引入任何新依赖前必须复检许可证与维护状态（AI 纪律 §30.4）。

## 11. 明确不做

- DRM 破解 / 付费墙绕过 / 登录绕过 / 私有内容抓取。
- Reader 内执行外部脚本或运行 EPUB/PDF 内嵌代码。
- 常驻本地 HTTP 服务器作为扩展通信通道（Native Messaging 优先）。

## 12. 已知开放项（移交后续阶段）

| 项 | 阶段 |
| --- | --- |
| Reader 沙箱 iframe + CSP 落地（消毒层之上的第二道防线） | M1 |
| EPUB 外部资源策略（默认阻断的例外机制） | M6 |
| PDF 渲染上下文真实样本复核 | M7 |
| Host 打包为独立可执行（去 Node PATH 依赖） | M11 |
| DRM/密码 PDF 的密码缓存策略细化 | M7 |
