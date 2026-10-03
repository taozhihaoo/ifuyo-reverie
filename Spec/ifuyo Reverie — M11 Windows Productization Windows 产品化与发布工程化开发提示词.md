# ifuyo Reverie — M11 Windows Productization
## Windows 产品化与发布工程化开发提示词

> 项目：ifuyo Reverie  
> 阶段：M11  
> 阶段名称：Windows Productization / Windows 产品化与发布工程化  
> 前置阶段：M0–M10  
> 后续阶段：M12 Self-Use 1.0  
> 本文用途：交给 Claude Code / Codex / Copilot 等本地 AI 执行 M11 开发  
> 核心目标：把已经完成的数据安全、Reader、搜索、RSS、Import/Export、EPUB、PDF、TTS、Recovery、Doctor 能力，收束为一个真正可以长期安装和使用的 Windows 桌面应用  
> 原则：**产品化，不等于商业化**

---

# 一、你的任务

你现在负责实施 **ifuyo Reverie M11**。

M11 的核心不是继续增加用户功能，而是解决一个问题：

> **“如果把 Reverie 当成一个真正的 Windows 桌面软件交给另一个 Windows 用户，他能不能稳定地安装、启动、使用、升级、迁移、卸载，并且永远不会因为安装器或升级器伤害自己的资料？”**

M11 完成之后，Reverie 应当从：

> “一个已经拥有大量功能的开发中项目”

进入：

> **“一个具备正式 Windows 产品形态的 Release Candidate / 可长期自用版本”**

---

# 二、首先牢记 Reverie 的核心原则

整个 M11 所有设计都必须服从下面这些原则。

## 2.1 文件是数据真相

Reverie 的用户资料仍然遵循：

```text
User Files
    ↓
Source of Truth
```

SQLite 仍然只是：

```text
Search Index
Cache
Derived State
Fast Query
UI State
```

因此：

```text
安装器 ≠ Library
升级器 ≠ Library Migration Tool
卸载程序 ≠ 删除用户资料
```

尤其不能因为安装路径、程序版本、用户重新安装、卸载、升级而破坏 Library。

---

# 三、M11 的边界

## 3.1 M11 必须完成

M11 重点完成：

```text
Windows Release Build
        ↓
Application Packaging
        ↓
Installer
        ↓
First Launch
        ↓
Configuration Initialization
        ↓
File Association
        ↓
Protocol / Optional Shell Integration
        ↓
Upgrade
        ↓
Downgrade / Unsupported Version Handling
        ↓
Uninstall
        ↓
User Data Preservation
        ↓
Portable / Migration Support
        ↓
Release Validation
        ↓
Crash / Log / Diagnostic Packaging
        ↓
Release Candidate
```

需要根据实际项目决定是否加入：

- Start Menu shortcut
- Desktop shortcut
- `.reverie` 或其他 Reverie 专用数据文件关联
- EPUB / PDF / Markdown / TXT 等系统文件关联
- “Send to Reverie”
- Windows context menu
- URI / protocol handler
- 开机启动
- Windows notification
- Windows jump list

其中任何 Shell Integration 都必须是：

> **实际需要才做**

不能为了“看起来像商业软件”大量添加系统集成。

---

# 四、M11 明确不做的事情

以下内容不要因为“产品化”而偷偷加入。

## 4.1 不做商业运营

不做：

- 登录
- 用户账号
- 云同步
- 会员
- 订阅
- 支付
- License Server
- 激活服务器
- 在线授权
- 用户统计平台
- 广告
- 埋点平台
- 用户画像
- 云端备份服务
- 在线内容平台
- 社交系统
- 商店运营
- SaaS 后端

M11 可以为未来商业化保留技术空间，但**现在不要实施商业服务**。

---

# 五、M11 的第一原则：先审计，不要立即写安装器

进入 M11 后第一步不是安装第三方 Installer，而是完整检查 M0–M10 当前真实状态。

必须先读取：

```text
CLAUDE.md
README*
docs/
src/
Scripts/
Data/
Assets/
project.godot
*.csproj
*.sln
```

以及当前已经存在的：

```text
M0–M10 文档
```

尤其检查：

```text
M10 Recovery
M10 Doctor
M10 Persistence
M10 Migration
M9 Export
M8 TTS
M7 PDF
M6 EPUB
M5 Import/Export
M4 RSS
M3 Search/Library
M2 Annotation
M1 Web Capture
```

不要假设之前规划已经全部实现。

必须以：

> **当前实际代码 > 当前实际文档 > 历史计划**

作为事实优先级。

---

# 六、M11 Explore：完整 Windows 产品化现状审计

首先输出：

```text
docs/M11-EXPLORE.md
```

至少调查以下内容。

---

## 6.1 当前 Godot / .NET / Windows 构建链

确认：

- Godot 实际版本
- .NET 实际版本
- C# 编译配置
- Debug / Release 配置
- Windows export preset
- Native dependency
- 第三方 DLL
- WebView2 依赖
- PDF 原生依赖
- EPUB 依赖
- TTS 依赖
- VC++ runtime 依赖
- 系统 API 依赖
- 字体依赖
- 外部 executable
- FFmpeg / codec 依赖（如果当前存在）
- GPU / renderer requirement
- DirectX / Vulkan / OpenGL requirement
- JIT / runtime requirement

不能靠猜。

必须从：

```text
实际项目文件
实际 export output
实际构建结果
实际 DLL
实际运行结果
```

确认。

---

# 七、Release Build 必须独立于 Debug

建立正式 Release Pipeline。

至少存在：

```text
Debug
Release
```

必要时可进一步：

```text
Release-Local
Release-RC
Release
```

但不要为了形式建立大量没有意义的 Configuration。

Release 构建必须检查：

- 是否包含调试资源
- 是否包含调试日志
- 是否包含 editor-only 文件
- 是否包含测试数据
- 是否包含开发工具
- 是否包含开发密钥
- 是否包含本地路径
- 是否包含绝对路径
- 是否写死开发环境
- 是否依赖开发机存在的 DLL
- 是否依赖 VS / dotnet SDK
- 是否依赖 Godot Editor
- 是否依赖当前用户目录中的资源
- 是否依赖当前开发环境注册表项

---

# 八、应用目录与用户资料目录彻底分离

这是 M11 最重要的 Windows 产品化要求之一。

绝对不要出现：

```text
Program Files/
    Reverie/
        library/
        books/
        articles/
        annotations/
        database/
```

这样的架构。

应该明确区分：

```text
Application Directory
```

与：

```text
User Data Directory
Library Directory
```

典型逻辑：

```text
Program Files / Local App Install
        ↓
Application binaries

User-selected Library Root
        ↓
User-owned content
```

Reverie 自己的：

```text
logs
settings
cache
index
temporary files
thumbnails
```

也需要有明确归属。

必须区分：

