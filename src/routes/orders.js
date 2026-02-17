/**
 * routes/orders.js
 * ─────────────────────────────────────────────────────
 * PURPOSE: Customer order placement and tracking.
 *
 * ROUTES (authenticated users):
 *   POST  /api/orders             – place new order
 *   GET   /api/orders/my-orders   – user's order list
 *   GET   /api/orders/:id         – single order detail
 *   PATCH /api/orders/:id/cancel  – cancel an order
 *
 * ORDER DOCUMENT SHAPE (collection: "orders"):
 *   orderId          – auto-generated  "FRH" + timestamp
 *   userId           – ObjectId of the logged-in user
 *   customerDetails  – { name, phone, address }
 *   items[]          – [ { productId, name, image, price, quantity } ]
 *   subtotal, deliveryFee, discount, total
 *   paymentMethod    – 'cod' | 'upi' | 'online'
 *   paymentStatus    – 'pending' | 'paid' | 'failed' | 'refunded'
 *   orderStatus      – 'pending' → 'confirmed' → 'preparing'
 *                      → 'shipped' → 'out_for_delivery' → 'delivered'
 *                      OR 'cancelled'
 *   statusHistory[]  – [ { status, note, timestamp } ]
 *   estimatedDelivery, deliveredAt, notes
 *   createdAt, updatedAt
 *
 * DELIVERY FEE:
 *   Free  when subtotal ≥ ₹299, else ₹40.
 *   Change the threshold / fee below in DELIVERY_THRESHOLD.
 * ─────────────────────────────────────────────────────
 */

const express = require('express');
const router  = express.Router();
const { getDB, toObjectId, ObjectId } = require('../db');
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

    // Verify each product and calculate subtotal
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
    res.status(201).json({
      message: 'Order placed successfully!',
      order: { ...order, _id: result.insertedId },
    });
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

    // Accept either MongoDB _id or our custom orderId string
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
        message: `Cannot cancel order with status: ${order.orderStatus}`
      });
    }

    const now       = new Date();
    const newStatus = {
      status: 'cancelled', note: 'Cancelled by customer', timestamp: now
    };

    const result = await db.collection('orders').findOneAndUpdate(
      { _id },
      {
        $set: { orderStatus: 'cancelled', updatedAt: now },
        $push: { statusHistory: newStatus },
      },
      { returnDocument: 'after' }
    );

    res.json({ message: 'Order cancelled', order: result });
  } catch (err) {
    res.status(500).json({ message: 'Failed to cancel order' });
  }
});

module.exports = router;
