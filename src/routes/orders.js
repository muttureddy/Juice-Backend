/**
 * routes/orders.js
 * Customer order placement and tracking.
 * Emits Socket.IO events on new orders and cancellations.
 */

const express = require('express');
const router  = express.Router();
const { getDB, toObjectId } = require('../db');
const { auth } = require('../middleware/auth');

const DELIVERY_THRESHOLD = 299;
const DELIVERY_FEE       = 40;

const makeOrderId = () =>
  'FRH' + Date.now().toString().slice(-8) +
  Math.random().toString(36).slice(2, 6).toUpperCase();

// ── POST /  ────────────────────────────────────────────
router.post('/', auth, async (req, res) => {
  try {
    const { items, customerDetails, paymentMethod, notes } = req.body;

    if (!items?.length)
      return res.status(400).json({ message: 'Order must have at least one item' });

    const db = getDB();

    let subtotal   = 0;
    const orderItems = [];

    for (const item of items) {
      const _id     = toObjectId(item.productId);
      const product = _id && await db.collection('products').findOne({ _id });

      if (!product)
        return res.status(404).json({ message: `Product ${item.productId} not found` });
      if (!product.isAvailable)
        return res.status(400).json({ message: `${product.name} is currently unavailable` });

      subtotal += product.price * item.quantity;
      orderItems.push({
        productId: product._id,
        name:      product.name,
        image:     product.image,
        price:     product.price,
        quantity:  item.quantity,
      });
    }

    const deliveryFee = subtotal >= DELIVERY_THRESHOLD ? 0 : DELIVERY_FEE;
    const total       = subtotal + deliveryFee;
    const now         = new Date();

    const order = {
      orderId: makeOrderId(),
      userId:  req.user._id,
      customerDetails,
      items:   orderItems,
      subtotal,
      deliveryFee,
      discount: 0,
      total,
      paymentMethod: paymentMethod || 'cod',
      paymentStatus: 'pending',
      orderStatus:   'pending',
      statusHistory: [{ status: 'pending', note: 'Order placed', timestamp: now }],
      estimatedDelivery: new Date(now.getTime() + 2 * 60 * 60 * 1000),
      deliveredAt: null,
      notes:       notes || '',
      createdAt:   now,
      updatedAt:   now,
    };

    const result = await db.collection('orders').insertOne(order);
    const savedOrder = { ...order, _id: result.insertedId };

    // ── Socket.IO: notify admin of new order ──────────
    const io = req.app.locals.io;
    if (io) {
      io.to('admin').emit('new_order', {
        message: `New order from ${customerDetails?.name || 'customer'} — ₹${total}`,
        orderId: savedOrder._id,
        total,
      });
    }

    res.status(201).json({ message: 'Order placed successfully!', order: savedOrder });
  } catch (err) {
    console.error('Create order error:', err);
    res.status(500).json({ message: 'Failed to place order', error: err.message });
  }
});

// ── GET /my-orders  ────────────────────────────────────
router.get('/my-orders', auth, async (req, res) => {
  try {
    const db     = getDB();
    const orders = await db.collection('orders')
      .find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .toArray();

    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch orders' });
  }
});

// ── GET /:id  ──────────────────────────────────────────
router.get('/:id', auth, async (req, res) => {
  try {
    const db = getDB();
    const filter = {
      $or: [
        { orderId: req.params.id },
        ...(toObjectId(req.params.id) ? [{ _id: toObjectId(req.params.id) }] : []),
      ],
      userId: req.user._id,
    };

    const order = await db.collection('orders').findOne(filter);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    res.json(order);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch order' });
  }
});

// ── PATCH /:id/cancel  ─────────────────────────────────
router.patch('/:id/cancel', auth, async (req, res) => {
  try {
    const _id = toObjectId(req.params.id);
    if (!_id) return res.status(400).json({ message: 'Invalid order ID' });

    const db    = getDB();
    const order = await db.collection('orders').findOne({ _id, userId: req.user._id });

    if (!order) return res.status(404).json({ message: 'Order not found' });

    const nonCancellable = ['delivered', 'shipped', 'out_for_delivery'];
    if (nonCancellable.includes(order.orderStatus)) {
      return res.status(400).json({
        message: `Cannot cancel order with status: ${order.orderStatus}`,
      });
    }

    const now       = new Date();
    const newStatus = { status: 'cancelled', note: 'Cancelled by customer', timestamp: now };

    const result = await db.collection('orders').findOneAndUpdate(
      { _id },
      { $set: { orderStatus: 'cancelled', updatedAt: now }, $push: { statusHistory: newStatus } },
      { returnDocument: 'after' }
    );

    // ── Socket.IO: notify admin of cancellation ──────
    const io = req.app.locals.io;
    if (io) {
      io.to('admin').emit('order_cancelled', {
        message: `Order #${order.orderId} cancelled by customer`,
        orderId: _id,
      });
    }

    res.json({ message: 'Order cancelled', order: result });
  } catch (err) {
    res.status(500).json({ message: 'Failed to cancel order' });
  }
});

module.exports = router;
