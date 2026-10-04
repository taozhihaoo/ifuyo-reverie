# ifuyo Reverie

**Windows 优先、本地优先、文件原生的个人阅读档案系统。**

> Your library is a folder, not an account.

Reverie 把网页、RSS、EPUB、PDF、划线与笔记保存为属于用户自己的、可迁移、
可长期维护的阅读档案。核心闭环：

```text
发现 → 保存 → 阅读 → 划线 → 记录 → 书签 → 归档 → 搜索 → 再次阅读 → 听读
```

## 当前状态：Reverie 1.0

M0–M12 全部完成。**1.0 能力**：

- **阅读**：Web 文章（正文提取+净化）、RSS/Atom 订阅、EPUB 2/3、PDF——统一
  Reader Shell，进度跨会话恢复
- **标注**：划线高亮、笔记、位置书签；定位失败转为 Orphaned，绝不静默删除
- **搜索**：标题/作者/正文/标注/标签/URL，`tag:` `is:` `in:` `author:` 过滤语法
- **TTS 有声阅读**：Windows 本地语音、语速、语音选择、句子级定位跟随
- **导入/导出**：Pocket / Wallabag / Raindrop 导入（幂等）；Markdown / EPUB 3 /
  Metadata / Highlights 导出；每日回顾
- **数据安全**：文件即真相（JSON/Markdown/JSONL/原始文件）；索引可重建；
  原子写入；Doctor 体检与分级修复；未来格式只读保护；整库可复制迁移
- **Windows 产品化**：Portable / NSIS 安装包、单实例、文件参数打开、有界日志

## 快速开始

```bash
npm install          # Node >= 22
npm run app          # 开发模式启动
```

发布构建（Windows）：

```bash
npm run package:portable
# → artifacts/Reverie-1.0.0-portable-win-x64/（Reverie.exe）+ .zip + checksums
```

把 `Reverie-1.0.0-portable-win-x64/` 复制到任意 Windows x64 机器运行即可；
用户资料保存在自选的库目录（默认 `%LOCALAPPDATA%\Reverie\library`），
与应用目录完全分离——复制库文件夹即完成备份与迁移。

## 验证

```bash
npm test               # 309 项测试
npm run doctor         # 库健康体检（--repair 执行安全修复）
npm run smoke:pdf      # 真机冒烟：PDF 全链路
npm run smoke:tts      # 真机冒烟：TTS 旅程
npm run smoke:epub     # 真机冒烟：EPUB 导出
npm run smoke:doctor   # 真机冒烟：损坏注入→修复
npm run smoke:release  # 真机冒烟：打包产物
npm run smoke:journey  # 真机冒烟：完整用户旅程
```

## 文档

| 文档 | 内容 |
| --- | --- |
| [docs/WINDOWS.md](docs/WINDOWS.md) | 安装/路径/集成/备份（用户指南） |
| [docs/RECOVERY-AND-DOCTOR.md](docs/RECOVERY-AND-DOCTOR.md) | 恢复语义与 Doctor |
| [docs/EPUB-EXPORT.md](docs/EPUB-EXPORT.md) / [docs/TTS.md](docs/TTS.md) / [docs/PDF.md](docs/PDF.md) | 能力说明 |
| [docs/M12-STATUS.md](docs/M12-STATUS.md) / [docs/M12-FINAL-AUDIT.md](docs/M12-FINAL-AUDIT.md) | 1.0 最终审计（Gate A–J） |
| [docs/POST-1.0.md](docs/POST-1.0.md) | 已知问题与未来路线 |
| [docs/FINAL-ARCHITECTURE.md](docs/FINAL-ARCHITECTURE.md) | 最终架构总览 |
| [docs/DECISIONS.md](docs/DECISIONS.md) / [docs/PROGRESS.md](docs/PROGRESS.md) | 决定记录 / 里程碑 |
| [docs/FORMAT.md](docs/FORMAT.md) | Library 文件格式规范（Source of Truth） |
| [THIRD_PARTY.md](THIRD_PARTY.md) | 第三方依赖与许可证审计 |

其余阶段文档（M0–M11 STATUS 及子系统手册）见 [docs/](docs/)。

## 原则

- **文件是真相**：索引/缓存/设置只是派生数据，可随时重建。
- **数据属于用户**：开放格式（JSON / Markdown / JSONL / 原始文件），可备份、可迁移、
  可脱离 Reverie 使用；卸载或升级永不触碰用户库。
- **本地优先**：网络只用于保存网页与获取 RSS，不制造云依赖；无账号、无遥测。
- **阅读优先**：一切设计服从长时间阅读的舒适性、稳定性、可恢复性。
