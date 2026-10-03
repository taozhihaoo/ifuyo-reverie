import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTextAnchor } from '../../src/annotation/resolver.js';
import { resolveAnnotation } from '../../src/annotation/service.js';
import { parseMarkdownBlocks } from '../../src/reader/markdown-reader.js';

const fixture = (name) => fsp.readFile(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'annotations', name),
  'utf8',
);

// ---------- resolver unit (M2 §15-17) ----------

test('unique quote resolves even without context', () => {
  const r = resolveTextAnchor({ quote: '独特短语' }, '前文 独特短语 后文');
  assert.equal(r.status, 'resolved');
});

test('repeated quote without agreeing context is AMBIGUOUS, never mis-located (M2 §16)', () => {
  // 原文 A B C D，高亮 B；内容变成 A B X B C D —— 不允许"找到一个 B 就定位"
  const r = resolveTextAnchor({ quote: 'B', prefix: '', suffix: '' }, 'A B X B C D');
  assert.equal(r.status, 'ambiguous');
  // 换算到真实场景（§38 Scenario D 变体）：重复 quote 且上下文都不匹配
  const r2 = resolveTextAnchor({ quote: '本地优先软件', prefix: '', suffix: '' }, '第一处：本地优先软件。第二处：本地优先软件。');
  assert.equal(r2.status, 'ambiguous');
});

test('repeated quote with matching context resolves to the correct occurrence', () => {
  const text = '第一段出现了关键短语：本地优先软件。这句是第一处。第二段再次出现关键短语：本地优先软件。';
  const r = resolveTextAnchor(
    { quote: '本地优先软件', prefix: '关键短语：', suffix: '。这句是第一处。' },
    text,
  );
  assert.equal(r.status, 'resolved');
  assert.ok(r.start < text.indexOf('本地优先软件', 20));
});

test('quote deleted -> orphaned (never an error, never deleted)', () => {
  const r = resolveTextAnchor({ quote: '已经不存在的引文' }, '完全不同的内容');
  assert.deepEqual({ status: r.status }, { status: 'orphaned' });
});

test('invalid anchor throws (caller-side contract)', () => {
  assert.throws(() => resolveTextAnchor({ quote: '' }, 'text'));
});

// ---------- §38 scenarios A-D on a real article ----------

const makeAnchor = (md, quote) => {
  const { canonicalText } = parseMarkdownBlocks(md);
  const start = canonicalText.indexOf(quote);
  assert.ok(start !== -1, `fixture must contain quote: ${quote}`);
  return {
    quote,
    prefix: canonicalText.slice(Math.max(0, start - 32), start),
    suffix: canonicalText.slice(start + quote.length, start + quote.length + 32),
    position: { start, end: start + quote.length },
  };
};

test('§38 Scenario A: unchanged document -> active (resolved) via position', async () => {
  const md = await fixture('multi-paragraph.md');
  const anchor = makeAnchor(md, '本地优先意味着网络只是手段');
  const { canonicalText } = parseMarkdownBlocks(md);
  const hash = 'sha256-same';
  const annotation = { quoted_text: anchor.quote, prefix: anchor.prefix, suffix: anchor.suffix, locator: { kind: 'text-quote', position: anchor.position }, source_content_hash: hash };
  const r = resolveAnnotation(annotation, canonicalText, { currentHash: hash });
  assert.equal(r.status, 'resolved');
  assert.equal(r.quality, 'hash-position');
  assert.deepEqual([r.start, r.end], [anchor.position.start, anchor.position.end]);
});

test('§38 Scenario B: content inserted before -> still recovers via quote+context', async () => {
  const original = await fixture('multi-paragraph.md');
  const anchor = makeAnchor(original, '本地优先意味着网络只是手段');
  const edited = original.replace('第一段：', '新增的序言段落改变了所有偏移。第一段：');
  const { canonicalText } = parseMarkdownBlocks(edited);
  const r = resolveAnnotation({ quoted_text: anchor.quote, prefix: anchor.prefix, suffix: anchor.suffix, locator: { kind: 'text-quote', position: anchor.position } }, canonicalText);
  assert.equal(r.status, 'resolved');
  assert.notEqual(r.start, anchor.position.start, 'position must have been re-derived');
  assert.equal(canonicalText.slice(r.start, r.end), anchor.quote);
});

test('§38 Scenario C: quote gone -> orphaned', async () => {
  const original = await fixture('multi-paragraph.md');
  const anchor = makeAnchor(original, '本地优先意味着网络只是手段');
  const edited = original.replace('第二段：本地优先意味着网络只是手段，而不是依赖。资料永远属于用户自己。', '第二段：完全被改写的内容。');
  const { canonicalText } = parseMarkdownBlocks(edited);
  const r = resolveAnnotation({ quoted_text: anchor.quote, prefix: anchor.prefix, suffix: anchor.suffix, locator: { kind: 'text-quote', position: anchor.position } }, canonicalText);
  assert.equal(r.status, 'orphaned');
});

test('§38 Scenario D: repeated quote, resolver must not pick the wrong occurrence', async () => {
  const md = await fixture('repeated.md');
  const anchor = makeAnchor(md, '本地优先软件');
  // anchor was the FIRST occurrence; simulate the document gaining a third copy
  const edited = md + '\n第三段又出现了：本地优先软件。\n';
  const { canonicalText } = parseMarkdownBlocks(edited);
  const r = resolveAnnotation({ quoted_text: anchor.quote, prefix: anchor.prefix, suffix: anchor.suffix, locator: { kind: 'text-quote', position: anchor.position } }, canonicalText);
  assert.equal(r.status, 'resolved');
  assert.equal(canonicalText.slice(r.start, r.end), '本地优先软件');
  assert.equal(r.start, anchor.position.start, 'must resolve to the ORIGINAL occurrence via context');
});

