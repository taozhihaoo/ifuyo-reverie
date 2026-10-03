# ifuyo Reverie — M12 Self-Use 1.0 自用版本最终收口开发提示词

> **阶段性质：最终自用版本收口 / Dogfooding / 产品验证**
>
> 本阶段不是新功能扩张阶段，而是把 M0–M11 已完成的 Reverie 收敛为一个**真正可以长期使用、值得每天使用、数据不会轻易丢失、出现问题也能够恢复的 Windows 个人阅读档案系统 1.0**。
>
> **核心目标：**
>
> > 从“功能已经做出来”进入“我可以把自己的阅读资料真正交给它，并长期依赖它”。

---

# 一、M12 总目标

M12 的最终目标不是：

- 再增加一批功能
- 再扩展新的文件格式
- 再加入 AI
- 再加入云同步
- 再加入账号体系
- 再做商业化
- 再建立插件生态
- 再做复杂社交功能
- 再进行大规模架构重构

M12 的目标是完成以下闭环：

```text
发现
 ↓
保存
 ↓
阅读
 ↓
高亮
 ↓
笔记
 ↓
书签
 ↓
归档
 ↓
搜索
 ↓
重新阅读
 ↓
长期维护
```

最终形成：

```text
ifuyo Reverie 1.0
=
长期个人阅读档案工具
```

---

# 二、M12 核心原则

## 2.1 文件是真相

继续保持全项目最重要的数据原则：

```text
文件系统 = Source of Truth
SQLite = Index / Cache / Derived State
```

任何 M12 的 UX、性能、修复，都不得破坏这一原则。

必须继续保证：

```text
SQLite 丢失
≠
用户资料丢失

索引损坏
≠
用户资料损坏

缓存清理
≠
用户资料删除

程序卸载
≠
Library 删除

程序升级
≠
Library 重写

搜索失败
≠
阅读资料消失
```

---

# 三、M12 禁止事项

M12 默认禁止引入以下范围：

### 3.1 新产品方向

禁止：

- 云平台
- 用户账号
- 登录系统
- 云同步
- 社交
- 评论
- 分享平台
- 在线书店
- 内容市场
- Web SaaS
- 手机端
- 浏览器扩展生态
- 多用户协作

### 3.2 AI 系统

禁止因为“现在看起来很酷”而新增：

- AI 总结
- AI 问答
- AI 标签
- AI 自动笔记
- AI 知识库
- AI 推荐
- AI embedding / vector database
- RAG
- AI 阅读助手

除非当前代码已经存在并且属于 M0–M11 明确范围；否则一律留到未来路线。

### 3.3 新阅读格式

M12 不主动新增：

- MOBI
- AZW
- CBZ / CBR
- DOCX
- PPTX
- XLSX
- 音频阅读格式
- 视频

M6–M9 已确定的：

```text
Web
RSS
EPUB
PDF
Markdown
TXT
```

作为 1.0 的阅读范围。

### 3.4 大重构

禁止以“代码更优雅”“架构更漂亮”为理由进行大规模重构。

只有满足以下条件时才允许重构：

```text
真实 Bug
数据安全
稳定性
性能瓶颈
明显 UX 阻塞
Windows 发布问题
维护成本已经成为现实障碍
```

否则：

> 优先最小修改，而不是架构重写。

---

# 四、M12 第一原则：真实使用优先于文档

M12 开始以后：

```text
真实代码
>
真实运行行为
>
真实 Library 数据
>
测试结果
>
现有设计文档
>
历史规划
```

尤其注意：

> 不允许因为“设计文档写着已经完成”，就默认功能真的可用。

必须实际运行。

---

# 五、M12 工作方式

本阶段仍然采用统一节奏：

```text
Explore
→
Measure
→
Plan
→
Implement
→
Test
→
Real Use
→
Review
→
Fix
→
Retest
→
Document
```

但和 M0–M11 不同：

M12 的核心验证环境不是测试数据，而是：

> **真实个人阅读资料。**

---

# 六、M12 最终验收模型

整个阶段围绕六个维度：

```text
功能完整性
数据安全
可靠性
阅读体验
长期维护性
真实使用价值
```

不允许只看：

```text
“所有单元测试都通过”
```

因为 Reverie 是个人资料工具。

