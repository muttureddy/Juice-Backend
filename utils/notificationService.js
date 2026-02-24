/**
 * NotificationService
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for creating and emitting all notifications.
 * Every notification is:
 *  1. Saved to MongoDB `notifications` collection
 *  2. Emitted in real-time via Socket.io to the right room
 *
 * Notification document shape:
 * {
 *   _id, userId (null = admin-only), type, title, body,
 *   icon, color, link, orderId, data{}, isRead, createdAt
 * }
 */

const { getDB }           = require('../db/connection');
const { emitToUser, emitToAdmins } = require('./socketManager');

// ── Notification type catalogue ─────────────────────────────────────────────
const TYPES = {
  ORDER_PLACED:          'ORDER_PLACED',
  ORDER_STATUS_CHANGED:  'ORDER_STATUS_CHANGED',
  PAYMENT_CONFIRMED:     'PAYMENT_CONFIRMED',
  PAYMENT_PENDING_COD:   'PAYMENT_PENDING_COD',
  NEW_ORDER_ADMIN:       'NEW_ORDER_ADMIN',
};

// Visual config per type
const TYPE_CONFIG = {
  ORDER_PLACED:         { icon: '🎉', color: '#1a7a3c' },
  ORDER_STATUS_CHANGED: { icon: '📦', color: '#ff6b00' },
  PAYMENT_CONFIRMED:    { icon: '💰', color: '#1a7a3c' },
  PAYMENT_PENDING_COD:  { icon: '💵', color: '#f5c842' },
  NEW_ORDER_ADMIN:      { icon: '🛎️', color: '#6366f1' },
};

// Human-readable status labels
const STATUS_LABELS = {
  pending:           'Order Placed',
  confirmed:         'Order Confirmed',
  preparing:         'Being Prepared',
  shipped:           'Shipped',
  out_for_delivery:  'Out for Delivery 🚴',
  delivered:         'Delivered ✅',
  cancelled:         'Order Cancelled',
};

const STATUS_MESSAGES = {
  pending:           'Your order has been received and is awaiting confirmation.',
  confirmed:         'Great news! Your order has been confirmed.',
  preparing:         'Your fresh order is being prepared right now! 🧃',
  shipped:           'Your order has been handed to delivery.',
  out_for_delivery:  'Your order is out for delivery. Almost there!',
  delivered:         'Your order has been delivered. Enjoy your fresh juice! 🥤',
  cancelled:         'Your order has been cancelled. Contact us if this was a mistake.',
};

// Which status = payment confirmed?
const PAYMENT_CONFIRMED_STATUSES = ['confirmed', 'delivered'];

// ── Internal: save notification to DB + emit ─────────────────────────────────
async function createNotification({ userId, type, title, body, link, orderId, data = {}, forAdmins = false }) {
  const cfg = TYPE_CONFIG[type] || { icon: '🔔', color: '#1a7a3c' };

  const doc = {
    userId:    userId   || null,
    type,
    title,
    body,
    icon:      cfg.icon,
    color:     cfg.color,
    link:      link || null,
    orderId:   orderId || null,
    data,
    isRead:    false,
    createdAt: new Date(),
  };

  let insertedId;
  try {
    const db = getDB();
    const result = await db.collection('notifications').insertOne({ ...doc });
    insertedId = result.insertedId;
    doc._id = insertedId;
  } catch (err) {
    console.error('⚠️  Failed to save notification to DB:', err.message);
    // Don't crash — still try to emit
  }

  // Emit to user
  if (userId) {
    emitToUser(String(userId), doc);
  }

  // Emit to admins room
  if (forAdmins) {
    emitToAdmins('admin_notification', doc);
  }

  return doc;
}

// ── Public helper: notify user of order status change ───────────────────────
async function notifyOrderStatus({ userId, orderId, orderShortId, newStatus, paymentMethod, totalAmount }) {
  const title   = STATUS_LABELS[newStatus]   || `Order ${newStatus}`;
  const body    = STATUS_MESSAGES[newStatus] || `Your order status has been updated to ${newStatus}.`;
  const link    = `/orders`;          // clicking goes to order history

  await createNotification({
    userId, type: TYPES.ORDER_STATUS_CHANGED,
    title, body, link, orderId,
    data: { orderId, orderShortId, newStatus, paymentMethod, totalAmount },
  });

  // Additional payment confirmation notification for non-COD on confirmed/delivered
  if (PAYMENT_CONFIRMED_STATUSES.includes(newStatus) && paymentMethod !== 'cod') {
    await createNotification({
      userId, type: TYPES.PAYMENT_CONFIRMED,
      title:  'Payment Confirmed ✅',
      body:   `Your payment of ₹${totalAmount} has been confirmed for order #${orderShortId}.`,
      link:   `/orders`,
      orderId,
      data:   { orderId, orderShortId, newStatus, paymentMethod, totalAmount },
    });
  }

  // COD payment reminder when delivered
  if (newStatus === 'delivered' && paymentMethod === 'cod') {
    await createNotification({
      userId, type: TYPES.PAYMENT_PENDING_COD,
      title:  'Payment Due 💵',
      body:   `Please pay ₹${totalAmount} to the delivery person for order #${orderShortId}.`,
      link:   `/orders`,
      orderId,
      data:   { orderId, orderShortId, paymentMethod, totalAmount },
    });
  }
}

// ── Public helper: notify user when their order is placed ───────────────────
async function notifyOrderPlaced({ userId, orderId, orderShortId, totalAmount, itemCount }) {
  await createNotification({
    userId, type: TYPES.ORDER_PLACED,
    title:  'Order Placed! 🎉',
    body:   `Your order of ${itemCount} item${itemCount > 1 ? 's' : ''} worth ₹${totalAmount} has been placed successfully. We'll confirm it shortly.`,
    link:   `/orders`,
    orderId,
    data:   { orderId, orderShortId, totalAmount, itemCount },
  });
}

// ── Public helper: notify all admins of a new order ─────────────────────────
async function notifyAdminNewOrder({ orderId, orderShortId, customerName, customerPhone, totalAmount, itemCount, paymentMethod }) {
  await createNotification({
    userId:    null,      // no specific user
    forAdmins: true,
    type:      TYPES.NEW_ORDER_ADMIN,
    title:     'New Order Received 🛎️',
    body:      `${customerName || 'A customer'} placed an order for ₹${totalAmount} (${itemCount} item${itemCount > 1 ? 's' : ''}) · ${paymentMethod?.toUpperCase()}`,
    link:      `/admin/orders`,
    orderId,
    data:      { orderId, orderShortId, customerName, customerPhone, totalAmount, itemCount, paymentMethod },
  });
}

module.exports = {
  TYPES,
  notifyOrderStatus,
  notifyOrderPlaced,
  notifyAdminNewOrder,
  createNotification,
};
