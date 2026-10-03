import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  enqueue, loadJob, updateJob, listJobs, claimNext, recoverOnStartup, failOrRetry,
  JOB_STATUSES, TRANSIENT_ERROR_CODES, MAX_RETRIES,
} from '../../src/capture/queue.js';
import { createCaptureRequest, ERROR_CODES } from '../../src/capture/protocol.js';

const tmpdir = () => fsp.mkdtemp(path.join(os.tmpdir(), 'reverie-queue-'));

test('enqueue -> list -> claim preserves request and order', async () => {
  const dir = await tmpdir();
  const a = await enqueue(dir, createCaptureRequest({ url: 'https://a.example/1' }), { now: '2026-10-04T00:00:01Z' });
  const b = await enqueue(dir, createCaptureRequest({ url: 'https://b.example/2' }), { now: '2026-10-04T00:00:02Z' });
  const jobs = await listJobs(dir);
  assert.deepEqual(jobs.map((j) => j.request_id), [a.request_id, b.request_id]);

  const claimed = await claimNext(dir);
  assert.equal(claimed.request_id, a.request_id);
  assert.equal(claimed.status, JOB_STATUSES.RUNNING);
  const loaded = await loadJob(dir, a.request_id);
  assert.equal(loaded.status, JOB_STATUSES.RUNNING); // persisted, not just in memory
});

test('transient errors retry up to max_retries then fail permanently', async () => {
  const dir = await tmpdir();
  const job = await enqueue(dir, createCaptureRequest({ url: 'https://a.example/x' }));
  assert.ok(TRANSIENT_ERROR_CODES.has(ERROR_CODES.NETWORK_ERROR));

  let current = job;
  for (let i = 0; i < MAX_RETRIES; i++) {
    current = await failOrRetry(dir, current, ERROR_CODES.NETWORK_ERROR, 'boom');
    assert.equal(current.status, JOB_STATUSES.QUEUED, `attempt ${i + 1} should requeue`);
    assert.equal(current.retry_count, i + 1);
    current = await claimNext(dir, { now: new Date().toISOString() });
  }
  const final = await failOrRetry(dir, current, ERROR_CODES.NETWORK_ERROR, 'boom again');
  assert.equal(final.status, JOB_STATUSES.FAILED);
  assert.equal(final.last_error.error_code, ERROR_CODES.NETWORK_ERROR);
});

test('permanent errors never retry', async () => {
  const dir = await tmpdir();
  const job = await enqueue(dir, createCaptureRequest({ url: 'https://a.example/x' }));
  for (const code of [ERROR_CODES.INVALID_URL, ERROR_CODES.UNSUPPORTED_PROTOCOL, ERROR_CODES.SECURITY_REJECTED, ERROR_CODES.EXTRACTION_FAILED]) {
    const result = await failOrRetry(dir, job, code, 'nope');
    assert.equal(result.status, JOB_STATUSES.FAILED, `${code} must not retry`);
    assert.equal(result.retry_count, 0);
  }
});

test('startup recovery: running -> queued, terminal states untouched', async () => {
  const dir = await tmpdir();
  const a = await enqueue(dir, createCaptureRequest({ url: 'https://a.example/1' }), { now: '2026-10-04T00:00:01Z' });
  const b = await enqueue(dir, createCaptureRequest({ url: 'https://b.example/2' }), { now: '2026-10-04T00:00:02Z' });
  const c = await enqueue(dir, createCaptureRequest({ url: 'https://c.example/3' }), { now: '2026-10-04T00:00:03Z' });
  await updateJob(dir, a, { status: JOB_STATUSES.RUNNING });
  await updateJob(dir, b, { status: JOB_STATUSES.COMPLETED, article_id: 'x' });
  await updateJob(dir, c, { status: JOB_STATUSES.FAILED, last_error: { error_code: 'INVALID_URL', message: 'x' } });

  const recovered = await recoverOnStartup(dir);
  assert.equal(recovered.length, 1);
  assert.equal(recovered[0].request_id, a.request_id);
  assert.equal(recovered[0].status, JOB_STATUSES.QUEUED);

  const jobs = await listJobs(dir);
  const byId = Object.fromEntries(jobs.map((j) => [j.request_id, j]));
  assert.equal(byId[a.request_id].status, JOB_STATUSES.QUEUED);
  assert.equal(byId[b.request_id].status, JOB_STATUSES.COMPLETED);
  assert.equal(byId[c.request_id].status, JOB_STATUSES.FAILED);
});

test('a torn job file does not take down the queue', async () => {
  const dir = await tmpdir();
  await enqueue(dir, createCaptureRequest({ url: 'https://a.example/1' }));
  await fsp.writeFile(path.join(dir, 'broken.json'), '{ torn');
  const jobs = await listJobs(dir);
  assert.equal(jobs.length, 1);
});

test('updateJob rejects unknown statuses', async () => {
  const dir = await tmpdir();
  const job = await enqueue(dir, createCaptureRequest({ url: 'https://a.example/1' }));
  await assert.rejects(() => updateJob(dir, job, { status: 'zapped' }));
});
