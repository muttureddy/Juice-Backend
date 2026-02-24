const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { ObjectId } = require('mongodb');
const { getDB } = require('../db/connection');
const { verifyToken } = require('../middleware/auth');
const { log, getIP, LOG_ACTIONS } = require('../utils/logger');

// ─── Twilio: lazy-initialize so server boots even without credentials ─────────
function getTwilioClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token || sid.startsWith('AC' + 'xxx')) return null;
  const twilio = require('twilio');
  return twilio(sid, token);
}

// ─── Helper: generate 6-digit OTP ────────────────────────────────────────────
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ─── Helper: sign JWT ─────────────────────────────────────────────────────────
function signToken(user) {
  return jwt.sign(
    {
      userId: user._id.toString(),
      phone:  user.phone,
      role:   user.role,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
  );
}

// ─── Helper: safe user object for response ────────────────────────────────────
function safeUser(user) {
  return {
    _id:     user._id,
    phone:   user.phone,
    name:    user.name    || '',
    email:   user.email   || '',
    address: user.address || '',
    city:    user.city    || '',
    pincode: user.pincode || '',
    role:    user.role,
  };
}

// ─── POST /api/auth/send-otp ─────────────────────────────────────────────────
router.post('/send-otp', async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone || !/^\d{10}$/.test(phone)) {
      return res.status(400).json({ message: 'Please provide a valid 10-digit mobile number.' });
    }

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min TTL

    const db = getDB();
    // Upsert: replace any existing OTP for this phone
    await db.collection('otps').replaceOne(
      { phone },
      { phone, otp, expiresAt, attempts: 0, createdAt: new Date() },
      { upsert: true }
    );

    // Try Twilio SMS; fall back to console log in dev
    const twilioClient = getTwilioClient();
    if (twilioClient) {
      await twilioClient.messages.create({
        body: `Your Freshly OTP is: ${otp}. Valid for 10 minutes. Do not share with anyone.`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to:   `+91${phone}`,
      });
      console.log(`📱 OTP sent via Twilio to +91${phone}`);
    } else {
      // DEV MODE — print to terminal
      console.log(`\n📱 ─── DEV MODE OTP ─────────────────`);
      console.log(`   Phone : +91 ${phone}`);
      console.log(`   OTP   : ${otp}`);
      console.log(`────────────────────────────────────\n`);
    }

    await log({
      action: LOG_ACTIONS.OTP_SENT,
      entityType: 'otp',
      entityId: phone,
      details: { phone, devMode: !twilioClient },
      ip: getIP(req),
    });

    res.json({ message: 'OTP sent successfully.', devMode: !twilioClient });
  } catch (err) {
    console.error('❌ Send OTP error:', err.message);
    res.status(500).json({ message: 'Failed to send OTP. Please try again.' });
  }
});

