const express = require('express');
const router  = express.Router();
const { ObjectId } = require('mongodb');
const { getDB }    = require('../db/connection');
const { verifyToken, verifyAdmin } = require('../middleware/auth');
const { upload, uploadToCloudinary, deleteFromCloudinary, isCloudinaryConfigured } = require('../middleware/upload');
const { log, getIP, LOG_ACTIONS } = require('../utils/logger');
const { notifyOrderStatus }       = require('../utils/notificationService');

// Every admin route: must be logged in AND admin
router.use(verifyToken, verifyAdmin);

// ── GET /api/admin/stats ────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const db = getDB();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [totalOrders, todayOrders, totalUsers, revenueAgg] = await Promise.all([
      db.collection('orders').countDocuments(),
      db.collection('orders').countDocuments({ createdAt: { $gte: todayStart } }),
      db.collection('users').countDocuments({ role: 'user' }),
      db.collection('orders').aggregate([
        { $match: { status: { $ne: 'cancelled' } } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]).toArray(),
    ]);

    res.json({ totalOrders, todayOrders, totalUsers, totalRevenue: revenueAgg[0]?.total || 0 });
  } catch (err) {
    console.error('Stats error:', err.message);
    res.status(500).json({ message: 'Failed to fetch stats.' });
  }
});

// ── GET /api/admin/orders ───────────────────────────────────────────────────
router.get('/orders', async (req, res) => {
  try {
    const { limit, status, search } = req.query;
    const db = getDB();

    const filter = {};
    if (status && status !== 'all') filter.status = status;
    if (search) {
      filter.$or = [
        { 'deliveryDetails.name':  { $regex: search, $options: 'i' } },
        { 'deliveryDetails.phone': { $regex: search, $options: 'i' } },
      ];
    }

    const orders = await db.collection('orders')
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(limit ? parseInt(limit) : 500)
      .toArray();

    await log({
      action: LOG_ACTIONS.ADMIN_VIEWED_ORDERS, entityType: 'order',
      actorId: req.user.userId, actorPhone: req.user.phone, actorRole: 'admin',
      details: { count: orders.length }, ip: getIP(req),
    });

    res.json({ orders });
  } catch (err) {
    console.error('Admin get orders error:', err.message);
    res.status(500).json({ message: 'Failed to fetch orders.' });
  }
});

// ── PUT /api/admin/orders/:id/status ───────────────────────────────────────
router.put('/orders/:id/status', async (req, res) => {
  try {
    const { status, note } = req.body;
    const VALID = ['pending','confirmed','preparing','shipped','out_for_delivery','delivered','cancelled'];
    if (!status || !VALID.includes(status))
      return res.status(400).json({ message: `Invalid status. Valid values: ${VALID.join(', ')}` });
    if (!ObjectId.isValid(req.params.id))
      return res.status(400).json({ message: 'Invalid order ID.' });

    const db = getDB();
    const order = await db.collection('orders').findOne({ _id: new ObjectId(req.params.id) });
    if (!order) return res.status(404).json({ message: 'Order not found.' });

    const prevStatus = order.status;
    await db.collection('orders').updateOne(
      { _id: new ObjectId(req.params.id) },
      {
        $set:  { status, updatedAt: new Date() },
        $push: { statusHistory: { status, changedAt: new Date(), changedBy: req.user.phone, note: note || '' } },
      }
    );

    await log({
      action: LOG_ACTIONS.ORDER_STATUS_CHANGED, entityType: 'order', entityId: req.params.id,
      actorId: req.user.userId, actorPhone: req.user.phone, actorRole: 'admin',
      details: { from: prevStatus, to: status, note: note||'', customerPhone: order.deliveryDetails?.phone, orderTotal: order.totalAmount },
      ip: getIP(req),
    });

    // Notify the customer in real-time (fire-and-forget)
    notifyOrderStatus({
      userId:       String(order.userId),
      orderId:      req.params.id,
      orderShortId: req.params.id.slice(-8).toUpperCase(),
      newStatus:    status,
      paymentMethod: order.paymentMethod,
      totalAmount:  order.totalAmount,
    }).catch(e => console.error('Notification error (non-fatal):', e.message));

    res.json({ message: `Order status updated: ${prevStatus} → ${status}` });
  } catch (err) {
    console.error('Update order status error:', err.message);
    res.status(500).json({ message: 'Failed to update order status.' });
  }
});

