/**
 * Best-effort per-IP rate limit for the API routes that proxy the free OpenStreetMap
 * services. State lives in memory, so each serverless instance counts separately: this
 * slows down a simple script, but a Vercel Firewall rate-limit rule is the real control.
 */
const WINDOW_MS = 60_000;
const MAX_TRACKED = 5000;

const buckets = new Map<string, { count: number; resetAt: number }>();

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

/** Returns a 429 response when the caller is over the limit, otherwise null. */
export function rateLimit(request: Request, bucket: string, limit: number): Response | null {
  const now = Date.now();
  if (buckets.size > MAX_TRACKED) {
    for (const [key, entry] of buckets) if (entry.resetAt <= now) buckets.delete(key);
    if (buckets.size > MAX_TRACKED) buckets.clear();
  }

  const key = `${bucket}:${clientIp(request)}`;
  const entry = buckets.get(key);
  if (!entry || entry.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return null;
  }
  entry.count++;
  if (entry.count <= limit) return null;

  const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
  return Response.json(
    { error: "Too many searches in a short time. Please wait a moment and try again." },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}
