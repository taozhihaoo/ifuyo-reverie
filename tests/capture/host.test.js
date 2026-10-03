import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCaptureRequest, frameMessage, LIMITS, PROTOCOL_VERSION } from '../../src/capture/protocol.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const HOST = path.join(here, '..', '..', 'src', 'capture', 'native-host.js');
const EXT_ORIGIN = 'chrome-extension://ngfmioeinapcphpbgboaajachhhdgajg/';

const tmpdir = () => fsp.mkdtemp(path.join(os.tmpdir(), 'reverie-host-'));

/** Spawn the host and return a client that frames messages and reads replies. */
function startHost({ queue, origin = EXT_ORIGIN }) {
  const child = spawn(process.execPath, [HOST, origin, '--parent-window=0', '--queue', queue], {
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

test('host accepts a valid CaptureRequest, queues it, and replies accepted', async () => {
  const dir = await tmpdir();
  const queue = path.join(dir, 'queue.jsonl');
  const host = startHost({ queue });
  const req = createCaptureRequest({ url: 'https://example.com/article?utm=x', title: '示例文章', selected_text: '' });
  host.send(req);
  const reply = await host.nextResponse();
  assert.equal(reply.accepted, true, JSON.stringify(reply));
  assert.equal(reply.protocol_version, PROTOCOL_VERSION);
  assert.equal(reply.request_id, req.request_id);

  const line = (await fsp.readFile(queue, 'utf8')).trim();
  const job = JSON.parse(line);
  assert.equal(job.request_id, req.request_id);
  assert.equal(job.url, req.url);
  await host.close();
});

test('host rejects non-http(s) URL scheme (bad_url)', async () => {
  const dir = await tmpdir();
  const host = startHost({ queue: path.join(dir, 'queue.jsonl') });
  const req = createCaptureRequest({ url: 'javascript:alert(1)' });
  host.send(req);
  const reply = await host.nextResponse();
  assert.equal(reply.accepted, false);
  assert.equal(reply.error_code, 'bad_url');
  await assert.rejects(() => fsp.access(path.join(dir, 'queue.jsonl'))); // nothing queued
  await host.close();
});

test('host rejects wrong protocol_version', async () => {
  const dir = await tmpdir();
  const host = startHost({ queue: path.join(dir, 'queue.jsonl') });
  const req = createCaptureRequest({ url: 'https://example.com/' });
  req.protocol_version = 999;
  host.send(req);
  const reply = await host.nextResponse();
  assert.equal(reply.accepted, false);
  assert.equal(reply.error_code, 'version_mismatch');
  await host.close();
});

test('host survives malformed JSON payloads', async () => {
  const dir = await tmpdir();
  const host = startHost({ queue: path.join(dir, 'queue.jsonl') });
  const garbage = Buffer.from('{ this is not json');
  const head = Buffer.alloc(4);
  head.writeUInt32LE(garbage.length, 0);
  host.sendRaw(Buffer.concat([head, garbage]));
  const reply = await host.nextResponse();
  assert.equal(reply.accepted, false);
  assert.equal(reply.error_code, 'malformed_json');
  // and the host is still alive for a valid message afterwards
  const req = createCaptureRequest({ url: 'https://example.com/after' });
  host.send(req);
  const reply2 = await host.nextResponse();
  assert.equal(reply2.accepted, true);
  await host.close();
});

test('host enforces the 1 MB message cap', async () => {
  const dir = await tmpdir();
  const host = startHost({ queue: path.join(dir, 'queue.jsonl') });
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
  const child = spawn(process.execPath, [HOST, '--queue', path.join(dir, 'q.jsonl')], { stdio: ['pipe', 'pipe', 'pipe'] });
  const code = await new Promise((resolve) => child.on('exit', resolve));
  assert.equal(code, 2);
});

test('host refuses untrusted origins', async () => {
  const dir = await tmpdir();
  const child = spawn(process.execPath, [HOST, 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/', '--queue', path.join(dir, 'q.jsonl')], { stdio: ['pipe', 'pipe', 'pipe'] });
  const code = await new Promise((resolve) => child.on('exit', resolve));
  assert.equal(code, 2);
});