必须进一步回答：

> 我真的愿意把自己的阅读资料全部放进去吗？

---

# 七、Batch 0 — M12 Explore / 当前状态冻结

首先全面审计 M0–M11。

## 7.1 建立基线

检查：

- 项目版本
- Git 状态
- M0–M11 实际完成情况
- Release 构建
- Installer
- Library
- SQLite
- Doctor
- Reader
- Search
- RSS
- Import
- Export
- EPUB
- PDF
- TTS
- Windows Integration
- Diagnostics
- Migration
- Recovery
- Tests
- Known Issues

不要直接相信历史文档。

建立：

```text
docs/M12-EXPLORE.md
```

记录：

```text
事实
假设
推断
已确认
未确认
已解决
仍存在
```

继续使用：

```text
FACT
HYPOTHESIS
INFERENCE
```

---

# 八、Batch 1 — 建立 Self-Use 真实资料集

M12 必须建立一个真实使用 Library。

建议至少包含：

```text
Web Article
RSS Article
EPUB
PDF
Markdown
TXT
```

并包含：

### 简短内容

用于：

- 快速启动
- 搜索
- 标注
- 导航

### 超长内容

用于：

- 长文本阅读
- TTS
- 搜索
- 进度恢复
- 内存测试

### 中文内容

覆盖：

- 简体中文
- 中英文混排
- 标点
- 数字
- 英文
- URL

### 特殊内容

包括：

- 图片
- 表格
- 代码
- 长标题
- 多级标题
- 特殊 Unicode
- emoji
- 外部链接

### 有意制造的异常资料

例如：

- 缺失 metadata
- 缺失 assets
- 外部修改
- 损坏 annotations
- 损坏 index
- duplicate
- orphan annotation
- malformed document
- 不完整导入

用于验证 Doctor / Recovery。

---

# 九、Batch 2 — 完成“第一小时”体验

模拟一个从零开始使用 Reverie 的真实用户。

流程：

```text
安装
→
启动
→
选择 Library
→
导入资料
→
打开文章
→
阅读
→
高亮
→
写笔记
→
设置书签
→
关闭
→
再次启动
→
继续阅读
→
搜索
```

重点检查：

### 首次启动

必须：

- 清晰
- 没有开发者痕迹
- 没有调试窗口
- 没有内部术语
- 不要求理解数据库
- 不要求理解缓存
- 不要求理解 Index

### 第一条资料

必须尽可能顺畅：

```text
Import
→
Open
→
Read
```

不要为了“架构正确”增加多余步骤。

### 第一次阅读

必须确认：

- 标题清晰
- 正文可读
- 字体合理
- 行高合理
- 滚动稳定
- 当前阅读位置明确
- 阅读区域没有明显视觉噪音

---

# 十、Batch 3 — 阅读体验收口

这是 M12 最重要的 UX 审查之一。

逐项实际检查：

## 10.1 Reader Shell

统一确认：

- 打开
- 关闭
- 返回
- 前进
- Reader 状态
- ReaderToolbar
- 文档信息
- 目录
- 搜索
- 书签
- 高亮
- 笔记
- TTS

## 10.2 阅读位置

必须检查：

```text
关闭
→
重新打开
→
恢复到合理位置
```

特别检查：

- Web
- EPUB
- PDF
- Markdown
- TXT

不要要求所有格式表现完全一致。

必须允许：

> 各 Reader Adapter 使用最适合该格式的 ReaderLocation。

---

# 十一、Batch 4 — 标注系统最终收口

M2 的：

- Highlight
- Note
- Bookmark

在 M12 必须进行真实使用验证。

测试：

```text
高亮
→
写笔记
→
关闭
→
重新打开
→
定位
→
编辑
→
删除
→
搜索
→
重新定位
```

检查：

- locator 稳定性
- annotation persistence
- orphan handling
- re-anchor
- duplicate annotation
- search integration
- export
- import round-trip

尤其必须确认：

> 文档发生轻微变化时，高亮不会轻易全部失效。

同时：

> 无法重新定位 ≠ 删除 Annotation。

应继续：

```text
Resolved
→
Unresolved / Orphan
```

而不是静默删除。

---

# 十二、Batch 5 — Search 最终收口

以真实 Library 验证：

