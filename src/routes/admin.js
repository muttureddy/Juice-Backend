/**
 * routes/admin.js  —  ProteinSpot
 * ─────────────────────────────────────────────────────
 * PURPOSE: All admin-only endpoints.
 * All routes require adminAuth (JWT with role === 'admin').
 *
 * SECTIONS:
 *   1. DASHBOARD   GET  /api/admin/dashboard
 *   2. ORDERS      GET/PATCH /api/admin/orders
 *   3. USERS       GET/PATCH/DELETE /api/admin/users
 *   4. INVENTORY   GET/PATCH /api/admin/inventory
 *   5. AUDIT LOGS  GET  /api/admin/audit-logs
 *   6. PAYMENTS    GET  /api/admin/payments
 *   7. SETUP       POST /api/admin/setup
 * ─────────────────────────────────────────────────────
 */

const express = require('express');
const router  = express.Router();
const { getDB, toObjectId }          = require('../db');
const { adminAuth, invalidateUserCache } = require('../middleware/auth');
const { logAction }                  = require('../middleware/auditLog');

const VALID_STATUSES = [
  'pending', 'confirmed', 'preparing',
  'shipped', 'out_for_delivery', 'delivered', 'cancelled',
];

// ══ 1. DASHBOARD ══════════════════════════════════════

