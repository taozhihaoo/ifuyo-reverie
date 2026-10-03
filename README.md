# ifuyo Reverie

**Windows 优先、本地优先、文件原生的个人阅读档案系统。**

> Your library is a folder, not an account.

Reverie 把网页、RSS、EPUB、PDF、Markdown、划线与笔记保存为属于用户自己的、
可迁移、可长期维护的阅读档案。核心闭环：

```text
发现 → 保存 → 阅读 → 划线 → 记录 → 归档 → 搜索 → 再次阅读
```

## 当前状态

项目处于 **M0 — Foundation & Risk Spikes**（基础设施与风险验证）阶段。

M0 不做产品功能，只回答一个问题：
在正式开发之前，把最容易导致返工的技术风险验证清楚
（正文提取 / Annotation 定位 / EPUB 引擎 / PDF 路线 / 文件原生数据 / Native Messaging / 安全基线）。

阶段文档见 [docs/](docs/)：

| 文档 | 内容 |
| --- | --- |
| [docs/M2-STATUS.md](docs/M2-STATUS.md) | M2 完成报告（Annotation Core） |
| [docs/ANNOTATIONS.md](docs/ANNOTATIONS.md) | 标注模型、生命周期与 Reader 集成 |
| [docs/ANNOTATION-FORMAT.md](docs/ANNOTATION-FORMAT.md) | annotations.jsonl 格式规范 |
| [docs/ANNOTATION-RESOLUTION.md](docs/ANNOTATION-RESOLUTION.md) | 锚点定位与恢复策略 |
| [docs/M1-STATUS.md](docs/M1-STATUS.md) | M1 完成报告（Web Capture：已实现/已验证/限制/风险/推迟） |
| [docs/CAPTURE.md](docs/CAPTURE.md) | 采集子系统手册：协议、队列、管线、重复判定、验收清单 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 模块边界与依赖方向 |
| [docs/TESTING.md](docs/TESTING.md) | 测试地图与基建模式 |
| [docs/M0-STATUS.md](docs/M0-STATUS.md) | M0 报告（现状、架构边界、Spike 结论） |
| [docs/M0-RISKS.md](docs/M0-RISKS.md) | 风险清单（R1–R9）与验证状态 |
| [docs/FORMAT.md](docs/FORMAT.md) | Library 文件格式规范（Source of Truth） |
| [docs/SECURITY.md](docs/SECURITY.md) | 安全基线与威胁模型 |
| [THIRD_PARTY.md](THIRD_PARTY.md) | 第三方依赖与许可证审计 |

## 开发

```bash
npm install        # 安装依赖（Node >= 22）
npm test           # 运行全部测试（node:test）
npm run spike:extraction   # 正文提取 Spike 评估
npm run spike:pdf          # PDF.js Spike（Node 侧）
npm run fixtures:pdf       # 重新生成 PDF 测试文件
npm run fixtures:epub      # 重新生成 EPUB 测试文件
```

## 原则

- **文件是真相**：SQLite / 索引 / 缓存只是派生数据，可随时重建。
- **数据属于用户**：开放格式（JSON / Markdown / JSONL / 原始文件），可备份、可迁移、可脱离 Reverie 使用。
- **本地优先**：网络只用于保存网页与获取 RSS，不制造云依赖。
- **阅读优先**：一切设计服从长时间阅读的舒适性、稳定性、可恢复性。
