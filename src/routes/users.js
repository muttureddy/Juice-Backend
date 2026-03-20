/**
 * routes/users.js  —  ProteinSpot
 * ─────────────────────────────────────────────────────
 * PURPOSE: Logged-in user profile management.
 *
 * ROUTES:
 *   GET /api/users/profile  – get own profile
 *   PUT /api/users/profile  – update name, email, address
 *
 * TO ADD MORE EDITABLE FIELDS:
 *   Add the field name to the ALLOWED_FIELDS array below.
 * ─────────────────────────────────────────────────────
 */

const express = require('express');
const router  = express.Router();
const { getDB } = require('../db');
const { auth }  = require('../middleware/auth');

// Whitelist: only these fields can be updated via this route
const ALLOWED_FIELDS = ['name', 'email', 'address'];

// ── GET /profile ───────────────────────────────────────
router.get('/profile', auth, async (req, res) => {
  try {
    const db   = getDB();
    const user = await db.collection('users').findOne(
      { _id: req.user._id },
      { projection: { otp: 0 } }  // never expose OTP
    );

    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch profile' });
  }
});

// ── PUT /profile ───────────────────────────────────────
router.put('/profile', auth, async (req, res) => {
  try {
    const updates = {};

    for (const field of ALLOWED_FIELDS) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }

    if (Object.keys(updates).length === 0)
      return res.status(400).json({ message: 'No valid fields to update' });

    updates.updatedAt = new Date();

    const db   = getDB();
    const user = await db.collection('users').findOneAndUpdate(
      { _id: req.user._id },
      { $set: updates },
      { returnDocument: 'after', projection: { otp: 0 } }
    );

    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ message: 'Profile updated', user });
  } catch (err) {
    res.status(400).json({ message: 'Failed to update profile', error: err.message });
  }
});

module.exports = router;
