// Simple in-memory rate limiter
// For production: use Redis (Upstash) or a database
const store = new Map();

const LIMITS: Record<string, { scansPerDay: number; cooldownMs: number }> = {
  free: { scansPerDay: 3, cooldownMs: 15000 },
  pro: { scansPerDay: 50, cooldownMs: 5000 },
};

export function checkRateLimit(userId: any, tier: string = "free") {
  const limits = LIMITS[tier];
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  const key = `${userId}:${today}`;

  let record = store.get(key);
  if (!record) {
    record = { count: 0, lastScan: 0 };
    store.set(key, record);
  }

  if (record.count >= limits.scansPerDay) {
    return { ok: false, reason: "Daily limit reached." };
  }
  if (now - record.lastScan < limits.cooldownMs) {
    const wait = Math.ceil((limits.cooldownMs - (now - record.lastScan)) / 1000);
    return { ok: false, reason: `Wait ${wait}s.` };
  }

  record.count++;
  record.lastScan = now;
  return { ok: true, remaining: limits.scansPerDay - record.count };
}