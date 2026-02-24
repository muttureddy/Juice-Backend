/**
 * SocketManager
 * ─────────────────────────────────────────────────────────────────────────────
 * Singleton that holds the Socket.io server instance and manages:
 *  - Per-user rooms  (room name = `user:<userId>`)
 *  - Admin room      (room name = `admins`)
 *
 * Usage anywhere in the server:
 *   const { emitToUser, emitToAdmins } = require('./utils/socketManager');
 *   emitToUser(userId, 'notification', { ... });
 *   emitToAdmins('new_order', { ... });
 */

let _io = null;

// Map<socketId, { userId, role }>
const connectedClients = new Map();

function init(httpServer, allowedOrigins) {
  const { Server } = require('socket.io');

  _io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    // Reconnection-friendly settings
    pingTimeout:  60000,
    pingInterval: 25000,
  });

  _io.on('connection', (socket) => {
    console.log(`🔌 Socket connected: ${socket.id}`);

    // ── Client authenticates immediately after connecting ────────────────────
    // Client emits: socket.emit('authenticate', { token })
    socket.on('authenticate', ({ token }) => {
      try {
        const jwt = require('jsonwebtoken');
        const payload = jwt.verify(token, process.env.JWT_SECRET);

        connectedClients.set(socket.id, { userId: payload.userId, role: payload.role });

        // Join personal room
        socket.join(`user:${payload.userId}`);

        // Join admin room if admin
        if (payload.role === 'admin') {
          socket.join('admins');
        }

        // Confirm auth to client
        socket.emit('authenticated', { userId: payload.userId, role: payload.role });
        console.log(`✅ Socket authenticated: userId=${payload.userId} role=${payload.role}`);
      } catch (err) {
        socket.emit('auth_error', { message: 'Invalid token. Notifications disabled.' });
        console.warn(`⚠️  Socket auth failed: ${err.message}`);
      }
    });

    socket.on('disconnect', (reason) => {
      const client = connectedClients.get(socket.id);
      if (client) {
        console.log(`🔌 Socket disconnected: userId=${client.userId} reason=${reason}`);
        connectedClients.delete(socket.id);
      }
    });
  });

  return _io;
}

function getIO() {
  if (!_io) throw new Error('Socket.io not initialized. Call init() first.');
  return _io;
}

/**
 * Send a notification to a specific user (by MongoDB userId string).
 * @param {string} userId
 * @param {object} notification  — full notification document from DB
 */
function emitToUser(userId, notification) {
  if (!_io) return;
  _io.to(`user:${userId}`).emit('notification', notification);
}

/**
 * Broadcast a notification to all connected admins.
 * @param {string} event  — socket event name
 * @param {object} data
 */
function emitToAdmins(event, data) {
  if (!_io) return;
  _io.to('admins').emit(event, data);
}

/**
 * Returns count of currently online users/admins (for debugging).
 */
function getOnlineCount() {
  return connectedClients.size;
}

module.exports = { init, getIO, emitToUser, emitToAdmins, getOnlineCount };