// ─── POST /api/auth/verify-otp ───────────────────────────────────────────────
router.post('/verify-otp', async (req, res) => {
  try {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({ message: 'Phone and OTP are required.' });
    }

    const db = getDB();
    const otpRecord = await db.collection('otps').findOne({ phone });

    if (!otpRecord) {
      await log({ action: LOG_ACTIONS.OTP_FAILED, entityType: 'otp', entityId: phone, details: { reason: 'not_found' }, ip: getIP(req) });
      return res.status(400).json({ message: 'OTP not found. Please request a new one.' });
    }
    if (new Date() > new Date(otpRecord.expiresAt)) {
      await db.collection('otps').deleteOne({ phone });
      await log({ action: LOG_ACTIONS.OTP_FAILED, entityType: 'otp', entityId: phone, details: { reason: 'expired' }, ip: getIP(req) });
      return res.status(400).json({ message: 'OTP has expired. Please request a new one.' });
    }
    if (otpRecord.otp !== String(otp)) {
      // Increment failure count
      await db.collection('otps').updateOne({ phone }, { $inc: { attempts: 1 } });
      await log({ action: LOG_ACTIONS.OTP_FAILED, entityType: 'otp', entityId: phone, details: { reason: 'wrong_otp' }, ip: getIP(req) });
      return res.status(400).json({ message: 'Invalid OTP. Please try again.' });
    }

    // OTP valid — delete it
    await db.collection('otps').deleteOne({ phone });

    // Determine role: admin phone always gets admin
    const role = phone === process.env.ADMIN_PHONE ? 'admin' : 'user';

    // Check if user exists already
    const existingUser = await db.collection('users').findOne({ phone });
    const isNewUser = !existingUser;

    // Upsert user document
    // IMPORTANT: $setOnInsert only runs on INSERT; $set runs always
    await db.collection('users').updateOne(
      { phone },
      {
        $set:        { phone, role, lastLoginAt: new Date() },
        $setOnInsert: { name: '', email: '', address: '', city: '', pincode: '', createdAt: new Date() },
      },
      { upsert: true }
    );

    // Fetch the full user document (most reliable approach across driver versions)
    const user = await db.collection('users').findOne({ phone });

    if (!user) {
      return res.status(500).json({ message: 'User creation failed. Please try again.' });
    }

    const token = signToken(user);

    // Log login / signup
    await log({
      action: isNewUser ? LOG_ACTIONS.USER_SIGNUP : LOG_ACTIONS.USER_LOGIN,
      entityType: 'user',
      entityId: user._id,
      actorId: user._id,
      actorPhone: user.phone,
      actorRole: user.role,
      details: { isNewUser, role },
      ip: getIP(req),
    });

    // Log role change if admin phone logged in
    if (role === 'admin') {
      await log({
        action: LOG_ACTIONS.USER_ROLE_CHANGED,
        entityType: 'user',
        entityId: user._id,
        actorId: user._id,
        actorPhone: user.phone,
        actorRole: 'admin',
        details: { role: 'admin', reason: 'admin_phone_match' },
        ip: getIP(req),
      });
    }

    res.json({
      message: 'Login successful.',
      token,
      user: safeUser(user),
    });
  } catch (err) {
    console.error('❌ Verify OTP error:', err);
    res.status(500).json({ message: 'Failed to verify OTP. Please try again.' });
  }
});

// ─── GET /api/auth/profile ────────────────────────────────────────────────────
router.get('/profile', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const user = await db.collection('users').findOne(
      { _id: new ObjectId(req.user.userId) },
      { projection: { _id: 1, phone: 1, name: 1, email: 1, address: 1, city: 1, pincode: 1, role: 1 } }
    );
    if (!user) return res.status(404).json({ message: 'User not found.' });
    res.json({ user: safeUser(user) });
  } catch (err) {
    console.error('❌ Get profile error:', err.message);
    res.status(500).json({ message: 'Failed to fetch profile.' });
  }
});

// ─── PUT /api/auth/profile ────────────────────────────────────────────────────
router.put('/profile', verifyToken, async (req, res) => {
  try {
    const { name, email, address, city, pincode } = req.body;
    const db = getDB();

    const before = await db.collection('users').findOne(
      { _id: new ObjectId(req.user.userId) },
      { projection: { name: 1, email: 1, address: 1, city: 1, pincode: 1 } }
    );

    await db.collection('users').updateOne(
      { _id: new ObjectId(req.user.userId) },
      { $set: { name: name || '', email: email || '', address: address || '', city: city || '', pincode: pincode || '', updatedAt: new Date() } }
    );

    const updated = await db.collection('users').findOne(
      { _id: new ObjectId(req.user.userId) },
      { projection: { _id: 1, phone: 1, name: 1, email: 1, address: 1, city: 1, pincode: 1, role: 1 } }
    );

    await log({
      action: LOG_ACTIONS.USER_PROFILE_UPDATED,
      entityType: 'user',
      entityId: req.user.userId,
      actorId: req.user.userId,
      actorPhone: req.user.phone,
      actorRole: req.user.role,
      details: { before, after: { name, email, address, city, pincode } },
      ip: getIP(req),
    });

    res.json({ message: 'Profile updated successfully.', user: safeUser(updated) });
  } catch (err) {
    console.error('❌ Update profile error:', err.message);
    res.status(500).json({ message: 'Failed to update profile.' });
  }
});

module.exports = router;
