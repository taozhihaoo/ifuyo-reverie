#!/usr/bin/env node
/**
 * Reverie Capture Host (M1): thin enqueuer.
 *
 * Chrome/Edge launch this process with:
 *   <host> chrome-extension://<ext-id>/ --parent-window=<n>   (Windows)
 * Protocol: 4-byte LE length + UTF-8 JSON, both directions.
 *
 * M1 flow (M1 §5): validate -> enqueue (persistent queue file) -> reply
 * `accepted`. The App's worker processes the queue; captures therefore
 * survive the browser closing and the UI being closed (queued jobs are
 * picked up on next app start).
 *
 * Privacy (M0 §35): stderr logs carry request_id and URL ORIGIN ONLY —
 * never full URLs with query strings, never selected_text.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LIMITS,
  PROTOCOL_VERSION,
  RESPONSE_STATUSES,
  ERROR_CODES,
  createResponse,
  validateCaptureRequest,
} from './protocol.js';
import { enqueue } from './queue.js';
import { getQueueDir } from '../core/paths.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export const EXTENSION_ID = 'ngfmioeinapcphpbgboaajachhhdgajg';
export { main as runCaptureHost };

function parseArgs(argv) {
  const args = { queueDir: getQueueDir() };
  let origin = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--queue-dir') args.queueDir = argv[++i];
    else if (a.startsWith('chrome-extension://')) origin = a;
    else if (a.startsWith('--parent-window=')) { /* Windows-only, ignored */ }
  }
  args.origin = origin;
  return args;
}

function urlOrigin(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return '(unparsable)';
  }
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);

  if (!args.origin || args.origin !== `chrome-extension://${EXTENSION_ID}/`) {
    process.stderr.write(`[reverie-capture-host] untrusted or missing origin (${args.origin ?? 'none'}) — refusing\n`);
    process.exit(2);
  }

  process.stderr.write(`[reverie-capture-host] ready (protocol v${PROTOCOL_VERSION})\n`);

  // Windows: the Electron launcher (Reverie.exe) emits exactly "\r\n" to
  // stdout during boot — before any app code runs (verified for the pinned
  // electron 44.5.1; bare `electron empty.js` reproduces it). Chrome reads
  // stdout as strict length-prefixed frames, so those two bytes join our
  // first response bytes to form a garbage prefix (len ≈ 14 MB → Chrome
  // hangs and the capture fails). Fix: complete the corrupted 4-byte prefix
  // with two NUL bytes → length = 0x00000a0d = 2573 — then emit exactly
  // 2573 bytes of whitespace-padded JSON as a harmless first message
  // ({"reverie_padding":true}); Chrome parses it, the extension ignores it,
  // and the parser is byte-aligned again for the real response that follows.
  // Only active when the launcher signals the junk via REVERIE_STDOUT_SKIP.
  const stdoutSkip = Number(process.env.REVERIE_STDOUT_SKIP ?? '0');
  const PAD_LEN = 0x0a0d;
  const PAD_PAYLOAD = JSON.stringify({ reverie_padding: true });
  let firstFrame = true;
  const write = (obj) => {
    if (firstFrame && stdoutSkip > 0) {
      firstFrame = false;
      if (stdoutSkip === 2) {
        const padSpaces = Buffer.alloc(PAD_LEN - PAD_PAYLOAD.length, 0x20);
        const out = Buffer.concat([
          Buffer.from([0x00, 0x00]), // complete the junk-corrupted length prefix
          Buffer.from(padSpaces), // leading whitespace, legal JSON
          Buffer.from(PAD_PAYLOAD), // padding message = exactly PAD_LEN bytes
        ]);
        process.stdout.write(out);
      } else {
        process.stderr.write(`[reverie-capture-host] unknown REVERIE_STDOUT_SKIP=${stdoutSkip} — writing plain frames (may misalign)\n`);
      }
    }
    const payload = Buffer.from(JSON.stringify(obj), 'utf8');
    const head = Buffer.alloc(4);
    head.writeUInt32LE(payload.length, 0);
    process.stdout.write(Buffer.concat([head, payload]));
  };

  let writes = Promise.resolve();
  const handleFrame = async (payload) => {
    let msg;
    let requestId = 'unknown';
    try {
      msg = JSON.parse(payload.toString('utf8'));
      requestId = typeof msg?.request_id === 'string' ? msg.request_id : requestId;
    } catch {
      write(createResponse(requestId, { status: RESPONSE_STATUSES.FAILED, error_code: ERROR_CODES.INVALID_REQUEST, message: 'payload is not JSON' }));
      return;
    }
    const verdict = validateCaptureRequest(msg);
    if (!verdict.ok) {
      process.stderr.write(`[reverie-capture-host] rejected ${requestId}: ${verdict.error_code}\n`);
      write(createResponse(requestId, { status: RESPONSE_STATUSES.FAILED, error_code: verdict.error_code, message: verdict.message }));
      return;
    }
    try {
      // capture_mode absent in older extensions defaults to article (validate allows undefined)
      const job = await enqueue(args.queueDir, {
        protocol_version: PROTOCOL_VERSION,
        request_id: msg.request_id,
        url: msg.url,
        title: msg.title ?? '',
        source: msg.source ?? 'browser',
        capture_mode: msg.capture_mode ?? 'article',
        selected_text: msg.selected_text ?? '',
        created_at: msg.created_at ?? msg.timestamp ?? new Date().toISOString(),
      });
      process.stderr.write(`[reverie-capture-host] queued ${job.request_id} from ${urlOrigin(msg.url)}\n`);
      write(createResponse(msg.request_id, { status: RESPONSE_STATUSES.ACCEPTED }));
    } catch (err) {
      process.stderr.write(`[reverie-capture-host] enqueue failed: ${err.message}\n`);
      write(createResponse(msg.request_id, { status: RESPONSE_STATUSES.FAILED, error_code: ERROR_CODES.UNKNOWN_ERROR, message: `enqueue failed: ${err.message}` }));
    }
  };

  let buffer = Buffer.alloc(0);
  process.stdin.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      if (buffer.length < 4) return;
      const len = buffer.readUInt32LE(0);
      if (len > LIMITS.message) {
        process.stderr.write(`[reverie-capture-host] frame of ${len} bytes exceeds cap — exiting\n`);
        process.exit(3);
      }
      if (buffer.length < 4 + len) return;
      const payload = buffer.subarray(4, 4 + len);
      buffer = buffer.subarray(4 + len);
      writes = writes.then(() => handleFrame(payload)).catch(() => {});
    }
  });

  // main() must not resolve until (a) the browser closes stdin AND (b) every
  // enqueued frame has been answered — embedded hosts (Reverie.exe launched
  // by Chrome) exit right after we return, so resolving early would kill
  // pending frames mid-write and the browser would show the capture as failed
  await new Promise((resolve) => {
    const done = () => { void writes.catch(() => {}).then(() => resolve()); };
    if (process.stdin.readableEnded) return done();
    process.stdin.once('end', done);
    process.stdin.once('error', done);
    // safety net: never outlive the browser (native messaging contract)
    const t = setTimeout(done, 24 * 60 * 60 * 1000);
    if (typeof t.unref === 'function') t.unref();
  });
  process.stderr.write('[reverie-capture-host] stdin closed — bye\n');
}

// run only when executed directly
const isMain = process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href;
if (isMain) await main();