```text
User-owned Library Data
Application Data
Cache
Temporary Data
Diagnostic Data
```

不能混为一谈。

---

# 九、Windows AppData 路径策略必须明确

调查当前实现并明确：

```text
AppData\Roaming
AppData\Local
ProgramData
Documents
User-selected path
```

各自承担什么责任。

原则上：

### Roaming

只有真正适合 roaming 的小型用户设置才考虑。

### Local

适合：

- SQLite index
- cache
- thumbnails
- logs
- temp
- recovery artifacts

### Library

用户明确选择的位置，例如：

```text
D:\Reverie Library
E:\Books\Reverie
Documents\Reverie
```

Library 不应绑定到：

```text
%APPDATA%
%LOCALAPPDATA%
Program Files
```

---

# 十、首次启动初始化

首次运行不能直接把复杂初始化全部堆在主线程。

设计：

```text
Application Launch
    ↓
Bootstrap
    ↓
Environment Check
    ↓
Config Load
    ↓
Config Validate
    ↓
Library Detection
    ↓
Index Detection
    ↓
Recovery Check
    ↓
First Launch Setup
    ↓
Main UI
```

必须考虑：

```text
首次运行
旧版本升级后首次运行
用户已有 Library
用户没有 Library
Library 在其他磁盘
Library 被移动
SQLite 不存在
SQLite 损坏
配置损坏
残留 temp 文件
Recovery artifact 存在
```

---

# 十一、Library 选择必须尊重文件真相

首次启动可以提供：

```text
Create Library
Choose Existing Library
```

但不能要求：

> Library 必须位于 Reverie 指定目录。

Library 应是用户拥有的数据目录。

必须支持：

```text
选择已有 Library Root
```

程序通过结构与版本判断：

```text
Valid Library
Legacy Library
Recoverable Library
Unsupported Library
Invalid Library
Empty Directory
```

然后进入对应流程。

---

# 十二、Library 与安装程序彻底解耦

安装：

```text
Install Reverie
```

不意味着：

```text
Create/delete/move Library
```

升级：

```text
Install newer Reverie
```

不意味着：

```text
Rewrite Library
```

卸载：

```text
Uninstall Reverie
```

默认不意味着：

```text
Delete Library
Delete User Files
Delete Annotations
Delete Exports
```

这是必须写入产品规范的硬约束。

---

# 十三、Installer 技术选型

必须实际评估 Installer 技术。

候选可以包括当前项目真正适合的：

- MSIX
- Inno Setup
- NSIS
- WiX Toolset
- 其他明确适合 Windows Desktop 的成熟方案

不要因为“某个安装器很流行”就直接采用。

必须建立：

```text
docs/M11-INSTALLER-EVALUATION.md
```

至少比较：

| 维度 | 评价 |
|---|---|
| Windows 兼容性 | 实测 |
| Godot .NET 支持 | 实测 |
| Native DLL | 实测 |
| WebView2 | 实测 |
| PDF runtime | 实测 |
| File Association | 实测 |
| Upgrade | 实测 |
| Uninstall | 实测 |
| Per-user install | 实测 |
| Per-machine install | 实测 |
| UAC | 实测 |
| Registry | 实测 |
| Repair | 实测 |
| Silent install | 可选 |
| Portable build | 可选 |
| Signing | 支持情况 |
| Defender / SmartScreen 行为 | 实测 |
| 构建复杂度 | 实测 |
| CI/CD | 实测 |
| 维护成本 | 评估 |
| License | 核实 |
| Runtime dependencies | 核实 |

最终只能选择一个实际可行方案。

---

# 十四、安装模式

M11 至少研究两种形态：

## 14.1 Installed Build

例如：

```text
Program Files / Reverie
```

或者：

```text
Local App Installation
```

用于正常长期使用。

---

## 14.2 Portable Build

如果当前技术架构允许，建议研究：

```text
Reverie-Portable/
    Reverie.exe
    runtimes/
    ...
```

Portable 模式的要求：

> 可以复制整个应用目录到另一台 Windows 电脑运行，而不依赖 Installer 注册状态。

但 Portable 不是为了绕过系统限制。

尤其必须考虑：

- WebView2 runtime
- Native DLL
- TTS
- file association
- registry integration
- app data
- absolute path

如果不能做到真正可靠，不要伪装成 Portable。

---

# 十五、运行时依赖检测

Reverie 启动后必须能够识别缺失依赖，而不是直接崩溃。

例如：

```text
Missing WebView2
Missing VC Runtime
Missing Native PDF Runtime
Unsupported Windows Version
Missing required runtime
```

统一转成：

```text
DependencyCheckResult
```

例如：

```text
Dependency
Installed
RequiredVersion
DetectedVersion
Status
Message
RecoveryAction
```

UI 至少能够告诉用户：

```text
当前功能需要某依赖，但系统未检测到。
```

而不是：

```text
DllNotFoundException
EntryPointNotFoundException
```

直接出现在日志里。

---

# 十六、不要偷偷下载运行时依赖

默认不要：

```text
首次启动 → 静默联网 → 下载 DLL
```

尤其不能未经用户明确行为：

- 下载第三方 runtime
- 下载浏览器
- 下载字体
- 下载模型
- 下载语音
- 下载内容

依赖安装策略必须透明。

---

# 十七、Windows 文件路径工程化

M11 必须进行一次完整的 Windows Path Audit。

测试：

```text
C:\Reverie
D:\资料库
D:\书籍\中文
D:\My Library
D:\阅读📚
C:\Users\...\Documents
\\server\share
UNC path
```

至少检查：

- 空格
- 中文
- 日文
- Emoji
- Unicode normalization
- 长路径
- 盘符变化
- UNC
- removable drive
- case differences
- trailing spaces
- reserved names
- invalid characters
- path traversal
- symlink
- junction

尤其要确认：

```text
Library Root
Source File
Asset
Annotation
SQLite
Export
Temp
Backup
```

都不依赖开发机的 Windows path 假设。

---

# 十八、File Association

根据实际产品需求研究：

```text
.epub
.pdf
.md
.txt
```

以及 Reverie 自己的数据/配置格式是否需要：

```text
.reverie
```

注意：

> 不要为了 File Association 而让用户资料依赖 Windows Registry。

Registry 只是：

```text
OS Integration
```

不是：

```text
Source of Truth
```

如果 Registry 丢失：

```text
Library 必须依旧可用。
```

---

# 十九、启动参数

建立统一 Application Arguments 规范。

至少考虑：

```text
reverie.exe
reverie.exe <file>
reverie.exe --open <file>
reverie.exe --library <path>
reverie.exe --safe-mode
```

具体参数以实际需求为准，不要过度设计。

需要明确：

```text
argument parsing
path normalization
invalid argument
multiple file
unsupported file
missing file
```

---

# 二十、已有应用实例处理

考虑：

```text
double click file
→ second Reverie process
```

