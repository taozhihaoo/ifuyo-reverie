/**
 * Doctor v2 (M10 §14-§23): data-health scan, diagnosis, and SAFE repair.
 *
 * Design constraints (M10 §95-§99):
 *   - filesystem-first: every check runs against FILES; indexes are only
 *     additional evidence. Doctor works with a missing or corrupt index.
 *   - repair is graded: `safe` (no user decision needed, reversible),
 *     `conditional` (needs explicit rules — offered as a separate repair),
 *     `manual`/`none` (reported, never faked as fixed).
 *   - safe repair: plan → backup → apply → re-scan → structured log
 *     (`<libraryRoot>/.recovery/repair-log.jsonl`). Idempotent: a healthy
 *     library produces zero findings and repair is a no-op.
 */
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { scanLibrary } from './scan.js';
import { loadSearchIndex, invalidateSearchIndex, refreshSearchIndex } from '../search/search-service.js';
import { rebuildIndex } from './index.js';
import { readAnnotationsFile } from '../annotation/store.js';
import { writeFileAtomic } from '../core/atomic-write.js';
import { parseAnnotationLine, serializeAnnotation } from '../annotation/annotation.js';
import { loadUserState, userStateUnsupportedVersion, USER_STATE_VERSION } from './user-state.js';
import { feedsUnsupportedVersion, FEEDS_VERSION } from '../feed/feed-store.js';
import { findTmpFilesRecursive, sweepTmpFilesRecursive, findStagingCandidates, recoverStaging, backupFiles, logRepair } from './recovery.js';

// ------------------------------------------------------------ report
export function reportToMarkdown(report) {
  const lines = [
    `# Reverie Doctor 报告`,
    ``,
    `- 时间：${report.generatedAt}`,
    `- 文档数：${report.summary.documents}`,
    `- 检查项：${report.summary.checks}`,
    `- 发现：${report.summary.findings}（error ${report.summary.bySeverity.error ?? 0} / warning ${report.summary.bySeverity.warning ?? 0} / info ${report.summary.bySeverity.info ?? 0} / critical ${report.summary.bySeverity.critical ?? 0}）`,
    `- 可安全修复：${report.summary.repairable}`,
    ``,
    `## 发现`,
    ``,
  ];
  if (report.findings.length === 0) lines.push('未发现问题。');
  for (const f of report.findings) {
    lines.push(`- [${f.severity.toUpperCase()}] ${f.checkId} — ${f.problem}${f.path ? `（${f.path}）` : ''} → ${f.suggestedAction}`);
  }
  return lines.join('\n');
}

function summarize(findings, documents, checks) {
  const bySeverity = { info: 0, warning: 0, error: 0, critical: 0 };
  let repairable = 0;
  for (const f of findings) {
    bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
    if (f.repairability === 'safe') repairable += 1;
  }
  return { documents, checks, findings: findings.length, bySeverity, repairable };
}

// ------------------------------------------------------------ scan
/**
 * Full health scan. Filesystem-first; the index is only cross-checked.
 * @returns {Promise<{ok:boolean, summary, findings, reportMd, generatedAt}>}
 */
