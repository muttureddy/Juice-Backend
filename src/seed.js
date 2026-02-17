/**
 * seed.js
 * ─────────────────────────────────────────────────────
 * PURPOSE: Load product data from  src/data/products.json
 *          into the MongoDB "products" collection.
 *
 * HOW TO RUN:
 *   cd backend
 *   npm run seed
 *   # or:
 *   node src/seed.js
 *   node src/seed.js --clear   ← deletes existing first
 *
 * TO CHANGE WHAT GETS SEEDED:
 *   Edit  src/data/products.json  and re-run this script.
 *   Each JSON object becomes one document in "products".
 *
 * FIELDS ADDED AUTOMATICALLY:
 *   createdAt, updatedAt  (ISO date strings)
 * ─────────────────────────────────────────────────────
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');
const path = require('path');
const fs = require('fs');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME     = process.env.DB_NAME     || 'freshly_db';

async function seed() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const col = db.collection('products');

    // Optional: clear existing data
    if (process.argv.includes('--clear')) {
      await col.deleteMany({});
      console.log('🗑  Cleared existing products.');
    }

    // Load JSON
    const jsonPath = path.join(__dirname, 'data', 'products.json');
    const raw      = fs.readFileSync(jsonPath, 'utf-8');
    const products = JSON.parse(raw);

    // Stamp timestamps
    const now  = new Date();
    const docs = products.map(p => ({
      ...p,
      stock:     p.stock     ?? 30,
      createdAt: now,
      updatedAt: now,
    }));

    const result = await col.insertMany(docs);
    console.log(`✅ Seeded ${result.insertedCount} products into "${DB_NAME}.products"`);

    // Create useful indexes
    await col.createIndex({ category: 1 });
    await col.createIndex({ isBestseller: 1 });
    await col.createIndex({ isFeatured: 1 });
    await col.createIndex({ isAvailable: 1 });
    await col.createIndex(
      { name: 'text', description: 'text' },
      { name: 'product_text_search' }
    );
    console.log('📑  Indexes created.');
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  } finally {
    await client.close();
    process.exit(0);
  }
}

seed();
