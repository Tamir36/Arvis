type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const reportCache = new Map<string, CacheEntry<unknown>>();

export async function getOrSetReportCache<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const existing = reportCache.get(key) as CacheEntry<T> | undefined;
  if (existing && existing.expiresAt > now) {
    return existing.value;
  }

  const value = await loader();
  reportCache.set(key, {
    value,
    expiresAt: now + ttlMs,
  });
  return value;
}

export function invalidateReportCache(prefix: string) {
  for (const key of reportCache.keys()) {
    if (key.startsWith(prefix)) {
      reportCache.delete(key);
    }
  }
}
