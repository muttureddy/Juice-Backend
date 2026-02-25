/**
 * routes/auth.js
 * ─────────────────────────────────────────────────────
 * PURPOSE: Phone-OTP authentication.
 *
 * ROUTES:
 *   POST /api/auth/send-otp    – generate & send OTP
 *   POST /api/auth/verify-otp  – verify OTP, return JWT
 *   POST /api/auth/resend-otp  – resend a fresh OTP
 *
 * OTP STORAGE: Inside the user document as
 *   { otp: { code, expiresAt } }
 *   Cleared on successful verify.
 *
 * DEV MODE: When NODE_ENV=development, OTP is returned
 *   in the API response as `devOtp` (no Twilio needed).
 * ─────────────────────────────────────────────────────
 */

const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');
const { getDB } = require('../db');
const { logAction } = require('../middleware/auditLog');
const { createRateLimiter } = require('../middleware/rateLimiter');

// Rate limiters: 5 sends per 10 min, 3 resends per 10 min per IP
const otpSendLimiter   = createRateLimiter({ windowMs: 10*60*1000, max: 5, message: 'Too many OTP requests. Please wait 10 minutes.' });
const otpResendLimiter = createRateLimiter({ windowMs: 10*60*1000, max: 3, message: 'Too many resend attempts. Please wait 10 minutes.' });

const JWT_SECRET = process.env.JWT_SECRET || 'freshly_jwt_secret_change_in_prod';

// ── Twilio (optional) ──────────────────────────────────
let twilioClient = null;
try {
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    const twilio = require('twilio');
    twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
    console.log('✅ Twilio configured');
  }
} catch {
  console.log('⚠️  Twilio not available — running in dev OTP mode');
}

const generateOTP = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

// ── POST /send-otp ─────────────────────────────────────
router.post('/send-otp', otpSendLimiter, async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ message: 'Phone number is required' });

    const phoneRegex = /^[+]?[\d\s\-(]{10,15}$/;
    if (!phoneRegex.test(phone.replace(/\s/g, ''))) {
      return res.status(400).json({ message: 'Invalid phone number format' });
    }

    const otp       = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    const db        = getDB();

    // Upsert: create user record if first time
    await db.collection('users').updateOne(
      { phone },
      {
        $set: { otp: { code: otp, expiresAt }, updatedAt: new Date() },
        $setOnInsert: {
          phone, role: 'user', isVerified: false, createdAt: new Date()
        }
      },
      { upsert: true }
    );

    // Send SMS or log
    if (twilioClient) {
      await twilioClient.messages.create({
        body: `Your Freshly OTP is: ${otp}. Valid for 10 minutes. Do not share.`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: phone,
      });
    } else {
      console.log(`📱 [DEV OTP] ${phone} → ${otp}`);
    }

    await logAction({ phone, role: 'user' }, 'otp_sent', 'Auth', null, {}, req);
    res.json({
      message: 'OTP sent successfully',
      ...(process.env.NODE_ENV !== 'production' && { devOtp: otp }),
    });
  } catch (err) {
    console.error('send-otp error:', err);
    res.status(500).json({ message: 'Failed to send OTP', error: err.message });
  }
});

// ── POST /verify-otp ───────────────────────────────────
router.post('/verify-otp', async (req, res) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp)
      return res.status(400).json({ message: 'Phone and OTP are required' });

    const db   = getDB();
    const user = await db.collection('users').findOne({ phone });

    if (!user)
      return res.status(404).json({ message: 'User not found. Request OTP first.' });
    if (!user.otp?.code)
      return res.status(400).json({ message: 'No OTP found. Request a new one.' });
    if (new Date() > user.otp.expiresAt)
      return res.status(400).json({ message: 'OTP has expired. Request a new one.' });
    if (user.otp.code !== otp)
      return res.status(400).json({ message: 'Invalid OTP. Try again.' });

    // Clear OTP, mark verified
    await db.collection('users').updateOne(
      { phone },
      { $unset: { otp: '' }, $set: { isVerified: true, updatedAt: new Date() } }
    );

    const token = jwt.sign(
      { userId: user._id.toString(), phone: user.phone, role: user.role },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    await logAction(user, 'login', 'Auth', user._id, {}, req);

    // ── Socket.IO: notify admin when a new user registers ──
    const isNewUser = !user.name;
    if (isNewUser) {
      const io = req.app.locals.io;
      if (io) {
        io.to('admin').emit('new_user', {
          message: `New user registered: ${phone}`,
          phone,
        });
      }
    }

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id, phone: user.phone, name: user.name,
        email: user.email, address: user.address,
        role: user.role, isNewUser: !user.name,
      },
    });
  } catch (err) {
    console.error('verify-otp error:', err);
    res.status(500).json({ message: 'Verification failed', error: err.message });
  }
});

// ── POST /resend-otp ───────────────────────────────────
router.post('/resend-otp', otpResendLimiter, async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ message: 'Phone is required' });

    const otp       = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const db        = getDB();

    await db.collection('users').updateOne(
      { phone },
      {
        $set: { otp: { code: otp, expiresAt }, updatedAt: new Date() },
        $setOnInsert: { phone, role: 'user', isVerified: false, createdAt: new Date() }
      },
      { upsert: true }
    );

    if (twilioClient) {
      await twilioClient.messages.create({
        body: `Your Freshly OTP is: ${otp}. Valid for 10 minutes.`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: phone,
      });
    } else {
      console.log(`📱 [DEV OTP resend] ${phone} → ${otp}`);
    }

    res.json({
      message: 'OTP resent successfully',
      ...(process.env.NODE_ENV !== 'production' && { devOtp: otp }),
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to resend OTP' });
  }
});

module.exports = router;
