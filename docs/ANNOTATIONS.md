# Annotations — 标注系统（M2）

> 标注是 Reverie 中独立的一等数据资产：可创建、可持久化、可恢复、可导航，
> **不因为页面变化而悄悄消失**。格式规范见 [ANNOTATION-FORMAT.md](ANNOTATION-FORMAT.md)，
> 定位算法见 [ANNOTATION-RESOLUTION.md](ANNOTATION-RESOLUTION.md)。

## 1. 模型与生命周期

```text
创建（选中→高亮，可带纯文本笔记）
  ↓ status: resolved（创建即校验：锚点必须能在正文中解析，否则拒绝保存）
阅读（重新打开文章）
  ↓ 重新解析：hash 一致→position 直用；不一致→quote+上下文重定位
  ↓ 能唯一定位 → 保持 resolved（position 缓存刷新）
  ↓ 无法唯一定位 → status: orphaned（⚠ 显示引文与笔记，绝不删除）
修复（用户重选原文）
  ↓ 替换锚点，annotation_id 不变 → resolved
删除（用户显式操作）
  ↓ 从 annotations.jsonl 原子重写移除
```

## 2. 数据关系

- 标注绑定 **document_id**（文章快照），不是 URL——同一 URL 可产生多个不同时间的快照（M1 重复语义），标注跟着快照走（M2 §39/40）。
- 高亮与笔记：`highlight` 类型 + `note` 字段（纯文本，最安全）；`note` / `bookmark` 类型在模型中保留。
- 标注数据源 = 文章目录下的 `annotations.jsonl`；`article.md` 是正文真相，**绝不写入高亮标记**（M2 §41）。

## 3. 服务边界（M2 §24）

```text
UI（选中/面板/导航）
   ↓ IPC
AnnotationService        src/annotation/service.js   ← 业务规则（创建校验/解析/状态）
   ↓
AnnotationStore          src/annotation/store.js     ← JSONL 追加 + 原子重写
   ↓
annotations.jsonl        文章目录内（Source of Truth）
```

## 4. Reader 集成（M2 §25/§34/§35）

- **规范化契约**：`src/reader/markdown-reader.js` 是 canonical text 的唯一来源；
  主进程解析（解析/哈希），渲染层用同一 blocks 构建 DOM —— DOM textContent === canonicalText（有测试强制）。
- **选中 → 锚点**：渲染端 `reader-anchor.js` 只做偏移映射（quote/prefix/suffix 提取 + 偏移→Range）；
  解析授权在主进程 resolver。创建时主进程校验，杜绝「创建 A 重开 B」的静默漂移。
- **高亮渲染**：CSS Custom Highlights overlay —— 不改 DOM、支持重叠、不破坏链接/代码/图片、重启后由解析结果重建。
- **跨块选择**：canonical text 连续，跨段/跨标题选择就是同一段文本上的区间（有专门测试）。

## 5. 索引投影（M2 §42/43）

`index.json` 中每篇文章带 annotations 摘要（id/type/status/时间/引文）。
**删除索引 → 重建 → 标注完整恢复**（数据源是 annotations.jsonl，投影只是派生）。
