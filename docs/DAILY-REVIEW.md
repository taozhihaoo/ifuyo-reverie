# Daily Review — 每日回顾（M5）

> 实现：`src/review/daily-review.js`。定位（M5 核心目标）：**阅读回顾，不是游戏化打卡**——
> 无签到/XP/等级/排行榜；不偷偷修改 Read State。

## 1. 数据来源（M5 §43）

复用既有数据，**无第二个 Review Database**：Highlight/Note 来自 annotations.jsonl 投影，
Saved Articles 来自 Library 索引。

## 2. 队列生成（M5 §49/§50）

- **确定性**：mulberry32 seeded RNG，seed = 日期 + 策略 + 文档数——
  同日同策略同库 → 队列完全一致（可测试可复现，有测试）。
- 一次生成、固定本次 Session、依次消费；不是逐项临时随机。
- 同一 Session 内同身份不重复（去重按 annotation/document identity，有测试）。

## 3. 策略（M5 §44）

`mixed`（默认，混合 Highlight/Note/文章）、`highlights`、`notes`、
`unread-articles`、`older-articles`（按捕获时间取较旧一半）。无推荐算法。

## 4. 数量

默认 10 条，可配 limit（5/10/20 均可）。不强制每日完成，无 Streak/成就。

## 5. 状态（M5 §46/§47）

- `REVERIE_HOME/daily-review.json`（派生用户状态）：`{ history: { <queue item id>:
  { last_reviewed_at } } }`，原子写入。
- **绝不**因 Review 打开而修改文档的 read/favorite/inbox/tags（M5 §46，测试断言
  article 目录不含任何 review 状态）。
- Document 被删除后：队列项跳过/标记失效，Session 不崩（M5 §97，索引存在性检查）。

## 6. UI（M5 §103）

极简：`[类型] 标题（点击回原文）/ 引文块 / 笔记 / [Previous] [Next] / 完成态`。
Open Article 直接进入 Reader（复用 openArticle）。
