# M11 Status — Windows Productization

> M11 完成报告。测试证据：`npm test` **309/309 全绿**（无回归）+
> `npm run package:portable && node scripts/smoke-release.mjs`——**打包产物真机 8/8**
> （脱离源码树/开发依赖直接运行，Fresh Machine 代理验证 §52）。

## 1. 最终报告（§105 逐问）

1. **Release Build 可独立运行？** ✅——portable 目录复制到任意 Windows x64 机器即运行
   （smoke 在打包产物内完成库/搜索/Doctor/导出全链路）。
2. **Installer 采用什么？** 基线 = Portable 目录组装（`npm run package:portable`）；
   NSIS（electron-builder）配置就绪（`electron-builder.yml`，per-user、可改目录、
   注册 .epub/.pdf 关联、卸载不删数据），网络允许时 `npx electron-builder --win` 生成
   Setup.exe。
3. **为什么？** 见 docs/M11-INSTALLER-EVALUATION.md——electron-builder 需联网拉工具链
   （当前网络受限），portable 零网络且直接满足核心验收；两者共享同一数据布局。
4-5. **安装目录 / 用户数据**：应用 = portable 目录（或 NSIS 默认
   `%LOCALAPPDATA%\Programs\Reverie`）；**用户数据 = REVERIE_HOME**
   （默认 `%LOCALAPPDATA%\Reverie`：索引/日志/设置/.recovery）。
6. **Library**：用户可选任意绝对路径（M11 起 UI「更改库位置」+ 持久化 +
   重启生效；env 优先级最高——测试兼容）；默认 `<home>/library`。
7. **SQLite（此处为 JSON 索引）**：REVERIE_HOME（库索引）/ REVERIE_SEARCH_INDEX
   （搜索索引）——全部派生、可重建（M10 已验证）。
8. **Cache/Logs/Temp/Recovery**：REVERIE_HOME/logs（轮转保留 3 份）、文档目录
   `.tmp-*`（清扫）、`.recovery/`（修复日志/备份/隔离区）。
9. **Portable** ✅；10. **File Association**：NSIS 注册 .epub/.pdf（配置就绪）+
   `--open <file>`/单实例转发已实现；11. **Single Instance** ✅（second-instance →
   聚焦 + 文件转发）；12. **Upgrade** ✅（覆盖安装 + 启动时设置/索引校验，数据迁移
   由数据层 M10 版本守卫承担——安装器不碰库）；13. **Downgrade**：不宣称支持；
   未来版本文件只读保护（M10，测试锁定）。
14. **Uninstall 保留 Library** ✅（NSIS deleteAppDataOnDelete:false + 库在用户自选
   目录；Portable 无卸载器）。
15. **跨机器迁移** ✅（整库复制 → 重建索引 → 全部可用，M10/M11 测试锁定）。
16. **Runtime dependencies**：仅 Electron 运行时（内置 Chromium/Node）+ Windows SAPI
   （系统）；无原生 DLL/WebView2/VC++（docs/M11-DEPENDENCIES.md）。
17. **Licenses**：MIT（Electron）+ Apache-2.0（pdf.js 全家，LICENSE 已随 vendor
   打包）——清单见 M11-DEPENDENCIES.md。
18. **Signing Ready** ✅（SIGNING.md：未来签名点/工具/环境变量注入；无证书=如实
   unsigned，不伪造）。
19-24. **Fresh Machine / Upgrade / Reinstall / Doctor**：打包产物 smoke 覆盖
   （启动/库/Doctor/搜索/导出/重启持久化/日志）；升级中断恢复由 M10 语义承担
   （安装器失败 ≠ 库失败）。
25. **Security**：安装器不引入新写路径；单实例转发仅处理 .epub/.pdf 且入库走既有
   安全校验；日志无正文/凭据（§34）。
26. **Performance**：打包产物启动→列表可用秒级（smoke 25s 预算内含首次索引）；
   Debug/Release 无行为差异（同一 JS 产物）。
27. **P0**：无。
28. **P1**：无。
29. **留给 M12**：UI polish/主题、onboarding 优化、自动更新评估、长跑观测。
30. **READY**（无 P0/P1；未签名与 NSIS 网络限制如实记录为已知事项）。

## 2. 交付物

- `npm run package:portable` → `artifacts/Reverie-<ver>-portable-win-x64/` +
  `.zip`（185MB，DEFLATE）+ `checksums.txt`（SHA-256）+ `release-manifest.json`。
- `electron-builder.yml`（NSIS/zip 目标、file associations、卸载保数据）。
- 应用设置/库位置 UI、单实例、`--open <file>`、`--safe-mode`、有界日志、崩溃钩子。

## 3. 结构与边界（§98/§102 不变量）

应用目录（portable/安装目录）**不拥有**用户库——`Reverie ──uses──> 用户自选 Library`。
全部 §102 不变量成立：卸载≠删库、安装位置≠库位置、索引丢失≠资料丢失、升级失败≠
库损坏、缓存清理≠删数据、Portable≠机器锁定、Registry 丢失≠库丢失（Registry 仅
NSIS 卸载登记）、打包≠开发环境依赖（smoke 证明）。

## 4. Known Issues / M12 边界

- 未签名（SmartScreen 首次运行提示，SIGNING.md 如实记录格式）。
- NSIS Setup.exe 生成依赖网络拉取工具链（配置就绪，本次网络受限未生成——portable
  已满足交付）。
- 窗口状态多显示器场景做了可见性校验，未在真实双屏环境人工回归（记录）。
- MSIX/Store/自动更新/开机启动：明确不做（§4.1/§37/§72）。
