/**
 * db.js
 * ─────────────────────────────────────────────────────
 * PURPOSE: Manages the single MongoDB native-driver
 *          connection used across all route files.
 *
 * EXPORTS:
 *   connectDB()  - Call once at startup (in server.js).
 *                  Connects, creates indexes, returns db.
 *   getDB()      - Call inside any route to get the db.
 *   toObjectId() - Safely convert a string to ObjectId.
 *   ObjectId     - Re-exported for convenience.
 *
 * TO CHANGE DB NAME / URI:  edit .env variables
 *   MONGODB_URI and DB_NAME
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

  // ── Index definitions ──────────────────────────────
  // Adding an index here is safe (MongoDB ignores duplicates).
  // To ADD a new index: just add another createIndex() call.
  // To REMOVE:  drop it manually in mongo shell or Compass.
  await db.collection('users').createIndex({ phone: 1 }, { unique: true });
  await db.collection('products').createIndex({ category: 1 });
  await db.collection('products').createIndex({ isBestseller: 1 });
  await db.collection('products').createIndex({ isFeatured: 1 });
  await db.collection('products').createIndex({ isAvailable: 1 });
  await db.collection('products').createIndex(
    { name: 'text', description: 'text', 'ingredients': 'text' },
    { name: 'product_text_search' }
  );

  await db.collection('orders').createIndex({ userId: 1 });
  await db.collection('orders').createIndex({ orderId: 1 }, { unique: true, sparse: true });
  await db.collection('orders').createIndex({ createdAt: -1 });
  await db.collection('orders').createIndex({ orderStatus: 1 });

  console.log(`✅ MongoDB connected  →  database: "${db.databaseName}"`);
  return db;
};

const getDB = () => {
  if (!db) throw new Error('Database not initialised. Call connectDB() first.');
  return db;
};

/**
 * toObjectId(id)
 * Converts a string to MongoDB ObjectId.
 * Returns null if the string is invalid so routes can
 * handle the 404 gracefully instead of crashing.
 */
const toObjectId = (id) => {
  try {
    return new ObjectId(id);
  } catch {
    return null;
  }
};

module.exports = { connectDB, getDB, toObjectId, ObjectId };