```text
Title
Author
Body
Highlight
Note
Tag
URL
```

查询：

```text
普通关键词
多个关键词
tag:
is:read
is:unread
is:favorite
in:inbox
author:
```

验证：

- 搜索速度
- 搜索准确性
- snippet
- result type
- annotation result
- document result
- result → Reader
- result → Highlight
- result → Note
- result → Bookmark

特别测试：

```text
SQLite 删除
→
Reverie 启动
→
Rebuild
→
Search
```

最终确认：

> Search 是 Library 的加速器，不是 Library 本身。

---

# 十三、Batch 6 — Import / Export 最终验证

对 M5 / M9 完整走一次真实数据闭环。

至少测试：

```text
外部资料
→
Import
→
Read
→
Annotation
→
Export
→
重新 Import
```

检查：

- 内容
- metadata
- tags
- annotations
- reading state
- provenance
- identity
- duplicates

确认：

```text
Export
≠
破坏源文件
```

并且：

```text
Export Failure
≠
Source Mutation
```

---

# 十四、Batch 7 — RSS 长期使用验证

至少建立若干长期订阅源。

实际验证：

```text
Subscribe
→
Refresh
→
New Article
→
Read
→
Mark Read
→
Archive
→
Search
```

特别观察：

- refresh 是否稳定
- 是否产生重复文章
- 网络失败是否安全
- feed 内容变化是否破坏 Annotation
- feed 删除是否误删文章
- 长期刷新是否产生垃圾数据

M12 不追求 RSS 的复杂化。

只追求：

> 它能够长期可靠地工作。

---

# 十五、Batch 8 — EPUB / PDF 长期阅读验证

选择真正会阅读的：

```text
EPUB
PDF
```

进行长时间使用。

至少验证：

### EPUB

- TOC
- chapter
- internal link
- image
- long chapter
- Chinese
- mixed language
- annotation
- search
- progress
- TTS

### PDF

- page navigation
- zoom
- fit width
- outline
- text selection
- search
- annotation
- progress
- TTS
- scanned/hybrid behavior提示

注意：

> M7 已明确“不在 M7 引入 OCR”，M12 同样不因为真实使用中的扫描 PDF 而临时扩展 OCR 项目。

---

# 十六、Batch 9 — TTS 长时间实际使用

重点不是 API 是否能播放。

而是：

> 用户能否真的用它听完整文章 / 长文本。

测试：

```text
短文章
中等文章
长文章
中文
英文
中英混合
```

检查：

- voice selection
- rate
- pause
- queue
- next segment
- cancel
- resume
- reader location sync
- unexpected shutdown
- repeated start/stop

至少进行长时间连续运行测试。

重点捕获：

- memory leak
- queue corruption
- UI freeze
- speech state desync
- reader position drift

---

# 十七、Batch 10 — Library 长期维护体验

真实使用一段时间后，执行：

```text
新增资料
删除资料
移动资料
重命名
修改 metadata
导入
导出
搜索
重新索引
备份
恢复
```

然后观察 Library 是否仍然：

- 清晰
- 可理解
- 可维护
- 可迁移

---

# 十八、Batch 11 — “关机 / 崩溃 / 异常”验证

主动测试：

### 普通关闭

```text
保存
→
关闭
→
重新打开
```

### 中断

在以下行为中模拟取消/关闭：

- Import
- Export
- Index rebuild
- Feed refresh
- metadata write
- annotation write

确认：

```text
Cancellation
≠
Corruption
```

### Crash Recovery

主动模拟：

- 程序异常退出
- 强制结束
- 写入过程中终止
- SQLite 被删除
- SQLite 被损坏
- temp 文件残留

随后：

```text
启动
→
Recovery
/ Doctor
→
继续使用
```

---

# 十九、Batch 12 — 备份 / 迁移 / 重装最终验证

这是个人资料软件必须通过的最终测试。

## 12.1 完整备份

复制整个：

```text
Library/
```

确认可以离线保存。

## 12.2 新机器

模拟：

```text
Clean Windows
→
Install Reverie
→
指定已有 Library
→
读取
→
Search
→
Annotation
→
Progress
```

## 12.3 卸载

确认：

```text
Uninstall
≠
Delete Library
```

## 12.4 重新安装

