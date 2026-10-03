# ifuyo Reverie — M2 Annotation Core 标注核心开发提示词

你现在继续开发 **ifuyo Reverie**。

这是一个 Windows-first、local-first、file-native 的个人阅读与资料归档中心。

当前阶段进入：

> **M2 — Annotation Core / 标注核心**

---

# 一、M2 的核心目标

M2 不只是“给 Web Reader 增加一个高亮按钮”。

本阶段真正需要建立的是：

> **一个与具体阅读格式解耦、可以长期保存、可以重新定位、可以处理内容变化、可以出现 orphaned 状态、未来能够同时服务 Web / EPUB / PDF / Markdown 的 Annotation Core。**

M2 完成后，用户应该能够：

```text
打开已经保存的文章
    ↓
选中文本
    ↓
创建高亮
    ↓
给高亮添加笔记
    ↓
关闭 Reverie
    ↓
重新打开
    ↓
高亮和笔记仍然存在
    ↓
点击标注
    ↓
Reader 跳转到对应原文
```

同时必须验证：

```text
文章内容发生变化
    ↓
原来的字符 offset 不再可靠
    ↓
Reverie 尝试根据 quote + context 等信息重新定位
    ↓
无法可靠定位
    ↓
标记为 orphaned
    ↓
绝不静默删除
```

M2 的最终结果应该是：

> **Annotation 是独立的一等数据，而不是写死在 HTML / article.md 里的临时 UI 状态。**

---

# 二、必须遵守的产品原则

## 1. 文件是用户资料的 Source of Truth

继续遵守 M0/M1 的原则：

> Reverie 不拥有你的资料。Reverie 只是帮你管理你的资料。

文章本体：

```text
article.md
meta.json
source/page.html
assets/
```

标注：

```text
annotations.jsonl
```

都属于用户资料。

SQLite 仍然只是：

```text
derived index / cache / search state
```

不能让 Annotation 只有 SQLite 一份。

如果删除数据库后：

```text
annotations.jsonl
```

仍然应该能够恢复标注。

---

# 三、M2 的边界

## 本阶段必须完成

### Annotation Core

包括：

- Annotation 数据模型
- Annotation ID
- Document ID 绑定
- Highlight
- Note
- Text Anchor
- Position Anchor
- Quote
- Prefix / Suffix Context
- Content Hash
- Annotation 状态
- orphaned 状态
- annotation resolver
- annotation persistence
- annotation reload
- annotation update
- annotation delete
- annotation navigation
- 基础标注 UI
- Web Reader Adapter 对 Annotation Core 的接入
- 标注 round-trip 测试
- 内容变化测试
- orphan / recovery 测试

---

# 四、本阶段明确不做的东西

M2 暂时不要扩大范围。

明确不要把以下功能提前带进来：

- EPUB Annotation Adapter 的最终实现
- PDF Annotation Adapter 的最终实现
- RSS
- Pocket 导入
- Wallabag 导入
- Raindrop 导入
- TTS
- Aurora Reading
- AI 摘要
- AI 自动笔记
- 向量数据库
- 知识图谱
- 云同步
- 账号系统
- 社交
- 协作
- WebDAV
- 移动端
- 浏览器端保存逻辑的大规模重构
- 富文本笔记编辑器
- Markdown 编辑器
- 标签系统
- 复杂颜色系统
- 复杂批量标注工具

M2 应该专注于：

> **“标注能创建、保存、恢复、定位、失效、修复。”**

---

# 五、首先重新检查 M0/M1 的实际代码

开始编码之前，不要直接假设之前的设计已经完全落地。

先检查：

```text
M0 STATUS / RISKS
M0 FORMAT
M0 SECURITY
M1 implementation
当前 Web Reader
当前 Article Document Model
当前 article.md
当前 meta.json
当前 SQLite index
当前页面渲染结构
```

检查：

```text
FACT
HYPOTHESIS
INFERENCE
```

不得把设计文档里的假设直接当成实际代码现状。

如果文档与代码冲突：

> **以当前代码和测试行为为 Source of Truth。**

先输出简短调查结果，再实施。

重点确认：

