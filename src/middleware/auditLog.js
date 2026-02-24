/**
 * middleware/auditLog.js
 * ─────────────────────────────────────────────────────
 * PURPOSE: Records admin/user actions into the auditLogs collection.
 *
 * USAGE:
 *   const { logAction } = require('../middleware/auditLog');
 *   await logAction(req.user, 'order_status', 'Order', orderId, { from, to }, req);
 *
 * FIELDS STORED:
 *   action     – e.g. 'login', 'order_status', 'product_added'
 *   entityType – e.g. 'Order', 'Product', 'User', 'Auth', 'Payment'
 *   entityId   – MongoDB _id or orderId string
 *   userPhone  – phone of the actor
 *   userRole   – 'user' | 'admin'
 *   details    – free-form object (status changes, diffs, etc.)
 *   ip         – client IP
 *   createdAt  – timestamp
 * ─────────────────────────────────────────────────────
 */

const { getDB } = require('../db');

const logAction = async (user, action, entityType, entityId, details, req) => {
  try {
    const db = getDB();
    await db.collection('auditLogs').insertOne({
      action,
      entityType:  entityType || null,
      entityId:    entityId ? entityId.toString() : null,
      userPhone:   user?.phone  || null,
      userRole:    user?.role   || null,
      details:     details || {},
      ip:          req?.headers?.['x-forwarded-for'] || req?.connection?.remoteAddress || null,
      createdAt:   new Date(),
    });
  } catch (e) {
    // Never let logging crash the main request
    console.error('⚠️  Audit log write failed:', e.message);
  }
};

module.exports = { logAction };
