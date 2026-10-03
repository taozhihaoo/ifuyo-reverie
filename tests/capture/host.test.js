import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCaptureRequest, frameMessage, LIMITS, PROTOCOL_VERSION, ERROR_CODES, RESPONSE_STATUSES } from '../../src/capture/protocol.js';
import { listJobs, JOB_STATUSES } from '../../src/capture/queue.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const HOST = path.join(here, '..', '..', 'src', 'capture', 'native-host.js');
const EXT_ORIGIN = 'chrome-extension://ngfmioeinapcphpbgboaajachhhdgajg/';

const tmpdir = () => fsp.mkdtemp(path.join(os.tmpdir(), 'reverie-host-'));

/** Spawn the host and return a client that frames messages and reads replies. */
function startHost({ queueDir, origin = EXT_ORIGIN }) {
  const child = spawn(process.execPath, [HOST, origin, '--parent-window=0', '--queue-dir', queueDir], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const stderr = [];
  child.stderr.on('data', (d) => stderr.push(d.toString()));

  let buffer = Buffer.alloc(0);
  const pending = [];
  child.stdout.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      if (buffer.length < 4) return;
      const len = buffer.readUInt32LE(0);
      if (buffer.length < 4 + len) return;
      const payload = buffer.subarray(4, 4 + len);
      buffer = buffer.subarray(4 + len);
      const resolve = pending.shift();
      resolve?.(JSON.parse(payload.toString('utf8')));
    }
  });

  return {
    child,
    stderrText: () => stderr.join(''),
    send: (obj) => child.stdin.write(frameMessage(obj)),
    sendRaw: (buf) => child.stdin.write(buf),
    nextResponse: (timeoutMs = 5000) => new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('no response within ' + timeoutMs + 'ms')), timeoutMs);
      pending.push((msg) => { clearTimeout(t); resolve(msg); });
    }),
    close: () => new Promise((resolve) => {
      child.stdin.end();
      child.on('exit', (code) => resolve(code));
    }),
  };
}

test('host validates v1 request, enqueues, replies accepted', async () => {
  const dir = await tmpdir();
  const queueDir = path.join(dir, 'queue');
  const host = startHost({ queueDir });
  const req = createCaptureRequest({ url: 'https://example.com/article?utm=x', title: '示例文章' });
  assert.equal(req.source, 'browser');
  assert.equal(req.capture_mode, 'article');
  assert.ok(req.created_at);
  host.send(req);
  const reply = await host.nextResponse();
  assert.equal(reply.status, RESPONSE_STATUSES.ACCEPTED, JSON.stringify(reply));
  assert.equal(reply.protocol_version, PROTOCOL_VERSION);
  assert.equal(reply.request_id, req.request_id);

  const jobs = await listJobs(queueDir);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].request_id, req.request_id);
  assert.equal(jobs[0].status, JOB_STATUSES.QUEUED);
  await host.close();
});

test('host rejects non-http(s) URL scheme (INVALID_URL)', async () => {
  const dir = await tmpdir();
  const host = startHost({ queueDir: path.join(dir, 'queue') });
  host.send(createCaptureRequest({ url: 'javascript:alert(1)' }));
  const reply = await host.nextResponse();
  assert.equal(reply.status, RESPONSE_STATUSES.FAILED);
  assert.equal(reply.error_code, ERROR_CODES.INVALID_URL);
  await host.close();
});

test('host rejects wrong protocol_version (UNSUPPORTED_PROTOCOL)', async () => {
  const dir = await tmpdir();
  const host = startHost({ queueDir: path.join(dir, 'queue') });
  const req = createCaptureRequest({ url: 'https://example.com/' });
  req.protocol_version = 999;
  host.send(req);
  const reply = await host.nextResponse();
  assert.equal(reply.status, RESPONSE_STATUSES.FAILED);
  assert.equal(reply.error_code, ERROR_CODES.UNSUPPORTED_PROTOCOL);
  await host.close();
});

test('host survives malformed JSON payloads', async () => {
  const dir = await tmpdir();
  const host = startHost({ queueDir: path.join(dir, 'queue') });
  const garbage = Buffer.from('{ this is not json');
  const head = Buffer.alloc(4);
  head.writeUInt32LE(garbage.length, 0);
  host.sendRaw(Buffer.concat([head, garbage]));
  const reply = await host.nextResponse();
  assert.equal(reply.status, RESPONSE_STATUSES.FAILED);
  assert.equal(reply.error_code, ERROR_CODES.INVALID_REQUEST);
  // and the host is still alive for a valid message afterwards
  host.send(createCaptureRequest({ url: 'https://example.com/after' }));
  const reply2 = await host.nextResponse();
  assert.equal(reply2.status, RESPONSE_STATUSES.ACCEPTED);
  await host.close();
});

test('host enforces the 1 MB message cap', async () => {
  const dir = await tmpdir();
  const host = startHost({ queueDir: path.join(dir, 'queue') });
  // The host reads the frame header and exits before draining the payload,
  // so we only send the 4-byte length header.
  const head = Buffer.alloc(4);
  head.writeUInt32LE(LIMITS.message + 1, 0);
  host.sendRaw(head);
  const code = await new Promise((resolve) => {
    const t = setTimeout(() => resolve('timeout'), 5000);
    host.child.on('exit', (c) => { clearTimeout(t); resolve(c); });
  });
  assert.equal(code, 3, 'host must exit with code 3 on cap violation');
});

test('host refuses to run without a browser origin', async () => {
  const dir = await tmpdir();
  const child = spawn(process.execPath, [HOST, '--queue-dir', path.join(dir, 'q')], { stdio: ['pipe', 'pipe', 'pipe'] });
  const code = await new Promise((resolve) => child.on('exit', resolve));
  assert.equal(code, 2);
});

test('host refuses untrusted origins', async () => {
  const dir = await tmpdir();
  const child = spawn(process.execPath, [HOST, 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/', '--queue-dir', path.join(dir, 'q')], { stdio: ['pipe', 'pipe', 'pipe'] });
  const code = await new Promise((resolve) => child.on('exit', resolve));
  assert.equal(code, 2);
});