是否：

```text
open in existing instance
```

必须做出明确决定。

若支持单实例：

```text
Second Instance
    ↓
Validate Argument
    ↓
IPC
    ↓
First Instance
    ↓
Open Document
```

要求：

- 不死锁
- 不阻塞 UI
- 文件路径安全
- IPC 失败时有 fallback
- 应用关闭时不残留
- 不影响 Library Integrity

不需要自己实现复杂 IPC framework。

---

# 二十一、升级系统

M11 必须正式定义版本策略。

至少区分：

```text
Application Version
Data Format Version
Library Format Version
Configuration Version
Index Schema Version
```

例如：

```text
Reverie App 1.0
Library Format 1
Config Format 3
Index Schema 5
```

绝不能把：

```text
AppVersion == DataVersion
```

当成默认前提。

---

# 二十二、Upgrade Pipeline

标准流程：

```text
Installer starts
      ↓
Detect existing installation
      ↓
Detect installed version
      ↓
Detect running instance
      ↓
Request close if needed
      ↓
Install new binaries
      ↓
Launch new version
      ↓
Validate config
      ↓
Validate Library
      ↓
Validate schema
      ↓
Run migration if needed
      ↓
Rebuild derived index if needed
      ↓
Verify
      ↓
Launch normally
```

注意：

> Installer 不应该直接改写 Library 内容。

数据 Migration 由 Reverie 自己的数据层完成。

---

# 二十三、升级必须可恢复

测试至少包含：

```text
upgrade succeeds
upgrade interrupted
upgrade cancelled
upgrade fails midway
disk full
permission denied
file locked
application still running
migration fails
migration partially completes
index rebuild fails
```

重要原则：

```text
Installer Failure != Library Failure
Migration Failure != Source Corruption
Index Failure != Source Loss
```

---

# 二十四、版本兼容策略

必须明确：

### Current

正常读写。

### Older Supported

迁移后正常读写。

### Older Unsupported

明确提示。

### Future / Unknown

默认：

```text
Do Not Destructively Rewrite
```

例如：

```text
Library format 99
Current Reverie supports 1–5
```

不得直接：

```text
read → overwrite as version 5
```

而应：

```text
Unsupported Future Format
```

必要时允许：

```text
Read-only inspection
```

---

# 二十五、Downgrade 策略

M11 必须明确是否支持：

```text
1.2 → 1.1
```

默认建议：

> **不要宣称支持任意降级。**

如果 Migration 会破坏旧版本兼容性：

安装旧版本后必须明确：

```text
This library was migrated by a newer version and cannot safely be opened for writing by this version.
```

而不是：

```text
自动回滚数据库 / 自动重写文件
```

---

# 二十六、卸载行为

Uninstall 必须非常明确。

默认：

```text
Remove Application
Remove Installer Metadata
Preserve User Library
Preserve User Preferences unless explicitly chosen
```

至少让用户能够理解：

```text
卸载程序
≠
删除阅读资料
```

---

# 二十七、不要把 Library 删除塞进默认卸载流程

如果未来提供：

```text
Remove User Data
```

必须：

- 明确提示
- 显示路径
- 显示数据类型
- 显示大致数据量
- 明确说明不可逆
- 最好提供 Backup
- 默认不勾选

尤其不能：

```text
Uninstall → rm %APPDATA% → 顺便删除 Library
```

---

# 二十八、卸载后的重新安装

必须测试：

```text
Install
→ create Library
→ import materials
→ annotations
→ uninstall
→ reinstall
→ choose old Library
→ verify
```

必须确认：

- Article 存在
- EPUB 存在
- PDF 存在
- Annotation 存在
- Bookmark 存在
- Progress 存在
- Tags 存在
- Feed 存在
- Export 不受影响
- Doctor 能重新检查

---

# 二十九、配置文件恢复

M10 已经完成基础 Recovery。

M11 重点关注：

```text
App Settings
Preferences
Window State
Reader Settings
TTS Settings
Library Path
Recent Items
```

必须区分：

```text
critical user data
non-critical preferences
cache
```

Preferences 损坏时：

```text
reset preference
```

不能：

```text
delete Library
```

---

# 三十、窗口状态恢复

Windows 产品化至少处理：

```text
Window Size
Window Position
Maximized State
Monitor
DPI
Scale
```

测试：

- 单显示器
- 双显示器
- 不同 DPI
- 显示器拔除后
- 从高 DPI 切换低 DPI
- 窗口位置在已经不存在的屏幕
- 最大化后启动

必须保证：

> Reverie 永远能重新出现在用户可见区域。

不能出现：

```text
窗口实际上在屏幕外
```

---

# 三十一、DPI / Scaling

必须进行实际 Windows 高 DPI 测试：

```text
100%
125%
150%
175%
200%
```

至少检查：

- Main UI
- Reader
- Dialog
- Search
- Library
- Annotation
- Settings
- Doctor
- Import/Export
- TTS

重点不是“完美 UI”，而是：

```text
文本不消失
按钮可点击
布局不崩
窗口不出屏
Reader 可用
```

---

# 三十二、Windows Theme

如果应用当前存在：

```text
Dark
Light
System
```

必须检查 Windows system theme 切换。

不要为了产品化新增复杂主题系统。

只确保现有能力：

```text
正常
稳定
持久
```

---

# 三十三、日志与诊断

M11 必须正式定义 Release Logging。

至少区分：

```text
Info
Warning
Error
Critical
```

同时定义：

```text
Development logging
Release logging
```

Release 不能无限写日志。

---

# 三十四、日志隐私

日志禁止默认记录：

- 整篇文章正文
- EPUB 全文
- PDF 全文
- Highlight 全文堆积
- Note 全文堆积
- 用户私密路径以外的不必要隐私
- 密码
- Token
- Cookie
- Authorization header
- 网络认证信息

日志可以记录：

```text
DocumentId
File type
Operation
Timing
Error code
Exception class
Path hash / safe path representation
```

根据诊断需要决定是否记录完整路径。

---

# 三十五、Crash Handling

研究当前 Godot / .NET 环境实际支持的异常处理方式。

目标不是：

> “绝对不 Crash”

而是：

> **Crash 之后可以判断发生了什么，并且用户数据不会因为 Crash 而被破坏。**

至少设计：

```text
Unhandled Exception
    ↓
Crash Report / Log
    ↓
Safe Shutdown
```

同时不要因为捕获异常而：

```text
吞掉错误
```

例如：

```csharp
catch(Exception)
{
}
```

这种代码必须重点审计。

---

# 三十六、Release Error Boundary

Release 版本中应该存在明确的功能边界：

```text
Reader Error
RSS Fetch Error
Import Error
Export Error
TTS Error
Doctor Error
Search Error
Index Error
```

任何一个功能失败，都尽量不让：

```text
Entire Application
```

一起退出。

---

