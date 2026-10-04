import { promises as fsp } from 'node:fs';

// ---- tts-view.js ----
let tts = await fsp.readFile('app/renderer/tts-view.js', 'utf8');
const T = [
  [`label: loaded.chapters[s.index].title || \`第 \${s.index + 1} 章\`,`,
   `label: loaded.chapters[s.index].title || window.I18N.t('toc.chapter', { n: s.index + 1 }),`],
  [`label: \`第 \${s.index + 1} 页\`,`, `label: window.I18N.t('toc.page', { n: s.index + 1 }),`],
  [`label: b.type === 'heading' ? (b.text || '标题').slice(0, 24) : \`第 \${s.index + 1} 段\`,`,
   `label: b.type === 'heading' ? (b.text || window.I18N.t('toc.untitled')).slice(0, 24) : window.I18N.t('toc.para', { n: s.index + 1 }),`],
  [`els.play.title = st === 'speaking' ? '暂停' : (st === 'paused' ? '继续' : '朗读（从当前位置）');`,
   `els.play.title = st === 'speaking' ? window.I18N.t('tts.pause') : (st === 'paused' ? window.I18N.t('tts.resume') : window.I18N.t('tts.play'));`],
  [`setStatus(selectionMode ? '朗读所选' : \`第 \${i + 1} / \${segments.length} 句\`);`,
   `setStatus(selectionMode ? window.I18N.t('tts.statusSelection') : window.I18N.t('tts.statusSentence', { i: i + 1, n: segments.length }));`],
  [`setStatus('已暂停');`, `setStatus(window.I18N.t('tts.paused'));`],
  [`auto.textContent = '自动语音';`, `auto.textContent = window.I18N.t('tts.voiceAuto');`],
  [`setStatus('当前文档没有可读取文本');`, `setStatus(window.I18N.t('tts.noReadableText'));`],
  [`[{ label: '所选内容', start: 0, end: quote.length }],`,
   `[{ label: window.I18N.t('tts.selectionSection'), start: 0, end: quote.length }],`],
];
const missT = [];
for (const [o, n] of T) { if (!tts.includes(o)) { missT.push(o.slice(0, 50)); continue; } tts = tts.split(o).join(n); }
await fsp.writeFile('app/renderer/tts-view.js', tts);
console.log('tts-view:', T.length - missT.length, '/', T.length);
if (missT.length) console.log('MISSED-T:\n' + missT.join('\n'));

// ---- pdf-view.js ----
let pdf = await fsp.readFile('app/renderer/pdf-view.js', 'utf8');
const P = [
  [`err.title = '此页无法渲染';`, `err.dataset.msg = window.I18N.t('pdf.pageError');`],
];
const missP = [];
for (const [o, n] of P) { if (!pdf.includes(o)) { missP.push(o.slice(0, 50)); continue; } pdf = pdf.split(o).join(n); }
await fsp.writeFile('app/renderer/pdf-view.js', pdf);
console.log('pdf-view:', P.length - missP.length, '/', P.length);
if (missP.length) console.log('MISSED-P:\n' + missP.join('\n'));
