/**
 * db.js
 * ─────────────────────────────────────────────────────
 * PURPOSE: MongoDB native-driver connection + index setup.
 *
 * CHANGES:
 *   - Enabled all commented-out product indexes (category, flags, text search)
 *   - Added compound index on (isAvailable + category) for filtered product listing
 *   - Added TTL index on auditLogs.createdAt (90-day auto-expiry)
 *   - Added index on auditLogs for filtering by action/entityType
 * ─────────────────────────────────────────────────────
 */

const { MongoClient, ObjectId } = require('mongodb');

let client;
let db;

const connectDB = async () => {
  if (db) return db;

  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
  client = new MongoClient(uri);

  await client.connect();
  db = client.db(process.env.DB_NAME || 'freshly_db');

  // ── Users indexes ──────────────────────────────────
  await db.collection('users').createIndex({ phone: 1 }, { unique: true });

  // ── Products indexes ───────────────────────────────
  // Single-field indexes for common filters
  await db.collection('products').createIndex({ category: 1 });
  await db.collection('products').createIndex({ isAvailable: 1 });
  await db.collection('products').createIndex({ isBestseller: 1 });
  await db.collection('products').createIndex({ isFeatured: 1 });
  await db.collection('products').createIndex({ createdAt: -1 });

  // Compound: availability + category (most common query shape)
  await db.collection('products').createIndex({ isAvailable: 1, category: 1 });

  // Compound: availability + bestseller (homepage featured fetch)
  await db.collection('products').createIndex({ isAvailable: 1, isBestseller: -1 });

  // Full-text search on name, description, tags
  // Drop first if it exists with different weights/fields — prevents startup crash
  // when the old index has different options (e.g. different weights or fields).
  try {
    await db.collection('products').dropIndex('product_text_search');
  } catch (_) {
    // Index didn't exist yet — that's fine, ignore the error
  }
  await db.collection('products').createIndex(
    { name: 'text', description: 'text', tags: 'text' },
    { name: 'product_text_search', weights: { name: 10, tags: 5, description: 1 } }
  );

  // ── Orders indexes ─────────────────────────────────
  await db.collection('orders').createIndex({ userId: 1 });
  await db.collection('orders').createIndex({ orderId: 1 }, { unique: true, sparse: true });
  await db.collection('orders').createIndex({ createdAt: -1 });
  await db.collection('orders').createIndex({ orderStatus: 1 });
  // Compound for admin order list (status filter + date sort)
  await db.collection('orders').createIndex({ orderStatus: 1, createdAt: -1 });

  // ── AuditLogs indexes ──────────────────────────────
  // TTL: auto-delete logs older than 90 days
  await db.collection('auditLogs').createIndex(
    { createdAt: 1 },
    { expireAfterSeconds: 90 * 24 * 60 * 60, name: 'auditLogs_ttl_90d' }
  );
  // For filter/search in AdminAuditLogs page
  await db.collection('auditLogs').createIndex({ action: 1 });
  await db.collection('auditLogs').createIndex({ entityType: 1 });
  await db.collection('auditLogs').createIndex({ userPhone: 1 });

  console.log(`✅ MongoDB connected  →  database: "${db.databaseName}" | indexes ensured`);
  return db;
};

const getDB = () => {
  if (!db) throw new Error('Database not initialised. Call connectDB() first.');
  return db;
};

/**
 * toObjectId(id)
 * Safely converts a string to MongoDB ObjectId.
 * Returns null on invalid input so routes handle 404 gracefully.
 */
const toObjectId = (id) => {
  try { return new ObjectId(id); } catch { return null; }
};

module.exports = { connectDB, getDB, toObjectId, ObjectId };