1. 当前 Document Model 如何表达段落/标题/list/code/quote 等 block。
2. 是否存在稳定的 block ID。
3. Web Reader 是否已经能够把 DOM Selection 映射到 Document Model。
4. 当前 article.md 如何生成。
5. article 内容是否经过统一 normalization。
6. 当前文档是否具有 content hash。
7. Reader 是否支持程序化滚动到某一个 block/character position。
8. 当前重启后的文档加载流程是什么。
9. SQLite 如何索引 Document。
10. 当前 UI 如何处理文本 Selection。

---

# 六、建立 Annotation Core，而不是把逻辑塞进 Web Reader

建议保持类似以下边界：

```text
Reader
   ↓
Reader Adapter
   ↓
Annotation Core
   ↓
Annotation Persistence
```

不要设计成：

```text
WebReader
 ├─ HighlightManager
 ├─ NoteManager
 ├─ DOMSelectionHelper
 ├─ SaveHighlightToSQLite
 └─ WebSpecificAnnotationLogic
```

因为这样以后 EPUB/PDF 会非常难接入。

建议结构：

```text
Annotation Core
├─ Models
│  ├─ Annotation
│  ├─ HighlightAnnotation
│  ├─ NoteAnnotation
│  ├─ TextAnchor
│  ├─ DocumentPosition
│  └─ AnnotationStatus
│
├─ Resolution
│  ├─ AnnotationResolver
│  ├─ ExactResolver
│  ├─ ContextResolver
│  └─ ResolutionResult
│
├─ Persistence
│  ├─ AnnotationStore
│  └─ AnnotationSerializer
│
└─ Services
   ├─ AnnotationService
   └─ AnnotationNavigationService
```

Web：

```text
Web Reader Adapter
        ↓
Web Selection
        ↓
Text Anchor
        ↓
Annotation Core
```

未来：

```text
EPUB Reader Adapter
        ↓
EPUB Selection
        ↓
Text Anchor / EPUB Locator
        ↓
Annotation Core
```

PDF：

```text
PDF Reader Adapter
        ↓
PDF Selection
        ↓
PDF Locator
        ↓
Annotation Core
```

---

# 七、设计 Annotation 数据模型

先设计模型，再编码。

最少需要：

```text
Annotation
├─ annotation_id
├─ document_id
├─ type
├─ status
├─ created_at
├─ updated_at
├─ selected_text
├─ anchor
├─ note
└─ source_content_hash
```

例如概念模型：

```json
{
  "annotation_id": "ann_01...",
  "document_id": "doc_01...",
  "type": "highlight",
  "status": "active",
  "created_at": "2026-10-04T...",
  "updated_at": "2026-10-04T...",
  "selected_text": "...",
  "anchor": {
    "start": {},
    "end": {},
    "quote": "...",
    "prefix": "...",
    "suffix": "...",
    "content_hash": "..."
  },
  "note": null
}
```

不要机械照抄这个 JSON。

根据实际项目语言和架构确定最终结构。

关键要求：

### Annotation ID

必须：

- 稳定
- 唯一
- 与数组下标无关
- 不因为排序变化而改变

---

# 八、Annotation Type

M2 至少支持：

```text
highlight
note
```

但建议模型能够表达：

```text
highlight
highlight_with_note
note
```

或者使用：

```text
Annotation
 ├─ HighlightData
 └─ NoteData
```

根据实际架构选择。

不要为了未来想象而创建十几种 Annotation 类型。

---

# 九、Annotation Status

至少支持：

```text
active
orphaned
```

可以预留：

```text
deleted
```

但删除通常建议真正从用户可见标注集合中移除，同时保留正常的持久化语义。

核心要求：

> **解析失败 ≠ Annotation 不存在。**

例如：

```text
active
  ↓
文档内容变化
  ↓
无法重新定位
  ↓
orphaned
```

而不是：

```text
resolve failed
  ↓
delete annotation
```

---

# 十、Text Anchor 是 M2 最重要的设计

不要只保存：

```json
{
  "start_offset": 1234,
  "end_offset": 1268
}
```

因为：

```text
文章前面新增一段
文章标题变化
HTML normalization 变化
广告文本被清除
段落结构改变
```

都会导致 offset 失效。

因此必须使用多信息 Anchor。

建议至少包含：

```text
Position
Quote
Prefix
Suffix
Content Hash
```

---

# 十一、DocumentPosition

建议逻辑结构类似：

```text
DocumentPosition
├─ block_id
└─ offset
```

