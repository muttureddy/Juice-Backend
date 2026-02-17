/**
 * middleware/auth.js
 * ─────────────────────────────────────────────────────
 * PURPOSE: Express middleware that validates JWT tokens
 *          and attaches the user document to req.user.
 *
 * EXPORTS:
 *   auth       – any logged-in user
 *   adminAuth  – logged-in user with role === 'admin'
 *
 * TO CHANGE JWT SECRET: update JWT_SECRET in .env
 * ─────────────────────────────────────────────────────
 */

const jwt        = require('jsonwebtoken');
const { getDB, toObjectId } = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'freshly_jwt_secret_change_in_prod';

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ message: 'No token — authorisation denied' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const db      = getDB();

    const user = await db.collection('users').findOne(
      { _id: toObjectId(decoded.userId) },
      { projection: { otp: 0 } }               // never expose OTP
    );

    if (!user) {
      return res.status(401).json({ message: 'Token is not valid — user not found' });
    }

    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Token is not valid' });
  }
};

const adminAuth = async (req, res, next) => {
  // Runs auth first, then checks role
  await auth(req, res, () => {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    next();
  });
};

module.exports = { auth, adminAuth };