router.get('/dashboard', adminAuth, async (req, res) => {
  try {
    const db    = getDB();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tom   = new Date(today); tom.setDate(tom.getDate() + 1);

    const [
      totalOrders, todayOrders, totalUsers, totalProducts,
      revenueResult, ordersByStatus, recentOrders, lowStockCount,
    ] = await Promise.all([
      db.collection('orders').countDocuments(),
      db.collection('orders').countDocuments({ createdAt: { $gte: today, $lt: tom } }),
      db.collection('users').countDocuments({ role: 'user' }),
      db.collection('products').countDocuments({ isAvailable: true }),

      db.collection('orders').aggregate([
        { $match: { orderStatus: { $ne: 'cancelled' } } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]).toArray(),

      db.collection('orders').aggregate([
        { $group: { _id: '$orderStatus', count: { $sum: 1 } } },
      ]).toArray(),

      db.collection('orders').aggregate([
        { $sort: { createdAt: -1 } },
        { $limit: 5 },
        { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'user' } },
        { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
        { $project: {
          orderId: 1, total: 1, orderStatus: 1, createdAt: 1,
          'customerDetails.name': 1, 'customerDetails.phone': 1,
          'user.name': 1, 'user.phone': 1,
        }},
      ]).toArray(),

      db.collection('products').countDocuments({ stock: { $lt: 10 } }),
    ]);

    res.json({
      stats: {
        totalOrders, todayOrders, totalUsers, totalProducts,
        totalRevenue: revenueResult[0]?.total || 0,
        lowStockCount,
      },
      ordersByStatus,
      recentOrders,
    });
  } catch (err) {
    res.status(500).json({ message: 'Dashboard fetch failed', error: err.message });
  }
});

// ══ 2. ORDERS ═════════════════════════════════════════

router.get('/orders', adminAuth, async (req, res) => {
  try {
    const { status, page = 1, limit = 15, search } = req.query;
    const db    = getDB();
    const query = {};

    if (status && status !== 'all') query.orderStatus = status;
    if (search) {
      query.$or = [
        { orderId:                  { $regex: search, $options: 'i' } },
        { 'customerDetails.name':  { $regex: search, $options: 'i' } },
        { 'customerDetails.phone': { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [orders, total] = await Promise.all([
      db.collection('orders').find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).toArray(),
      db.collection('orders').countDocuments(query),
    ]);

    res.json({ orders, total, pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch orders' });
  }
});

router.get('/orders/:id', adminAuth, async (req, res) => {
  try {
    const _id = toObjectId(req.params.id);
    const db  = getDB();
    const order = await db.collection('orders').findOne(
      _id ? { $or: [{ _id }, { orderId: req.params.id }] } : { orderId: req.params.id }
    );
    if (!order) return res.status(404).json({ message: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch order' });
  }
});

router.patch('/orders/:id/status', adminAuth, async (req, res) => {
  try {
    const { status, note } = req.body;
    if (!VALID_STATUSES.includes(status))
      return res.status(400).json({ message: 'Invalid order status' });

    const _id = toObjectId(req.params.id);
    if (!_id) return res.status(400).json({ message: 'Invalid order ID' });

    const db  = getDB();
    const now = new Date();
    const setFields = { orderStatus: status, updatedAt: now };
    if (status === 'delivered') {
      setFields.deliveredAt   = now;
      setFields.paymentStatus = 'paid';
    }

    const existing = await db.collection('orders').findOne({ _id }, { projection: { orderStatus: 1 } });

    const result = await db.collection('orders').findOneAndUpdate(
      { _id },
      {
        $set:  setFields,
        $push: { statusHistory: { status, note: note || `Updated to ${status}`, timestamp: now } },
      },
      { returnDocument: 'after' }
    );

    if (!result) return res.status(404).json({ message: 'Order not found' });

    await logAction(req.user, 'order_status', 'Order', req.params.id,
      { from: existing?.orderStatus, to: status }, req);

    res.json({ message: `Status → ${status}`, order: result });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update order status' });
  }
});

// ══ 3. USERS ══════════════════════════════════════════

router.get('/users', adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 20, search, role } = req.query;
    const db    = getDB();
    const query = {};

    if (role)   query.role = role;
    if (search) {
      query.$or = [
        { name:  { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [users, total] = await Promise.all([
      db.collection('users').find(query, { projection: { otp: 0 } }).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).toArray(),
      db.collection('users').countDocuments(query),
    ]);

    res.json({ users, total, pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch users' });
  }
});

router.get('/users/:id', adminAuth, async (req, res) => {
  try {
    const _id = toObjectId(req.params.id);
    if (!_id) return res.status(400).json({ message: 'Invalid user ID' });

    const db   = getDB();
    const user = await db.collection('users').findOne({ _id }, { projection: { otp: 0 } });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const [orderCount, spendResult] = await Promise.all([
      db.collection('orders').countDocuments({ userId: _id }),
      db.collection('orders').aggregate([
        { $match: { userId: _id, orderStatus: { $ne: 'cancelled' } } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]).toArray(),
    ]);

    res.json({ ...user, orderCount, totalSpend: spendResult[0]?.total || 0 });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch user' });
  }
});

router.patch('/users/:id/role', adminAuth, async (req, res) => {
  try {
    const _id = toObjectId(req.params.id);
    if (!_id) return res.status(400).json({ message: 'Invalid user ID' });

    const { role } = req.body;
    if (!['user', 'admin'].includes(role))
      return res.status(400).json({ message: 'Role must be "user" or "admin"' });

    const db   = getDB();
    const user = await db.collection('users').findOneAndUpdate(
      { _id },
      { $set: { role, updatedAt: new Date() } },
      { returnDocument: 'after', projection: { otp: 0 } }
    );

    if (!user) return res.status(404).json({ message: 'User not found' });
    invalidateUserCache(req.params.id);
    await logAction(req.user, 'role_changed', 'User', req.params.id, { newRole: role }, req);
    res.json({ message: `Role updated to ${role}`, user });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update role' });
  }
});

router.delete('/users/:id', adminAuth, async (req, res) => {
  try {
    const _id = toObjectId(req.params.id);
    if (!_id) return res.status(400).json({ message: 'Invalid user ID' });

    if (_id.toString() === req.user._id.toString())
      return res.status(400).json({ message: 'Cannot delete your own account' });

    const db = getDB();
    const [userDel, ordersDel] = await Promise.all([
      db.collection('users').deleteOne({ _id }),
      db.collection('orders').deleteMany({ userId: _id }),
    ]);

    if (userDel.deletedCount === 0)
      return res.status(404).json({ message: 'User not found' });

    invalidateUserCache(req.params.id);
    await logAction(req.user, 'user_deleted', 'User', req.params.id, {}, req);
    res.json({ message: 'User and their orders deleted', ordersDeleted: ordersDel.deletedCount });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete user' });
  }
});

// ══ 4. INVENTORY ══════════════════════════════════════

router.get('/inventory', adminAuth, async (req, res) => {
  try {
    const { category, lowStock } = req.query;
    const db    = getDB();
    const query = {};

    // category supports comma-separated or repeated params
    if (category) {
      const cats = Array.isArray(category) ? category : category.split(',').map(c => c.trim()).filter(Boolean);
      query.category = cats.length === 1 ? cats[0] : { $in: cats };
    }
    if (lowStock === 'true') query.stock = { $lt: 10 };

    const products = await db.collection('products').find(query).sort({ stock: 1, name: 1 }).toArray();

    const summary = {
      total:      products.length,
      outOfStock: products.filter(p => p.stock === 0).length,
      lowStock:   products.filter(p => p.stock > 0 && p.stock < 10).length,
      inStock:    products.filter(p => p.stock >= 10).length,
    };

    res.json({ products, summary });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch inventory' });
  }
});

router.patch('/inventory/:id', adminAuth, async (req, res) => {
  try {
    const _id = toObjectId(req.params.id);
    if (!_id) return res.status(400).json({ message: 'Invalid product ID' });

    const { stock, isAvailable } = req.body;
    const update = { updatedAt: new Date() };
    if (stock       !== undefined) update.stock       = Math.max(0, parseInt(stock, 10));
    if (isAvailable !== undefined) update.isAvailable = Boolean(isAvailable);

    const db     = getDB();
    const result = await db.collection('products').findOneAndUpdate(
      { _id },
      { $set: update },
      { returnDocument: 'after' }
    );

    if (!result) return res.status(404).json({ message: 'Product not found' });
    res.json({ message: 'Inventory updated', product: result });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update inventory' });
  }
});

// ══ 5. AUDIT LOGS ══════════════════════════════════════

router.get('/audit-logs', adminAuth, async (req, res) => {
  try {
    const { action, entity, role, search, page = 1, limit = 20 } = req.query;
    const db    = getDB();
    const query = {};

    if (action && action !== 'all')              query.action     = action;
    if (entity && entity !== 'All Entities')     query.entityType = entity;
    if (role   && role   !== 'all')              query.userRole   = role;
    if (search) {
      query.$or = [
        { userPhone: { $regex: search, $options: 'i' } },
        { entityId:  { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [logs, total] = await Promise.all([
      db.collection('auditLogs').find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).toArray(),
      db.collection('auditLogs').countDocuments(query),
    ]);

    res.json({ logs, total, pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch audit logs', error: err.message });
  }
});

// ══ 6. PAYMENTS ═══════════════════════════════════════

router.get('/payments', adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, method } = req.query;
    const db    = getDB();
    const query = {};
    if (status) query.paymentStatus = status;
    if (method) query.paymentMethod = method;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [payments, total] = await Promise.all([
      db.collection('orders').find(query, {
        projection: {
          orderId: 1, total: 1, paymentMethod: 1, paymentStatus: 1,
          orderStatus: 1, createdAt: 1,
          'customerDetails.name': 1, 'customerDetails.phone': 1,
        },
      }).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).toArray(),
      db.collection('orders').countDocuments(query),
    ]);

    const [totalRevenue, pendingCount, paidCount] = await Promise.all([
      db.collection('orders').aggregate([
        { $match: { paymentStatus: 'paid' } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]).toArray(),
      db.collection('orders').countDocuments({ paymentStatus: 'pending' }),
      db.collection('orders').countDocuments({ paymentStatus: 'paid'    }),
    ]);

    res.json({
      payments, total,
      pages: Math.ceil(total / parseInt(limit)),
      stats: {
        totalRevenue: totalRevenue[0]?.total || 0,
        pendingCount,
        paidCount,
      },
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch payments', error: err.message });
  }
});

// ══ 7. SETUP (one-time admin promotion) ═══════════════

router.post('/setup', async (req, res) => {
  try {
    const { phone, secretKey } = req.body;
    const expectedKey = process.env.ADMIN_SECRET_KEY || 'PROTEINSPOT_ADMIN_2024';

    if (secretKey !== expectedKey)
      return res.status(403).json({ message: 'Invalid secret key' });

    const db     = getDB();
    const result = await db.collection('users').findOneAndUpdate(
      { phone },
      {
        $set:         { role: 'admin', updatedAt: new Date() },
        $setOnInsert: { phone, name: 'Admin', isVerified: true, createdAt: new Date() },
      },
      { upsert: true, returnDocument: 'after', projection: { otp: 0 } }
    );

    res.json({ message: 'Admin account ready', phone: result.phone });
  } catch (err) {
    res.status(500).json({ message: 'Setup failed', error: err.message });
  }
});

module.exports = router;