例如：

```json
{
  "block_id": "paragraph_17",
  "offset": 42
}
```

开始：

```text
start
```

结束：

```text
end
```

这样 Annotation 可以描述：

```text
paragraph_17:42
    →
paragraph_17:76
```

也可以跨 block：

```text
paragraph_17:42
    →
paragraph_18:12
```

必须考虑跨段选择。

不能假设所有用户选择都在同一个 `<p>`。

---

# 十二、Quote

保存用户真正选择的文本：

```text
quote
```

或者：

```text
selected_text
```

必须使用 Reverie 实际 Reader 中用于显示的 canonical text。

不要保存未经 normalization 的 DOM 原始字符串作为唯一依据。

例如：

DOM：

```html
<p>Hello
   world</p>
```

Reader：

```text
Hello world
```

Annotation 应该与最终阅读文本保持一致。

---

# 十三、Prefix / Suffix Context

保存：

```text
prefix
suffix
```

例如：

```text
prefix:
"...the system works by"

quote:
"persisting the original document"

suffix:
"before building the index..."
```

Context 用于：

1. offset 失效时重新定位
2. quote 出现多次时消歧
3. 判断是否找到了正确位置

不要保存无限长度。

根据实验确定合理长度，例如：

```text
32~128 characters
```

以实际测试结果为准。

---

# 十四、Content Hash

Annotation 建立时保存：

```text
source_content_hash
```

或：

```text
anchor.content_hash
```

用途不是单纯判断“文件是否改变”。

而是用于：

```text
当前文档
vs
创建 Annotation 时的文档
```

进行判断。

例如：

```text
hash 相同
→ 可以直接使用 position

hash 不同
→ position 可能失效
→ 启动 resolver
```

不要把 hash 当作 Annotation 唯一定位手段。

---

# 十五、Resolution 策略

必须建立独立的：

```text
AnnotationResolver
```

第一版建议使用确定性策略，不要引入 AI。

推荐：

```text
Step 1
Position + Hash

↓失败

Step 2
Exact Quote Search

↓多个结果

Step 3
Quote + Prefix/Suffix Context

↓失败

Step 4
Normalized Text Matching

↓仍然失败

Step 5
orphaned
```

不要一开始就做复杂 fuzzy matching。

---

# 十六、Resolver 的基本原则

Resolver 必须避免：

> **“看起来差不多，所以偷偷把高亮移动到另一个地方。”**

错误示例：

```text
原文：
A B C D

用户高亮：
B

内容改变：
A B X B C D

Resolver 找到第二个 B
```

不能因为“找到了一个 B”就自动认定成功。

应该根据：

```text
quote
prefix
suffix
position
block
context
```

综合判断。

如果无法证明唯一对应：

```text
ambiguous / unresolved
```

最终进入：

```text
orphaned
```

而不是错误定位。

---

# 十七、ResolutionResult

建议不要只返回：

```text
bool
```

至少应能够区分：

```text
Resolved
Ambiguous
NotFound
Invalid
```

例如：

```text
ResolutionResult
├─ status
├─ start
├─ end
├─ confidence / score（仅内部使用也可）
└─ reason
```

注意：

> 内部 score 不是用户评分。

不要把“confidence”包装成“100% 准确”。

第一版可以完全不用浮点 confidence，只使用确定性 resolution status。

---

# 十八、跨 Block Selection

必须测试：

```text
paragraph A
paragraph B
```

选择：

```text
A 的最后一部分
+
B 的开头
```

Annotation 不能截断。

同时处理：

```text
heading → paragraph
paragraph → list
paragraph → code
```

如果 UI 层不允许某些跨结构选择，必须在代码中明确说明，而不是出现随机失败。

---

# 十九、重建 Annotation 的核心逻辑

Document 打开后：

```text
Load Document
    ↓
Load annotations.jsonl
    ↓
For each Annotation
    ↓
Resolve Anchor
    ↓
Resolved?
 ├─ yes → render highlight
 └─ no  → orphaned
```

不要把 Annotation 的渲染结果持久化成：

```text
HTML span
```

例如不要依赖：

```html
<span class="highlight">...</span>
```

作为用户资料本体。

因为下一次 article.md 重新生成时这些 span 很容易消失。

---

# 二十、Annotation Persistence

沿用 Reverie 文件结构：