// ── GET /api/admin/payments ─────────────────────────────────────────────────
router.get('/payments', async (req, res) => {
  try {
    const db = getDB();
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

    const [orders, revenueAgg, todayAgg] = await Promise.all([
      db.collection('orders').find({}).sort({ createdAt: -1 }).toArray(),
      db.collection('orders').aggregate([
        { $match: { status: { $ne: 'cancelled' } } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]).toArray(),
      db.collection('orders').aggregate([
        { $match: { status: { $ne: 'cancelled' }, createdAt: { $gte: todayStart } } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]).toArray(),
    ]);

    const nonCancelled = orders.filter(o => o.status !== 'cancelled');
    const total        = nonCancelled.length;
    const codCount     = nonCancelled.filter(o => o.paymentMethod === 'cod').length;

    await log({
      action: LOG_ACTIONS.ADMIN_VIEWED_PAYMENTS, entityType: 'payment',
      actorId: req.user.userId, actorPhone: req.user.phone, actorRole: 'admin',
      ip: getIP(req),
    });

    res.json({
      orders,
      totalRevenue:   revenueAgg[0]?.total || 0,
      todayRevenue:   todayAgg[0]?.total   || 0,
      codPercent:     total ? Math.round((codCount / total) * 100) : 0,
      onlinePercent:  total ? Math.round(((total - codCount) / total) * 100) : 0,
    });
  } catch (err) {
    console.error('Payments error:', err.message);
    res.status(500).json({ message: 'Failed to fetch payment data.' });
  }
});

// ── GET /api/admin/products ─────────────────────────────────────────────────
router.get('/products', async (req, res) => {
  try {
    const products = await getDB().collection('products').find({}).sort({ createdAt: -1 }).toArray();
    res.json({ products });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch products.' });
  }
});

// ── POST /api/admin/products ─────────────────────────────────────────────────
router.post('/products', upload.single('image'), async (req, res) => {
  try {
    const { name, description, price, originalPrice, category, type,
            volume, prepTime, isBestseller, discountPercent, isActive } = req.body;

    if (!name || !price || !category)
      return res.status(400).json({ message: 'Name, price, and category are required.' });
    if (isNaN(price) || Number(price) <= 0)
      return res.status(400).json({ message: 'Price must be a positive number.' });

    // Upload image to Cloudinary if file attached and credentials available
    let imageUrl = null, imagePublicId = null;
    if (req.file) {
      if (isCloudinaryConfigured()) {
        const result = await uploadToCloudinary(req.file.buffer);
        imageUrl      = result.url;
        imagePublicId = result.publicId;
      } else {
        console.warn('⚠️  Cloudinary not configured — image not stored');
      }
    }

    const db = getDB();
    const product = {
      name: name.trim(), description: (description || '').trim(),
      price: parseFloat(price), originalPrice: originalPrice ? parseFloat(originalPrice) : null,
      category, type: type || 'juices', volume: volume || '', prepTime: prepTime || '',
      isBestseller: isBestseller === 'true' || isBestseller === true,
      discountPercent: parseInt(discountPercent) || 0,
      isActive: isActive !== 'false' && isActive !== false,
      imageUrl, imagePublicId, createdAt: new Date(), updatedAt: new Date(),
    };

    const result = await db.collection('products').insertOne(product);
    product._id = result.insertedId;

    await log({
      action: LOG_ACTIONS.PRODUCT_CREATED, entityType: 'product', entityId: result.insertedId,
      actorId: req.user.userId, actorPhone: req.user.phone, actorRole: 'admin',
      details: { name: product.name, price: product.price, category }, ip: getIP(req),
    });

    res.status(201).json({ message: 'Product created.', product });
  } catch (err) {
    console.error('Create product error:', err.message);
    res.status(500).json({ message: 'Failed to create product.' });
  }
});

// ── PUT /api/admin/products/:id ──────────────────────────────────────────────
router.put('/products/:id', upload.single('image'), async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id))
      return res.status(400).json({ message: 'Invalid product ID.' });

    const db = getDB();
    const existing = await db.collection('products').findOne({ _id: new ObjectId(req.params.id) });
    if (!existing) return res.status(404).json({ message: 'Product not found.' });

    const { name, description, price, originalPrice, category, type,
            volume, prepTime, isBestseller, discountPercent, isActive } = req.body;

    const updates = {
      name:            (name || existing.name).trim(),
      description:     description !== undefined ? description.trim() : existing.description,
      price:           price ? parseFloat(price) : existing.price,
      originalPrice:   originalPrice ? parseFloat(originalPrice) : existing.originalPrice,
      category:        category  || existing.category,
      type:            type      || existing.type,
      volume:          volume    !== undefined ? volume    : existing.volume,
      prepTime:        prepTime  !== undefined ? prepTime  : existing.prepTime,
      isBestseller:    isBestseller !== undefined ? (isBestseller === 'true' || isBestseller === true) : existing.isBestseller,
      discountPercent: discountPercent !== undefined ? parseInt(discountPercent) : existing.discountPercent,
      isActive:        isActive  !== undefined ? (isActive !== 'false' && isActive !== false) : existing.isActive,
      updatedAt:       new Date(),
    };

    // New image uploaded: delete old from Cloudinary, upload new
    if (req.file) {
      await deleteFromCloudinary(existing.imagePublicId);
      if (isCloudinaryConfigured()) {
        const result = await uploadToCloudinary(req.file.buffer);
        updates.imageUrl      = result.url;
        updates.imagePublicId = result.publicId;
      }
    }

    await db.collection('products').updateOne({ _id: new ObjectId(req.params.id) }, { $set: updates });

    await log({
      action: LOG_ACTIONS.PRODUCT_UPDATED, entityType: 'product', entityId: req.params.id,
      actorId: req.user.userId, actorPhone: req.user.phone, actorRole: 'admin',
      details: { before: { name: existing.name, price: existing.price }, after: { name: updates.name, price: updates.price }, imageChanged: !!req.file },
      ip: getIP(req),
    });

    res.json({ message: 'Product updated.' });
  } catch (err) {
    console.error('Update product error:', err.message);
    res.status(500).json({ message: 'Failed to update product.' });
  }
});

