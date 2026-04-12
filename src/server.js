require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { connectDB } = require('./db');

const app = express();

// CORS
app.use(cors({ 
  origin: '*', // Allow all origins for now
  credentials: true 
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// In-memory notification storage
const notifications = {
  users: new Map(), // userId -> [notifications]
  admins: []        // all admin notifications
};

// Helper functions
global.notifyUser = (userId, type, message) => {
  if (!notifications.users.has(userId)) {
    notifications.users.set(userId, []);
  }
  notifications.users.get(userId).push({
    id: Date.now(),
    type,
    message,
    timestamp: Date.now()
  });
  console.log(`📤 User notification: ${userId} - ${type}`);
};

global.notifyAdmins = (type, message) => {
  notifications.admins.push({
    id: Date.now(),
    type,
    message,
    timestamp: Date.now()
  });
  console.log(`📤 Admin notification: ${type}`);
};

// Polling endpoint
app.get('/api/notifications/poll', (req, res) => {
  const { userId, role, since } = req.query;
  const sinceTime = parseInt(since) || 0;
  let results = [];

  // Get user notifications
  if (notifications.users.has(userId)) {
    results = notifications.users.get(userId)
      .filter(n => n.timestamp > sinceTime);
  }

  // Add admin notifications if user is admin
  if (role === 'admin') {
    const adminNotifs = notifications.admins
      .filter(n => n.timestamp > sinceTime);
    results = [...results, ...adminNotifs];
  }

  res.json({
    notifications: results,
    timestamp: Date.now()
  });
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/users', require('./routes/users'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/email-templates', require('./routes/emailTemplates'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK',
    notifications: 'polling',
    timestamp: Date.now()
  });
});

// Start server
const PORT = process.env.PORT || 5000;
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`📡 Polling: /api/notifications/poll`);
  });
});
