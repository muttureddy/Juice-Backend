/**
 * server.js
 * ─────────────────────────────────────────────────────
 * PURPOSE: Express app bootstrap — loads env, connects
 *          MongoDB, mounts routes, starts listening.
 *
 * TO ADD A NEW ROUTE FILE:
 *   1. Create  src/routes/yourRoute.js
 *   2. const yourRoute = require('./routes/yourRoute');
 *   3. app.use('/api/yourRoute', yourRoute);
 *
 * PORT: set via .env  PORT=5000  (default 5000)
 * CORS: origins listed in corsOptions below
 * ─────────────────────────────────────────────────────
 */

require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const { connectDB } = require('./db');

// ── Route imports ──────────────────────────────────────
const authRoutes    = require('./routes/auth');
const productRoutes = require('./routes/products');
const orderRoutes   = require('./routes/orders');
const userRoutes    = require('./routes/users');
const adminRoutes   = require('./routes/admin');

const app = express();

// ── CORS ───────────────────────────────────────────────
// Add more origins here when deploying
const corsOptions = {
  origin: [
    'http://localhost:3000',
    'http://localhost:3001',
    process.env.FRONTEND_URL,
  ].filter(Boolean),
  credentials: true,
};
app.use(cors(corsOptions));

// ── Body parsers ───────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Mount routes ───────────────────────────────────────
app.use('/api/auth',     authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders',   orderRoutes);
app.use('/api/users',    userRoutes);
app.use('/api/admin',    adminRoutes);

// ── Health check ───────────────────────────────────────
app.get('/api/health', (_req, res) =>
  res.json({ status: 'OK', message: 'Freshly API v3 — MongoDB native driver' })
);

// ── Global error handler ───────────────────────────────
// TO CUSTOMISE ERROR RESPONSES: edit this middleware
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err.stack);
  res.status(500).json({ message: 'Internal server error', error: err.message });
});

// ── Start ──────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

connectDB()
  .then(() => {
    app.listen(PORT, () =>
      console.log(`🚀 Freshly API running on port ${PORT}  [${process.env.NODE_ENV || 'development'}]`)
    );
  })
  .catch(err => {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  });

module.exports = app;
