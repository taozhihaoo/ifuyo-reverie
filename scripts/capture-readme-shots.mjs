/**
 * README screenshot generator — drives the REAL Electron app (no mockups)
 * over CDP, with a seeded library and the UI language forced, then writes
 * PNGs to docs/screenshots/.
 *
 *   node scripts/capture-readme-shots.mjs            # en + zh
 *   node scripts/capture-readme-shots.mjs --lang=en  # one language
 *
 * Each language gets an isolated temp library / home / profile so the two
 * runs cannot leak `localStorage` (language + theme) into each other.
 */
import { spawn } from 'node:child_process';
import { promises as fsp } from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const importFromRoot = (...p) => import(pathToFileURL(path.join(root, ...p)).href);
const electronExe = createRequire(pathToFileURL(path.join(root, 'x.js')).href)('electron');
const outDir = path.join(root, 'docs', 'screenshots');
const PORT = 9244;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const args = process.argv.slice(2);
const onlyLang = (args.find((a) => a.startsWith('--lang=')) ?? '').split('=')[1] || null;

/* ---------------------------------------------------------------- fixtures */
const EN = [
  {
    title: 'The Quiet Architecture of a Personal Archive',
    author: 'Mira Ellison',
    tags: ['essay', 'archives'],
    favorite: true,
    body: [
      'A library is not a pile of files. It is a set of promises you make to your future self: that this paragraph will still be here, that this margin note will still make sense, that the thing you understood at midnight will not evaporate by morning.',
      'Most reading tools quietly break that promise. They keep your highlights on a server you do not control, convert your notes into a format you cannot open, and ask you to trust an account instead of a folder. The archive becomes a subscription.',
      'The alternative is unglamorous and it works: write everything down as plain files, keep the folder yours, and treat every database as a cache that can be thrown away and rebuilt. Indexes are cheap. Memory is not.',
      'So the architecture is deliberately boring. Articles are Markdown. Annotations are one JSON object per line. The original page is stored exactly as it arrived. Nothing depends on a schema you cannot read with a text editor.',
      'What you get in exchange is durability. You can copy the folder to a new machine, open it in ten years, and still find the sentence that changed your mind about something.',
    ],
  },
  {
    title: 'A Field Guide to Slow Reading',
    author: 'Northwind Review',
    tags: ['reading', 'practice'],
    body: [
      'Slow reading is not a moral achievement. It is a way of giving a text enough room to disagree with you.',
      'The first pass is for shape: what is this author trying to do, and to whom? The second pass is for friction: where do you stop believing them? The third pass is for residue: what will you still remember in a week?',
      'Annotation is the tool that makes the third pass possible. A highlight with no note is a bookmark; a highlight with a note is an argument you had with the author and won.',
      'Keep the argument somewhere you will trip over it again. A daily review is not a productivity ritual — it is a way of letting old reading interrupt new reading.',
    ],
  },
  {
    title: 'Designing for Long Attention Spans',
    author: 'Ilya Grant',
    tags: ['design', 'typography'],
    body: [
      'Interfaces optimised for engagement are optimised for interruption. Reading interfaces should be optimised for the opposite: the feeling that nothing is going to jump in front of the paragraph you are in.',
      'That means no badges, no counters that tick, no notification that a feed refreshed. Motion should be quiet enough to be missed. Colour should do one job at a time.',
      'Serif body text, generous line height, and a measure between sixty and eighty characters do more for comprehension than any feature list. The rest is discipline.',
    ],
  },
  {
    title: 'Notes on Local-First Software',
    author: 'Ink & Paper',
    tags: ['local-first', 'engineering'],
    body: [
      'Local-first is a data-ownership stance before it is a sync strategy. The copy on your disk is the real one; every other copy is a convenience.',
      'Once you accept that, the design questions become tractable. What is the smallest unit of truth? Can it be rebuilt if the cache is lost? Can a user leave with everything they brought?',
      'The answers are usually: a file, yes, and yes. Systems that cannot answer those questions are not local-first, no matter where the server is.',
    ],
  },
  {
    title: 'The Shape of a Good Annotation',
    author: 'Mira Ellison',
    tags: ['annotation', 'essay'],
    read: true,
    body: [
      'An annotation has three jobs: to point at a span of text, to survive the text being edited, and to remain legible when the surrounding document changes shape.',
      'Most tools solve the first and ignore the other two. Anchors break silently, highlights drift onto the wrong sentence, and the note ends up attached to nothing.',
      'The honest solution is to let an annotation become orphaned — visibly, loudly, and without ever deleting it. A broken anchor is information. Quietly losing a note is data loss.',
    ],
  },
  {
    title: 'Why Your Library Should Be a Folder',
    author: 'Reverie Journal',
    tags: ['local-first', 'archives'],
    read: true,
    body: [
      'Accounts expire. Services shut down. Formats get abandoned by the companies that invented them. Folders, remarkably, keep working.',
      'A folder is a contract you can inspect: it has names, sizes, and dates. Any tool can read it. Any backup can copy it. Any future version of you can open it without asking permission.',
      'The cost is that a folder cannot be sold to you twice. That, more than any technical constraint, is why so few products are built this way.',
    ],
  },
];