# 三十七、自动启动 / Background Process

M11 不默认加入：

```text
Startup App
Windows Service
Background daemon
```

因为 Reverie 当前是：

> Local-first personal reading application

除非实际存在明确需求，例如 RSS refresh。

即使未来存在 scheduler，也必须明确：

```text
Foreground
Background
Startup
```

分别承担什么职责。

不要为了“像商业软件”强行后台运行。

---

# 三十八、Windows Security Audit

安装器和 Release 构建必须重新跑一次安全检查。

至少覆盖：

```text
Installer path traversal
Zip extraction
DLL search order
Untrusted DLL loading
External process execution
ShellExecute
file://
http://
https://
UNC
network share
junction
symlink
local file access
HTML script
EPUB script
PDF JavaScript
external resource
temporary files
logs
environment variables
command line arguments
```

尤其检查：

```text
用户打开恶意文件
```

不能让：

```text
Reverie
```

因为 Reader / Import / Export 而：

```text
执行任意本地程序
```

---

# 三十九、Installer 安全

安装器必须检查：

- 安装目录是否可控
- 是否支持非 ASCII path
- 是否处理权限问题
- 是否正确处理 Program Files
- 是否避免 DLL hijacking
- 是否正确卸载
- 是否清理 installer metadata
- 是否残留错误文件
- 是否不会误删用户资料

安装包本身也必须检查：

```text
SHA-256
artifact integrity
```

---

# 四十、版本号规范

建立正式版本格式。

例如：

```text
Major.Minor.Patch
```

具体规则根据实际项目情况决定。

必须区分：

```text
Build Number
Application Version
Library Format Version
```

建议所有 Release 页面或 About 页面都能显示：

```text
Reverie Version
Build
Godot/runtime information
```

但不要把内部调试信息全部暴露给普通 UI。

---

# 四十一、Build Metadata

Release Build 建议保存：

```text
Version
BuildId
CommitHash
BuildDate
Configuration
TargetPlatform
RuntimeVersion
```

用于：

```text
Bug Report
Doctor Report
Crash Report
```

例如：

```text
Reverie 1.0.0
Build 20261004
Commit abc123
Windows x64
Release
```

---

# 四十二、Deterministic / Reproducible Build

尽可能保证：

```text
同一 commit
+
同一 build configuration
+
同一依赖
```

可以得到：

```text
可解释的相同构建结果
```

不必为了绝对 bit-for-bit reproducibility 大规模引入复杂系统。

至少确保：

- build provenance
- dependency versions
- artifact hashes
- build script
- release manifest

完整。

---

# 四十三、第三方依赖清单

建立：

```text
docs/M11-DEPENDENCIES.md
```

记录：

```text
Dependency
Version
Purpose
Runtime/Build time
License
Native dependency
Windows requirement
Distribution requirement
Source
Known issue
```

特别检查：

```text
DLL
NuGet
Native Runtime
WebView2
PDF
TTS
Installer
```

---

# 四十四、License 文件

M11 必须检查所有第三方依赖的：

```text
license
notice
attribution
redistribution requirement
```

如果某依赖要求在发布目录中存在：

```text
LICENSE
NOTICE
```

必须正确打包。

不要手工猜许可证。

必须根据：

```text
实际依赖
实际版本
实际许可证
```

建立最终清单。

---

# 四十五、代码签名

M11 可以建立：

```text
Code Signing Ready
```

架构。

例如：

```text
Unsigned Release
Signed Release
```

但如果当前没有实际签名证书：

> 不要伪造“已签名”。

可以建立：

```text
SIGNING.md
```

定义未来签名点：

```text
.exe
.dll
Installer
Uninstaller
```

签名必须放在正确的 Release Pipeline 阶段。

---

# 四十六、不要把证书放进仓库

绝对禁止：

```text
.pfx
private key
certificate password
signing token
```

进入：

```text
git
source tree
installer
public artifact
```

应通过：

```text
local secure store
CI secret
hardware-backed key
```

等实际安全方式处理。

---

# 四十七、Windows Defender / SmartScreen

M11 可以做一次：

```text
fresh Windows machine
```

上的实际验证。

观察：

- installer warning
- unsigned executable warning
- first-run warning
- DLL load behavior
- Windows Defender detection
- SmartScreen behavior

注意：

> 不要声称“保证没有 SmartScreen 警告”。

因为实际信誉和签名环境会影响结果。

应记录：

```text
Observed
Environment
Date
Build
Result
```

---

# 四十八、Release Artifact 目录

最终建立明确的 Release 输出：

```text
artifacts/
    Reverie-x.y.z-win-x64.zip
    Reverie-x.y.z-Setup.exe
    checksums.txt
    release-manifest.json
```

具体名称根据实际 Installer 决定。

---

# 四十九、Checksums

至少生成：

```text
SHA-256
```

覆盖：

- Installer
- Portable package
- ZIP
- 关键 Release artifacts

例如：

```text
filename
sha256
size
version
```

---

# 五十、Release Manifest

建议生成：

```text
release-manifest.json
```

记录：

```json
{
  "product": "ifuyo Reverie",
  "version": "...",
  "platform": "windows-x64",
  "commit": "...",
  "buildDate": "...",
  "artifacts": [],
  "dependencies": [],
  "checksums": {}
}
```

不要让 manifest 成为运行时核心依赖。

---

# 五十一、Release Candidate

M11 最终必须能生成：

```text
Release Candidate
```

而不是只生成：

```text
Debug Build
```

RC 必须经过：

```text
Fresh Install
Existing Install Upgrade
Uninstall
Reinstall
Portable
First Launch
Existing Library
New Library
Broken SQLite
Doctor
Import
Export
Reader
TTS
RSS
```

验证。

---

# 五十二、Fresh Machine Test

至少模拟：

```text
Windows 10/11
```

中项目目标支持范围内的干净环境。

不要只在：

```text
开发者电脑
```

验证。

重点检查：

```text
缺少开发环境
缺少 Godot
缺少 VS
缺少 dotnet SDK
缺少开发目录
缺少本地 source tree
```

情况下是否仍然运行。

---

# 五十三、Upgrade Matrix

建立升级矩阵：

| From | To | Result |
|---|---|---|
| Old stable | Current | Supported |
| Current | Current patch | Supported |
| Legacy | Current | Migrated / Unsupported |
| Future | Current | Refused |
| Current | Older | Unsupported / warning |

实际版本根据当前项目生成。

---

# 五十四、Install / Upgrade / Uninstall E2E

建立至少以下完整流程：

### Scenario A

```text
Fresh Machine
→ Install
→ Launch
→ Create Library
→ Import
→ Read
→ Annotate
→ Restart
```

### Scenario B

```text
Old Version
→ Library
→ Install New Version
→ Launch
→ Migration
→ Verify
```

### Scenario C

```text
New Version
→ Uninstall
→ Library remains
→ Reinstall
→ Open Library
```