export async function runDoctor(libraryRoot, { signal } = {}) {
  const findings = [];
  const add = (f) => findings.push({
    entityType: '', entityId: '', path: '', repairability: 'none', suggestedAction: '', ...f,
  });

  // 1. storage root
  try {
    await fsp.access(libraryRoot);
  } catch (err) {
    add({ checkId: 'storage_root', severity: 'critical', entityType: 'library', path: libraryRoot,
      problem: `库根目录不可访问: ${err.message}`, repairability: 'manual',
      suggestedAction: '检查磁盘/权限或重新选择 Library 目录' });
    return finish(findings, 0);
  }

  // 2-3. document scan + duplicate ids
  const { entries, errors } = await scanLibrary(libraryRoot);
  for (const err of errors) {
    add({ checkId: 'document_scan', severity: 'error', entityType: 'document', path: err.path,
      problem: `文档不可读: ${err.reason}`, repairability: 'manual',
      suggestedAction: '检查该目录的 meta.json/article.md 是否损坏；不要用默认值覆盖' });
  }
  const byId = new Map();
  for (const e of entries) {
    if (!byId.has(e.document_id)) byId.set(e.document_id, []);
    byId.get(e.document_id).push(e.dir);
  }
  for (const [documentId, dirs] of byId) {
    if (dirs.length > 1) {
      add({ checkId: 'duplicate_document_id', severity: 'error', entityType: 'document', entityId: documentId,
        path: dirs.join(', '), problem: '同一 document_id 出现在多个目录', repairability: 'manual',
        suggestedAction: '人工确认哪一份是正本；Doctor 不自动删除用户文件' });
    }
  }

  // 4-5. per-document annotations + empty content
  for (const e of entries) {
    const docDir = path.join(libraryRoot, e.dir);
    try {
      const { invalid, duplicates, annotations } = await readAnnotationsFile(path.join(docDir, 'annotations.jsonl'), { documentId: e.document_id });
      if (invalid.length > 0) {
        add({ checkId: 'annotation_corrupt', severity: 'warning', entityType: 'annotation', entityId: e.document_id,
          path: e.dir, problem: `${invalid.length} 行标注无法解析（首行: 第 ${invalid[0].line} 行 — ${invalid[0].reason}）`,
          repairability: 'conditional', suggestedAction: '备份后重写有效行并隔离坏行（保留全部有效标注）' });
      }
      if (duplicates.length > 0) {
        add({ checkId: 'annotation_duplicate_id', severity: 'warning', entityType: 'annotation', entityId: e.document_id,
          path: e.dir, problem: `${duplicates.length} 个重复 annotation_id（保留首次出现）`,
          repairability: 'conditional', suggestedAction: '备份后重写有效行' });
      }
      void annotations;
    } catch (err) {
      add({ checkId: 'annotation_read', severity: 'warning', entityType: 'annotation', entityId: e.document_id,
        path: e.dir, problem: `标注文件不可读: ${err.message}`, repairability: 'manual', suggestedAction: '检查文件权限' });
    }
    try {
      const md = await fsp.readFile(path.join(docDir, 'article.md'), 'utf8');
      if (md.trim().length === 0) {
        add({ checkId: 'content_empty', severity: 'warning', entityType: 'document', entityId: e.document_id,
          path: e.dir, problem: 'article.md 为空', repairability: 'manual', suggestedAction: '确认是否误删正文；不自动补写' });
      }
    } catch { /* no article.md for this type (book/pdf) — fine */ }
  }

  // 6. orphan temp files (crash leftovers)
  const tmpFiles = await findTmpFilesRecursive(libraryRoot, { signal });
  if (tmpFiles.length > 0) {
    add({ checkId: 'orphan_tmp', severity: 'info', entityType: 'filesystem', path: tmpFiles[0],
      problem: `${tmpFiles.length} 个崩溃残留临时文件`, repairability: 'safe',
      suggestedAction: '清扫临时文件（原子写保证原文件不受影响）' });
  }

  // 7. staging candidates
  const staging = await findStagingCandidates(libraryRoot, { signal });
  for (const c of staging) {
    add({ checkId: 'staging_recovery', severity: 'warning', entityType: 'document', entityId: c.documentId,
      path: c.dir,
      problem: c.valid ? '采集中断留下的完整文章（staging）' : `采集中断残留（${c.problems.join('；')}）`,
      repairability: 'safe',
      suggestedAction: c.valid ? '恢复到正式位置' : '移入隔离区（保留原文，附原因）' });
  }

  // 8. future-version user files (read-only protection active)
  await loadUserState().catch(() => {});
  const usVersion = userStateUnsupportedVersion();
  if (usVersion !== null) {
    add({ checkId: 'future_version', severity: 'error', entityType: 'user-state',
      entityId: 'user-state.json', path: 'user-state.json',
      problem: `用户状态文件格式版本 (${usVersion}) 高于当前支持 (${USER_STATE_VERSION})，已进入只读保护`,
      repairability: 'manual', suggestedAction: '升级 Reverie 到对应版本；不要用旧版本覆写该文件' });
  }
  const feedsVersion = await feedsUnsupportedVersion(libraryRoot).catch(() => null);
  if (feedsVersion !== null) {
    add({ checkId: 'future_version', severity: 'error', entityType: 'feeds',
      entityId: 'feeds.json', path: 'feeds.json',
      problem: `订阅文件格式版本 (${feedsVersion}) 高于当前支持 (${FEEDS_VERSION})，已进入只读保护`,
      repairability: 'manual', suggestedAction: '升级 Reverie 到对应版本；不要用旧版本覆写该文件' });
  }

  // 9. feed subscription sanity
  try {
    const feedsPath = path.join(libraryRoot, 'feeds.json');
    const raw = JSON.parse(await fsp.readFile(feedsPath, 'utf8'));
    const ids = new Set();
    const urls = new Set();
    for (const f of raw.feeds ?? []) {
      if (ids.has(f.feed_id)) add({ checkId: 'feed_duplicate_id', severity: 'error', entityType: 'feed', entityId: f.feed_id, path: 'feeds.json', problem: '重复 feed_id', repairability: 'manual', suggestedAction: '人工保留一份' });
      ids.add(f.feed_id);
      const cu = f.canonical_url ?? '';
      if (urls.has(cu)) add({ checkId: 'feed_duplicate_url', severity: 'warning', entityType: 'feed', entityId: f.feed_id, path: 'feeds.json', problem: `重复订阅: ${cu}`, repairability: 'manual', suggestedAction: '在界面中删除多余订阅' });
      urls.add(cu);
    }
  } catch { /* no feeds file — fine */ }

  // 10. index cross-consistency (index = additional evidence only)
  let index = null;
  try {
    index = await loadSearchIndex(libraryRoot);
  } catch (err) {
    add({ checkId: 'index_unreadable', severity: 'warning', entityType: 'index',
      problem: `搜索索引不可读（将自动重建）: ${err.message}`, repairability: 'safe',
      suggestedAction: '重建搜索索引' });
  }
  if (index) {
    const indexedIds = new Set(index.documents.map((d) => d.document_id));
    for (const d of index.documents) {
      if (d.path.includes('..') || path.isAbsolute(d.path)) {
        add({ checkId: 'index_bad_path', severity: 'error', entityType: 'index', entityId: d.document_id, path: d.path,
          problem: '索引中的路径逃逸', repairability: 'safe', suggestedAction: '重建索引' });
      } else if (!byId.has(d.document_id)) {
        add({ checkId: 'stale_index_entry', severity: 'warning', entityType: 'index', entityId: d.document_id, path: d.path,
          problem: '索引引用的文档在文件中不存在', repairability: 'safe', suggestedAction: '重建索引（文件缺失问题另行报告）' });
      }
    }
    for (const [documentId, dirs] of byId) {
      if (!indexedIds.has(documentId)) {
        add({ checkId: 'document_missing_from_index', severity: 'warning', entityType: 'document', entityId: documentId,
          path: dirs[0], problem: '文档未进入搜索索引', repairability: 'safe', suggestedAction: '重建索引' });
      }
    }
  }

  return finish(findings, entries.length);
}

