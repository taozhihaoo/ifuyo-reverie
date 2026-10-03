/** Minimal concurrency limiter (no dependency; ~15 lines beat a whole package). */
export function pLimit(concurrency) {
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error('concurrency must be a positive integer');
  let active = 0;
  const queue = [];
  const next = () => {
    active--;
    if (queue.length > 0) queue.shift()();
  };
  return (fn) => new Promise((resolve, reject) => {
    const run = () => {
      active++;
      fn().then(resolve, reject).finally(next);
    };
    if (active < concurrency) run();
    else queue.push(run);
  });
}