```text
Uninstall
→
Reinstall
→
Attach Existing Library
```

资料必须仍然存在。

## 12.5 Library 跨设备复制

```text
Machine A
→
Copy Library
→
Machine B
```

确认不会产生：

```text
machine lock-in
```

---

# 二十、Batch 13 — UX 去噪

这一批不是新增 UI。

而是删除：

- 重复入口
- 冗余设置
- 开发测试按钮
- 无意义状态
- 内部术语
- 过度提示
- 重复确认框
- 不必要弹窗
- 无意义 Loading
- 过于复杂的配置

目标：

> 用户不需要知道 Reverie 内部是 SQLite、Indexer、Adapter、Locator、Cache 还是 Migration。

这些只属于实现层。

---

# 二十一、Batch 14 — Windows 产品体验最终收口

检查：

## Window

- resize
- maximize
- restore
- multi-monitor
- DPI
- 100%
- 125%
- 150%
- 175%
- 200%

## 输入

- keyboard
- shortcuts
- mouse
- wheel
- selection
- copy
- paste

## 路径

测试：

- 空格
- 中文
- 日文
- emoji
- 长路径
- 不同盘符

## 界面

检查：

- Dark / Light（若已有）
- 字体
- 行距
- 空间
- icon
- tooltip
- empty state
- error state
- loading state

---

# 二十二、Batch 15 — 性能最终检查

M12 不进行“为了 benchmark 而 benchmark”。

重点观察真实使用中的瓶颈：

### Startup

目标：

> 没有明显等待感。

### Library

测试：

```text
100
1,000
10,000
```

资料规模。

视项目实际情况进一步验证：

```text
50,000+
```

但不要为了达到数字而引入复杂架构。

### Search

检查：

- 首次搜索
- 连续搜索
- annotation search
- large corpus

### Reader

检查：

- large EPUB
- large PDF
- long Markdown
- large TXT

### TTS

检查：

- long-running
- queue size

---

# 二十三、Batch 16 — 日常使用反馈循环

建立一个：

```text
docs/M12-SELF-USE-LOG.md
```

每次真实使用只记录：

```text
日期
场景
资料类型
操作
问题
严重度
是否可复现
影响
解决方式
```

问题分类：

```text
P0 Data Safety
P1 Reliability / Blocking UX
P2 Usability
P3 Polish
```

其中：

### P0

例如：

- 数据丢失
- 静默覆盖
- Source mutation
- Annotation 永久丢失
- Upgrade 导致 Library 损坏

必须优先修复。

### P1

例如：

- 核心 Reader 无法使用
- Search 大面积失败
- Import / Export 无法正常工作
- 程序启动后无法恢复
- 频繁崩溃
- 明显数据一致性错误

优先修复。

### P2

普通 UX 问题。

只修复明显影响长期使用的问题。

### P3

视觉细节、极端边界、不影响实际使用的问题。

默认不阻塞 1.0。

---

# 二十四、Batch 17 — Backlog 清理

对所有历史 TODO / FIXME / Future / Wishlist 进行扫描。

分类：

```text
M12 必须修
Post-1.0
可以删除
历史遗留
已失效
```

尤其处理：

- TODO
- FIXME
- 暂时实现
- 临时代码
- Debug UI
- 临时开关
- Feature Flag
- PoC
- dead code

原则：

> 1.0 不意味着“代码里不能存在 TODO”。

真正需要的是：

> 明确哪些 TODO 是有意留下的未来工作。

---

# 二十五、Batch 18 — 最终依赖清理

扫描：

- NuGet
- native DLL
- runtime
- fonts
- WebView2
- PDF runtime
- TTS provider
- third-party libraries
- build tools

分类：

```text
Required
Optional
Dev-only
Unused
Legacy
```

删除：

- 不再需要的依赖
- PoC 依赖
- 调试依赖
- 未使用包

但不能为了“少一个包”破坏稳定功能。

---

# 二十六、Batch 19 — License / Attribution Final Review

M11 已进行依赖审计。

M12 再进行最终确认。

检查：

- 第三方许可证
- NOTICE
- attribution
- bundled dependency
- native runtime
- font license
- icon license
- sample data license

目标不是商业化合规包装。

目标是：

> 自用 1.0 不应留下明显的第三方许可遗漏。

---

