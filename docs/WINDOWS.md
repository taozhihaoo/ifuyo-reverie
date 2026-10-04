# WINDOWS — 安装、路径与产品边界（M11）

> Reverie 在 Windows 上的产品形态、目录布局与硬边界。详细报告见 docs/M11-STATUS.md。

## 形态

| 形态 | 产物 | 说明 |
|---|---|---|
| **Portable（基线）** | `npm run package:portable` → `artifacts/Reverie-<ver>-portable-win-x64/` + `.zip` + `checksums.txt` + `release-manifest.json` | 复制到任意 Windows x64 机器运行；无需安装器 |
| **Installed（配置就绪）** | `npx electron-builder --win` → `Reverie-<ver>-Setup.exe` | per-user 安装、可改目录、开始菜单/桌面快捷方式、注册 .epub/.pdf 关联 |

## 目录布局（应用与用户资料彻底分离）

```
<portable 目录 或 安装目录>      ← 应用本体（可删可重装，不含任何用户资料）
%LOCALAPPDATA%\Reverie\         ← REVERIE_HOME：应用运行时
    index.json                  ←    库索引（派生，可重建）
    search-index.json           ←    搜索索引（派生，可重建）
    app-settings.json           ←    应用设置（库位置/窗口状态）
    logs\                       ←    有界日志（保留 3 份）
    queue\ daily-review.json    ←    派生任务/回顾状态
用户选择的库目录（默认 %LOCALAPPDATA%\Reverie\library）
    articles\ books\ pdf\       ←    用户资料（真相）
    user-state.json feeds.json  ←    用户状态与订阅（真相）
    .recovery\                  ←    修复日志/备份/隔离区
```

**硬边界**：安装/升级/卸载永远不创建、移动、删除用户库；卸载只删应用本体与安装
登记；"重置应用设置"只影响 app-settings.json，与库无关。

## 启动参数与集成

```
Reverie.exe                        正常启动
Reverie.exe <file.epub|.pdf>       入库并打开（单实例时转发给已运行实例）
Reverie.exe --safe-mode            跳过窗口状态恢复与队列处理的最小启动
```

- 单实例：第二个进程把参数转发给第一个实例后退出（不死锁、不阻塞）。
- NSIS 版注册 .epub/.pdf 关联（仅 OS 集成；删除注册表不影响库）。

## 运行依赖

仅 Electron 运行时（内置 Chromium/Node）+ Windows 内置 SAPI 语音（TTS 用，缺失时
TTS 入口隐藏并提示）。无 WebView2/VC++/原生 DLL。详见 docs/M11-DEPENDENCIES.md。

## 备份

用户的全部资料 = **库目录**。备份 = 复制该文件夹（文件资源管理器/zip/移动硬盘均可）；
恢复 = 指向恢复后的目录 → Doctor 体检 → 重建索引。应用本体随时可以重新下载。