### Scenario D

```text
Install
→ Existing Library
→ SQLite deleted
→ Launch
→ Rebuild
→ Verify
```

### Scenario E

```text
Install
→ Open EPUB/PDF
→ Annotate
→ Restart
→ Verify
```

### Scenario F

```text
Upgrade interrupted
→ Restart
→ Recovery
→ Verify
```

---

# 五十五、Portable / Installed Data Test

如果最终支持 Portable：

验证：

```text
Installed Build
→ Library A

Portable Build
→ Library A
```

两者必须共享：

```text
同一 Library
```

且不能依赖：

```text
Install Location
```

---

# 五十六、Library Portability

这是 Reverie 的核心竞争力之一。

至少测试：

```text
PC-A
→ Library

Copy Library

PC-B
→ Install Reverie
→ Choose Existing Library
→ Rebuild Index
→ Verify
```

需要验证：

- Article
- RSS Article
- EPUB
- PDF
- Markdown
- TXT
- Highlight
- Note
- Bookmark
- Progress
- Tags
- Feed
- Metadata
- Assets

全部尽量保持。

---

# 五十七、跨磁盘测试

至少：

```text
C:
D:
External Drive
Network Path
```

如果不支持某类路径，必须：

```text
明确检测
明确报错
```

不要出现：

```text
部分可用
部分损坏
```

---

# 五十八、文件关联回归

例如：

```text
Double-click EPUB
→ Reverie opens
→ correct document

Double-click PDF
→ Reverie opens
→ correct document

Double-click Markdown
→ Reverie opens
→ correct document
```

如果已经实现。

同时测试：

```text
Reverie not running
Reverie running
multiple instances
invalid file
deleted file
```

---

# 五十九、Reader Regression

M11 不修改 Reader 核心逻辑。

但必须做产品化回归：

```text
Web
EPUB
PDF
Markdown
TXT
```

确认：

```text
Open
Navigate
Search
Bookmark
Highlight
Note
Progress
TTS
```

没有因为：

```text
Release Build
Install Path
User Data Path
```

而异常。

---

# 六十、Doctor Regression

M10 Doctor 是 M11 的关键底牌。

必须验证：

```text
Fresh installation
Existing library
Corrupted index
Missing file
Broken metadata
Broken annotation
Old format
Temp file
```

都可以：

```text
Launch
→ Doctor
→ Scan
→ Report
```

并确保：

> Installer 不会让 Doctor 失去作用。

---

# 六十一、Migration Regression

所有数据 Migration 必须：

```text
backup / recovery
validate
atomic
idempotent
```

测试：

```text
migration success
migration repeat
migration failure
migration interruption
migration on copied library
```

尤其检查：

```text
same library
run migration twice
```

不会产生：

```text
duplicate annotation
duplicate metadata
duplicate assets
duplicate documents
```

---

# 六十二、Performance

M11 不重新做整个性能优化工程。

但要做 Release Build 基准。

至少观察：

```text
Startup time
Cold startup
Warm startup
Library scan
Index rebuild
Large library open
EPUB open
PDF open
Search
Import
Export
TTS startup
Doctor scan
```

并比较：

```text
Debug
Release
```

重点发现：

> Release 环境下是否存在 Debug-only 假设。

---

# 六十三、启动时间

重点关注：

```text
Startup
```

是否被：

- Full Library Scan
- Full Index Rebuild
- EPUB Parsing
- PDF initialization
- RSS Refresh
- TTS initialization
- thumbnail generation

阻塞。

理想结构：

```text
Bootstrap
→ UI available
→ background initialization
```

但必须服从正确性。

尤其不能：

```text
用户一打开
→ Background Thread 同时疯狂修改 Library
```

---

# 六十四、首次启动体验

第一次启动建议做到：

```text
Welcome
→ Library location
→ Optional settings
→ Start
```

但不要设计成 onboarding campaign。

Reverie 是工具，不是内容平台。

---

# 六十五、Settings Audit

M11 需要整理 Settings。

至少区分：

```text
Library
Reader
Appearance
TTS
RSS
Import/Export
Storage
Advanced
Diagnostics
```

不要为了分类而重复设置。

尤其确认：

```text
Library Path
Index Path
Cache Path
Temp Path
```

用户能够理解。

---

# 六十六、恢复默认设置

必须明确：

```text
Reset Settings
```

究竟会删除什么。

默认：

```text
Reset Settings
≠
Delete Library
```

甚至应该让按钮文案明确：

```text
Reset application settings
```

而不是：

```text
Reset Reverie
```

---

# 六十七、Storage 页面

建议增加：

```text
Storage
```

信息：

```text
Library Path
Documents Count
Estimated Library Size
Index Size
Cache Size
Logs Size
Temp / Recovery Size
```

尤其区分：

```text
User Data
Derived Data
```

让用户理解：

> 删除 Cache 不等于删除资料。

---

# 六十八、Clear Cache

必须支持：

```text
Clear Cache
```

但明确保证：

```text
Source Files remain
Annotations remain
Library remains
```

同时：

```text
SQLite index
```

如果属于 derived data，可以允许重建。

---

# 六十九、Rebuild Index

M11 必须确保 UI 具备可靠的：

```text
Rebuild Index
```

入口。

流程：

```text
User Click
    ↓
Confirm
    ↓
Temp DB
    ↓
Filesystem Scan
    ↓
Validate
    ↓
Build
    ↓
Verify
    ↓
Atomic Replace
```

不能：

```text
delete index.db
→ create empty DB
→ gradually mutate current index
```

导致中途崩溃后无法恢复。

---

# 七十、Safe Mode

只有当实际项目存在：

```text
startup crash
plugin/rendering issue
corrupt config
bad user setting
```

等问题时，再实现轻量 Safe Mode。

例如：

```text
reverie.exe --safe-mode
```

Safe Mode 可以：

- 不加载非必要 UI state
- 不自动打开最近文件
- 不加载某些可选组件
- 不使用缓存
- 不自动 refresh RSS
- 不执行高风险后台任务

但必须保证：

> Safe Mode 本身不是第二套运行时架构。

---

# 七十一、Crash Recovery 后首次启动

如果上一轮程序异常退出：

```text
Next Startup
```

检查：

```text
Recovery Artifacts
Incomplete Operations
Pending Index Build
Pending Migration
Temp Files
```

然后：

```text
Recover
or
Mark for Doctor
```

不能无限弹窗。

---

# 七十二、自动更新

M11 可以研究 Auto Update。

但默认原则：

> **不要因为产品化就强行接入在线更新服务。**

如果当前是纯个人自用：

至少实现：

```text
Manual Update
```

与：

```text
version detection mechanism
```

的边界即可。

如果之后需要 Auto Update：

必须单独设计：

```text
Update Service
Signature Verification
Rollback
Channel
```

