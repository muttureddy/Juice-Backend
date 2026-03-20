/**
 * db.js  —  ProteinSpot
 * ─────────────────────────────────────────────────────
 * PURPOSE: MongoDB native-driver connection + index setup.
 *
 * Indexes ensured on every startup (createIndex is idempotent):
 *   users      — phone (unique)
 *   products   — category, isAvailable, flags, text-search,
 *                compound (isAvailable+category), (isAvailable+isBestseller)
 *   orders     — userId, orderId (unique sparse), createdAt,
 *                orderStatus, compound (status+date)
 *   auditLogs  — TTL 90 days, action, entityType, userPhone
 * ─────────────────────────────────────────────────────
 */

const { MongoClient, ObjectId } = require("mongodb");

let client;
let db;

const connectDB = async () => {
  if (db) return db;

  const uri = process.env.MONGODB_URI || "mongodb://localhost:27017";
  client = new MongoClient(uri);

  await client.connect();
  db = client.db(process.env.DB_NAME || "proteinspot_db");

  // ── Users indexes ──────────────────────────────────
  await db.collection("users").createIndex({ phone: 1 }, { unique: true });

  // ── Products indexes ───────────────────────────────
  await db.collection("products").createIndex({ category: 1 });
  await db.collection("products").createIndex({ isAvailable: 1 });
  await db.collection("products").createIndex({ isBestseller: 1 });
  await db.collection("products").createIndex({ isFeatured: 1 });
  await db.collection("products").createIndex({ createdAt: -1 });
  await db.collection("products").createIndex({ type: 1 }); // juice | food

  // Compound: availability + category (most common query shape)
  await db.collection("products").createIndex({ isAvailable: 1, category: 1 });

  // Compound: availability + bestseller (homepage featured fetch)
  await db
    .collection("products")
    .createIndex({ isAvailable: 1, isBestseller: -1 });

  // Full-text search on name, description, tags
  // Drop first if weights/fields changed — prevents startup crash
  try {
    await db.collection("products").dropIndex("product_text_search");
  } catch (_) {}
  await db.collection("products").createIndex(
    { name: "text", description: "text", tags: "text" },
    {
      name: "product_text_search",
      weights: { name: 10, tags: 5, description: 1 },
    },
  );

  // ── Orders indexes ─────────────────────────────────
  await db.collection("orders").createIndex({ userId: 1 });
  await db
    .collection("orders")
    .createIndex({ orderId: 1 }, { unique: true, sparse: true });
  await db.collection("orders").createIndex({ createdAt: -1 });
  await db.collection("orders").createIndex({ orderStatus: 1 });
  await db.collection("orders").createIndex({ paymentStatus: 1 });
  await db.collection("orders").createIndex({ orderStatus: 1, createdAt: -1 });

  // ── AuditLogs indexes ──────────────────────────────
  // TTL: auto-delete logs older than 90 days
  await db
    .collection("auditLogs")
    .createIndex(
      { createdAt: 1 },
      { expireAfterSeconds: 90 * 24 * 60 * 60, name: "auditLogs_ttl_90d" },
    );
  await db.collection("auditLogs").createIndex({ action: 1 });
  await db.collection("auditLogs").createIndex({ entityType: 1 });
  await db.collection("auditLogs").createIndex({ userPhone: 1 });

  console.log(
    `✅ MongoDB connected → database: "${db.databaseName}" | indexes ensured`,
  );
  return db;
};

const getDB = () => {
  if (!db) throw new Error("Database not initialised. Call connectDB() first.");
  return db;
};

/**
 * toObjectId(id)
 * Safely converts a string to MongoDB ObjectId.
 * Returns null on invalid input so routes handle 404 gracefully.
 */
const toObjectId = (id) => {
  try {
    return new ObjectId(id);
  } catch {
    return null;
  }
};

module.exports = { connectDB, getDB, toObjectId, ObjectId };