# 二十七、Batch 20 — Security Final Audit

检查：

### 文件

- path traversal
- zip bomb
- malformed EPUB
- malformed PDF
- malformed XML
- symlink / junction
- UNC
- external file reference

### Web

- HTTP / HTTPS
- SSRF
- private network
- redirect
- response size
- timeout
- HTML script
- external resources
- tracking content

### Import

- malicious file
- oversized file
- invalid metadata
- path injection
- duplicate attack surface

### Export

- output path safety
- overwrite policy
- temporary files
- archive structure

继续保持：

```text
No paywall bypass
No login bypass
No DRM bypass
No private-content scraping bypass
No unauthorized republishing
```

---

# 二十八、Batch 21 — Recovery Final Audit

执行一次完整：

```text
Normal Use
→
Failure
→
Restart
→
Doctor
→
Recover
→
Continue Use
```

必须重新验证：

```text
SQLite Loss
→
Rebuild

Index Corruption
→
Rebuild

Incomplete Write
→
Recover

Orphan Temp
→
Classify

Broken Annotation Locator
→
Orphan / Recover

Unknown Version
→
Safe Read-only / Refuse Destructive Migration
```

---

# 二十九、Batch 22 — 真实 Release Candidate

M11 的 Release Build 基础上生成：

```text
Reverie 1.0 Release Candidate
```

要求：

```text
Clean Build
→
Install
→
Use
→
Upgrade
→
Uninstall
→
Reinstall
→
Attach Library
```

完整走通。

Release Candidate 不得依赖：

- IDE
- Debug environment
- source tree
- developer-only configuration
- local machine-specific路径
- 未声明 runtime

---

# 三十、Batch 23 — Final User Journey

执行一次完整真实旅程。

模拟：

```text
看到文章
↓
保存
↓
打开
↓
阅读
↓
高亮
↓
写笔记
↓
设置书签
↓
关闭
↓
第二天继续
↓
RSS 获取新文章
↓
搜索历史资料
↓
重新查看旧高亮
↓
导出
↓
备份 Library
```

这是 Reverie 1.0 最重要的最终测试。

---

# 三十一、Batch 24 — 1.0 Final Audit

最终必须回答：

## 功能

```text
Web
RSS
EPUB
PDF
Markdown
TXT
Highlight
Note
Bookmark
Search
TTS
Import
Export
```

是否全部满足既定 1.0 范围。

## 数据

```text
Library 是否可独立存在？
是否可复制？
是否可备份？
是否可恢复？
是否可迁移？
```

## 稳定性

```text
Crash
Cancel
Restart
Upgrade
Uninstall
Reinstall
```

是否安全。

## UX

实际使用时：

```text
是否自然？
是否容易理解？
是否愿意继续使用？
```

## 长期价值

最终必须回答：

> Reverie 是否已经足以替代当前个人阅读资料管理方式？

注意：

这个问题只要求给出：

```text
FACT
EVIDENCE
OBSERVATION
OPEN ISSUE
```

不要为了“完成 1.0”强行得出正面结论。

---

# 三十二、最终 1.0 Gate

只有全部核心项满足后，才可以将状态标记：

```text
Reverie 1.0
```

## Gate A — Build

- Release build 成功
- Clean machine 可安装
- 不依赖开发环境

## Gate B — Data

- Library 独立于 Application
- 可复制
- 可备份
- 可恢复
- 可迁移

## Gate C — Reader

- Web
- RSS
- EPUB
- PDF
- Markdown
- TXT

正常工作。

## Gate D — Annotation

- Highlight
- Note
- Bookmark
- Search
- Export
- Re-anchor

正常。

## Gate E — Search

正常。

## Gate F — TTS

正常。

## Gate G — Recovery

必须至少证明：

```text
SQLite loss
Index corruption
Interrupted write
Broken annotation
```

存在安全恢复路径。

## Gate H — Windows

- 安装
- 卸载
- 重装
- DPI
- Path
- Shortcut
- Window State

正常。

## Gate I — Security

已完成最终审计，没有已知 P0 安全问题。

## Gate J — Real Use

使用真实资料完成完整阅读闭环。

---

# 三十三、M12 最终文档

必须建立 / 更新：

