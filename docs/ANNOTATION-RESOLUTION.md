# Annotation Resolution — 定位与恢复策略（M2）

> 目标：**确定性**地把保存的锚点重新定位到当前文档文本中；
> 无法证明唯一定位时进入 orphaned，绝不悄悄移动高亮、绝不删除。

## 1. 锚点的多重信息

| 信息 | 作用 |
| --- | --- |
| `position {start,end}` | canonical text 上的字符偏移缓存——**加速，不是真相** |
| `quoted_text` | 用户选中的原文（canonical text，非原始 DOM 串）——定位的主依据 |
| `prefix` / `suffix` | 前后各 32 字符——多命中消歧、验证命中正确性 |
| `source_content_hash` | 创建时文档哈希——一致则 position 可直用（仍校验 quote） |

## 2. 解析顺序（确定性，无 AI）

```text
Step 1  hash 相同 + position 处 quote 校验命中     → resolved (hash-position)
Step 2  quote 精确搜索：唯一命中                    → resolved (exact-quote)
Step 3  多命中：prefix/suffix 评分 > 0 的最优       → resolved (exact-quote-disambiguated)
        多命中且全部 0 分                           → AMBIGUOUS
Step 4  空白折叠匹配（处理空白丢失）                 → resolved (normalized-quote) / AMBIGUOUS
Step 5  字符间弹性空白匹配（处理空白新增）           → resolved (flexible-whitespace) / AMBIGUOUS
失败    → orphaned（保留引文/笔记，绝不删除）
```

服务层把 `AMBIGUOUS` 折叠为 `status: orphaned`（`quality: "ambiguous"`），
因此用户状态只有 resolved / orphaned 两种；ambiguous 是内部诊断信息。

## 3. 防误定位原则（M2 §16）

> “看起来差不多”不是定位成功。

- 多命中且上下文完全不匹配 → AMBIGUOUS → orphaned（宁可 orphaned，不可错位）。
- 有上下文时按前后文一致度评分取最优（测试覆盖：原文 A B C D 中高亮 B，
  内容变 A B X B C D 时不得定位到第二个 B）。
- 恢复成功后 position 缓存刷新并持久化；仅当状态或位置真实变化时才重写文件。

## 4. Canonical Text（M2 §36/37）

- 唯一来源：`src/reader/markdown-reader.js`（markdown → blocks b0..bN → canonicalText）。
- 渲染层用同一 blocks 构建 DOM ⇒ `DOM textContent === canonicalText`（测试强制）。
- 同一文档反复解析，blocks/canonicalText/hash 完全稳定（测试覆盖全部 fixtures）。
- 引文必须来自 canonical text——DOM 原始字符串（含未规范空白）不作为依据。

## 5. 内容变化（§38 场景，全部有测试）

| 场景 | 结果 |
| --- | --- |
| A 未变化 | resolved（hash-position 直用） |
| B 前文插入内容 | resolved（quote+context 重新定位，position 刷新） |
| C quote 消失 | orphaned（保留不删） |
| D 重复 quote | 唯一上下文匹配→正确位置；无匹配上下文→orphaned（不误选） |
| 前文/后文/中间加字、段落增删、空白增减、标题变化 | 全部 re-locate 测试覆盖 |

## 6. Repair（M2 §32）

用户在正文中重新选中原文 → `Replace Anchor` → **annotation_id 不变** → status 回 `resolved`。
不做自动智能修复（无 LLM/embedding/语义搜索）；确定性 anchor 系统先行，AI 只能是未来辅助层。

## 7. 跨块选择（M2 §18）

canonical text 是连续文本，跨段/跨标题选择 = 同一文本上的普通区间；
renderer 用统一的 偏移↔Range 映射（`reader-anchor.js`），round-trip 有测试
（heading→paragraph、paragraph→paragraph）。