const ZH = [
  {
    title: '把阅读还给读者：本地优先的资料库',
    author: '林间',
    tags: ['随笔', '资料库'],
    favorite: true,
    body: [
      '资料库不是一堆文件。它是你与未来的自己之间的一组承诺：这一段还会在，这条边注还看得懂，午夜想明白的事不会在天亮前蒸发。',
      '大多数阅读工具会悄悄违背这些承诺。它们把划线圈在你无法控制的服务器里，把笔记转成你打不开的格式，让你信任一个账号而不是一个文件夹。档案因此变成了订阅。',
      '另一种做法朴素却可靠：一切写成纯文本文件，文件夹归你所有，把每一次数据库都当成可以随时丢弃、随时重建的缓存。索引很便宜，记忆不是。',
      '于是架构刻意保持无聊。文章是 Markdown，标注是一行一个 JSON，原始网页按到达时的样子原样保存。没有任何东西依赖你用文本编辑器读不懂的结构。',
      '换来的东西叫耐久。你可以把文件夹拷到新机器上，十年后再打开，仍然找得到那句改变过你想法的话。',
    ],
  },
  {
    title: '慢读的艺术',
    author: '北窗书话',
    tags: ['阅读', '方法'],
    body: [
      '慢读不是一种道德成就，而是给文本留出足够的空间，让它有机会反驳你。',
      '第一遍看形状：作者想做什么，做给谁看。第二遍找摩擦力：你在哪一句开始不再相信他。第三遍看残留：一周之后你还记得什么。',
      '标注是让第三遍成为可能的东西。没有笔记的高亮只是书签；有笔记的高亮，是你和作者吵过并且吵赢的一场架。',
      '把这场架放在你一定会再次撞见的地方。每日回顾不是效率仪式，而是让旧的阅读有机会打断新的阅读。',
    ],
  },
  {
    title: '长注意力时代的设计',
    author: '叶青',
    tags: ['设计', '排版'],
    body: [
      '为互动率优化的界面，本质上是在为打断而优化。阅读界面应该优化它的反面：让你确信，没有任何东西会突然跳到你正在读的这一段前面。',
      '这意味着没有角标，没有会跳动的计数器，没有“订阅源已刷新”的提示。动效要轻到可以被忽略，颜色一次只做一件事。',
      '衬线正文、舒展的行距、六七十个字的行宽，对理解力的帮助超过任何功能列表。剩下的，全靠克制。',
    ],
  },
  {
    title: '一份可以带走的知识库',
    author: '纸上漫游',
    tags: ['本地优先', '工程'],
    body: [
      '本地优先首先是一种数据所有权的立场，其次才是一种同步策略。你磁盘上的那一份才是真的，其余都只是便利。',
      '一旦接受这一点，设计问题就变得可解了：最小的真相单位是什么？缓存丢了能不能重建？用户离开时能不能带走他带来的全部东西？',
      '答案通常是：一个文件，能，能。回答不了这三个问题的系统，不论服务器放在哪里，都不是本地优先。',
    ],
  },
  {
    title: '注解的形状',
    author: '沈砚',
    tags: ['标注', '随笔'],
    read: true,
    body: [
      '一条注解要做三件事：指向一段文本，在文本被修改后仍然存活，以及在文档结构变化时保持可读。',
      '多数工具只解决第一件，忽略后两件。锚点悄悄失效，高亮漂到错误的句子上，笔记最终附着在虚无之上。',
      '诚实的做法是允许标注变成“孤立”状态：明确、醒目地标记出来，但永远不删除。断掉的锚点是信息，悄悄丢掉笔记才是数据损失。',
    ],
  },
  {
    title: '文件即真相',
    author: 'Reverie 手记',
    tags: ['本地优先', '资料库'],
    read: true,
    body: [
      '账号会过期，服务会关闭，格式会被发明它的公司放弃。文件夹却意外地一直能用。',
      '文件夹是一份可以检查的合同：它有名字、大小和日期。任何工具都能读，任何备份都能拷贝，任何未来的你都能不问许可地打开。',
      '代价是，文件夹没法卖给你第二次。比起任何技术限制，这才是这类产品如此稀少的原因。',
    ],
  },
];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Realistic source domains — the library row prints the source host, and a
// loopback origin would look like a test fixture in a README screenshot.
[EN, ZH].forEach((set, si) => {
  const sites = si === 0
    ? ['miraellison.com', 'northwind.review', 'ilyagrant.design', 'inkandpaper.press', 'miraellison.com', 'journal.reverie.app']
    : ['linjian.ink', 'beichuang.blog', 'yeqing.studio', 'paper-walk.cn', 'shenyan.ink', 'journal.reverie.app'];
  set.forEach((doc, i) => { doc.site = sites[i % sites.length]; });
});

