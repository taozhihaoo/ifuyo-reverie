# M11 Implementation Plan — Windows Productization

> Electron 栈适配版。基线交付 = 离线可重复的 Portable 打包；NSIS 安装器配置就绪、
> 网络允许时生成。

## Batch 1 — Explore（docs/M11-EXPLORE.md + INSTALLER-EVALUATION + DEPENDENCIES）✅

## Batch 2 — 应用设置与运行时边界（src/core/app-settings.js + main.js bootstrap）

- `app-settings.json`（REVERIE_HOME 下，原子写）：`{settings_version, libraryPath,
  window:{x,y,width,height,maximized}}`；损坏 → 回退默认（§53）；**env 永远优先**（测试
  兼容）；未来版本字段透传保留。
- main.js bootstrap：加载设置 → `settings.libraryPath` 注入 `process.env.REVERIE_LIBRARY`
  （无 env 时）→ 一切下游逻辑不变。
- IPC：`settings:get / settings:set-library {path} / settings:relaunch`；set-library 校验
  （创建/复用已有 Reverie 库识别）+ 保存 + 提示重启生效（app.relaunch）。
- UI：侧栏底部「库位置」区（当前路径 + 更改… + 打开库文件夹）。
- 窗口状态：bounds+maximized 存 settings，启动恢复；越界/不存在屏幕 → 回退默认尺寸（§30）。

## Batch 3 — 单实例 / 文件打开 / 日志 / 崩溃钩子

- `app.requestSingleInstanceLock`；second-instance → 聚焦 + 处理 argv 文件。
- `open-file` 事件 + argv 解析：`.epub/.pdf` → 入库（复用 addEpubBook/addPdfBook）→ 打开；
  其余扩展名 → 提示不支持。
- `src/core/app-log.js`：REVERIE_HOME/logs/reverie-YYYYMMDD.log（info/warn/error，>1MB 轮转
  保留 3 份，只记 id/操作/错误码，不记正文 §34）；uncaughtException/unhandledRejection →
  记日志 + error dialog（§35），不吞错。

## Batch 4 — Release 打包（scripts/package-release.mjs + electron-builder.yml）

- **Portable（基线，零网络）**：组装 `artifacts/Reverie-<ver>-portable-win-x64/` =
  `node_modules/electron/dist/**` + `resources/app/`（package.json + app/** +
  node_modules/pdfjs-dist）+ `build-info.json`；STORE zip 打包 + SHA-256 + 
  `release-manifest.json`（§48-50）。
- **NSIS（网络允许时）**：`electron-builder.yml`（per-user、允许改目录、
  fileAssociations [.epub]、deleteAppDataOnDelete: false、artifact 命名）→
  `Reverie-<ver>-Setup.exe`；失败如实记录。
- `--safe-mode` 参数（§70 最小面：跳过窗口状态恢复 + 队列处理）。
- 版本/构建信息：`app/build-info.json`（package 时生成，gitignore）+ Doctor 面板显示。

## Batch 5 — 稳定性验证

- **打包产物真机 smoke**（scripts/smoke-release.mjs）：直接启动打包出的 exe（CDP）→
  库 bootstrap → Doctor 面板版本/路径 → 打开文章 → 导出 EPUB 存在。脱离源码树运行 =
  Fresh Machine 代理验证（§52）。
- 既有 smoke 全家（pdf/tts/epub/doctor）继续通过（回归）。
- 单实例/文件打开/窗口状态：单元 + 手工清单记录（windows.md）。

## 文档（§95 合并原则）

`M11-STATUS.md`、`docs/WINDOWS.md`（安装/路径/单实例/参数/依赖/可移植性/签名边界合并）、
`docs/M11-INSTALLER-EVALUATION.md`、`docs/M11-DEPENDENCIES.md`、`SIGNING.md`、
PROGRESS/DECISIONS 同步。

## 明确不做

自动更新服务、开机启动、Store/MSIX 签名发布、云备份、onboarding campaign、大重构。
