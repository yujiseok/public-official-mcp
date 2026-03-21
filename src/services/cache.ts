const store = new Map<string, { data: unknown; expiresAt: number }>();

const DEFAULT_TTL = 10 * 60 * 1000; // 10분

export function get<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.data as T;
}

export function set(key: string, data: unknown, ttl = DEFAULT_TTL): void {
  store.set(key, { data, expiresAt: Date.now() + ttl });
}