不要在 M11 中偷偷建立一套后台更新系统。

---

# 七十三、Release Channels

如果实际需要，可建立：

```text
dev
rc
stable
```

但不必做在线频道控制。

一个最简单、适合当前阶段的模式：

```text
Debug
Release Candidate
Stable
```

即可。

---

# 七十四、CI/CD

如果当前已有 GitHub / GitLab / Azure DevOps 等环境，可以建立：

```text
Build
Test
Package
Hash
Artifact
```

Pipeline。

最低要求：

```text
clean checkout
→ restore
→ build
→ test
→ export
→ package
→ checksum
```

CI 不能依赖开发机本地文件。

---

# 七十五、Release Gate

建立正式 Release Gate：

```text
Build PASS
Test PASS
Install PASS
Upgrade PASS
Uninstall PASS
Library integrity PASS
Doctor PASS
Security PASS
Dependency audit PASS
License audit PASS
Artifact hash PASS
```

任何 P0 问题：

> 不允许进入 Release Candidate。

任何 P1：

> 必须有证据、影响说明与明确处置。

不要因为：

```text
“看起来差不多”
```

放行。

---

# 七十六、测试分层

M11 至少整理：

```text
Unit
Integration
E2E
Install
Upgrade
Uninstall
Release Smoke
Recovery
Security
Performance
```

不要所有测试都塞进：

```text
Unit Tests
```

Installer 本身也需要自动化或半自动化验证。

---

# 七十七、Windows Sandbox / VM 测试

有条件时，优先使用：

```text
Windows VM
Windows Sandbox
Clean Environment
```

避免：

```text
Developer PC only
```

因为开发机通常已经拥有：

- .NET SDK
- VS
- Godot
- WebView2
- VC runtime
- Git
- PATH 环境
- 已注册组件

会掩盖部署问题。

---

# 七十八、错误消息标准化

统一用户可见错误。

不要直接显示：

```text
System.IO.IOException
DllNotFoundException
UnauthorizedAccessException
JsonException
```

内部日志可以保留异常类型。

UI 应显示：

```text
发生了什么
为什么发生
资料是否安全
用户可以做什么
```

例如：

```text
无法写入该文件。

Reverie 没有修改原文件。
请确认磁盘空间或文件权限后重试。

原始资料仍然保留。
```

这与 Reverie 的核心价值一致。

---

# 七十九、错误分类

建议建立统一：

```text
ReverieError
```

或等价错误分类。

至少区分：

```text
Validation
IO
Permission
Format
Unsupported
Migration
Dependency
Network
Security
Cancelled
Concurrency
Internal
```

这样 UI、日志、Doctor、E2E 测试可以共享语义。

---

# 八十、不要重复造数据层

M11 尤其禁止：

```text
Installer Metadata DB
Application Database
Library Database
Update Database
Recovery Database
```

为了产品化再造一堆数据库。

仍然：

```text
File = Truth
SQLite = Derived
Config = Application Preference
```

---

# 八十一、不要把 Windows Registry 当数据库

Registry 只用于真正需要的 Windows 集成：

```text
file association
uninstall registration
shell integration
```

不能把：

```text
Library metadata
Bookmark
Progress
Annotation
Feed
Document state
```

写进去。

---

# 八十二、Export / Import 仍然是产品出口

M11 不能因为“已经安装好了”而削弱：

```text
Markdown Export
EPUB Export
Metadata Export
Highlight Export
```

必须确保：

```text
Uninstall
Reinstall
```

之后用户仍然可以：

```text
Export
```

---

# 八十三、备份指导

M11 可以在 UI 中增加轻量提示：

```text
Your Library is stored separately from the application.
Back up the Library directory to protect your data.
```

不要做云备份。

必要时仅提供：

```text
Open Library Folder
```

即可。

---

# 八十四、Windows 文件备份兼容性

测试用户使用：

```text
File Explorer copy
Zip
7-Zip
OneDrive / local folder copy
external drive
```

对 Library 进行备份之后：

```text
restore
→ choose restored folder
→ Doctor
→ rebuild index
```

应能恢复。

但不需要在 M11 实现第三方云同步。

---

# 八十五、Portable Library Contract

建立：

```text
docs/LIBRARY-PORTABILITY.md
```

明确：

```text
什么可以复制
什么不能复制
哪些是 derived
哪些是 machine-specific
```

理想情况：

```text
Copy Library Directory
→ Another Computer
→ Reverie Detects
→ Index Rebuild
→ Usable
```

---

# 八十六、机器相关信息不得污染 Library

例如禁止：

```json
{
  "machine": "GRAY-PC",
  "absolutePath": "C:\\Users\\..."
}
```

进入用户资料作为关键字段。

可以存在：

```text
machine-specific cache
```

但它必须是：

```text
rebuildable
```

---

# 八十七、日志、缓存、索引、临时文件的生命周期

建立明确策略：

```text
Temp
→ short-lived

Cache
→ disposable

Index
→ rebuildable

Logs
→ bounded

Recovery
→ cleaned after success

Library
→ persistent
```

---

# 八十八、磁盘空间策略

检测：

```text
Free Space
```

在重大操作之前至少对：

```text
Import
Export
Index Rebuild
Migration
Large EPUB
Large PDF
```

考虑空间风险。

不必做复杂精确预测。

至少不能：

```text
直接写满用户磁盘
```

---

# 八十九、Cancellation

M11 必须重新验证：

```text
Install
Import
Export
Index
Doctor
Migration
```

的取消语义。

要求：

```text
Cancel
!=
Partial Corruption
```

尤其：

```text
Cancel Index Rebuild
```

不能留下一个：

```text
半成品 index.db
```

---

# 九十、Single Responsibility

产品化代码也必须保持已有架构边界。

例如：

```text
Installer
```

不要直接操作：

```text
Annotation
Reader
Search
```

而：

```text
Application Bootstrap
```

负责：

```text
Environment
Config
Library
Services
```

不要把所有启动逻辑塞进：

```text
Main.cs
```

或：

```text
Main Scene
```

---

# 九十一、推荐产品化层次

根据实际项目适配，推荐最终结构接近：

```text
Application
├── Bootstrap
├── Configuration
├── Environment
├── Lifecycle
├── Diagnostics
├── Release
└── Windows Integration

Core
├── Library
├── Documents
├── Reader
├── Annotation
├── Search
├── Import
├── Export
├── RSS
├── TTS
└── Recovery

Infrastructure
├── File System
├── SQLite
├── HTTP
├── ZIP
├── Windows APIs
└── Third-party adapters

UI
├── Library
├── Reader
├── Settings
├── Import
├── Export
└── Doctor
```

实际目录命名以当前代码为准，不要为了结构美观大规模移动代码。

---

# 九十二、M11 不进行“大重构”

非常重要：

> **不要把 M11 变成 Architectural Refactor。**

只允许为：

