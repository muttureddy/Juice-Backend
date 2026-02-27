/**
 * middleware/rateLimiter.js
 * ─────────────────────────────────────────────────────
 * PURPOSE: Simple in-memory rate limiter.
 * Logic: Tracks requests per IP and enforces a cooling period.
 * ─────────────────────────────────────────────────────
 */

function createRateLimiter({ 
  windowMs = 10 * 60 * 1000, 
  max = 5, 
  message = 'Too many requests, please try again later.' 
} = {}) {
  const hits = new Map(); // Map<ip, { count, resetAt }>

  // Prune stale entries every 5 minutes to prevent memory leaks
  const interval = setInterval(() => {
    const now = Date.now();
    for (const [ip, rec] of hits.entries()) {
      if (now > rec.resetAt) hits.delete(ip);
    }
  }, 5 * 60 * 1000);

  // Unref the interval so it doesn't keep the process alive on shutdown
  interval.unref();

  return (req, res, next) => {
    // Standard Express IP detection
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() 
               || req.ip 
               || 'unknown';

    const now = Date.now();
    const rec = hits.get(ip);

    // Case 1: New IP or previous window has expired
    if (!rec || now > rec.resetAt) {
      hits.set(ip, { count: 1, resetAt: now + windowMs });
      return next();
    }

    // Case 2: Limit exceeded
    if (rec.count >= max) {
      const retryAfterSec = Math.ceil((rec.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        error: 'Too Many Requests',
        message,
        retryAfter: retryAfterSec,
      });
    }

    // Case 3: Within limit, increment and proceed
    rec.count += 1;
    next();
  };
}

module.exports = { createRateLimiter };