```text
Reverie Library/
└─ articles/
   └─ 2026/
      └─ article-id/
         ├─ article.md
         ├─ meta.json
         ├─ annotations.jsonl
         ├─ source/
         └─ assets/
```

Annotation 数据保存到：

```text
annotations.jsonl
```

---

# 二十一、annotations.jsonl 原则

每一个 Annotation 一个 JSON object。

例如：

```text
line 1 → annotation A
line 2 → annotation B
line 3 → annotation C
```

更新 Annotation 时：

> 可以整体重写 annotations.jsonl，但必须使用 Atomic Write。

删除 Annotation 同样如此。

不要：

```text
直接 truncate 文件
直接覆盖用户原始文件
```

导致中途崩溃时文件损坏。

---

# 二十二、AnnotationSerializer

建立：

```text
AnnotationSerializer
```

负责：

```text
Model
↔
JSONL
```

不要让 UI 自己拼 JSON。

要有：

```text
schema_version
```

例如：

```json
{
  "schema_version": 1,
  ...
}
```

未来允许：

```text
schema_version 1
→ migration
→ schema_version 2
```

---

# 二十三、文件损坏处理

必须考虑：

```text
annotations.jsonl 不存在
annotations.jsonl 为空
某一行 JSON 损坏
整个文件损坏
字段缺失
schema_version 不支持
annotation_id 重复
document_id 不一致
anchor 非法
```

原则：

### 不要让一个坏 Annotation 直接让整个 Library 崩溃。

例如：

```text
20 个 annotation
其中 1 个损坏
```

至少应该：

```text
19 个正常加载
1 个进入错误状态 / diagnostic
```

具体策略根据项目架构决定，但必须可诊断。

---

# 二十四、AnnotationService

建立统一服务层，例如：

```text
CreateHighlight(...)
CreateNote(...)
UpdateNote(...)
DeleteAnnotation(...)
ResolveAnnotations(...)
GetDocumentAnnotations(...)
```

不要让 UI 直接操作：

```text
annotations.jsonl
```

也不要让 UI 直接操作 SQLite。

UI 只负责：

```text
interaction
presentation
```

Service 负责：

```text
business logic
```

Persistence 负责：

```text
storage
```

---

# 二十五、Web Reader 接入

M2 首先只接入：

```text
Web Reader
```

建立：

```text
WebSelectionAdapter
```

负责：

```text
DOM Selection
    ↓
DocumentPosition
    ↓
TextAnchor
```

Reader Core 不应该知道浏览器 DOM 的实现细节。

---

# 二十六、用户创建高亮

最小交互：

```text
用户选中文本
    ↓
出现轻量操作入口
    ↓
Highlight
```

成功后：

```text
Selected Text
↓
Create Annotation
↓
Persist
↓
Render
```

不能出现：

```text
UI 显示高亮
但文件还没保存
```

然后崩溃导致数据丢失。

---

# 二十七、给高亮添加 Note

至少支持：

```text
Highlight
    +
Note
```

例如：

```text
[高亮]

“local-first software should keep the source files portable.”

[笔记]
这个原则可以直接用于 Reverie 的产品设计。
```

M2 的 Note 可以先做：

```text
纯文本
```

不要急着做：

```text
富文本
Markdown
图片
附件
双向链接
标签
```

---

# 二十八、Note 的数据关系

建议：

```text
Annotation
 ├─ selected_text
 ├─ anchor
 └─ note
```

或者使用：

```text
Highlight Annotation
      +
child Note
```

选择一种真正适合当前代码结构的方案。

关键不是形式，而是：

> Note 必须能够准确绑定到一个 Highlight Anchor。

---

# 二十九、Annotation List / Panel

M2 应加入最基础的 Annotation 查看能力。

至少能够：

```text
查看当前文章全部标注
```

例如：

```text
Annotations

──────────────

“local-first software...”
Highlight

这个原则值得保留。
Note

“SQLite is only a derived index...”
Highlight
```

点击标注：

```text
Annotation
    ↓
Reader Navigation
    ↓
滚动到原文
    ↓
短暂视觉定位
```

视觉效果可以简单，不要为动画过度投入。

---

# 三十、Annotation Navigation

需要统一接口：

```text
NavigateToAnnotation(annotation_id)
```

不要让 Annotation List 自己处理：

