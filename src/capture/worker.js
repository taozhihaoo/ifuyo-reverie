/**
 * Capture worker (M1 §5): claims queued jobs and drives the pipeline,
 * recording terminal states in the persistent queue. Runs inside the App;
 * the Native Host only enqueues, so captures survive UI-side crashes and
 * are retried/resumed on next start (queue.recoverOnStartup).
 */
import { RESPONSE_STATUSES, ERROR_CODES } from './protocol.js';
import { JOB_STATUSES, claimNext, updateJob, failOrRetry } from './queue.js';
import { runCapture } from './pipeline.js';

const terminal = (status) => status !== JOB_STATUSES.QUEUED && status !== JOB_STATUSES.RUNNING;

/**
 * Process up to `maxJobs` queued jobs. Returns processed job summaries.
 * onJobUpdate lets the UI observe progress without coupling to the queue.
 */
export async function processQueue({ queueDir, libraryRoot, maxJobs = Infinity, onJobUpdate = () => {} } = {}) {
  const processed = [];
  for (let i = 0; i < maxJobs; i++) {
    const job = await claimNext(queueDir);
    if (!job) break;
    onJobUpdate(job);

    const result = await runCapture(job.request, { libraryRoot });

    let final;
    if (result.status === RESPONSE_STATUSES.COMPLETED) {
      final = await updateJob(queueDir, job, {
        status: JOB_STATUSES.COMPLETED,
        article_id: result.article_id,
        last_error: result.warnings?.length
          ? { error_code: ERROR_CODES.ASSET_DOWNLOAD_FAILED, message: `degraded: ${result.warnings.length} asset(s) failed` }
          : null,
      });
    } else if (result.status === RESPONSE_STATUSES.DUPLICATE) {
      final = await updateJob(queueDir, job, {
        status: JOB_STATUSES.DUPLICATE,
        article_id: result.article_id,
        last_error: { error_code: ERROR_CODES.DUPLICATE, message: result.message ?? 'duplicate capture' },
      });
    } else {
      final = await failOrRetry(queueDir, job, result.error_code ?? ERROR_CODES.UNKNOWN_ERROR, result.message ?? 'capture failed');
    }
    onJobUpdate(final);
    processed.push(final);
    if (terminal(final.status) && final.status !== JOB_STATUSES.COMPLETED && final.status !== JOB_STATUSES.DUPLICATE && final.status !== JOB_STATUSES.FAILED) {
      // requeued for retry — keep looping until retries exhaust or queue empty
    }
  }
  return processed;
}
