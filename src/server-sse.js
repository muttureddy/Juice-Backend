/**
 * server.js - SIMPLIFIED VERSION
 * ─────────────────────────────────────────────────────
 * Using Server-Sent Events (SSE) instead of Socket.IO
 * Much more reliable on Render free tier!
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

// ── SSE Notification System ────────────────────────────
// Store connected clients
const clients = new Map(); // Map<userId, response>
const adminClients = new Set(); // Set<response>

// SSE endpoint for notifications
app.get('/api/notifications/stream', (req, res) => {
  const { userId, role } = req.query;
  
  if (!userId) {
    return res.status(400).json({ message: 'userId required' });
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'connected', message: 'SSE connected' })}\n\n`);

  // Store client connection
  if (role === 'admin') {
    adminClients.add(res);
    console.log('✅ Admin connected via SSE. Total admins:', adminClients.size);
  }
  
  clients.set(userId, res);
  console.log('✅ User connected via SSE:', userId, 'Total clients:', clients.size);

  // Keep connection alive with heartbeat
  const heartbeat = setInterval(() => {
    res.write(`: heartbeat\n\n`);
  }, 30000); // Every 30 seconds

  // Clean up on close
  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(userId);
    adminClients.delete(res);
    console.log('❌ Client disconnected:', userId);
  });
});

// Helper function to send notification
function sendNotification(userId, data) {
  const client = clients.get(userId);
  if (client) {
    try {
      client.write(`data: ${JSON.stringify(data)}\n\n`);
      console.log('📤 Sent notification to user:', userId, data.type);
    } catch (error) {
      console.error('Error sending to user:', userId, error);
      clients.delete(userId);
    }
  }
}

// Helper function to send to all admins
function sendToAdmins(data) {
  let sent = 0;
  adminClients.forEach(client => {
    try {
      client.write(`data: ${JSON.stringify(data)}\n\n`);
      sent++;
    } catch (error) {
      console.error('Error sending to admin:', error);
      adminClients.delete(client);
    }
  });
  console.log('📤 Sent notification to', sent, 'admins:', data.type);
}

// Make notification functions available globally
global.sendNotification = sendNotification;
global.sendToAdmins = sendToAdmins;

// ── Mount routes ───────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);

// ── Health check ───────────────────────────────────────
app.get('/api/health', (_req, res) =>
  res.json({ 
    status: 'OK', 
    message: 'Freshly API with SSE notifications',
    connectedClients: clients.size,
    connectedAdmins: adminClients.size,
  })
);

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
      console.log(`🚀 Freshly API with SSE on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
      console.log('📡 SSE endpoint: /api/notifications/stream');
    });
  })
  .catch(err => {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  });

module.exports = { app };