- Installer
- Release
- Windows Integration
- Bootstrap
- Diagnostics
- Upgrade
- Uninstall
- Deployment

真正证明必要的代码调整。

如果发现：

```text
旧代码很丑
```

但：

```text
不会影响发布
```

不要因为“顺便整理一下”而重写。

---

# 九十三、现有技术债处理原则

发现问题时按照：

```text
P0
P1
P2
```

处理。

M11 优先修：

### P0

会导致：

- 数据丢失
- 升级破坏
- 卸载误删
- 无法启动
- Release 无法运行
- 安全边界突破

### P1

会严重影响：

- 安装
- Reader
- Library
- Import/Export
- Recovery
- 用户长期使用

### P2

普通质量问题：

> 能不阻塞 M11 就不阻塞。

---

# 九十四、必须遵循 FACT / HYPOTHESIS / INFERENCE

所有审计结论区分：

```text
FACT
HYPOTHESIS
INFERENCE
```

例如：

```text
FACT:
Release Build 启动时读取了开发机绝对路径。

IMPACT:
Fresh Machine 启动失败。

P0/P1:
P1

EVIDENCE:
具体文件、代码位置、测试结果。

RECOMMENDATION:
改为相对资源路径。
```

禁止：

```text
“感觉这个设计不专业。”
```

作为问题证据。

---

# 九十五、M11 文档体系

至少生成：

```text
docs/M11-EXPLORE.md
docs/M11-IMPLEMENTATION-PLAN.md
docs/M11-STATUS.md

docs/WINDOWS.md
docs/INSTALLER.md
docs/UPGRADE.md
docs/UNINSTALL.md
docs/RELEASE.md
docs/RELEASE-BUILD.md
docs/RELEASE-TESTING.md
docs/DEPENDENCIES.md
docs/LICENSING.md
docs/SIGNING.md
docs/DIAGNOSTICS.md
docs/LIBRARY-PORTABILITY.md
docs/WINDOWS-INTEGRATION.md
docs/DISTRIBUTION.md
```

根据实际需求可删减明显重复的文档。

同时更新：

```text
docs/DECISIONS.md
docs/PROGRESS.md
docs/RECOVERY.md
docs/PERSISTENCE.md
docs/MIGRATION.md
docs/DATA-INTEGRITY.md
docs/FAILURE-MODES.md
```

以及当前已有的相关共享文档。

---

# 九十六、M11 批次计划

M11 推荐拆成 13 批。

---

## Batch 1 — Explore

完成：

- M0–M10 真实状态审计
- Windows 构建现状
- Runtime dependencies
- Application/Data 路径
- Installer 候选
- Release pipeline
- 当前问题清单

输出：

```text
M11-EXPLORE.md
```

---

## Batch 2 — Product Runtime Boundary

建立并确认：

- Application Directory
- User Data
- Library
- Config
- Cache
- Temp
- Logs
- Recovery
- Index

解决：

> 应用程序与用户资料彻底解耦。

---

## Batch 3 — Release Build

完成：

- Release configuration
- clean build
- runtime dependency packaging
- version metadata
- build metadata
- artifact generation

必须能在干净环境运行。

---

## Batch 4 — Installer PoC

实际验证候选 Installer。

选择最终 Installer 技术。

完成：

- install
- start menu
- uninstall
- permissions
- UAC
- per-user/per-machine
- file association capability
- upgrade capability

---

## Batch 5 — First Launch / Bootstrap

完成：

- first launch
- config initialization
- library detection
- existing library selection
- corrupted config recovery
- dependency checks
- startup lifecycle

---

## Batch 6 — Windows Integration

按实际需求完成：

- File Association
- Open With
- Startup arguments
- Single Instance
- IPC
- Shell integration

没有必要的功能不要做。

---

## Batch 7 — Upgrade / Migration

完成：

- version detection
- app upgrade
- config migration
- library format migration integration
- index compatibility
- interrupted upgrade
- unsupported version

---

## Batch 8 — Uninstall / Reinstall / Portability

完成：

- clean uninstall
- data preservation
- reinstall
- existing library reopen
- portable investigation
- library portability
- cross-machine verification

---

## Batch 9 — Diagnostics / Error UX

完成：

- logging
- crash reporting boundary
- error classification
- user-facing error
- diagnostic bundle
- no-sensitive-data logging

---

## Batch 10 — Security / Dependency / License

完成：

- dependency audit
- native DLL audit
- path security
- installer security
- third-party license audit
- signing architecture
- Windows Defender / SmartScreen observation

---

## Batch 11 — E2E / Fresh Machine

执行：

```text
Fresh install
First launch
Create Library
Import
Read
Annotate
Search
RSS
EPUB
PDF
TTS
Export
Restart
Doctor
```

确认完整产品链路。

---

## Batch 12 — Upgrade / Failure / Stress

执行：

```text
Upgrade
Interrupted upgrade
Failed migration
DB corruption
Config corruption
Disk full
Permission denied
Locked file
Large Library
Long-running Reader
Large EPUB
Large PDF
Doctor
```

检查：

```text
No data loss
No silent corruption
No unrecoverable state
```

---

## Batch 13 — Final Release Audit

最终审计：

```text
Code
Build
Installer
Dependencies
Runtime
Security
License
Library
Migration
Recovery
Doctor
Reader
Search
Import
Export
RSS
EPUB
PDF
TTS
Logs
Portability
Documentation
```

生成：

```text
M11-STATUS.md
```

并给出明确结果：

```text
READY
READY WITH KNOWN ISSUES
BLOCKED
```

其中：

### READY

没有 P0/P1 阻塞问题。

### READY WITH KNOWN ISSUES

存在已知问题，但经过证据评估不阻塞当前目标。

### BLOCKED

存在 P0 或明确阻塞性的 P1。

---

# 九十七、M11 最终验收标准

M11 完成时，必须回答以下问题。

## 安装

```text
我能在一台干净 Windows 电脑上安装 Reverie 吗？
```

## 启动

```text
没有开发环境，我能启动吗？
```

## 数据

```text
Library 是否完全独立于安装目录？
```

## 升级

```text
旧版本升级是否不会伤害 Library？
```

## 卸载

```text
卸载是否默认不会删除用户资料？
```

## 迁移

```text
我能把 Library 复制到另一台电脑继续使用吗？
```

## 恢复

```text
SQLite 损坏、配置损坏、程序异常退出后，我是否仍有恢复路径？
```

## 安全

```text
恶意 EPUB/PDF/HTML/RSS 文件是否不会轻易突破本地安全边界？
```

## 依赖

```text
缺少 runtime 时用户是否得到明确反馈？
```

## Release

```text
我拿到的是正式 Release artifact，而不是开发环境导出的临时包吗？
```

## 诊断

```text
出问题后，我能否得到有价值的诊断信息？
```

## 数据出口

