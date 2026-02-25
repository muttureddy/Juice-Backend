/**
 * middleware/rateLimiter.js
 * ─────────────────────────────────────────────────────
 * PURPOSE: Simple in-memory rate limiter (no Redis needed).
 *
 * createRateLimiter(options) returns an Express middleware that:
 *   - Tracks requests per IP in a Map
 *   - Rejects with 429 once windowMax is exceeded in windowMs
 *   - Auto-cleans expired windows every 5 minutes
 *
 * Used on:
 *   POST /api/auth/send-otp    → max 5 per 10 min per IP
 *   POST /api/auth/resend-otp  → max 3 per 10 min per IP
 * ─────────────────────────────────────────────────────
 */

function createRateLimiter({ windowMs = 10 * 60 * 1000, max = 5, message = 'Too many requests, please try again later.' } = {}) {
  const hits = new Map(); // Map<ip, { count, resetAt }>

  // Prune stale entries every 5 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [ip, rec] of hits.entries()) {
      if (now > rec.resetAt) hits.delete(ip);
    }
  }, 5 * 60 * 1000);

  return (req, res, next) => {
    const ip  = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
               || req.socket?.remoteAddress
               || 'unknown';
    const now = Date.now();
    const rec = hits.get(ip);

    if (!rec || now > rec.resetAt) {
      // First hit or window expired — start fresh
      hits.set(ip, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (rec.count >= max) {
      const retryAfterSec = Math.ceil((rec.resetAt - now) / 1000);
      res.set('Retry-After', retryAfterSec);
      return res.status(429).json({
        message,
        retryAfter: retryAfterSec,
      });
    }

    rec.count += 1;
    next();
  };
}

module.exports = { createRateLimiter };
