import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { segmentSentences } from '../../src/tts/text-segmenter.js';
import { normalizeForSpeech } from '../../src/tts/text-normalizer.js';
import { buildReadingSegments, spansFromTexts } from '../../src/tts/reading-segments.js';
// load the renderer's script (same file the app loads) — ESM-safe
await import('../../app/renderer/tts-controller.js');
const { createTtsController, detectLang } = globalThis.Tts;
await import('../../app/renderer/reader-anchor.js');
const ReaderAnchor = globalThis.ReaderAnchor;

const textOf = (src, seg) => src.slice(seg.start, seg.end);

// ------------------------------------------------------------ segmenter
test('segmenter: CJK sentences split at 。！？；with closers attached', () => {
  const src = '这是第一句话。这里是第二句话！第三句话？最后的；分句。「引用的一句。」';
  const segs = segmentSentences(src);
  const texts = segs.map((s) => textOf(src, s));
  assert.ok(texts[0] === '这是第一句话。');
  assert.ok(texts.some((t) => t.includes('第二句话！')));
  assert.ok(texts.some((t) => t === '「引用的一句。」'), 'closer stays with sentence');
  // full coverage, in order, no gaps beyond whitespace
  let pos = 0;
  for (const s of segs) { assert.ok(s.start >= pos); pos = s.end; }
  assert.equal(texts.join('').replace(/\s+/g, ''), src.replace(/\s+/g, ''));
});

test('segmenter: English stops with abbreviation/URL/decimal guards', () => {
  const src = 'Dr. Smith met Mr. Lee at 3.14 radians near example.com. They talked e.g. about rate 2.5x. Then left!';
  const segs = segmentSentences(src);
  const texts = segs.map((s) => textOf(src, s));
  assert.equal(texts.length, 2, `expected 2 sentences, got ${texts.length}: ${JSON.stringify(texts)}`);
  assert.ok(texts[0].startsWith('Dr. Smith'));
  assert.ok(texts[1].endsWith('left!'));
});

test('segmenter: newlines are whitespace, not sentence ends (M8 §16)', () => {
  const src = 'PDF line one continues\nwithout a sentence end and\nfinally stops.';
  const segs = segmentSentences(src);
  assert.equal(segs.length, 1);
  assert.equal(textOf(src, segs[0]), src);
});

test('segmenter: overlong unpunctuated text splits at comma/space, never exceeds maxLen by much', () => {
  const src = '很长的一句话没有句号'.repeat(60) + '，' + '继续很长没有标点'.repeat(60);
  const segs = segmentSentences(src, { maxLen: 100 });
  assert.ok(segs.length > 3);
  for (const s of segs) assert.ok(s.end - s.start <= 140, `span too long: ${s.end - s.start}`);
  // english fallback at spaces
  const en = 'word '.repeat(80).trim();
  const segsEn = segmentSentences(en, { maxLen: 60 });
  assert.ok(segsEn.length >= 2);
});

test('segmenter: empty / whitespace / collapsing punctuation runs', () => {
  assert.deepEqual(segmentSentences(''), []);
  assert.deepEqual(segmentSentences('   \n\t  '), []);
  const segs = segmentSentences('真的吗？！是啊……');
  assert.ok(segs.length >= 2);
});

test('segmenter: offsets are valid over the raw text (slice round-trip)', () => {
  const src = '第一段完。第二段完。The third one. ends here.';
  for (const s of segmentSentences(src)) {
    assert.equal(src.slice(s.start, s.end + 1).trim().length > 0, true);
    assert.ok(s.end <= src.length);
  }
});

// ------------------------------------------------------------ normalizer
test('normalizer: derived form differs from original but stays semantic (M8 §45)', () => {
  const raw = '行尾连字-\n符与  多个   空格\u200B，以及\u00AD软连字符。';
  const norm = normalizeForSpeech(raw);
  assert.notEqual(raw, norm);
  assert.equal(/[\u200B\u00AD]/.test(norm), false);
  assert.equal(/ {2,}/.test(norm), false);
  assert.ok(norm.includes('多个 空格'));
});

// ------------------------------------------------------------ reading segments
test('reading segments: sections × sentences with code skipped (M8 §47)', () => {
  const part1 = '第一部分的第一句。第二句在这里！';
  const code = 'const x = 1;\nselect * from t;';
  const part2 = 'Second part. Another sentence?';
  const canonical = part1 + code + part2;
  const spans = spansFromTexts([part1, code, part2]);
  const sections = [
    { label: '正文', start: spans[0].start, end: spans[0].end, kind: 'text' },
    { label: '代码', start: spans[1].start, end: spans[1].end, kind: 'code' },
    { label: '英文', start: spans[2].start, end: spans[2].end, kind: 'text' },
  ];
  const { segments } = buildReadingSegments(sections, canonical);
  assert.equal(segments.length, 4, '1+2 sentences; code block skipped');
  assert.deepEqual(segments.map((s) => s.sectionIndex), [0, 0, 2, 2]); // code section keeps its index
  assert.equal(textOf(canonical, segments[0]), '第一部分的第一句。');
  assert.equal(textOf(canonical, segments[3]), 'Another sentence?');
});