// ---------- §46 content mutation matrix ----------

const BASE = `# 变化矩阵

开头段落，提供稳定的前文上下文锚点。

目标段落：这里有一句会被划线的话，划线内容必须能够经受各种变化。

结尾段落，提供稳定的后文上下文锚点。
`;
const QUOTE = '这里有一句会被划线的话';

const mutations = {
  '前文增加文字': BASE.replace('开头段落', '开头段落之前又插入了一句全新的话，'),
  '后文增加文字': BASE.replace('结尾段落', '结尾段落之后又追加了一句全新的话，'),
  '中间增加文字': BASE.replace('划线内容必须能够经受各种变化', '划线内容必须能够经受各种变化，而且这句话还变长了'),
  '段落增加': BASE.replace('##', '插入段：全新的一段落在中间。\n\n##'),
  '段落删除': BASE.replace('开头段落，提供稳定的前文上下文锚点。\n\n', ''),
  '空白变化': BASE.replace('目标段落：这里有', '目标段落：这里  有'),
  '标题变化': BASE.replace('# 变化矩阵', '# 完全不同的标题'),
};

for (const [name, edited] of Object.entries(mutations)) {
  test(`mutation: ${name} -> quote still re-locates`, async () => {
    const anchor = makeAnchor(BASE, QUOTE);
    const { canonicalText } = parseMarkdownBlocks(edited);
    const r = resolveAnnotation({ quoted_text: anchor.quote, prefix: anchor.prefix, suffix: anchor.suffix, locator: { kind: 'text-quote', position: anchor.position } }, canonicalText);
    assert.equal(r.status, 'resolved', JSON.stringify(r));
    // the mutated document legitimately contains the inserted whitespace —
    // what matters is that the anchor lands on the (mutated) quote text
    const located = canonicalText.slice(r.start, r.end);
    assert.equal(located.replace(/\s+/g, ''), QUOTE);
  });
}

test('mutation: quote消失 -> orphaned', async () => {
  const anchor = makeAnchor(BASE, QUOTE);
  const edited = BASE.replace('目标段落：这里有一句会被划线的话，划线内容必须能够经受各种变化。', '目标段落：整句话都被删掉重写了。');
  const { canonicalText } = parseMarkdownBlocks(edited);
  const r = resolveAnnotation({ quoted_text: anchor.quote, prefix: anchor.prefix, suffix: anchor.suffix, locator: { kind: 'text-quote', position: anchor.position } }, canonicalText);
  assert.equal(r.status, 'orphaned');
});

test('mutation: 重复quote且无上下文 -> ambiguous -> orphaned（不得误定位）', async () => {
  const annotation = { quoted_text: '重复的话', prefix: '', suffix: '', locator: { kind: 'text-quote', position: { start: 0, end: 4 } } };
  const r = resolveAnnotation(annotation, '前面重复的话后面又出现了重复的话结尾');
  // service-level: ambiguous degrades to orphaned (never a wrong location)
  assert.equal(r.status, 'orphaned');
  assert.equal(r.quality, 'ambiguous');
  // resolver-level: ambiguous is its own outcome, distinct from resolved
  const raw = resolveTextAnchor({ quote: '重复的话', prefix: '', suffix: '' }, '前面重复的话后面又出现了重复的话结尾');
  assert.equal(raw.status, 'ambiguous');
});

// ---------- cross-block selection (M2 §18) ----------

test('cross-block selection (heading -> paragraph) round-trips through canonical text', async () => {
  const md = await fixture('headings.md');
  const { canonicalText } = parseMarkdownBlocks(md);
  // select from "A 部分的正文" back into the heading tail — canonical text is
  // contiguous, so a cross-block selection is just a range in it
  const start = canonicalText.indexOf('二级标题 A');
  const end = canonicalText.indexOf('以便划线测试') + '以便划线测试'.length;
  const quote = canonicalText.slice(start, end);
  assert.ok(quote.includes('A 部分的正文内容'));
  const r = resolveTextAnchor({ quote, prefix: '', suffix: '' }, canonicalText);
  assert.equal(r.status, 'resolved');
  assert.equal(canonicalText.slice(r.start, r.end), quote);
});

// ---------- normalization stability (M2 §37) ----------

test('canonical text + blocks are stable across repeated parses (all fixtures)', async () => {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'annotations');
  for (const f of await fsp.readdir(dir)) {
    const md = await fsp.readFile(path.join(dir, f), 'utf8');
    const a = parseMarkdownBlocks(md);
    const b = parseMarkdownBlocks(md);
    assert.equal(a.canonicalText, b.canonicalText, `${f}: canonical text unstable`);
    assert.deepEqual(a.blocks, b.blocks, `${f}: blocks unstable`);
    assert.equal(a.blocks.map((x) => x.text).join(''), a.canonicalText, `${f}: canonical join contract broken`);
    for (const block of a.blocks) {
      const segText = (block.segments ?? []).map((s) => (s.t === 'image' ? '' : s.v ?? '')).join('');
      if (block.segments) assert.equal(segText, block.text, `${f}/${block.id}: segment text contract broken`);
    }
  }
});