```text
scrollTop
DOM query
character offset
```

这些都应该由 Reader / Adapter 负责。

结构：

```text
Annotation List
      ↓
AnnotationNavigationService
      ↓
Reader
      ↓
Adapter
      ↓
Position
```

---

# 三十一、Orphaned UI

如果 Annotation 无法恢复：

不要直接消失。

应该让用户知道：

```text
⚠ 此标注无法在当前文档中定位
```

Annotation List 中可以显示：

```text
[无法定位]
“原来的高亮文本……”
```

用户仍然可以：

```text
查看 quote
查看 note
删除 annotation
尝试重新定位
```

---

# 三十二、手动修复

M2 至少预留：

```text
Repair Annotation
```

完整编辑器可以后续完善。

第一版可以非常简单：

```text
orphaned annotation
    ↓
用户查看原 quote
    ↓
重新选择原文
    ↓
Replace Anchor
    ↓
Save
    ↓
active
```

必须验证：

```text
旧 Annotation ID 不变
```

因为 Annotation ID 是稳定引用。

---

# 三十三、不要在 M2 做“自动智能修复”

暂时不要：

```text
LLM
Embedding
semantic search
AI matching
```

M2 首先证明：

> **确定性的 Anchor 系统已经成立。**

以后 AI 可以作为辅助 resolver，但不能成为基本数据完整性的前提。

---

# 三十四、Highlight 渲染

必须考虑：

```text
多个 Highlight
重叠 Highlight
相邻 Highlight
跨段 Highlight
```

第一版至少做到：

```text
不破坏正文
不破坏链接
不破坏代码块
不破坏图片
不导致 Selection 崩坏
```

不要为了显示高亮而修改持久化的：

```text
article.md
```

高亮属于：

```text
view overlay / reader rendering layer
```

---

# 三十五、多个 Highlight 重叠

至少建立测试：

```text
A B C D E

Highlight 1:
B C D

Highlight 2:
C D
```

测试：

```text
是否可以同时存在
是否可以重新加载
是否可以正确删除一个
是否另一个仍然存在
```

如果本阶段决定：

```text
不支持重叠
```

也必须明确记录这个产品/技术限制。

不要隐式产生：

```text
删除一个导致另一个消失
```

---

# 三十六、Selection 规范化

Web DOM Selection 很可能包含：

```text
whitespace
newline
multiple text nodes
link
strong
em
code
```

需要建立统一 normalization：

```text
DOM Selection
    ↓
Canonical Reader Text
    ↓
TextAnchor
```

必须避免：

```text
创建时保存 A
重新打开时 Reader 显示 B
```

导致 Annotation 永远无法解析。

---

# 三十七、Normalization 必须稳定

同一篇文档：

```text
第一次打开
第二次打开
第三次打开
```

在没有内容变化的情况下：

```text
Canonical text
Content hash
Block IDs
```

必须保持稳定。

这是 M2 的基础契约之一。

---

# 三十八、文章更新与 Annotation

建立测试：

### Scenario A

原始文章：

```text
A B C D
```

Highlight：

```text
B C
```

文章重新读取：

```text
A B C D
```

结果：

```text
active
```

### Scenario B

文章变成：

```text
A X B C D
```

结果：

```text
仍能正确恢复
```

### Scenario C

文章变成：

```text
A X Y Z D
```

原文：

```text
B C
```

已经不存在。

结果：

```text
orphaned
```

### Scenario D

原 quote 出现两次：

```text
B C
...
B C
```

Resolver 不能随便选择错误位置。

---

# 三十九、URL 改变不等于 Annotation 改变

必须明确：

Annotation 绑定的是：

```text
document_id
```

而不是简单绑定：

```text
URL
```

因为：

```text
同一个 URL
```

可能在不同时间产生不同内容。

因此：

```text
URL
≠
Document Identity
```

必须继续沿用 M1 的 Snapshot 思路。

---

# 四十、Document Identity

确认：

```text
document_id
```

的生命周期。

同一篇捕获快照：

```text
document_id = stable
```

重新捕获形成新快照：

```text
new document_id
```

M2 不要擅自实现复杂 Annotation Migration。

可以记录为未来能力：

```text
M? Annotation Migration
```

本阶段只保证：

> Annotation 对所属 Document Snapshot 的完整性。

---