```text
用户仍然可以自由复制、备份、检查和导出自己的资料吗？
```

---

# 九十八、最终产品结构应接近

理想状态：

```text
┌──────────────────────────────────────────────┐
│                ifuyo Reverie                   │
├──────────────────────────────────────────────┤
│                                              │
│  Windows Application                         │
│      │                                       │
│      ├── Reader                              │
│      ├── Library                             │
│      ├── Search                              │
│      ├── Annotation                          │
│      ├── RSS                                 │
│      ├── Import / Export                     │
│      ├── TTS                                 │
│      ├── Doctor / Recovery                   │
│      └── Settings                            │
│                                              │
│  Application Runtime                         │
│      │                                       │
│      ├── Config                              │
│      ├── Logs                                │
│      ├── Cache                               │
│      ├── Temp                                │
│      └── Derived Index                       │
│                                              │
│  User Library                                │
│      │                                       │
│      ├── Articles                            │
│      ├── Books                               │
│      ├── PDFs                                │
│      ├── Annotations                         │
│      ├── Metadata                            │
│      └── Exports                             │
│                                              │
└──────────────────────────────────────────────┘
```

最核心的是：

```text
Reverie Application
       ↓
does not own
       ↓
the user's Library
```

而是：

```text
Reverie
    ───── uses ─────>
User-owned Library
```

---

# 九十九、M11 与 M10 的边界

M10：

```text
Data Integrity
Recovery
Doctor
Persistence
Migration
Failure Recovery
```

M11：

```text
Windows Runtime
Installer
Release
Upgrade
Uninstall
Deployment
Diagnostics
Windows Integration
Portability
```

如果在 M11 中发现：

```text
底层持久化仍可能损坏用户数据
```

优先修 M10 类问题。

不要认为：

> “这是 M11，不应该碰。”

数据安全优先级高于阶段边界。

---

# 一百、M11 与 M12 的边界

M11 到这里：

```text
可以安装
可以运行
可以升级
可以卸载
可以恢复
可以迁移
可以发布
```

但：

```text
“我自己已经连续使用一段时间，而且整个产品真的好用。”
```

属于 M12。

因此 M11 不需要：

- 大规模 UI polish
- 大量视觉动画
- 完整用户体验重做
- 商业官网
- 商店上架
- 用户运营
- 云同步
- 账号系统

M12 再进行：

```text
Self-Use 1.0
```

---

# 一百零一、M11 的核心质量标准

不要用：

```text
“Installer 能安装”
```

作为完成标准。

真正标准是：

```text
Install
↓
Run
↓
Create / Open Library
↓
Read
↓
Annotate
↓
Search
↓
Import
↓
Export
↓
Close
↓
Upgrade
↓
Restart
↓
Recover
↓
Uninstall
↓
Reinstall
↓
Open same Library
```

这一整条链条成立。

---

# 一百零二、M11 的硬性不变量

必须验证：

```text
Uninstall != Delete Library

Install Location != Library Location

SQLite Loss != User Data Loss

Index Rebuild != Source Mutation

Upgrade Failure != Library Corruption

Migration Failure != Silent Rewrite

Installer Failure != User Data Loss

Config Corruption != Library Deletion

Cache Clear != Data Loss

Application Crash != Partial Source Replacement

Portable Copy != Machine Lock-in

Registry Loss != Library Loss

Release Packaging != Development Environment Dependency
```

---

# 一百零三、最终代码审计

M11 完成后，对新增和修改代码进行一次完整审计。

重点查找：

```text
absolute path
hardcoded username
hardcoded drive letter
working-directory assumption
AppData assumption
Program Files write
fire-and-forget task
async void
unhandled exception
swallowed exception
installer-specific data dependency
registry as source of truth
non-atomic write
non-idempotent migration
unsafe temp file
unsafe cleanup
DLL load vulnerability
shell execution
unsafe URI handling
```

任何发现都必须按照：

```text
FACT
EVIDENCE
IMPACT
SEVERITY
RECOMMENDATION
```

记录。

---

# 一百零四、Git 提交策略

不要把整个 M11 做成一个 commit。

按照逻辑功能拆分，例如：

```text
feat: establish windows runtime boundaries
feat: add release build pipeline
feat: add installer
feat: add bootstrap initialization
feat: add windows integration
feat: add upgrade flow
feat: improve uninstall preservation
feat: add diagnostics
test: add install upgrade e2e coverage
test: add portability and recovery coverage
docs: document release and deployment
```

实际 commit 根据真实工作拆分。

不要为了“提交多一点”制造无意义 commit。

---

# 一百零五、最终报告必须回答这些问题

完成 M11 后输出最终报告：

```text
1. 当前 Release Build 是否可独立运行？
2. Installer 最终采用什么？
3. 为什么选择它？
4. 安装目录在哪里？
5. User Data 在哪里？
6. Library 在哪里？
7. SQLite 在哪里？
8. Cache 在哪里？
9. Logs 在哪里？
10. Temp / Recovery 在哪里？
11. 是否支持 Portable？
12. 是否支持 File Association？
13. 是否支持 Single Instance？
14. 是否支持 Upgrade？
15. Downgrade 怎么处理？
16. Uninstall 是否保留 Library？
17. Library 是否可跨机器迁移？
18. 哪些 runtime dependencies？
19. 哪些 third-party licenses？
20. 是否具备 Signing Ready？
21. Fresh Machine 是否验证？
22. Upgrade 是否验证？
23. Reinstall 是否验证？
24. Doctor 是否验证？
25. Security 是否验证？
26. Performance 是否验证？
27. 仍有哪些 P0？
28. 仍有哪些 P1？
29. 哪些问题明确留给 M12？
30. M11 是否达到 READY？
```

---

# 一百零六、最终完成条件

当且仅当下面这句话成立，M11 才算完成：

> **“我可以把 Reverie 打包成一个正式 Windows Release，安装到另一台没有开发环境的电脑；它可以使用用户自己的 Library；升级和卸载不会破坏资料；Library 可以独立复制与恢复；SQLite、Cache、Config、Installer、Registry 都只是辅助基础设施；即使程序发生错误，用户仍然拥有明确的数据恢复路径。”**

M11 的目标不是让 Reverie 看起来像商业软件。

M11 的真正目标是：

> **让 Reverie 从一个项目，变成一个真正可以被安装和长期使用的软件。**

最终请严格执行：

```text
Explore
→ Plan
→ Implement
→ Test
→ Review
→ Document
```

每个 Batch 完成后更新状态，不要等 M11 全部结束才补文档。

执行期间：

```text
FACT > HYPOTHESIS > INFERENCE
Evidence > Opinion
Data Safety > Architecture Cleanliness
Release Reliability > Feature Count
```

任何涉及用户资料、升级、卸载、迁移、恢复的问题：

> **宁可停止某项产品化功能，也不要让用户数据承担风险。**