/**
 * A small in-memory rate limiter: at most `limit` calls per `windowMs` for each key (e.g. a user
 * and an action). Enough for one API instance; behind several, move it to Postgres or Redis.
 */
export function rateLimiter(limit: number, windowMs = 60_000) {
  const hits = new Map<string, number[]>();
  return (key: string) => {
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    const allowed = recent.length < limit;
    if (allowed) recent.push(now);
    hits.set(key, recent);
    // Forget keys that have gone quiet, so the map doesn't grow forever.
    if (hits.size > 10_000) for (const [k, times] of hits) if (times.every((t) => now - t >= windowMs)) hits.delete(k);
    return allowed;
  };
}
