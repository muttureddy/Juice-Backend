const { MongoClient } = require('mongodb');

let client;
let db;

async function connectDB() {
  if (db) return db;

  try {
    client = new MongoClient(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
    });

    await client.connect();
    // Ping to verify connection
    await client.db('admin').command({ ping: 1 });

    db = client.db(process.env.DB_NAME || 'freshly_db');
    console.log('✅ MongoDB connected to database:', process.env.DB_NAME || 'freshly_db');

    await setupIndexes(db);
    return db;
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message);
    console.error('   Check your MONGODB_URI in .env');
    process.exit(1);
  }
}

async function setupIndexes(db) {
  try {
    // users
    await db.collection('users').createIndex({ phone: 1 }, { unique: true });

    // otps — TTL index auto-deletes expired docs
    await db.collection('otps').createIndex({ phone: 1 });
    await db.collection('otps').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

    // products
    await db.collection('products').createIndex({ category: 1, type: 1 });
    await db.collection('products').createIndex({ isActive: 1 });

    // orders
    await db.collection('orders').createIndex({ userId: 1 });
    await db.collection('orders').createIndex({ createdAt: -1 });
    await db.collection('orders').createIndex({ status: 1 });

    // logs — for audit trail
    await db.collection('logs').createIndex({ createdAt: -1 });
    await db.collection('logs').createIndex({ entityType: 1, entityId: 1 });
    await db.collection('logs').createIndex({ actorId: 1 });

    // notifications
    await db.collection('notifications').createIndex({ userId: 1, createdAt: -1 });
    await db.collection('notifications').createIndex({ userId: 1, isRead: 1 });
    // Auto-delete notifications older than 30 days
    await db.collection('notifications').createIndex({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

    console.log('✅ Database indexes ready');
  } catch (err) {
    // Indexes may already exist — not a fatal error
    console.warn('⚠️  Index setup warning:', err.message);
  }
}

function getDB() {
  if (!db) throw new Error('Database not initialized. Call connectDB() first.');
  return db;
}

module.exports = { connectDB, getDB };