```text
docs/M12-EXPLORE.md
docs/M12-IMPLEMENTATION-PLAN.md
docs/M12-STATUS.md
docs/M12-SELF-USE-LOG.md
docs/M12-FINAL-AUDIT.md
docs/SELF-USE.md
docs/USER-JOURNEY.md
docs/UX-FINAL.md
docs/1.0-ACCEPTANCE.md
docs/POST-1.0.md
docs/KNOWN-ISSUES.md
docs/BACKLOG.md
docs/FINAL-ARCHITECTURE.md
```

同时更新：

```text
README.md
CHANGELOG.md
```

使它们与实际代码状态一致。

---

# 三十四、POST-1.0 边界

M12 完成后不要继续无休止迭代。

建立：

```text
docs/POST-1.0.md
```

记录：

### Future Features

例如：

```text
真正必要的新格式
高级阅读统计
更高级 Export
更丰富 Reader 功能
更多 Windows Integration
未来 macOS
未来移动端
AI 功能
同步
```

但必须全部标记：

```text
Future
```

不能因为已经写入文档，就自动进入开发。

---

# 三十五、M12 Git 要求

继续遵循：

> 一个逻辑修改一个逻辑 Commit。

禁止：

```text
M12全部完成
→
一个巨大 Commit
```

推荐：

```text
M12: establish self-use baseline
M12: fix reader UX regressions
M12: stabilize annotation workflow
M12: improve search UX
M12: fix RSS long-term issues
M12: fix EPUB/PDF issues
M12: harden TTS
M12: remove debug artifacts
M12: clean dependencies
M12: finalize release candidate
M12: final documentation
```

具体 commit 拆分由实际修改决定。

---

# 三十六、问题处理原则

继续使用：

```text
FACT
HYPOTHESIS
INFERENCE
```

并记录：

```text
Evidence
Impact
Repro
Status
```

问题状态统一：

```text
OPEN
CONFIRMED
FIXED
VERIFIED
WONTFIX
POST-1.0
```

不得因为“理论上没问题”标记 VERIFIED。

必须有实际验证证据。

---

# 三十七、M12 绝对不能发生的事情

最终阶段尤其禁止：

### 1. 为了 1.0 又新增一个大型系统

例如：

```text
AI
Sync
Account
Cloud
Plugin
Knowledge Graph
Recommendation
Social
```

### 2. 为了重构而重构

### 3. 为了 benchmark 制造复杂缓存

### 4. 为了 UI 漂亮破坏 Reader 可读性

### 5. 为了方便索引把 SQLite 重新变成 Source of Truth

### 6. 为了修复数据问题直接删除异常数据

### 7. 为了 migration 方便覆盖未知版本资料

### 8. 为了“看起来完成”而关闭真实问题

---

# 三十八、最终核心不变量

M12 必须重新验证整个项目的这些不变量：

```text
Files Are Truth

SQLite Is Derived

SQLite Loss != User Data Loss

Index Rebuild != Source Mutation

Search Failure != Source Loss

Export Failure != Source Mutation

Import Failure != Partial Corruption

Annotation Resolution Failure != Annotation Deletion

Unknown Schema != Destructive Rewrite

Migration Failure != Silent Rewrite

Doctor Failure != Data Loss

Cancellation != Corrupted Persistent State

Crash != Partial Source Replacement

Uninstall != Delete Library

Install Location != Library Location

Cache Clear != Data Loss

Backup != Machine Lock-In

Library Copy != Application Installation

Reader Implementation != Data Model Duplication

Reader Adapter Failure != Other Reader Corruption

TTS Failure != Reader Data Mutation

RSS Refresh Failure != Existing Article Loss
```

这些不变量比“代码是否漂亮”更加重要。

---

# 三十九、M12 完成标准

M12 不是以：

```text
代码量
文件数量
Commit 数量
TODO 数量
UI 数量
```

作为完成标准。

而是：

> **一个真实用户能否安心把自己的阅读资料交给 Reverie，并持续使用。**

最终状态：

```text
M0
基础与风险

↓

M1
Web Capture + Reader

↓

M2
Annotation

↓

M3
Search + Library

↓

M4
RSS

↓

M5
Import / Export / Review

↓

M6
EPUB

↓

M7
PDF

↓

M8
TTS

↓

M9
Advanced EPUB / Web→EPUB

↓

M10
Recovery / Doctor

↓

M11
Windows Productization

↓

M12
Self-Use 1.0
```

