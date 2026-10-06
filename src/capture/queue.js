/**
 * Persistent Capture Queue (M1 §5).
 *
 * One JSON file per job under <home>/queue/<request_id>.json — per-file
 * atomic writes mean a crash can never corrupt other jobs, and startup
 * recovery is a directory scan:
 *   queued   -> stays queued (processed on next worker run)
 *   running  -> back to queued (the worker died mid-job; never stuck)
 *   completed/failed/duplicate -> terminal, kept for history/inspection
 *
 * Retry policy (M1 §5.3): transient errors (NETWORK_ERROR) retry up to
 * max_retries; permanent errors never retry.
 */
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { writeFileAtomic } from '../core/atomic-write.js';
import { ERROR_CODES } from './protocol.js';

export const QUEUE_VERSION = 1;

export const JOB_STATUSES = Object.freeze({
  QUEUED: 'queued',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  DUPLICATE: 'duplicate',
});

/** Errors worth another attempt (network hiccups, server 5xx...). */
export const TRANSIENT_ERROR_CODES = new Set([ERROR_CODES.NETWORK_ERROR]);
export const MAX_RETRIES = 3;

const jobPath = (dir, requestId) => path.join(dir, `${request_id(requestId)}.json`);
const request_id = (id) => id; // id is already a safe UUID; explicit for clarity

export async function enqueue(queueDir, request, { now = new Date().toISOString() } = {}) {
  const job = {
    queue_version: QUEUE_VERSION,
    request_id: request.request_id,
    capture_id: null, // set when a capture directory is created
    request,
    status: JOB_STATUSES.QUEUED,
    retry_count: 0,
    max_retries: MAX_RETRIES,
    last_error: null,
    article_id: null,
    created_at: now,
    updated_at: now,
  };
  await writeFileAtomic(jobPath(queueDir, job.request_id), JSON.stringify(job, null, 2));
  return job;
}

export async function loadJob(queueDir, requestId) {
  const raw = await fsp.readFile(jobPath(queueDir, requestId), 'utf8');
  return JSON.parse(raw);
}

/** Patch + persist a job. Rejects unknown status values. */
export async function updateJob(queueDir, job, patch, { now = new Date().toISOString() } = {}) {
  if (patch.status !== undefined && !Object.values(JOB_STATUSES).includes(patch.status)) {
    throw new Error(`unknown job status: ${patch.status}`);
  }
  const next = { ...job, ...patch, updated_at: now };
  await writeFileAtomic(jobPath(queueDir, job.request_id), JSON.stringify(next, null, 2));
  return next;
}

/** All jobs, oldest first. Missing dir -> []. */
export async function listJobs(queueDir) {
  let names;
  try {
    names = await fsp.readdir(queueDir);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const jobs = [];
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    try {
      jobs.push(JSON.parse(await fsp.readFile(path.join(queueDir, name), 'utf8')));
    } catch {
      // a torn job file can only be one write; skip and keep the queue alive
    }
  }
  return jobs.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
}

/** Startup recovery (M1 §5.1): running -> queued, never stuck. */
export async function recoverOnStartup(queueDir, { now = new Date().toISOString() } = {}) {
  const jobs = await listJobs(queueDir);
  const recovered = [];
  for (const job of jobs) {
    if (job.status === JOB_STATUSES.RUNNING) {
      const next = await updateJob(queueDir, job, {
        status: JOB_STATUSES.QUEUED,
        last_error: { error_code: ERROR_CODES.UNKNOWN_ERROR, message: 'app restarted while job was running' },
      }, { now });
      recovered.push(next);
    }
  }
  return recovered;
}

/** Remove terminal-FAILED job files (user-cleared failure history). Failed
 * jobs are otherwise kept forever for inspection; successful/duplicate jobs
 * and anything still queued/running are never touched. Returns the count. */
export async function clearFailed(queueDir) {
  const jobs = await listJobs(queueDir);
  let removed = 0;
  for (const job of jobs) {
    if (job.status !== JOB_STATUSES.FAILED) continue;
    await fsp.rm(jobPath(queueDir, job.request_id), { force: true });
    removed += 1;
  }
  return removed;
}

/** Pop the oldest queued job, marking it running. Returns null if empty. */
export async function claimNext(queueDir, { now = new Date().toISOString() } = {}) {
  const jobs = await listJobs(queueDir);
  const job = jobs.find((j) => j.status === JOB_STATUSES.QUEUED);
  if (!job) return null;
  return updateJob(queueDir, job, { status: JOB_STATUSES.RUNNING }, { now });
}

/** Record a failure; transient errors stay queued for retry until exhausted. */
export async function failOrRetry(queueDir, job, error_code, message, { now = new Date().toISOString() } = {}) {
  const last_error = { error_code, message };
  const retryable = TRANSIENT_ERROR_CODES.has(error_code) && job.retry_count < job.max_retries;
  if (retryable) {
    return updateJob(queueDir, job, {
      status: JOB_STATUSES.QUEUED,
      retry_count: job.retry_count + 1,
      last_error,
    }, { now });
  }
  return updateJob(queueDir, job, {
    status: JOB_STATUSES.FAILED,
    last_error,
  }, { now });
}