# 四十一、与 Article.md 的关系

这是 M2 必须明确的边界：

```text
article.md
    ↓
文章正文 Source of Truth

annotations.jsonl
    ↓
用户标注 Source of Truth
```

不要把：

```text
==highlight==
```

之类标记直接写进文章正文。

原因：

- 会污染原始资料
- 不利于重新提取
- 不利于跨格式
- 容易导致内容 hash 改变
- 未来 EPUB/PDF 很难统一

---

# 四十二、数据库索引

M2 可以将 Annotation 投影到 SQLite：

```text
annotation_id
document_id
type
status
created_at
updated_at
selected_text
```

用于：

```text
查询
统计
未来 Search
```

但必须遵守：

```text
annotations.jsonl
    ↓
rebuild
    ↓
SQLite
```

不能：

```text
SQLite
    ↓
唯一真实来源
```

---

# 四十三、重建索引测试

必须测试：

```text
Create Highlight
↓
保存 annotations.jsonl
↓
写入 SQLite
↓
删除 SQLite
↓
启动 Reverie
↓
重新扫描 Library
↓
重建索引
↓
Annotation 仍然存在
```

如果做不到：

> M2 不算完成。

---

# 四十四、Crash Safety

至少模拟：

```text
创建 Annotation
写文件过程中崩溃
```

以及：

```text
更新 Note
写文件过程中崩溃
```

验证：

```text
旧版本仍然完整
```

或者：

```text
新版本完整
```

绝不能留下：

```text
半个 JSON
```

---

# 四十五、错误恢复原则

任何情况下：

```text
Annotation 文件损坏
```

都不应该自动：

```text
覆盖成空文件
```

也不要：

```text
“为了修复”直接删除全部 Annotation。
```

需要保留 diagnostic 信息。

如果项目已经有 Doctor / diagnostics 体系，也应接入。

---

# 四十六、测试体系

M2 必须增加：

## Unit Tests

至少覆盖：

```text
Annotation serialization
Annotation deserialization
ID stability
TextAnchor
DocumentPosition
Content hash
Exact resolver
Context resolver
Normalization
Status transitions
```

---

## Integration Tests

至少覆盖：

```text
Create
Save
Reload
Resolve
Render
Navigate
Update
Delete
```

---

## Round-trip Tests

必须验证：

```text
Create
→ Serialize
→ Write
→ Read
→ Deserialize
→ Resolve
```

最终结果一致。

---

## Content Mutation Tests

至少覆盖：

```text
前文增加文字
后文增加文字
中间增加文字
段落增加
段落删除
空白变化
标题变化
重复 quote
quote 消失
```

---

# 四十七、测试 Fixture

建立专门的：

```text
annotation fixtures
```

不要全部依赖真实网站。

至少包括：

```text
short article
long article
multi-paragraph
headings
lists
code blocks
links
Chinese
English
Japanese
repeated phrases
cross-block selection
```

---

# 四十八、不要依赖在线网络才能测试 Annotation

M2 的核心测试应该可以：

```text
完全离线运行
```

因为：

> Annotation Core 本质上是本地数据一致性问题，而不是网络问题。

Web 在线测试继续保留给 M1 的 capture/extraction harness。

---

# 四十九、Performance

M2 不需要过早优化。

但必须记录：

```text
文章长度
Annotation 数量
Resolve 时间
Render 时间
```

至少验证：

```text
几百个 annotation
较长文章
```

不会产生明显 UI 卡顿。

不要因为性能优化提前引入：

```text
复杂数据库
多线程系统
GPU annotation engine
```

除非真实 profiling 证明需要。

---

# 五十、Security

继续沿用 M0/M1 安全边界。

特别注意：

### Note

如果未来支持 Markdown：

```text
raw user note
```

不能直接作为未消毒 HTML 注入 Reader。

M2 先使用：

```text
plain text
```

最安全。

### Selected Text

来自网页的：

```text
selected_text
```

必须当作不可信内容处理。

不要直接作为 HTML。

### External Link

Annotation 内部不要引入特殊 URL scheme。

---

# 五十一、未来格式扩展接口

M2 完成时，要让架构能够自然扩展到：

```text
Web
EPUB
PDF
Markdown
```

建议定义类似：

```text
IAnnotationAnchorAdapter
```

或者：