---

# 四十、最终输出报告

完成 M12 后，必须输出：

```text
1. 当前 Reverie 1.0 实际状态

2. M0–M12 最终完成情况

3. 实际支持格式

4. Reader 架构最终状态

5. Annotation 最终状态

6. Search 最终状态

7. RSS 最终状态

8. Import / Export 最终状态

9. TTS 最终状态

10. Library 数据结构最终状态

11. SQLite / Index 最终状态

12. Recovery / Doctor 最终状态

13. Windows 产品化最终状态

14. Installer 最终状态

15. Upgrade / Uninstall / Reinstall 最终结果

16. Backup / Restore / Migration 最终结果

17. Security Audit 结果

18. Dependency / License 结果

19. Performance 结果

20. Real Self-Use 结果

21. Remaining Known Issues

22. P0 / P1 Issues

23. Post-1.0 Backlog

24. 是否满足 1.0 Acceptance Gate

25. 最终建议
```

其中：

```text
P0
```

必须为 0。

P1 原则上也应为 0；如果存在 P1，必须明确说明为什么仍允许自用 1.0，以及实际影响范围。

不得为了让报告好看而隐藏问题。

---

# 四十一、最终完成定义

M12 的最终完成定义为：

> **Reverie 已经不是一个“正在开发的阅读工具”，而是一个可以在 Windows 上长期实际使用的个人阅读档案系统。**

最终必须能够完成：

```text
安装 Reverie
↓
创建 / 选择 Library
↓
保存自己的阅读资料
↓
阅读
↓
搜索
↓
高亮
↓
写笔记
↓
书签
↓
RSS 获取新内容
↓
TTS 阅读
↓
导入旧资料
↓
导出自己的资料
↓
备份 Library
↓
恢复 Library
↓
换机器继续使用
↓
升级程序
↓
卸载 / 重装
↓
Library 仍然独立存在
```

并且：

```text
不依赖云
不依赖账号
不依赖服务器
不依赖 AI
不依赖开发环境
不依赖某一台电脑
```

---

# 四十二、最终执行指令

现在开始执行 M12。

严格遵循：

```text
Explore
→
Measure
→
Plan
→
Implement
→
Test
→
Real Use
→
Review
→
Fix
→
Retest
→
Document
```

要求：

1. 先审计当前真实代码、运行状态和 M0–M11 文档。
2. **代码和实际运行结果优先于历史设计文档。**
3. 不要假设任何功能已经完成。
4. 不要擅自扩大 M12 范围。
5. 不要为了“架构漂亮”而进行大型重构。
6. 所有数据安全问题优先于 UI polish。
7. 所有 P0 / P1 必须有证据。
8. 所有 VERIFIED 必须实际验证。
9. 所有修改按逻辑拆分 Git Commit。
10. 最终必须进行真实 Library Dogfooding。
11. 最终必须进行 Clean Windows Release Candidate 验证。
12. 最终必须完成 Backup / Restore / Upgrade / Uninstall / Reinstall / Migration 验证。
13. 最终必须完成 M10 Recovery / Doctor 回归。
14. 最终必须产出完整 M12 Final Audit。
15. 不得为了宣布 1.0 而隐藏、删除或弱化已知风险。
16. 发现属于 Post-1.0 的需求时，记录，不要偷偷纳入当前阶段。

---

# 四十三、M12 与其他阶段的边界

```text
M10
解决：
“出问题还能不能救回来？”

M11
解决：
“这个东西能不能被正常安装、升级、卸载和发布？”

M12
解决：
“这个东西是不是已经值得我长期真正使用？”
```

因此：

> **M12 是 Reverie 1.0 的最终收口，不是 Reverie 2.0 的开始。**

完成 M12 后，默认冻结核心架构与产品边界。

任何新功能进入：

```text
Post-1.0
```

重新评估。

---

# M12 最终成功标准

最终只需要满足一句话：

> **我可以把自己的阅读资料交给 Reverie，今天保存，明天继续读，几个月后还能搜索、重新打开、找到自己的高亮和笔记；即使程序出问题、索引损坏、换电脑或者重装软件，我仍然拥有自己的资料。**