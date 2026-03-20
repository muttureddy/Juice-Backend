/**
 * middleware/auth.js
 * ─────────────────────────────────────────────────────
 * PURPOSE: JWT validation + in-memory user cache.
 *
 * CHANGE: Added a 5-minute in-memory cache (Map) keyed by userId.
 * Every authenticated request previously hit MongoDB. With the cache,
 * repeat requests within 5 min skip the DB lookup entirely.
 * Cache is auto-invalidated after TTL or on logout signal.
 *
 * EXPORTS:
 *   auth         – any logged-in user
 *   adminAuth    – logged-in user with role === 'admin'
 *   invalidateUserCache(userId) – call after role change / delete
 * ─────────────────────────────────────────────────────
 */

const jwt        = require('jsonwebtoken');
const { getDB, toObjectId } = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'PROTEINSPOT_jwt_secret_change_in_prod';

// ── In-memory user cache ───────────────────────────────
// Structure: Map<userId, { user, expiresAt }>
const USER_CACHE     = new Map();
const CACHE_TTL_MS   = 5 * 60 * 1000; // 5 minutes

function getCached(userId) {
  const entry = USER_CACHE.get(userId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { USER_CACHE.delete(userId); return null; }
  return entry.user;
}

function setCache(userId, user) {
  USER_CACHE.set(userId, { user, expiresAt: Date.now() + CACHE_TTL_MS });
}

// Call this whenever a user's role changes or they are deleted
function invalidateUserCache(userId) {
  USER_CACHE.delete(String(userId));
}

// Prune stale entries every 10 minutes to avoid memory creep
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of USER_CACHE.entries()) {
    if (now > entry.expiresAt) USER_CACHE.delete(id);
  }
}, 10 * 60 * 1000);

// ── auth middleware ────────────────────────────────────
const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ message: 'No token — authorisation denied' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const userId  = decoded.userId;

    // 1️⃣  Try cache first
    let user = getCached(userId);

    // 2️⃣  Miss → hit DB, then cache
    if (!user) {
      const db = getDB();
      user = await db.collection('users').findOne(
        { _id: toObjectId(userId) },
        { projection: { otp: 0 } }       // never expose OTP
      );
      if (!user) {
        return res.status(401).json({ message: 'Token is not valid — user not found' });
      }
      setCache(userId, user);
    }

    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Token is not valid' });
  }
};

// ── adminAuth middleware ───────────────────────────────
const adminAuth = async (req, res, next) => {
  await auth(req, res, () => {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    next();
  });
};

module.exports = { auth, adminAuth, invalidateUserCache };
