# EXPORT — 导出（M5）

> 实现：`src/importexport/export/`（markdown/metadata/epub exporters）。
> 总纲：**Export ≠ Modify**——只读 Library 文件 → Export Model → 写新文件；绝不改写原始资料（M5 §37）。
> 数据源是 Library 文件（article.md/meta.json/annotations.jsonl）而非派生索引——删索引后导出照常可用（M5 §27）。

## 1. 支持格式

| 格式 | 内容 | 用途 |
| --- | --- | --- |
| Markdown | YAML front matter（title/author/source_url/document_id/时间）+ 正文 + Annotations 段（引用块+笔记） | 通用迁移：VS Code/Obsidian/任意编辑器可读 |
| EPUB 3 | mimetype(STORE 首 entry)+container.xml+OPF+nav.xhtml+分章 XHTML+CSS | 电子书阅读器/归档 |
| Metadata | JSON（全保真）+ CSV（表格，无正文/HTML） | 机器处理/统计 |
| Highlights | JSON（全保真含 locator/status）+ Markdown（人类阅读档案） | 阅读笔记档案 |

## 2. Export Scope（M5 §28）

当前支持：当前文章（Reader 内导出 MD/EPUB）；全部文章的 Metadata/Highlights 批量导出。
Search/Filter 结果集导出复用同一 `export:documents` IPC（传入 id 列表即可）。

## 3. EPUB 结构（M5 §34/§40）

```
mimetype                     STORE、首 entry、application/epub+zip
META-INF/container.xml
OEBPS/content.opf            EPUB 3 包（dc:identifier/title/language/creator/date/source）
OEBPS/nav.xhtml              EPUB 3 导航（properties="nav"）
OEBPS/chapN.xhtml            按一级标题分章的 XHTML
OEBPS/style.css
```

校验（M5 §40）：ZIP magic、mimetype 首 entry 且 STORE、container/OPF/nav 存在、
非空。基础级验证已自动化（export.test.js）；兼容阅读器实测为 HYPOTHESIS（未在本环境执行）。

## 4. 失败处理（M5 §37/§39/§92）

- 每篇导出失败仅记录 `{document_id, error}`，不中断批量、不破坏 Library。
- 空文章拒绝导出 EPUB（明确报错，不出 broken 文件）。
- Library 原始文件在导出全流程中**零写入**（测试断言 read-only）。

## 5. Large Library（M3 §69/§136-137）

Metadata/Highlights 导出流式拼装后一次写入；单文档导出逐篇处理。
10,000+ 篇的流式导出为 Deferred（当前规模实测见 PERF.md）。
