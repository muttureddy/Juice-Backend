require('dotenv').config();

const http       = require('http');
const express    = require('express');
const cors       = require('cors');
const { connectDB } = require('./db/connection');
const socketManager = require('./utils/socketManager');

const app    = express();
const server = http.createServer(app); // wrap express in http.Server for Socket.io

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  process.env.CLIENT_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: Origin '${origin}' not allowed.`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── BODY PARSERS ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── REQUEST LOGGER (dev) ──────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'production') {
  app.use((req, _res, next) => { console.log(`→ ${req.method} ${req.path}`); next(); });
}

// ── ROUTES ─────────────────────────────────────────────────────────────────────
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/products',      require('./routes/products'));
app.use('/api/orders',        require('./routes/orders'));
app.use('/api/admin',         require('./routes/admin'));
app.use('/api/notifications', require('./routes/notifications'));

// ── HEALTH ────────────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok', message: '🥤 Freshly API is running!',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
    onlineSockets: socketManager.getOnlineCount(),
  });
});

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => { res.status(404).json({ message: `Route ${req.method} ${req.path} not found.` }); });

// ── ERROR HANDLER ─────────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('❌ Unhandled error:', err.message);
  if (err.code === 'LIMIT_FILE_SIZE')   return res.status(400).json({ message: 'Image too large. Max 5MB.' });
  if (err.message?.startsWith('CORS:')) return res.status(403).json({ message: err.message });
  res.status(500).json({ message: err.message || 'Internal server error.' });
});

// ── START ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  // Init Socket.io AFTER DB is ready (notification service needs DB)
  socketManager.init(server, allowedOrigins);

  server.listen(PORT, () => {
    console.log(`\n🥤  Freshly API + WebSocket started`);
    console.log(`    URL   : http://localhost:${PORT}`);
    console.log(`    Health: http://localhost:${PORT}/api/health`);
    console.log(`    Mode  : ${process.env.NODE_ENV || 'development'}`);
    console.log(`    CORS  : ${allowedOrigins.join(', ')}\n`);
  });
}).catch(err => { console.error('Failed to start:', err.message); process.exit(1); });