```text
IReaderAnnotationAdapter
```

具体名称根据现有代码决定。

核心只需要理解：

```text
Annotation
Anchor
ResolveResult
```

具体格式自己负责：

```text
DOM position
EPUB CFI
PDF page/position
Markdown block position
```

---

# 五十二、不要过度抽象

注意一个风险：

为了“未来 EPUB/PDF”，不要创建：

```text
20 个 Interface
30 个 Factory
10 个 Registry
```

M2 真正需要的是：

```text
Stable Annotation Model
Stable Anchor Contract
Stable Resolver Boundary
Stable Persistence
```

而不是形式上的高度抽象。

---

# 五十三、建议代码结构

根据现有项目结构调整，不强制照搬。

逻辑上应类似：

```text
src/
  Annotation/
    Models/
    Resolution/
    Persistence/
    Services/

  Reader/
    Core/
    Web/
      Selection/
      Rendering/
```

如果项目已经有成熟目录结构：

> 优先延续当前架构，不为了目录形式进行大规模重构。

---

# 五十四、实施顺序

严格建议：

## M2-A

调查当前 M1：

```text
Document Model
Reader
Selection
Persistence
```

↓

## M2-B

设计并实现：

```text
Annotation Model
TextAnchor
DocumentPosition
Status
```

↓

## M2-C

实现：

```text
AnnotationStore
Serializer
JSONL persistence
Atomic Write
```

↓

## M2-D

实现：

```text
AnnotationResolver
```

↓

## M2-E

Web Selection：

```text
DOM → TextAnchor
```

↓

## M2-F

创建：

```text
Highlight
```

↓

## M2-G

实现：

```text
Highlight rendering
```

↓

## M2-H

实现：

```text
Annotation List
Navigation
```

↓

## M2-I

实现：

```text
Note
Edit Note
Delete
```

↓

## M2-J

实现：

```text
orphaned
re-resolution
manual repair
```

↓

## M2-K

SQLite projection / rebuild

↓

## M2-L

完整测试

↓

## M2-M

代码审查与 M2 收口

---

# 五十五、Git / Commit 原则

不要把整个 M2 压成一个巨型 commit。

建议按实际工作拆分，例如：

```text
feat(annotation): add core annotation model

feat(annotation): add annotation persistence

feat(annotation): add text anchor resolver

feat(reader): add web selection adapter

feat(reader): add highlight rendering

feat(annotation): add annotation navigation

feat(annotation): add notes

test(annotation): add persistence and resolution tests

test(annotation): add mutation and orphan tests
```

不要为了凑 commit 数量拆得过细。

提交单位应该对应：

> 一个逻辑完整、容易 review、可回退的变化。

---

# 五十六、AI 编码纪律

你是 AI Coding Agent。

不要：

```text
看到需求 → 大规模重构 → 顺便修几十个无关问题
```

必须保持：

```text
M2 Scope
```

发现无关问题时：

```text
记录
分类
不要顺手扩大任务
```

除非该问题直接阻塞 M2。

---

# 五十七、架构问题判断标准

不要因为：

```text
命名不喜欢
目录不够优雅
Interface 不够漂亮
某个类偏大
```

就认定架构存在问题。

只有在能够证明：

```text
功能错误
数据丢失风险
跨格式无法扩展
测试无法建立
维护成本显著增加
安全问题
性能问题
```

时才升级问题。

---

# 五十八、审查格式

M2 每次 review 使用：

```text
FACT
HYPOTHESIS
INFERENCE
```

问题分级：

```text
P0
P1
P2
```

P0/P1 必须给出：

```text
Evidence
Impact
Reproduction / Trigger
Recommended Fix
```

不要为了“架构更漂亮”制造 P1。

---

# 五十九、M2 必须形成的文档

至少更新：

```text
docs/M2-STATUS.md
docs/ANNOTATIONS.md
docs/ANNOTATION-FORMAT.md
docs/ANNOTATION-RESOLUTION.md
```

其中必须明确：

## ANNOTATIONS.md

说明：

```text
Annotation 模型
生命周期
Document 关系
Highlight
Note
Status
```

## ANNOTATION-FORMAT.md

说明：

```text
annotations.jsonl
schema_version
字段定义
兼容性原则
```

## ANNOTATION-RESOLUTION.md

说明：

