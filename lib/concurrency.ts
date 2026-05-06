/**
 * Run a worker over a list of items with a concurrency cap.
 * Returns when every worker has settled.
 */
export async function runPool<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>
): Promise<void> {
  if (items.length === 0) return
  let next = 0
  const concurrency = Math.min(limit, items.length)
  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const i = next++
      if (i >= items.length) return
      await worker(items[i], i)
    }
  })
  await Promise.all(workers)
}
