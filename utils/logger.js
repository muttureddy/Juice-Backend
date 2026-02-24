const { getDB } = require('../db/connection');

/**
 * Central logger — writes audit events to the `logs` collection.
 *
 * Usage:
 *   await log({ action: 'ORDER_STATUS_CHANGED', entityType: 'order', entityId: order._id,
 *               actorId: req.user.userId, actorPhone: req.user.phone, actorRole: req.user.role,
 *               details: { from: 'pending', to: 'confirmed' } });
 */
async function log({ action, entityType, entityId, actorId, actorPhone, actorRole, details = {}, ip = null }) {
  try {
    const db = getDB();
    await db.collection('logs').insertOne({
      action,           // e.g. 'ORDER_STATUS_CHANGED', 'USER_LOGIN', 'PRODUCT_CREATED'
      entityType,       // e.g. 'order', 'user', 'product'
      entityId: entityId ? String(entityId) : null,
      actorId: actorId ? String(actorId) : null,
      actorPhone: actorPhone || null,
      actorRole: actorRole || null,
      details,          // any extra info — before/after values, notes, etc.
      ip: ip || null,
      createdAt: new Date(),
    });
  } catch (err) {
    // Never crash the main request because of a logging failure
    console.error('⚠️  Logging failed:', err.message);
  }
}

// Helper: extract IP from request
function getIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.socket?.remoteAddress
    || null;
}

// Pre-built log actions for consistency
const LOG_ACTIONS = {
  USER_LOGIN:            'USER_LOGIN',
  USER_SIGNUP:           'USER_SIGNUP',
  USER_PROFILE_UPDATED:  'USER_PROFILE_UPDATED',
  USER_ROLE_CHANGED:     'USER_ROLE_CHANGED',
  OTP_SENT:              'OTP_SENT',
  OTP_VERIFIED:          'OTP_VERIFIED',
  OTP_FAILED:            'OTP_FAILED',
  ORDER_CREATED:         'ORDER_CREATED',
  ORDER_STATUS_CHANGED:  'ORDER_STATUS_CHANGED',
  PRODUCT_CREATED:       'PRODUCT_CREATED',
  PRODUCT_UPDATED:       'PRODUCT_UPDATED',
  PRODUCT_DELETED:       'PRODUCT_DELETED',
  PRODUCT_TOGGLED:       'PRODUCT_TOGGLED',
  ADMIN_VIEWED_ORDERS:   'ADMIN_VIEWED_ORDERS',
  ADMIN_VIEWED_PAYMENTS: 'ADMIN_VIEWED_PAYMENTS',
};

module.exports = { log, getIP, LOG_ACTIONS };
