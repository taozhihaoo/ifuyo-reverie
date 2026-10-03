#!/usr/bin/env node
/**
 * Reverie Capture Host (Native Messaging Spike, M0 §24).
 *
 * Chrome/Edge launch this process with:
 *   <host> chrome-extension://<ext-id>/ --parent-window=<n>   (Windows)
 * Protocol: 4-byte LE length + UTF-8 JSON, both directions (stdout replies
 * must stay <= 1 MB — enforced by our reply size, not worth checking).
 *
 * M0 scope: receive CaptureRequest -> validate -> append to a persistent
 * queue file -> reply CaptureResponse. No fetch/extraction (that is M1).
 *
 * Privacy (M0 §35): stderr logs carry request_id and URL ORIGIN ONLY —
 * never full URLs with query strings, never selected_text.
 */
import { createInterface } from 'node:readline';
import { appendLine } from '../core/atomic-write.js';
import {
  LIMITS,
  PROTOCOL_VERSION,
  createResponse,
  validateCaptureRequest,
} from './protocol.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = { queue: path.join(here, '..', '..', 'native-host', 'data', 'capture-queue.jsonl') };
  let origin = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--queue') args.queue = argv[++i];
    else if (a === '--allowed-origin') args.allowedOrigin = argv[++i];
    else if (a.startsWith('chrome-extension://')) origin = a;
    else if (a.startsWith('--parent-window=')) { /* Windows-only, ignored */ }
  }
  if (!origin) {
    // Standalone/dev invocations may pass the origin explicitly
    if (args.allowedOrigin) origin = args.allowedOrigin;
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

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // Origin pinning: the browser is the only legitimate caller.
  if (!args.origin) {
    process.stderr.write('[reverie-capture-host] no caller origin — refusing\n');
    process.exit(2);
  }
  if (args.origin !== `chrome-extension://${EXTENSION_ID}/`) {
    process.stderr.write(`[reverie-capture-host] untrusted origin ${args.origin} — refusing\n`);
    process.exit(2);
  }

  process.stderr.write(`[reverie-capture-host] ready (protocol v${PROTOCOL_VERSION}, queue=${path.basename(args.queue)})\n`);

  let buffer = Buffer.alloc(0);
  let queueDrain = Promise.resolve();

  const handleFrame = async (payload) => {
    let msg;
    let requestId = 'unknown';
    try {
      msg = JSON.parse(payload.toString('utf8'));
      requestId = typeof msg?.request_id === 'string' ? msg.request_id : requestId;
    } catch {
      write(createResponse(requestId, { accepted: false, error_code: 'malformed_json', message: 'payload is not JSON' }));
      return;
    }
    const verdict = validateCaptureRequest(msg);
    if (!verdict.ok) {
      process.stderr.write(`[reverie-capture-host] rejected ${requestId}: ${verdict.error_code}\n`);
      write(createResponse(requestId, { accepted: false, error_code: verdict.error_code, message: verdict.message }));
      return;
    }
    // privacy: log origin only
    process.stderr.write(`[reverie-capture-host] queued ${requestId} from ${urlOrigin(msg.url)}\n`);
    const job = {
      queue_format_version: 1,
      request_id: msg.request_id,
      url: msg.url,
      title: msg.title ?? '',
      selected_text: msg.selected_text ?? '',
      client_timestamp: msg.timestamp ?? null,
      received_at: new Date().toISOString(),
    };
    queueDrain = queueDrain
      .then(() => appendLine(args.queue, JSON.stringify(job)))
      .catch((err) => {
        process.stderr.write(`[reverie-capture-host] queue write failed: ${err.message}\n`);
        write(createResponse(requestId, { accepted: false, error_code: 'queue_write_failed', message: err.message }));
        return;
      });
    await queueDrain;
    write(createResponse(requestId, { accepted: true }));
  };

  const write = (obj) => {
    const payload = Buffer.from(JSON.stringify(obj), 'utf8');
    const head = Buffer.alloc(4);
    head.writeUInt32LE(payload.length, 0);
    process.stdout.write(Buffer.concat([head, payload]));
  };

  // stdin frame reader
  process.stdin.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      if (buffer.length < 4) return;
      const len = buffer.readUInt32LE(0);
      if (len > LIMITS.message) {
        // refuse oversized messages but keep the stream framed: we cannot
        // drain an unbounded payload efficiently, so shut down cleanly.
        process.stderr.write(`[reverie-capture-host] frame of ${len} bytes exceeds cap — exiting\n`);
        process.exit(3);
      }
      if (buffer.length < 4 + len) return;
      const payload = buffer.subarray(4, 4 + len);
      buffer = buffer.subarray(4 + len);
      handleFrame(payload); // async, ordered via queueDrain
    }
  });

  process.stdin.on('end', async () => {
    try { await queueDrain; } catch { /* already logged */ }
    process.stderr.write('[reverie-capture-host] stdin closed — bye\n');
    process.exit(0);
  });
}

export const EXTENSION_ID = 'ngfmioeinapcphpbgboaajachhhdgajg';

// run only when executed directly
const isMain = process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href;
if (isMain) await main();