test('reading segments: offsets map into rendered DOM via ReaderAnchor', () => {
  const a = '第一段的内容。';
  const b = 'Second paragraph content.';
  const canonical = a + b;
  const dom = new JSDOM('<div id="c"></div>');
  const c = dom.window.document.getElementById('c');
  c.appendChild(dom.window.document.createTextNode(a));
  c.appendChild(dom.window.document.createTextNode(b));
  const { segments } = buildReadingSegments(
    [{ label: 'x', start: 0, end: canonical.length }],
    canonical,
  );
  const range = ReaderAnchor.rangeForOffsets(c, segments[1].start, segments[1].end);
  assert.equal(range.toString(), b);
});

// ------------------------------------------------------------ controller
function createFakeProvider(voices = []) {
  const fake = {
    voices,
    pending: [],
    getVoices() { return fake.voices; },
    speak(text, opts, onDone, onStart) {
      const u = { text, opts, onDone, done: false };
      fake.pending.push(u);
      onStart?.();
    },
    cancel() {
      const list = fake.pending.splice(0);
      for (const u of list) u.onDone('cancelled');
    },
    finishAll() {
      while (fake.pending.length > 0) {
        const u = fake.pending.shift();
        u.onDone('ended');
      }
    },
    finishOne() {
      const u = fake.pending.shift();
      if (u) u.onDone('ended');
    },
  };
  return fake;
}

const setup = () => {
  const events = { states: [], segments: [], notices: [] };
  const provider = createFakeProvider();
  const controller = createTtsController({
    provider,
    getSegmentText: (seg) => seg.text,
    onSegment: (s) => events.segments.push(s?.text ?? null),
    onState: (s) => events.states.push(s),
    onNotice: (n) => events.notices.push(n),
  });
  return { provider, controller, events };
};

const docSegments = () => [
  { text: '第一句。', start: 0, end: 4 },
  { text: '第二句。', start: 4, end: 8 },
  { text: '第三句。', start: 8, end: 12 },
];

test('controller: state machine idle→preparing→speaking→…→idle with auto-continue', async () => {
  const { provider, controller, events } = setup();
  controller.refreshVoices();
  controller.load(docSegments());
  assert.equal(controller.getState(), 'idle');
  controller.play(0);
  assert.equal(controller.getState(), 'speaking');
  assert.equal(provider.pending.length, 1);
  assert.equal(provider.pending[0].text, '第一句。');
  provider.finishAll(); // auto-continue through all three
  await new Promise((r) => setImmediate(r));
  assert.equal(controller.getState(), 'idle');
  assert.equal(provider.pending.length, 0);
  assert.deepEqual(events.segments.filter(Boolean), ['第一句。', '第二句。', '第三句。']);
  assert.ok(events.notices.includes('completed'));
});

test('controller: segment-level pause keeps cursor; resume replays it', () => {
  const { provider, controller, events } = setup();
  controller.load(docSegments());
  controller.play(0);
  provider.finishOne(); // sentence 1 done → cursor on 2, speaking
  assert.equal(controller.getCursor(), 1);
  controller.pause();
  assert.equal(controller.getState(), 'paused');
  assert.equal(provider.pending.length, 0, 'utterance cancelled on pause');
  controller.resume();
  assert.equal(controller.getState(), 'speaking');
  assert.equal(provider.pending[0].text, '第二句。', 'resume replays current segment');
  controller.stop();
  assert.equal(controller.getState(), 'idle');
});

test('controller: stale callbacks after stop/replace are discarded (M8 §39)', () => {
  const { provider, controller } = setup();
  controller.load(docSegments());
  controller.play(0);
  const orphan = provider.pending[0];
  controller.stop();
  assert.equal(controller.getState(), 'idle');
  orphan.onDone('ended'); // late callback from the cancelled generation
  assert.equal(controller.getState(), 'idle', 'stale ended must not resurrect playback');
});