function finish(findings, documents) {
  const summary = summarize(findings, documents, DOCTOR_CHECK_COUNT);
  const generatedAt = new Date().toISOString();
  const report = { generatedAt, summary, findings };
  return {
    ok: (summary.bySeverity.error ?? 0) === 0 && (summary.bySeverity.critical ?? 0) === 0,
    summary, findings, reportMd: reportToMarkdown(report), report,
  };
}

export const DOCTOR_CHECK_COUNT = 11;

// ------------------------------------------------------------ safe repair
/**
 * Execute the `safe` repairs for the current findings. `dryRun` returns the
 * plan without touching anything (M10 §65). Every applied action is backed up
 * (where applicable), logged, and followed by a re-scan.
 */
export async function repairSafe(libraryRoot, { dryRun = false, signal } = {}) {
  const before = await runDoctor(libraryRoot, { signal });
  const actions = [];
  for (const f of before.findings) {
    if (f.repairability !== 'safe') continue;
    if (f.checkId === 'orphan_tmp') actions.push({ action: 'sweep_tmp', target: '全库临时文件', filesAffected: (await findTmpFilesRecursive(libraryRoot, { signal })).length, risk: '无——原子写保证 tmp 只是残留' });
    if (f.checkId === 'staging_recovery') actions.push({ action: 'recover_staging', target: f.path, filesAffected: 1, risk: '无效 staging 移入 .recovery 隔离区（可还原）' });
    if (f.checkId === 'index_unreadable' || f.checkId === 'index_bad_path' || f.checkId === 'stale_index_entry'
      || f.checkId === 'document_missing_from_index') {
      if (!actions.some((a) => a.action === 'rebuild_index')) {
        actions.push({ action: 'rebuild_index', target: 'library index + search index', filesAffected: 0, risk: '无——派生数据，可随时重建' });
      }
    }
  }

  if (dryRun) {
    return { dryRun: true, actions, userSourceFilesModified: 0 };
  }

  // execution order follows M10 §99: source-adjacent recovery first, derived
  // index rebuild LAST (so promoted documents get indexed in the same pass)
  const ordered = actions.sort((a, b) => {
    const rank = { sweep_tmp: 0, recover_staging: 1, rebuild_index: 2 };
    return (rank[a.action] ?? 9) - (rank[b.action] ?? 9);
  });

  const executed = [];
  for (const action of ordered) {
    if (signal?.aborted) break;
    if (action.action === 'sweep_tmp') {
      const removed = await sweepTmpFilesRecursive(libraryRoot, { signal });
      executed.push({ action: 'sweep_tmp', removed: removed.length });
      await logRepair(libraryRoot, { check_id: 'orphan_tmp', action: 'sweep_tmp', before: `${action.filesAffected} files`, after: `${removed.length} removed`, result: 'success' });
    } else if (action.action === 'recover_staging') {
      const result = await recoverStaging(libraryRoot, { signal });
      executed.push({ action: 'recover_staging', promoted: result.promoted.length, quarantined: result.quarantined.length });
    } else if (action.action === 'rebuild_index') {
      invalidateSearchIndex();
      await rebuildIndex(libraryRoot).catch((err) => logRepair(libraryRoot, { check_id: 'rebuild_index', action: 'rebuild_index', result: 'failed', error: err.message }));
      await refreshSearchIndex(libraryRoot).catch(() => {});
      executed.push({ action: 'rebuild_index' });
      await logRepair(libraryRoot, { check_id: 'index', action: 'rebuild_index', before: 'inconsistent index', after: 'rebuilt', result: 'success' });
    }
  }

  const after = await runDoctor(libraryRoot, { signal }); // post-validation (M10 §20)
  const stillRepairable = after.summary.repairable;
  return {
    dryRun: false,
    executed,
    beforeSummary: before.summary,
    afterSummary: after.summary,
    remainingFindings: after.findings.filter((f) => f.repairability === 'safe').length,
    stillRepairable,
  };
}

