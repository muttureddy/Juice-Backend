const express = require('express');
const router  = express.Router();
const { ObjectId } = require('mongodb');
const { getDB }    = require('../db/connection');
const { verifyToken } = require('../middleware/auth');
const { log, getIP, LOG_ACTIONS } = require('../utils/logger');
const { notifyOrderPlaced, notifyAdminNewOrder } = require('../utils/notificationService');

router.post('/', verifyToken, async (req, res) => {
  try {
    const { items, deliveryDetails, paymentMethod, totalAmount, deliveryFee } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0)
      return res.status(400).json({ message: 'Order must contain at least one item.' });
    if (!deliveryDetails?.name || !deliveryDetails?.phone || !deliveryDetails?.address)
      return res.status(400).json({ message: 'Delivery details (name, phone, address) are required.' });
    if (!totalAmount || isNaN(totalAmount))
      return res.status(400).json({ message: 'Valid total amount is required.' });

    const db    = getDB();
    const order = {
      userId: new ObjectId(req.user.userId),
      items: items.map(i => ({
        productId: i.productId ? String(i.productId) : null,
        name: i.name, price: Number(i.price), quantity: Number(i.quantity),
        imageUrl: i.imageUrl || null,
        lineTotal: Number(i.price) * Number(i.quantity),
      })),
      deliveryDetails: {
        name: deliveryDetails.name, phone: deliveryDetails.phone,
        address: deliveryDetails.address,
        city: deliveryDetails.city || '', pincode: deliveryDetails.pincode || '',
      },
      paymentMethod: paymentMethod || 'cod',
      totalAmount:   Number(totalAmount),
      deliveryFee:   Number(deliveryFee) || 0,
      status:        'pending',
      statusHistory: [{ status: 'pending', changedAt: new Date(), note: 'Order placed by customer' }],
      createdAt:     new Date(), updatedAt: new Date(),
    };

    const result   = await db.collection('orders').insertOne(order);
    order._id      = result.insertedId;
    const shortId  = result.insertedId.toString().slice(-8).toUpperCase();

    // Fire notifications async — never block the response
    Promise.all([
      notifyOrderPlaced({
        userId: req.user.userId, orderId: result.insertedId,
        orderShortId: shortId, totalAmount: order.totalAmount, itemCount: items.length,
      }),
      notifyAdminNewOrder({
        orderId: result.insertedId, orderShortId: shortId,
        customerName: deliveryDetails.name, customerPhone: deliveryDetails.phone,
        totalAmount: order.totalAmount, itemCount: items.length, paymentMethod: order.paymentMethod,
      }),
    ]).catch(e => console.error('Notification error (non-fatal):', e.message));

    await log({
      action: LOG_ACTIONS.ORDER_CREATED, entityType: 'order', entityId: result.insertedId,
      actorId: req.user.userId, actorPhone: req.user.phone, actorRole: req.user.role,
      details: { totalAmount, itemCount: items.length, paymentMethod: order.paymentMethod },
      ip: getIP(req),
    });

    res.status(201).json({ message: 'Order placed successfully.', order });
  } catch (err) {
    console.error('Create order error:', err.message);
    res.status(500).json({ message: 'Failed to place order. Please try again.' });
  }
});

router.get('/my', verifyToken, async (req, res) => {
  try {
    const orders = await getDB().collection('orders')
      .find({ userId: new ObjectId(req.user.userId) })
      .sort({ createdAt: -1 }).toArray();
    res.json({ orders });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch orders.' });
  }
});

router.get('/:id', verifyToken, async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id))
      return res.status(400).json({ message: 'Invalid order ID.' });
    const order = await getDB().collection('orders').findOne({
      _id: new ObjectId(req.params.id), userId: new ObjectId(req.user.userId),
    });
    if (!order) return res.status(404).json({ message: 'Order not found.' });
    res.json({ order });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch order.' });
  }
});

module.exports = router;