```text
Position
Quote
Prefix
Suffix
Content Hash
Resolution 顺序
Ambiguous
Orphaned
Repair
```

---

# 六十、M2 最终 Demo

完成后必须能够完整展示以下流程：

```text
1. 打开一篇 M1 捕获的网页文章
        ↓
2. 选中一段中文文本
        ↓
3. 创建 Highlight
        ↓
4. Highlight 立刻显示
        ↓
5. 给 Highlight 添加 Note
        ↓
6. 关闭 Reverie
        ↓
7. 重新打开
        ↓
8. Highlight 恢复
        ↓
9. Note 恢复
        ↓
10. 点击 Annotation
        ↓
11. Reader 跳回原文位置
```

然后执行：

```text
12. 修改文章内容
        ↓
13. 重新加载文档
        ↓
14. Resolver 尝试恢复 Annotation
```

验证：

```text
能唯一定位
→ active

无法唯一定位
→ orphaned
```

然后：

```text
15. 删除或修改 Annotation
        ↓
16. 关闭 Reverie
        ↓
17. 再次打开
        ↓
18. 状态正确
```

最后：

```text
19. 删除 SQLite 数据库
        ↓
20. 执行索引重建
        ↓
21. Annotation 仍然完整恢复
```

---

# 六十一、M2 Exit Criteria

只有全部满足以下条件，M2 才算完成：

```text
[ ] Annotation Core 已独立于 Web Reader
[ ] Highlight 数据模型稳定
[ ] Note 数据模型稳定
[ ] Annotation ID 稳定
[ ] Document ID 关系明确
[ ] TextAnchor 已建立
[ ] DocumentPosition 已建立
[ ] Quote 已保存
[ ] Prefix / Suffix 已保存
[ ] Content Hash 已保存
[ ] annotations.jsonl 已落地
[ ] schema_version 已建立
[ ] Atomic Write 已实现
[ ] Annotation 可以创建
[ ] Annotation 可以重新加载
[ ] Highlight 可以正确渲染
[ ] Note 可以编辑
[ ] Annotation 可以删除
[ ] Annotation 可以导航
[ ] Resolver 可以处理内容变化
[ ] Resolver 可以处理重复 quote
[ ] Resolver 无法确定时不会误定位
[ ] 无法定位的 Annotation 会进入 orphaned
[ ] orphaned Annotation 不会被静默删除
[ ] 支持基本 Repair
[ ] SQLite 只是派生索引
[ ] 删除 SQLite 后可以重建
[ ] Unit Tests 完成
[ ] Integration Tests 完成
[ ] Round-trip Tests 完成
[ ] Mutation Tests 完成
[ ] Orphan Tests 完成
[ ] Crash Safety 已验证
[ ] Security 基线满足
[ ] M2 文档完成
```

---

# 六十二、最终输出要求

完成 M2 后，不要只告诉我：

```text
“功能已经实现。”
```

请输出一份完整的 M2 收口报告：

```text
# M2 Final Report

## 1. Implementation Summary

## 2. Architecture

## 3. Annotation Data Model

## 4. Persistence Format

## 5. Anchor Strategy

## 6. Resolution Strategy

## 7. Orphan / Repair Strategy

## 8. Web Reader Integration

## 9. SQLite Projection

## 10. Tests

## 11. Performance

## 12. Security

## 13. Known Limitations

## 14. Deferred Items

## 15. FACT / HYPOTHESIS / INFERENCE

## 16. P0 / P1 / P2 Issues

## 17. M2 Exit Criteria

## 18. Recommended M3 Preconditions
```

并明确说明：

```text
哪些是真实验证结果
哪些只是设计结论
哪些仍然属于假设
```

---

# M2 的最终原则

始终记住：

> **M2 不是“高亮功能”。**

它真正要建立的是：

```text
用户资料
   ↓
文章 Snapshot
   ↓
稳定 Anchor
   ↓
Annotation
   ↓
持久化
   ↓
重新解析
   ↓
内容变化后的恢复
   ↓
无法恢复时保留并诊断
```

最终达到：

> **Highlight / Note 是 Reverie 中真正独立、可持久化、可恢复、不会因为页面变化而悄悄消失的数据资产。**

M2 不追求功能数量。

M2 只追求一件事：

> **把“我在文章上留下的阅读痕迹”变成可靠的本地数据。**