/**
 * seed.js  —  ProteinSpot
 * ─────────────────────────────────────────────────────
 * Loads src/data/products.json into MongoDB.
 *
 * HOW TO RUN:
 *   npm run seed              ← upserts by name (replaces duplicates, adds new)
 *   npm run seed -- --clear   ← wipes collection first, then seeds fresh
 *
 * CATEGORIES COVERED (57 products total):
 *   Juices     → seasonal-juices (3) | citrus-juices (3) | green-juices (3)
 *                berry-juices (2) | energy-shots (2) | detox-juices (2) | special-juices (2)
 *   Salads     → fruit-salad (3) | bowls (2)
 *   Sandwiches → veg-sandwiches (6) | grilled (5) | wraps (6)
 *   Smoothies  → protein-smoothies (6) | fruit-smoothies (6) | green-smoothies (6)
 * ─────────────────────────────────────────────────────
 */

require("dotenv").config();
const { MongoClient } = require("mongodb");
const path = require("path");
const fs = require("fs");

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017";
const DB_NAME = process.env.DB_NAME || "proteinspot_db";

async function seed() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log(`🔌 Connected to MongoDB`);

    const db = client.db(DB_NAME);
    const col = db.collection("products");

    // ── Optional: clear existing products ──────────────
    if (process.argv.includes("--clear")) {
      const { deletedCount } = await col.deleteMany({});
      console.log(
        `🗑  Cleared ${deletedCount} existing products from "${DB_NAME}"`,
      );
    }

    // ── Load products.json ──────────────────────────────
    const jsonPath = path.join(__dirname, "data", "products.json");

    if (!fs.existsSync(jsonPath)) {
      console.error(`❌ products.json not found at: ${jsonPath}`);
      process.exit(1);
    }

    const products = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    const now = new Date();

    const docs = products.map((p) => ({
      ...p,
      stock: p.stock ?? 30,
      rating: p.rating ?? 4.5,
      reviewCount: p.reviewCount ?? 0,
      isAvailable: p.isAvailable !== false,
      createdAt: now,
      updatedAt: now,
    }));

    // ── Upsert by name (no duplicates) ─────────────────
    // Each product is matched by name.
    //   - exists → replaced with fresh data from JSON
    //   - new    → inserted
    // Running seed multiple times is always safe.
    const ops = docs.map((doc) => ({
      replaceOne: {
        filter: { name: doc.name },
        replacement: doc,
        upsert: true,
      },
    }));

    const result = await col.bulkWrite(ops, { ordered: false });
    const inserted = result.upsertedCount;
    const replaced = result.modifiedCount;
    console.log(`✅ Seed complete → "${DB_NAME}.products"`);
    console.log(`   ${inserted} new products inserted`);
    console.log(`   ${replaced} existing products replaced\n`);

    // ── Print summary by category ───────────────────────
    const cats = {};
    docs.forEach((p) => {
      cats[p.category] = (cats[p.category] || 0) + 1;
    });

    const SECTION_MAP = {
      "seasonal-juices": "🥤 Juices",
      "citrus-juices": "🥤 Juices",
      "green-juices": "🥤 Juices",
      "berry-juices": "🥤 Juices",
      "energy-shots": "🥤 Juices",
      "detox-juices": "🥤 Juices",
      "special-juices": "🥤 Juices",
      "fruit-salad": "🥗 Salads",
      bowls: "🥗 Salads",
      "veg-sandwiches": "🥪 Sandwiches",
      grilled: "🥪 Sandwiches",
      wraps: "🥪 Sandwiches",
      "protein-smoothies": "🍓 Smoothies",
      "fruit-smoothies": "🍓 Smoothies",
      "green-smoothies": "🍓 Smoothies",
    };

    const grouped = {};
    Object.entries(cats)
      .sort()
      .forEach(([cat, count]) => {
        const section = SECTION_MAP[cat] || "📦 Other";
        if (!grouped[section]) grouped[section] = [];
        grouped[section].push(`${cat} (${count})`);
      });

    Object.entries(grouped).forEach(([section, items]) => {
      console.log(`  ${section}`);
      items.forEach((i) => console.log(`    • ${i}`));
    });

    // ── Ensure indexes ──────────────────────────────────
    console.log("\n📑 Ensuring indexes…");
    await col.createIndex({ category: 1 });
    await col.createIndex({ isAvailable: 1 });
    await col.createIndex({ isBestseller: 1 });
    await col.createIndex({ isFeatured: 1 });
    await col.createIndex({ createdAt: -1 });
    await col.createIndex({ isAvailable: 1, category: 1 });
    await col.createIndex({ isAvailable: 1, isBestseller: -1 });

    try {
      await col.dropIndex("product_text_search");
    } catch (_) {}
    await col.createIndex(
      { name: "text", description: "text", tags: "text" },
      {
        name: "product_text_search",
        weights: { name: 10, tags: 5, description: 1 },
      },
    );
    console.log("✅ Indexes ready\n");

    console.log(
      "🎉 Seed complete! Start your server and visit /products to see all items.",
    );
  } catch (err) {
    console.error("❌ Seed failed:", err.message);
    process.exit(1);
  } finally {
    await client.close();
    process.exit(0);
  }
}

seed();
