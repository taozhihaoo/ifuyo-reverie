import { inspectContent } from './extract.js';

/**
 * Structured evaluation of an extraction result against a fixture's
 * expected.json (docs/M0 §18 — never just `assert body != empty`).
 *
 * Verdict semantics:
 * - plain pass/fail on all checks;
 * - `xfail: true` marks a tracked, root-caused known failure (e.g. unclosed
 *   heading swallowing the article). XFAIL keeps CI green but an unexpected
 *   XPASS fails loudly so the fixture gets upgraded when extraction improves;
 * - `known_loss_contains` records real, quantified extraction losses (e.g. an
 *   aside box dropped from a table-layout newsletter). Reported as
 *   LIMITATION, excluded from the verdict, always visible in output.
 */
export function evaluateExtraction(result, expected) {
  const checks = [];
  const limitations = [];
  const add = (name, pass, detail = '') => checks.push({ name, pass, detail });
  const a = result.article;
  const insp = a ? inspectContent(a.content_html) : null;

  const expectArticle = expected.expect_article !== false;
  add('article-present', a !== null === expectArticle,
    a ? 'extracted' : `no article (${result.rejection ?? 'parse() null'})`);

  if (expectArticle && a) {
    if (expected.title !== undefined) add('title', a.title === expected.title, JSON.stringify(a.title));
    if (expected.title_contains !== undefined) add('title-contains', a.title?.includes(expected.title_contains) ?? false, JSON.stringify(a.title));
    if (expected.byline !== undefined) add('byline', a.byline === expected.byline, JSON.stringify(a.byline));
    if (expected.byline_contains !== undefined) add('byline-contains', a.byline?.includes(expected.byline_contains) ?? false, JSON.stringify(a.byline));
    if (expected.published_time_contains !== undefined) add('published-time', a.published_time?.includes(expected.published_time_contains) ?? false, JSON.stringify(a.published_time));
    if (expected.canonical !== undefined) add('canonical', result.canonical === expected.canonical, JSON.stringify(result.canonical));
    for (const s of expected.body_contains ?? []) add(`body-has:${snippet(s)}`, a.text_content?.includes(s) ?? false);
    for (const s of expected.body_not_contains ?? []) add(`body-not:${snippet(s)}`, !(a.text_content?.includes(s)), 'found junk in body');
    if (insp) {
      if (expected.min_paragraphs !== undefined) add('min-paragraphs', insp.paragraphs >= expected.min_paragraphs, `${insp.paragraphs}`);
      if (expected.min_images !== undefined) add('min-images', insp.images >= expected.min_images, `${insp.images} (${insp.image_srcs.slice(0, 3).join(', ')})`);
      if (expected.min_code_blocks !== undefined) add('min-code-blocks', insp.code_blocks >= expected.min_code_blocks, `${insp.code_blocks}`);
      if (expected.min_tables !== undefined) add('min-tables', insp.tables >= expected.min_tables, `${insp.tables}`);
      if (expected.min_links !== undefined) add('min-links', insp.links >= expected.min_links, `${insp.links}`);
      if (expected.min_lists !== undefined) add('min-lists', insp.lists >= expected.min_lists, `${insp.lists}`);
      if (expected.min_blockquotes !== undefined) add('min-blockquotes', insp.blockquotes >= expected.min_blockquotes, `${insp.blockquotes}`);
    }
    // known losses: real extraction gaps we track without failing the verdict
    for (const s of expected.known_loss_contains ?? []) {
      if (!(a.text_content?.includes(s))) limitations.push(`body-lost:${snippet(s)}`);
    }
  }

  const hardFailed = checks.filter((c) => !c.pass);
  if (expected.xfail) {
    if (hardFailed.length === 0) {
      return { pass: false, verdict: 'xpass', checks, failed: hardFailed, limitations,
        xfailReason: 'known failure unexpectedly passes — upgrade the fixture expectation' };
    }
    return { pass: true, verdict: 'xfail', checks, failed: hardFailed, limitations,
      xfailReason: expected.xfail_reason ?? 'tracked known failure' };
  }
  return { pass: hardFailed.length === 0, verdict: hardFailed.length === 0 ? 'pass' : 'fail', checks, failed: hardFailed, limitations };
}

const snippet = (s) => (s.length > 24 ? s.slice(0, 24) + '…' : s);