// ── DELETE /api/admin/products/:id ───────────────────────────────────────────
router.delete('/products/:id', async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id))
      return res.status(400).json({ message: 'Invalid product ID.' });

    const db = getDB();
    const product = await db.collection('products').findOne({ _id: new ObjectId(req.params.id) });
    if (!product) return res.status(404).json({ message: 'Product not found.' });

    await deleteFromCloudinary(product.imagePublicId);
    await db.collection('products').deleteOne({ _id: new ObjectId(req.params.id) });

    await log({
      action: LOG_ACTIONS.PRODUCT_DELETED, entityType: 'product', entityId: req.params.id,
      actorId: req.user.userId, actorPhone: req.user.phone, actorRole: 'admin',
      details: { name: product.name, price: product.price }, ip: getIP(req),
    });

    res.json({ message: 'Product deleted.' });
  } catch (err) {
    console.error('Delete product error:', err.message);
    res.status(500).json({ message: 'Failed to delete product.' });
  }
});

// ── PATCH /api/admin/products/:id/toggle ────────────────────────────────────
router.patch('/products/:id/toggle', async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id))
      return res.status(400).json({ message: 'Invalid product ID.' });

    const db = getDB();
    const product = await db.collection('products').findOne({ _id: new ObjectId(req.params.id) });
    if (!product) return res.status(404).json({ message: 'Product not found.' });

    const newState = !product.isActive;
    await db.collection('products').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { isActive: newState, updatedAt: new Date() } }
    );

    await log({
      action: LOG_ACTIONS.PRODUCT_TOGGLED, entityType: 'product', entityId: req.params.id,
      actorId: req.user.userId, actorPhone: req.user.phone, actorRole: 'admin',
      details: { name: product.name, isActive: newState }, ip: getIP(req),
    });

    res.json({ message: `Product ${newState ? 'shown' : 'hidden'}.`, isActive: newState });
  } catch (err) {
    console.error('Toggle product error:', err.message);
    res.status(500).json({ message: 'Failed to toggle product.' });
  }
});

// ── GET /api/admin/users ─────────────────────────────────────────────────────
router.get('/users', async (req, res) => {
  try {
    const users = await getDB().collection('users')
      .find({}, { projection: { _id:1, phone:1, name:1, email:1, role:1, createdAt:1, lastLoginAt:1 } })
      .sort({ createdAt: -1 }).toArray();
    res.json({ users });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch users.' });
  }
});

// ── PATCH /api/admin/users/:id/role ─────────────────────────────────────────
router.patch('/users/:id/role', async (req, res) => {
  try {
    const { role } = req.body;
    if (!['user','admin'].includes(role))
      return res.status(400).json({ message: 'Role must be "user" or "admin".' });
    if (!ObjectId.isValid(req.params.id))
      return res.status(400).json({ message: 'Invalid user ID.' });

    const db = getDB();
    const target = await db.collection('users').findOne({ _id: new ObjectId(req.params.id) });
    if (!target) return res.status(404).json({ message: 'User not found.' });

    await db.collection('users').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { role, updatedAt: new Date() } }
    );

    await log({
      action: LOG_ACTIONS.USER_ROLE_CHANGED, entityType: 'user', entityId: req.params.id,
      actorId: req.user.userId, actorPhone: req.user.phone, actorRole: 'admin',
      details: { targetPhone: target.phone, from: target.role, to: role }, ip: getIP(req),
    });

    res.json({ message: `Role changed: ${target.role} → ${role}` });
  } catch (err) {
    console.error('Change role error:', err.message);
    res.status(500).json({ message: 'Failed to change user role.' });
  }
});

// ── GET /api/admin/logs ──────────────────────────────────────────────────────
router.get('/logs', async (req, res) => {
  try {
    const { page = 1, limit = 50, action, entityType } = req.query;
    const db = getDB();

    const filter = {};
    if (action)     filter.action     = action;
    if (entityType) filter.entityType = entityType;

    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const total = await db.collection('logs').countDocuments(filter);
    const logs  = await db.collection('logs')
      .find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).toArray();

    res.json({ logs, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error('Get logs error:', err.message);
    res.status(500).json({ message: 'Failed to fetch logs.' });
  }
});

module.exports = router;