function pageHtml(doc, lang, i) {
  const paras = doc.body.map((p) => `<p>${esc(p)}</p>`).join('\n');
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
<title>${esc(doc.title)}</title>
<meta name="author" content="${esc(doc.author)}">
<meta name="description" content="${esc(doc.body[0].slice(0, 120))}">
<link rel="canonical" href="https://${doc.site}/reading/${i + 1}">
</head><body><article>
<h1>${esc(doc.title)}</h1>
<p class="byline">${esc(doc.author)}</p>
${paras}
<blockquote><p>${esc(doc.body[doc.body.length - 1])}</p></blockquote>
</article></body></html>`;
}

/* ------------------------------------------------------------------- cdp */
class Cdp {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      }
    });
  }
  get ready() {
    return new Promise((resolve, reject) => {
      if (this.ws.readyState === 1) return resolve();
      this.ws.addEventListener('open', () => resolve(), { once: true });
      this.ws.addEventListener('error', () => reject(new Error('ws error')), { once: true });
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); } }, 30000);
    });
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('page eval failed: ' + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text));
    return r.result?.value;
  }
  async shot(file) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await fsp.writeFile(file, Buffer.from(data, 'base64'));
    const { size } = await fsp.stat(file);
    console.log(`  shot  ${path.relative(root, file)}  (${(size / 1024).toFixed(0)} KB)`);
  }
  close() { try { this.ws.close(); } catch { /* */ } }
}

async function waitUntil(cdp, expression, timeoutMs = 25000, label = '') {
  const t0 = Date.now();
  for (;;) {
    const v = await cdp.eval(expression).catch(() => false);
    if (v) return v;
    if (Date.now() - t0 > timeoutMs) throw new Error(`waitUntil timeout: ${label || expression}`);
    await sleep(300);
  }
}

async function findPageTarget(tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = targets.find((t) => t.type === 'page' && t.url.includes('index.html'));
      if (page) return page;
    } catch { /* retry */ }
    await sleep(800);
  }
  throw new Error('app page target not found');
}

function killTree(child) {
  if (!child || child.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const p = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    p.on('close', resolve);
    setTimeout(resolve, 4000);
  });
}

/* ---------------------------------------------------------------- seeding */
async function seedLibrary(tmp, docs, lang) {
  const env = {
    REVERIE_LIBRARY: path.join(tmp, 'library'),
    REVERIE_HOME: path.join(tmp, 'home'),
    REVERIE_SEARCH_INDEX: path.join(tmp, 'search-index.json'),
  };
  Object.assign(process.env, env, { REVERIE_ALLOW_PRIVATE_NETWORK: '1' });
  await fsp.mkdir(env.REVERIE_HOME, { recursive: true });

  const server = createServer((req, res) => {
    const i = Number(new URL(req.url, 'http://x').searchParams.get('i') ?? 0);
    const doc = docs[i];
    if (!doc) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(pageHtml(doc, lang, i));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;

  const { createCaptureRequest } = await importFromRoot('src', 'capture', 'protocol.js');
  const { enqueue } = await importFromRoot('src', 'capture', 'queue.js');
  const { processQueue } = await importFromRoot('src', 'capture', 'worker.js');
  const { loadIndex, rebuildIndex } = await importFromRoot('src', 'library', 'index.js');
  const { updateUserState } = await importFromRoot('src', 'library', 'user-state.js');
  const { rebuildSearchIndex } = await importFromRoot('src', 'search', 'search-service.js');

  const queueDir = path.join(env.REVERIE_HOME, 'queue');
  // capture oldest-first so the newest article lands at the top of the list
  for (let i = docs.length - 1; i >= 0; i--) {
    await enqueue(queueDir, createCaptureRequest({ url: `${origin}/?i=${i}` }));
    await processQueue({ queueDir, libraryRoot: env.REVERIE_LIBRARY });
    await sleep(20);
  }
  await rebuildIndex(env.REVERIE_LIBRARY);

  // user state: tags / read / favorite (mirrored into the search index)
  const index = await loadIndex(env.REVERIE_LIBRARY);
  const byTitle = new Map(docs.map((d) => [d.title, d]));
  for (const entry of index.entries) {
    const doc = byTitle.get(entry.title);
    if (!doc) continue;
    await updateUserState(entry.document_id, {
      tags: doc.tags ?? [],
      read: Boolean(doc.read),
      favorite: Boolean(doc.favorite),
      inbox: false,
    });
  }
  await rebuildSearchIndex(env.REVERIE_LIBRARY);

  server.close();
  return env;
}

/* --------------------------------------------------------------- capture */
async function captureLanguage(lang) {
  const docs = lang === 'zh' ? ZH : EN;
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), `reverie-shots-${lang}-`));
  console.log(`\n[${lang}] seeding ${docs.length} documents in ${tmp}`);
  const env = await seedLibrary(tmp, docs, lang);

  const childEnv = {
    ...process.env,
    ...env,
    REVERIE_ALLOW_PRIVATE_NETWORK: '1',
  };
  // The host shell may run with ELECTRON_RUN_AS_NODE=1 (which turns the
  // Electron binary into plain Node and breaks `import 'electron'`).
  delete childEnv.ELECTRON_RUN_AS_NODE;
  delete childEnv.NODE_OPTIONS;
  const child = spawn(electronExe, ['.', `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(tmp, 'profile')}`], {
    cwd: root, env: childEnv, stdio: ['ignore', 'ignore', 'ignore'],
  });

  try {
    const target = await findPageTarget();
    const cdp = new Cdp(target.webSocketDebuggerUrl);
    await cdp.ready;
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    try {
      const { windowId } = await cdp.send('Browser.getWindowForTarget', { targetId: target.id });
      await cdp.send('Browser.setWindowBounds', { windowId, bounds: { width: 1360, height: 860, windowState: 'normal' } });
    } catch { /* window size is cosmetic */ }

    // force language + a light, mist-accented surface for both README shots
    await waitUntil(cdp, `document.getElementById('article-list') !== null`, 25000, 'app booted');
    await waitUntil(cdp, `document.querySelectorAll('#article-list li').length >= ${Math.min(docs.length, 3)}`, 25000, 'rows rendered');
    // Drive the app's own controllers (no reload): localStorage writes right
    // before a reload can be lost, which silently left the UI in the default
    // language. Verify the switch actually took effect before shooting.
    await cdp.eval(`localStorage.setItem('reverie.lang', '${lang}');
      localStorage.setItem('reverie.theme', 'light');
      localStorage.setItem('reverie.accent', 'mist');
      window.I18N.setLang('${lang}'); window.Theme.setTheme('light'); window.Theme.setAccent('mist');
      document.getElementById('sel-lang').value = '${lang}';
      document.getElementById('sel-theme').value = 'light';`);
    const applied = await cdp.eval(`document.documentElement.lang`);
    if (applied !== (lang === 'zh' ? 'zh-CN' : 'en')) {
      throw new Error(`language not applied: document.lang=${applied} expected ${lang}`);
    }
    await waitUntil(cdp, `document.querySelectorAll('#article-list li').length >= ${Math.min(docs.length, 3)}`, 15000, 'rows after lang switch');
    await sleep(700);
    await cdp.eval(`document.getElementById('queue-hint').textContent = '';`);

    await cdp.shot(path.join(outDir, `${lang}-library.png`));

    // reader view (first article)
    await cdp.eval(`document.querySelectorAll('#article-list li')[0].click();`);
    await waitUntil(cdp, `document.getElementById('reader-view').hidden === false && document.getElementById('reader-content').textContent.length > 120`, 20000, 'reader open');
    await sleep(600);
    await cdp.shot(path.join(outDir, `${lang}-reader.png`));

    // dark mode, back on the library
    await cdp.eval(`document.getElementById('btn-back').click();`);
    await waitUntil(cdp, `document.getElementById('library-view').hidden === false`, 15000, 'back to library');
    await cdp.eval(`document.getElementById('sel-theme').value = 'dark';
      document.getElementById('sel-theme').dispatchEvent(new Event('change'));`);
    await sleep(700);
    await cdp.eval(`document.getElementById('queue-hint').textContent = '';`);
    await cdp.shot(path.join(outDir, `${lang}-dark.png`));

    cdp.close();
  } finally {
    await killTree(child);
    await fsp.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

await fsp.mkdir(outDir, { recursive: true });
for (const lang of onlyLang ? [onlyLang] : ['en', 'zh']) {
  await captureLanguage(lang);
}
console.log('\nScreenshots written to docs/screenshots/');
