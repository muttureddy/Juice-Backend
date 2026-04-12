const express = require('express');
const router = express.Router();
const { getDB, ObjectId } = require('../db');
const { auth } = require('../middleware/auth');

let stripe = null;
try {
  if (process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_SECRET_KEY.includes('xxx')) {
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    console.log('✅ Stripe initialized');
  } else {
    console.log('⚠️  Stripe not configured — using mock mode');
  }
} catch (e) {
  console.log('Stripe not available:', e.message);
}

// POST /api/payment/create-intent
// Creates a Stripe PaymentIntent for a cart
router.post('/create-intent', auth, async (req, res) => {
  try {
    const { items, customerDetails } = req.body;
    if (!items?.length) return res.status(400).json({ message: 'No items provided' });

    const db = getDB();
    let subtotal = 0;
    for (const item of items) {
      const product = await db.collection('products').findOne({ _id: new ObjectId(item.productId) });
      if (!product) return res.status(404).json({ message: `Product ${item.productId} not found` });
      subtotal += product.price * item.quantity;
    }
    const deliveryFee = subtotal >= 299 ? 0 : 40;
    const total = subtotal + deliveryFee;
    const amountInPaise = Math.round(total * 100); // Stripe uses smallest currency unit

    if (!stripe) {
      // Dev mock — return fake client secret
      return res.json({
        clientSecret: `mock_pi_${Date.now()}_secret_mock`,
        paymentIntentId: `mock_pi_${Date.now()}`,
        amount: total,
        currency: 'inr',
        isMock: true
      });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInPaise,
      currency: 'inr',
      metadata: {
        userId: req.user._id.toString(),
        customerName: customerDetails?.name || '',
        customerPhone: customerDetails?.phone || ''
      },
      description: `Protein Spot Order — ${customerDetails?.name || 'Customer'}`,
      automatic_payment_methods: { enabled: true }
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: total,
      currency: 'inr'
    });
  } catch (err) {
    console.error('Stripe error:', err);
    res.status(500).json({ message: 'Payment initiation failed', error: err.message });
  }
});

// POST /api/payment/confirm
// Called after frontend confirms payment — verify and mark order paid
router.post('/confirm', auth, async (req, res) => {
  try {
    const { paymentIntentId, orderId } = req.body;
    const db = getDB();

    if (!stripe || paymentIntentId?.startsWith('mock_')) {
      // Mock success in dev
      if (orderId) {
        await db.collection('orders').updateOne(
          { _id: new ObjectId(orderId) },
          { $set: { paymentStatus: 'paid', stripePaymentIntentId: paymentIntentId, updatedAt: new Date() } }
        );
      }
      return res.json({ success: true, message: 'Payment confirmed (dev mode)' });
    }

    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (intent.status !== 'succeeded') {
      return res.status(400).json({ message: `Payment not completed. Status: ${intent.status}` });
    }

    if (orderId) {
      await db.collection('orders').updateOne(
        { _id: new ObjectId(orderId), user: req.user._id },
        { $set: { paymentStatus: 'paid', stripePaymentIntentId: paymentIntentId, updatedAt: new Date() } }
      );
    }

    res.json({ success: true, message: 'Payment verified and confirmed' });
  } catch (err) {
    console.error('Confirm payment error:', err);
    res.status(500).json({ message: 'Payment confirmation failed', error: err.message });
  }
});

// POST /api/payment/webhook  (raw body)
router.post('/webhook', (req, res) => {
  if (!stripe) return res.json({ received: true });

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const db = getDB();

  switch (event.type) {
    case 'payment_intent.succeeded':
      const intent = event.data.object;
      console.log(`✅ PaymentIntent ${intent.id} succeeded`);
      db.collection('orders').updateOne(
        { stripePaymentIntentId: intent.id },
        { $set: { paymentStatus: 'paid', updatedAt: new Date() } }
      ).catch(console.error);
      break;

    case 'payment_intent.payment_failed':
      const failedIntent = event.data.object;
      console.log(`❌ Payment failed: ${failedIntent.id}`);
      db.collection('orders').updateOne(
        { stripePaymentIntentId: failedIntent.id },
        { $set: { paymentStatus: 'failed', updatedAt: new Date() } }
      ).catch(console.error);
      break;
  }

  res.json({ received: true });
});

// GET /api/payment/config  — expose publishable key
router.get('/config', (req, res) => {
  res.json({
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || 'pk_test_mock',
    currency: 'inr',
    isConfigured: !!stripe
  });
});

module.exports = router;