/** Conditional repair IPC surface: annotation record-level recovery (M10 §80). */
export async function repairDoctorFinding(libraryRoot, { checkId, docDir, dryRun = false, signal } = {}) {
  if (checkId !== 'annotation_corrupt') {
    throw new Error(`此发现类型不支持自动修复: ${checkId}`);
  }
  return repairAnnotationsFile(libraryRoot, docDir, { dryRun, signal });
}

/** Conditional repair (M10 §80/§81): rewrite an annotations.jsonl keeping every
 * valid line and moving bad/duplicate lines into the quarantine area. Backs up
 * the original first; refuses when there is nothing to fix. */
export async function repairAnnotationsFile(libraryRoot, docDir, { dryRun = false, signal } = {}) {
  const throwIfCancelled = () => { if (signal?.aborted) throw new Error('cancelled'); };
  const filePath = path.join(libraryRoot, docDir, 'annotations.jsonl');
  const { invalid, duplicates } = await readAnnotationsFile(filePath, { documentId: null });
  if (invalid.length === 0 && duplicates.length === 0) {
    return { dryRun, changed: false };
  }
  throwIfCancelled();
  const rawLines = (await fsp.readFile(filePath, 'utf8')).split('\n');
  const keptLines = [];
  const seenIds = new Set();
  const quarantined = [];
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i].trim();
    if (line === '') continue;
    let ok = false;
    try {
      const a = parseAnnotationLine(line);
      if (!seenIds.has(a.annotation_id)) {
        seenIds.add(a.annotation_id);
        keptLines.push(serializeAnnotation(a)); // full object: unknown fields survive
        ok = true;
      }
    } catch { /* invalid → quarantine below */ }
    if (!ok) quarantined.push({ line: i + 1, raw: line });
  }

  const plan = {
    action: 'rewrite_annotations', target: filePath,
    kept: keptLines.length, quarantined: quarantined.length,
    backup: true, risk: '原文件备份到 .recovery/；坏行移入隔离区保留原文，可人工还原',
  };
  if (dryRun) return { dryRun: true, changed: true, ...plan };

  const backupDir = await backupFiles(libraryRoot, [filePath]);
  const qDir = path.join(libraryRoot, '.recovery', `quarantine-${Date.now()}-${path.basename(docDir)}`);
  await fsp.mkdir(qDir, { recursive: true });
  for (const q of quarantined) {
    await fsp.writeFile(path.join(qDir, `line-${q.line}.json`), JSON.stringify(q, null, 2));
  }
  await writeFileAtomic(filePath, keptLines.length > 0 ? keptLines.join('\n') + '\n' : '');
  // annotation projections live in the search index — keep derived state in
  // step with the repaired file (M10 §99: revalidate everything)
  invalidateSearchIndex();
  await refreshSearchIndex(libraryRoot).catch(() => {});
  await logRepair(libraryRoot, {
    check_id: 'annotation_corrupt', action: 'rewrite_annotations', target: filePath,
    before: `${rawLines.filter((l) => l.trim()).length} lines`,
    after: `${keptLines.length} valid lines`, backup: backupDir, quarantine: qDir, result: 'success',
  });
  return { dryRun: false, changed: true, kept: keptLines.length, quarantined: quarantined.length, backupDir, quarantineDir: qDir };
}
