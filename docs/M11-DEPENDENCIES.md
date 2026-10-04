# M11 Dependencies — 第三方依赖清单（发布视角）

> 运行时打包范围 = `app/` + `pdfjs-dist` + Electron 运行时。其余全部为开发期依赖。
> 许可证以 node_modules 内实际 LICENSE 文件为准（已随 vendor 打包 pdf.js 全套许可）。

## 运行时（随发布分发）

| 依赖 | 版本 | 用途 | 许可 | 分发要求 |
|---|---|---|---|---|
| Electron | 44.5.1 | 应用运行时（Chromium+Node 内置） | MIT | 随 portable/安装包分发 electron/dist |
| pdfjs-dist | 6.4.299 | PDF 解析/渲染（主进程 legacy build + app/vendor 渲染资产） | Apache-2.0 | 连同 LICENSE 分发（app/vendor/pdfjs/LICENSE.pdfjs 已含） |
| pdf.js cmaps / standard_fonts / wasm | 同上 | CJK 映射/标准字体/JBIG2·JPXX 解码 | Apache-2.0 / 各自 LICENSE 文件（已随 vendor 打包） | 同上 |
| Windows SAPI 语音 | 系统组件 | TTS（M8） | 系统自带 | 不分发，运行时检测 |

## 开发期（不随发布分发）

| 依赖 | 用途 |
|---|---|
| @mozilla/readability、dompurify、jsdom | 采集/净化/解析（M1） |
| foliate-js | M0/M6 spike（M6 起渲染为自研章节流） |
| pdf-lib、@pdf-lib/fontkit | PDF fixture 生成（M7/M9） |
| @napi-rs/canvas | M0 Node 渲染 spike |
| electron | 运行时提供者（dist 随 portable 分发，本身不分发 npm 包） |

## 无原生 DLL / 无 WebView2 / 无 VC++ Redistributable / 无外部 executable 依赖

**FACT**：全栈纯 JS + Electron 内置运行时；TTS 走系统 SAPI。因此"运行时依赖检测"
（M11 §15）收敛为：Electron 能启动 = 依赖满足；SAPI 语音缺失时 TTS 面板隐藏并提示
（M8 已实现）。
