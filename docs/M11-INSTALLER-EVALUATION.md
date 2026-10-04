# M11 Installer 评估 — Windows 产品化

> 按 M11 §13 逐维度评估；结论以本仓库实际栈（Electron 44 + Node 24）为准。

## 候选对比

| 维度 | electron-builder (NSIS) | Portable 目录组装（自研脚本） | MSIX | WiX / Inno / NSIS 手写 |
|---|---|---|---|---|
| Windows 兼容 | 成熟（业界标准） | ✅（Electron 官方运行形态） | 成熟 | 成熟 |
| 本仓库接入成本 | 低（声明式 yml） | ✅ 最低（复用 STORE zip writer） | 高（需打包身份/签名） | 高（手写 XML/脚本） |
| 网络依赖 | **需联网拉 NSIS/winCodeSign 工具链** | ✅ 零网络 | 需签名工具 | 需下载工具链 |
| per-user 安装 | ✅ 默认 | —（免安装） | ✅ | ✅ 可配 |
| 升级覆盖安装 | ✅ | 覆盖解压 | ✅ | ✅ |
| 卸载保留用户库 | ✅（deleteAppDataOnDelete:false + NSIS 默认不碰自选目录） | ✅（无卸载器=无删除） | ✅ | ✅ 可配 |
| File association | ✅ fileAssociations 声明 | ❌（可手工"打开方式"） | ✅ | ✅ |
| 签名 | ✅ 配置位 | 可后续 signtool | 强制签名 | ✅ |
| SmartScreen | 未签名会有提示（如实记录 §47） | 同 | 需 Store 签名 | 同 |
| 本机实测（2026-10-05） | 工具链下载受当前网络阻塞 | **打包+启动验证通过** | 未尝试（超出自用需求） | 未尝试 |

## 决定

1. **M11 交付基线 = Portable 目录组装**（`scripts/package-release.mjs`）：零网络依赖、
   产物即"复制到另一台 Windows 机器可用"，直接满足核心验收（§56 库可移植 + §52
   Fresh Machine 代理验证）。
2. **NSIS（electron-builder）配置就绪**：`electron-builder.yml` 已写明 per-user 安装、
   允许更改目录、注册 `.epub` 关联、卸载不删用户数据；网络允许时
   `npx electron-builder --win` 生成 `Setup.exe`。
3. Portable 与 Installed 共享同一用户数据布局（REVERIE_HOME + 用户库），**不制造两种
   数据格式**（§55）。
4. 不选 MSIX：个人自用场景引入签名与商店通道成本，无对应收益（§4.1 产品化≠商业化）。

## 卸载/数据边界（§26/§27 硬约束）

- NSIS 卸载只删除安装目录与注册项；`REVERIE_HOME`（索引/日志/设置）与用户库
  **一律保留**。
- Portable 无卸载器——删除目录即卸载，用户库独立于应用目录。
