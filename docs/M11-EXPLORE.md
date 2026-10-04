# M11 Explore — Windows Productization（Phase A 产物）

> FACT 来自当前仓库与真实运行环境实测；HYPOTHESIS/INFERENCE 显式标注。（2026-10-05）
> 注：任务书模板假设 Godot/.NET 栈；**实际项目 = Electron 44 (Chromium) + Node 24**，
> 一切以实际代码为准（任务书 §五）。

## 1. 运行时与构建链（FACT）

- Electron 44.5.1（Chromium 内置 → 无 WebView2/VC++/DirectX 独立依赖）；Node 24.19。
- 产品代码 = `app/`（main/preload/renderer + vendor/pdfjs 运行时资产）+ 生产依赖
  `pdfjs-dist`（主进程 legacy build）。`foliate-js`/`pdf-lib`/`@pdf-lib/fontkit`/
  `@napi-rs/canvas`/`electron-builder(未装)` 均仅开发期使用。
- **现状**：只有开发模式 `electron .`；无打包、无安装器、无 Release 产物。
- TTS = Windows SAPI（系统组件，随 OS）；PDF/EPUB 解析 = 纯 JS；字体 = 系统。

## 2. 路径现状（§8/§9 审计）

**FACT**：`src/core/paths.js` 已实现应用数据与用户库分离——
- `REVERIE_HOME`（默认 `%LOCALAPPDATA%/Reverie`）= 应用运行时（index.json、queue、
  logs、settings、recovery 均归属于此或库内 `.recovery/`）；
- `REVERIE_LIBRARY`（默认 `<home>/library`）= 用户库（env 可指到任意盘/路径）。
- **Gap**：库路径只能用环境变量指定——无持久化设置、无 UI 选择器（§10/§11 缺失）；
- 无窗口状态持久化（§30）；无单实例（§20）；无 open-file/参数处理（§19）。

## 3. 缺失清单（M11 范围内逐项）

1. Release 打包管线（portable 目录组装——离线可完成；NSIS 安装器需联网拉
   electron-builder 二进制，网络受限时记录）。
2. 应用设置存储（libraryPath/window 状态）+ 首启库选择 + 「更改库位置/打开库文件夹」。
3. 单实例 + 第二实例参数转发 + `--open <file>`（.epub/.pdf 关联的最小可用面）。
4. 主进程日志（分级、有界、隐私安全 §34）+ 崩溃钩子（uncaughtException/rejection）。
5. 构建元数据（version/commit/date）+ checksums + release manifest。
6. About/版本信息入口（Doctor 面板已有一致信息位，补应用版本）。

## 4. Installer 评估（§13，详见 docs/M11-INSTALLER-EVALUATION.md）

| 候选 | 结论 |
|---|---|
| electron-builder (NSIS) | 生态标准、支持 per-user、file association、升级；**需联网拉取 NSIS/winCodeSign 工具链** |
| MSIX | 需签名/Store 通道，个人自用过重 |
| WiX/Inno/NSIS 手写 | 学习+维护成本高，收益低 |
| **Portable 目录组装（本仓库脚本，STORE zip）** | **零网络依赖、立即可行**，作为 M11 交付基线；NSIS 作为后续增强 |

**决定**：M11 交付 = 可重复的 portable 打包脚本 + checksums + manifest（保证"能交给
另一个 Windows 用户"）；electron-builder NSIS 配置就绪（`electron-builder.yml`），
网络允许时生成 Setup.exe；未签名如实记录（§45 不伪造）。

## 5. 现有可复用面

- M10 Recovery/Doctor/启动容错（索引缺失自动重建、配置损坏回退默认）= §10 Bootstrap
  的大部分已成立；M10 smoke 已验证"库移动/复制后一切可用"（§73/§74）。
- 原子写、路径安全门、SSF 防线（M1/M4）——安装器/打包不引入新写路径。

## 6. 风险清单

- electron-builder 二进制下载受网络阻塞（当前网络间歇故障）→ Portable 为基线交付。
- 打包后 pdf.worker 从 asar 加载的不确定性 → 采用**不打包 asar 的目录形态**
  （resources/app 明文目录），规避 ESM worker/asar 组合风险（记录理由）。
- 首启库选择不能破坏既有 env 语义（测试依赖 env 优先级）→ 设置仅在没有 env 时生效。
