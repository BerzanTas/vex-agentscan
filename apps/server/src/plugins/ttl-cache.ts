type CacheEntry<T> = { expiresAtMs: number; value: Promise<T> };

export class TtlCache<T> {
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly entries = new Map<string, CacheEntry<T>>();

  constructor(ttlSec: number, now: () => number = Date.now) {
    this.ttlMs = ttlSec * 1000;
    this.now = now;
  }

  async get(key: string, load: () => Promise<T>): Promise<T> {
    const existing = this.entries.get(key);
    if (existing !== undefined && existing.expiresAtMs > this.now()) return existing.value;
    const value = load();
    this.entries.set(key, { expiresAtMs: this.now() + this.ttlMs, value });
    try {
      return await value;
    } catch (error) {
      this.entries.delete(key);
      throw error;
    }
  }
}
