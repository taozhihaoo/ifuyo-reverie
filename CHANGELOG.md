# Changelog

## Unreleased — UI refresh + audit fixes

### 界面

- 重做整套视觉层（`app/renderer/style.css`）：分层表面、柔光背景、卡片化列表、
  更明确的层级与克制动效；新增资料库视图标题区与「每日回顾」视图
- 修复 `--muted` 变量从未定义——24 处次要文字颜色实际失效，界面因此发灰发平
- 修复带 `hidden` 属性、但被 author CSS `display` 覆盖的控件（PDF/TTS 控制条、
  选区弹窗）可能常驻显示的问题（`[hidden] { display: none !important }`）
- 日期格式跟随界面语言（英文界面不再出现「2026年11月8日」）
- 列表标签只渲染一次；行内操作按钮改为悬停显示，减少视觉噪声

### 修复

- **每日回顾点击即崩溃**：视图所需的 8 个 DOM 节点在 `index.html` 中缺失，
  补齐视图并接线「上一张 / 下一张」
- **订阅源筛选失效**：`feedId` 由渲染层传入后，在主进程被丢弃
- **Metadata 导出** read / favorite / inbox / tags 恒为假值（读错了 `read-state.json`
  而非 `user-state.json`）
- **无标题 EPUB 无法打开**：`epub-reader-core.js` 漏导入 `node:path`
- **库列表来源站点恒为空**：搜索结果投影未返回 URL
- 采集网络失败时真实错误被 `signal is not defined` 覆盖；abort 监听器泄漏
- `fetchPage` 私有主机校验发生在请求之后（SSRF 防护时序），`fetchAsset` 无该校验
- 原生消息注册表写入失败被静默吞掉（`exit` 先于 callback 敲定 Promise）
- 冷启动 `searchIndexReady` 门禁从未赋值
- 「日志」按钮重复绑定；行内按钮的 active 状态是死代码
- 删除未被引用、未被 git 追踪的 `src/search/search-service-head.tmp` 旧副本

### 工程

- README 改为英文优先、中文第二，并为两种语言各附界面截图
- 新增 `LICENSE-APACHE` / `LICENSE-MIT`（双许可）与英文 `SECURITY.md`
- 新增 `npm run shots`：用真实 Electron + CDP 生成 README 截图
- 补齐 `smoke:ui` / `smoke:release` / `smoke:journey` / `smoke:packaged` /
  `smoke:capture-live`；移除指向不存在文件的 `spike:epub:node`
- 新增 3 项回归测试（订阅源过滤、`fetchPage` 请求前预检、无标题 EPUB）

**312 项自动化测试通过。**

## 1.0.0 (2026-10-05) — Self-Use 1.0

首个完整自用版本。M0–M12 全部里程碑完成，309 项自动化测试 + 7 项真机冒烟。

### 阅读

- Web 文章采集（正文提取 + 图片本地化 + 净化）与块级渲染阅读器
- EPUB 2/3 阅读器（章节流、目录、进度、标注）
- PDF 阅读器（懒渲染、缩放、文本层选择与高亮、大纲）
- TTS 有声阅读（Windows 本地语音、语速、句子级跟随、选区朗读）

### 档案

- RSS/Atom 订阅（去重、条件请求、SSRF 防线）
- Pocket / Wallabag / Raindrop 导入（幂等 + provenance）
- 划线/笔记/书签（M2 统一标注模型，定位失败转 Orphaned 不删除）
- 每日回顾（确定性队列）

### 搜索与导出

- 全局搜索（标题/作者/正文/标注/标签/URL，过滤语法，结果直达阅读位置）
- 导出：Markdown / EPUB 3（含标注附录）/ Metadata / Highlights
- 高级 EPUB 导出（多文档合并成书、内容寻址资产、确定性产物）

### 数据安全与恢复

- 文件即真相：库为纯文件目录，整库复制即备份/迁移
- 原子写入全覆盖；崩溃残留可清扫；采集中断可恢复
- Doctor 体检（11 项检查、分级修复、备份/隔离/日志）；索引损坏自动重建
- 未来格式文件只读保护，拒绝降级覆写

### Windows 产品化

- Portable 打包（checksums + manifest）；NSIS 安装器配置
- 单实例、文件参数打开、窗口状态持久化、库位置选择
- 有界分级日志、崩溃钩子、6+1 项真机冒烟自检

### 修复

- feed 刷新后新文章可见但打不开（库索引未随刷新重建）
- 搜索结果面板渲染前抛错导致永远空白（缺失 #search-hint 元素）
- RSS 订阅输入框未接线（无 UI 入口）
- 文章不支持位置书签
- 重建索引按钮静默失败（els.queueHint 未定义）
- EPUB 阅读进度恢复与打开渲染竞态
- feed 刷新写错索引路径等（详见各里程碑 STATUS）
