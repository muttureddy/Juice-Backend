/**
 * routes/payments.js — ProteinSpot
 *
 * POST /api/payments/create-order  → create Razorpay order, returns order_id
 * POST /api/payments/verify        → verify HMAC signature after payment success
 *
 * Required .env:
 *   RAZORPAY_KEY_ID=rzp_live_xxxxxxxxxxxx
 *   RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
 */

const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const Razorpay = require("razorpay");
const { getDB, toObjectId } = require("../db");
const { auth } = require("../middleware/auth");

let _rzp = null;
const getRzp = () => {
  if (_rzp) return _rzp;
  const { RAZORPAY_KEY_ID: key_id, RAZORPAY_KEY_SECRET: key_secret } =
    process.env;
  if (!key_id || !key_secret)
    throw new Error(
      "RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set in .env",
    );
  _rzp = new Razorpay({ key_id, key_secret });
  return _rzp;
};

/* ── POST /create-order ──────────────────────────────── */
router.post("/create-order", auth, async (req, res) => {
  try {
    const { amount, currency = "INR", receipt, notes = {} } = req.body;
    if (!amount || amount < 1)
      return res.status(400).json({ message: "amount is required" });

    const order = await getRzp().orders.create({
      amount: Math.round(amount * 100),
      currency,
      receipt: receipt || `ps_${Date.now()}`,
      notes,
    });

    res.json({
      razorpayOrderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    console.error("[payments] create-order:", err.message);
    res
      .status(500)
      .json({ message: err.message || "Failed to create Razorpay order" });
  }
});

/* ── POST /verify ────────────────────────────────────── */
router.post("/verify", auth, async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      psOrderId,
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature)
      return res
        .status(400)
        .json({ message: "Missing Razorpay payment fields" });

    const expected = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expected !== razorpay_signature)
      return res
        .status(400)
        .json({ message: "Payment signature verification failed" });

    if (psOrderId) {
      const _id = toObjectId(psOrderId);
      if (_id) {
        const now = new Date();
        await getDB()
          .collection("orders")
          .updateOne(
            { _id },
            {
              $set: {
                paymentStatus: "paid",
                paymentMethod: "razorpay",
                razorpayOrderId: razorpay_order_id,
                razorpayPaymentId: razorpay_payment_id,
                orderStatus: "confirmed",
                updatedAt: now,
              },
              $push: {
                statusHistory: {
                  status: "confirmed",
                  note: `Paid via Razorpay — ${razorpay_payment_id}`,
                  timestamp: now,
                },
              },
            },
          );
      }
    }

    res.json({
      success: true,
      message: "Payment verified and order confirmed",
    });
  } catch (err) {
    console.error("[payments] verify:", err.message);
    res
      .status(500)
      .json({ message: "Verification failed", error: err.message });
  }
});

module.exports = router;
