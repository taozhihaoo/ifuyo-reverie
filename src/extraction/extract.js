/**
 * Article extraction wrapper (Extraction Spike, M0).
 *
 * Uses Mozilla Readability — a mature, vetted extractor — but never treats
 * "the library ran" as success: the harness in tests/extraction evaluates
 * structured fields (title / byline / date / canonical / body / images /
 * code / tables) per corpus fixture.
 */
import { Readability, isProbablyReaderable } from '@mozilla/readability';
import { JSDOM } from 'jsdom';

/**
 * Extract an article from raw HTML.
 * Returns `{ article: null, rejection }` when there is nothing worth
 * archiving: either Readability itself found no candidate, or the extracted
 * text is too short to be a real article (e.g. a nav-only shell page —
 * Readability happily "extracts" the nav links as body text).
 */
export function extractArticle(html, { url = 'https://corpus.reverie.local/page/', minTextLength = 40 } = {}) {
  const dom = new JSDOM(html, { url });
  const doc = dom.window.document;

  const canonicalLink = doc.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null;
  let canonical = null;
  if (canonicalLink) {
    try { canonical = new URL(canonicalLink, url).href; } catch { canonical = canonicalLink; }
  }
  const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute('content') ?? null;

  // isProbablyReaderable is a UI hint only (length-sensitive); do NOT gate on
  // it. The authoritative "no extractable article" signal is parse() -> null.
  const readable = isProbablyReaderable(doc);
  // Readability mutates the document it parses — feed it a clone so the
  // original stays available for metadata extraction above.
  const article = new Readability(doc.cloneNode(true)).parse();

  const base = {
    source_url: url,
    readable,
    canonical,
    og_title: ogTitle,
  };

  if (!article) return { ...base, article: null, rejection: 'no-candidate' };

  const textLength = (article.textContent ?? '').trim().length;
  if (textLength < minTextLength) {
    return { ...base, article: null, rejection: 'too-short', text_length: textLength };
  }

  return {
    ...base,
    text_length: textLength,
    rejection: null,
    article: {
      title: article.title ?? null,
      byline: article.byline ?? null,
      published_time: article.publishedTime ?? null,
      site_name: article.siteName ?? null,
      lang: article.lang ?? null,
      excerpt: article.excerpt ?? null,
      content_html: article.content ?? null,
      text_content: article.textContent ?? null,
    },
  };
}

/** Count structural elements inside extracted content HTML. */
export function inspectContent(contentHtml) {
  if (!contentHtml) return null;
  const body = new JSDOM(contentHtml).window.document.body;
  const count = (sel) => body.querySelectorAll(sel).length;
  const srcs = [...body.querySelectorAll('img')].map((i) => i.getAttribute('src')).filter(Boolean);
  return {
    paragraphs: count('p'),
    links: count('a[href]'),
    images: count('img'),
    image_srcs: srcs,
    code_blocks: count('pre'),
    tables: count('table'),
    lists: count('ul,ol'),
    headings: count('h1,h2,h3,h4,h5,h6'),
    blockquotes: count('blockquote'),
  };
}
