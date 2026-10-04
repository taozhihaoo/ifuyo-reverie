/**
 * Web → EPUB (M9 §15/§B): one-shot conversion that REUSES the entire M1
 * capture pipeline (fetch → Readability → sanitize → assets → markdown →
 * atomic promote) and then runs the M9 export engine on the captured
 * document. No second HTTP/parse/sanitize stack lives here.
 *
 * Offline-first (M9 §89/§90): exporting an ALREADY-SAVED article never
 * touches the network — use exportDocumentsToEpub directly; this flow is
 * only for converting a fresh URL.
 */
import { scanLibrary } from '../../library/scan.js';
import { ExportError, exportDocumentsToEpub } from './epub-export-service.js';

/**
 * Capture `url` into the library and export it as a single-article EPUB.
 * @returns {Promise<ExportResult & {documentId}>}
 */
export async function captureAndExportToEpub({
  url,
  libraryRoot,
  destDir,
  fileName,
  options = {},
  signal,
  captureOptions = {}, // fetchPageImpl/fetchAssetImpl/limits injection for tests
}) {
  const { runCapture } = await import('../../capture/pipeline.js');
  throwIfCancelled(signal);
  const capture = await runCapture({ url }, { libraryRoot, ...captureOptions });
  if (capture.status !== 'completed') {
    const reason = capture.error_code ? `${capture.error_code}: ${capture.message ?? ''}` : capture.message ?? capture.status;
    throw new ExportError('content', `网页采集失败——${reason}`);
  }
  // locate the captured document by scanning FILES (M9 §59: never the index)
  const { entries } = await scanLibrary(libraryRoot);
  const entry = entries.find((e) => e.document_id === capture.article_id);
  if (!entry) {
    throw new ExportError('input', `采集完成但找不到文档: ${capture.article_id}`);
  }
  const result = await exportDocumentsToEpub({
    libraryRoot,
    entries: [entry],
    destDir,
    fileName,
    options, // single article: no bookTitle → no title page (M9 §11)
    signal,
  });
  return { ...result, documentId: capture.article_id, captureWarnings: capture.warnings ?? [] };
}

function throwIfCancelled(signal) {
  if (signal?.aborted) throw new ExportError('cancelled', '导出已取消');
}
