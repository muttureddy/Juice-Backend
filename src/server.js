/**
 * server.js
 * ─────────────────────────────────────────────────────
 * Express + Socket.IO server.
 * Socket rooms:
 *   "admin"     – all admin connections join this
 *   userId      – each user joins their own userId room
 *
 * Events emitted TO clients:
 *   new_order          → "admin" room
 *   low_stock          → "admin" room
 *   new_user           → "admin" room
 *   order_status       → userId room (specific customer)
 *   order_cancelled    → "admin" room + userId room
 * ─────────────────────────────────────────────────────
 */

require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const http     = require('http');
const { Server } = require('socket.io');
const { connectDB } = require('./db');

// ── Route imports ──────────────────────────────────────
const authRoutes    = require('./routes/auth');
const productRoutes = require('./routes/products');
const orderRoutes   = require('./routes/orders');
const userRoutes    = require('./routes/users');
const adminRoutes   = require('./routes/admin');

const app    = express();
const server = http.createServer(app);  // wrap Express in http.Server for Socket.IO

// ── CORS ───────────────────────────────────────────────
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  process.env.FRONTEND_URL,
  process.env.FRONTEND_URL_VERCEL,
process.env.FRONTEND_URL_VERCEL2
].filter(Boolean);

app.use(cors({ origin: allowedOrigins, credentials: true }));

// ── Socket.IO ──────────────────────────────────────────
const io = new Server(server, {
  cors: { 
    origin: allowedOrigins, 
    methods: ['GET', 'POST'],
    credentials: true,
    allowedHeaders: ['Content-Type'],
  },
  transports: ['polling', 'websocket'],  // Try polling first
  pingTimeout: 60000,
  pingInterval: 25000,
  allowEIO3: true,
  cookie: false,  // Disable cookies for simplicity
  path: '/socket.io/',  // Explicit path
});

// Make `io` available to route handlers via app.locals
app.locals.io = io;

// Add error handling for Socket.IO engine
io.engine.on('connection_error', (err) => {
  console.error('🔥 Socket.IO connection error:', {
    code: err.code,
    message: err.message,
    context: err.context,
  });
});

io.on('connection', (socket) => {
  console.log('✅ New Socket.IO connection:', socket.id);
  
  // Client emits { userId, role } to join the right rooms
  socket.on('join', ({ userId, role }) => {
    console.log(`👤 User ${userId} joining as ${role}`);
    if (role === 'admin') socket.join('admin');
    if (userId) socket.join(String(userId));
    console.log(`✅ User ${userId} joined rooms successfully`);
  });

  socket.on('disconnect', (reason) => {
    console.log('❌ Socket disconnected:', socket.id, 'Reason:', reason);
  });
  
  socket.on('error', (error) => {
    console.error('🔥 Socket error:', socket.id, error);
  });
});

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
  res.json({ status: 'OK', message: 'Freshly API — Socket.IO enabled' })
);

// ── Socket.IO test endpoint ────────────────────────────
app.get('/api/socket-test', (_req, res) => {
  const connectedSockets = io.engine.clientsCount || 0;
  res.json({ 
    status: 'OK', 
    socketIO: 'enabled',
    connectedClients: connectedSockets,
    transports: ['polling', 'websocket'],
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
    server.listen(PORT, () =>
      console.log(`🚀 Freshly API + Socket.IO on port ${PORT}  [${process.env.NODE_ENV || 'development'}]`)
    );
  })
  .catch(err => {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  });

module.exports = { app, io };
