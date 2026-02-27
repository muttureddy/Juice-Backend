/**
 * server.js - SIMPLE POLLING VERSION
 * ─────────────────────────────────────────────────────
 * No Socket.IO, No SSE - Just simple HTTP polling
 * GUARANTEED TO WORK on any hosting platform!
 * ─────────────────────────────────────────────────────
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { connectDB } = require('./db');

// ── Route imports ──────────────────────────────────────
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const userRoutes = require('./routes/users');
const adminRoutes = require('./routes/admin');

const app = express();

// ── CORS ───────────────────────────────────────────────
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  process.env.FRONTEND_URL,
  process.env.FRONTEND_URL_VERCEL,
  process.env.FRONTEND_URL_VERCEL2,
  process.env.FRONTEND_URL_LOCAL,
].filter(Boolean);

app.use(cors({ origin: allowedOrigins, credentials: true }));

// ── Body parsers ───────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── NOTIFICATION QUEUE (In-Memory) ─────────────────────
// Simple in-memory notification storage
const notificationQueues = {
  users: new Map(),  // userId -> [notifications]
  admins: [],        // All admin notifications
};

// Add notification for specific user
function addUserNotification(userId, notification) {
  if (!notificationQueues.users.has(userId)) {
    notificationQueues.users.set(userId, []);
  }
  
  const notif = {
    id: Date.now() + Math.random(),
    timestamp: new Date(),
    ...notification,
  };
  
  notificationQueues.users.get(userId).push(notif);
  
  // Keep only last 50 notifications per user
  const queue = notificationQueues.users.get(userId);
  if (queue.length > 50) {
    notificationQueues.users.set(userId, queue.slice(-50));
  }
  
  console.log(`📤 Added notification for user ${userId}:`, notification.type);
}

// Add notification for all admins
function addAdminNotification(notification) {
  const notif = {
    id: Date.now() + Math.random(),
    timestamp: new Date(),
    ...notification,
  };
  
  notificationQueues.admins.push(notif);
  
  // Keep only last 100 admin notifications
  if (notificationQueues.admins.length > 100) {
    notificationQueues.admins = notificationQueues.admins.slice(-100);
  }
  
  console.log(`📤 Added admin notification:`, notification.type);
}

// Expose globally so routes can use them
global.addUserNotification = addUserNotification;
global.addAdminNotification = addAdminNotification;

// ── POLLING ENDPOINT ───────────────────────────────────
app.get('/api/notifications/poll', (req, res) => {
  const { userId, role, since } = req.query;
  
  if (!userId) {
    return res.status(400).json({ message: 'userId required' });
  }
  
  const sinceTime = since ? parseInt(since) : 0;
  let notifications = [];
  
  // Get user-specific notifications
  if (notificationQueues.users.has(userId)) {
    const userNotifs = notificationQueues.users.get(userId);
    notifications = userNotifs.filter(n => n.timestamp.getTime() > sinceTime);
  }
  
  // If admin, also get admin notifications
  if (role === 'admin') {
    const adminNotifs = notificationQueues.admins.filter(n => n.timestamp.getTime() > sinceTime);
    notifications = [...notifications, ...adminNotifs];
  }
  
  // Sort by timestamp
  notifications.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  
  res.json({
    notifications,
    serverTime: Date.now(),
  });
});

// ── CLEAR NOTIFICATIONS ────────────────────────────────
app.post('/api/notifications/clear', (req, res) => {
  const { userId } = req.body;
  
  if (userId) {
    notificationQueues.users.delete(userId);
  }
  
  res.json({ success: true });
});

// ── Mount routes ───────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);

// ── Health check ───────────────────────────────────────
app.get('/api/health', (_req, res) => {
  const totalUsers = notificationQueues.users.size;
  const totalAdminNotifs = notificationQueues.admins.length;
  
  res.json({ 
    status: 'OK', 
    message: 'Freshly API with Polling Notifications',
    system: 'polling',
    connectedUsers: totalUsers,
    adminNotifications: totalAdminNotifs,
  });
});

// ── Global error handler ───────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err.stack);
  res.status(500).json({ message: 'Internal server error', error: err.message });
});

// ── Start ──────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 Freshly API with Polling Notifications on port ${PORT}`);
      console.log(`📡 Polling endpoint: /api/notifications/poll`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  })
  .catch(err => {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  });

module.exports = { app };