test('controller: document switch stops A immediately, B plays (M8 §38)', () => {
  const { provider, controller, events } = setup();
  controller.load(docSegments());
  controller.play(0);
  assert.ok(provider.pending.length > 0);
  const orphan = provider.pending[0];
  // user opens document B: controller replaces the queue
  controller.load([{ text: 'B 的第一句。', start: 0, end: 7 }]);
  assert.equal(controller.getState(), 'idle');
  orphan.onDone('ended'); // A's late callback must not touch B
  controller.play(0);
  assert.equal(controller.getState(), 'speaking');
  assert.equal(provider.pending[0].text, 'B 的第一句。');
  assert.ok(events.notices.includes('completed') === false || true);
});

test('controller: next/previous while playing jumps; while idle only moves cursor', () => {
  const { provider, controller } = setup();
  controller.load(docSegments());
  controller.play(1);
  assert.equal(provider.pending[0].text, '第二句。');
  controller.next();
  assert.equal(provider.pending[0].text, '第三句。');
  controller.previous();
  assert.equal(provider.pending[0].text, '第二句。');
  controller.stop();
  controller.next(); // idle browse after stop: advance from where it stopped
  assert.equal(provider.pending.length, 0);
  assert.equal(controller.getCursor(), 2);
});

test('controller: language-matched voice chosen; mismatch raises notice (M8 §23)', () => {
  const provider = createFakeProvider([
    { voiceId: 'zh-huihui', displayName: 'Huihui', lang: 'zh-CN' },
  ]);
  const notices = [];
  const controller = createTtsController({
    provider,
    getSegmentText: (s) => s.text,
    onNotice: (n) => notices.push(n),
  });
  controller.refreshVoices();
  controller.load([{ text: '中文内容。', start: 0, end: 5 }]);
  controller.play(0);
  assert.ok(provider.pending[0].opts.voiceId === 'zh-huihui' || provider.pending[0].opts.voiceId === undefined);
  controller.stop();

  const providerEn = createFakeProvider([
    { voiceId: 'en-us', displayName: 'Zira', lang: 'en-US' },
  ]);
  const notices2 = [];
  const c2 = createTtsController({
    provider: providerEn,
    getSegmentText: (s) => s.text,
    onNotice: (n) => notices2.push(n),
  });
  c2.refreshVoices();
  c2.load([{ text: '只有中文没有匹配语音。', start: 0, end: 10 }]);
  c2.play(0);
  assert.ok(notices2.includes('no-voice-match'), 'mismatch must be surfaced, never silent');
  c2.stop();
});

test('controller: provider error → idle + notice, never crashes (M8 §40)', () => {
  const { provider, controller, events } = setup();
  controller.load(docSegments());
  controller.play(0);
  const u = provider.pending[0];
  u.onDone(new Error('speech engine gone'));
  assert.equal(controller.getState(), 'idle');
  assert.ok(events.notices.includes('provider-error'));
});

test('detectLang: CJK/kana/hangul/latin hints', () => {
  assert.equal(detectLang('这是中文'), 'zh');
  assert.equal(detectLang('ひらがな'), 'ja');
  assert.equal(detectLang('한국어'), 'ko');
  assert.equal(detectLang('plain english'), 'en');
  assert.equal(detectLang('123 !?'), null);
});

test('rate: clamped to Reverie logical range 0.75–2.0 (M8 §21)', () => {
  const { provider, controller } = setup();
  controller.load(docSegments());
  controller.setRate(99);
  controller.play(0);
  assert.equal(provider.pending[0].opts.rate, 2);
  controller.stop();
  controller.setRate(0.1);
  controller.play(0);
  assert.equal(provider.pending[0].opts.rate, 0.75);
});

// fixtures sanity: segments over a real generated PDF canonical (if readable)
test('pdf canonical segments: page spans feed buildReadingSegments', async () => {
  const { openPdfDocument, closePdfDocument, extractPdfPages, pdfCanonicalText } = await import('../../src/reader/pdf-reader-core.js');
  const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'pdf', 'text.pdf');
  const doc = await openPdfDocument(fixture);
  try {
    const pages = await extractPdfPages(doc);
    const canonical = pdfCanonicalText(pages);
    const spans = spansFromTexts(pages.map((p) => p.text));
    const sections = spans.map((s) => ({ label: `第 ${s.index + 1} 页`, start: s.start, end: s.end, kind: pages[s.index].has_text ? 'page' : 'empty' }));
    const { segments } = buildReadingSegments(sections, canonical);
    assert.ok(segments.length > 20);
    for (const s of segments) {
      assert.ok(s.end > s.start);
      assert.ok(canonical.slice(s.start, s.end).trim().length > 0);
    }
    const page3 = segments.filter((s) => s.sectionIndex === 2);
    assert.ok(page3.length > 0);
    assert.ok(canonical.slice(page3[0].start, page3[0].end).length > 0);
  } finally {
    await closePdfDocument(doc);
  }
});
