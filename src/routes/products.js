/**
 * routes/products.js  —  ProteinSpot
 * ─────────────────────────────────────────────────────
 * PURPOSE: Product catalogue CRUD.
 *
 * ROUTES (public):
 *   GET  /api/products           – list / filter / search
 *   GET  /api/products/:id       – single product
 *
 * ROUTES (admin only):
 *   POST   /api/products              – create product
 *   PUT    /api/products/:id          – update product
 *   DELETE /api/products/:id          – delete product
 *   PATCH  /api/products/:id/stock    – update stock only
 *   POST   /api/products/cloudinary-sign – signed upload URL
 *   POST   /api/products/seed         – seed from products.json
 *
 * SECTIONS & CATEGORIES:
 *   Juices      → seasonal-juices, citrus-juices, green-juices,
 *                 berry-juices, energy-shots, detox-juices, special-juices
 *   Salads      → fruit-salad, bowls
 *   Sandwiches  → veg-sandwiches, grilled, wraps
 *   Smoothies   → protein-smoothies, fruit-smoothies, green-smoothies
 * ─────────────────────────────────────────────────────
 */

const express = require("express");
const router = require("express").Router();
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { getDB, toObjectId } = require("../db");
const { adminAuth } = require("../middleware/auth");
const { logAction } = require("../middleware/auditLog");

// ── Category → section mapping (for type-based filtering) ──
const SECTION_CATEGORIES = {
  juices: [
    "seasonal-juices",
    "citrus-juices",
    "green-juices",
    "berry-juices",
    "energy-shots",
    "detox-juices",
    "special-juices",
  ],
  salads: ["fruit-salad", "bowls"],
  sandwiches: ["veg-sandwiches", "grilled", "wraps"],
  smoothies: ["protein-smoothies", "fruit-smoothies", "green-smoothies"],
};

// ── POST /cloudinary-sign  (admin) ─────────────────────
router.post("/cloudinary-sign", adminAuth, (req, res) => {
  try {
    const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } =
      process.env;
    if (
      !CLOUDINARY_CLOUD_NAME ||
      !CLOUDINARY_API_KEY ||
      !CLOUDINARY_API_SECRET
    ) {
      return res.status(500).json({
        message:
          "Cloudinary env vars not configured. Add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET to .env",
      });
    }

    const timestamp = Math.round(Date.now() / 1000);
    const folder = "proteinspot-products";

    // Signature: SHA-1 of "folder=<folder>&timestamp=<ts><secret>"
    // IMPORTANT: frontend must send EXACTLY these two fields (folder + timestamp)
    // in the FormData — adding any extra signed param will break the signature.
    const signStr = `folder=${folder}&timestamp=${timestamp}${CLOUDINARY_API_SECRET}`;
    const signature = crypto.createHash("sha1").update(signStr).digest("hex");

    res.json({
      cloudName: CLOUDINARY_CLOUD_NAME,
      apiKey: CLOUDINARY_API_KEY,
      signature,
      timestamp,
      folder,
    });
  } catch (err) {
    res.status(500).json({
      message: "Failed to generate Cloudinary signature",
      error: err.message,
    });
  }
});

// ── GET /categories  (public) ──────────────────────────
// Returns every distinct category that has at least one available product.
// Frontend uses this to build dynamic sub-category filters per section.
router.get("/categories", async (req, res) => {
  try {
    const db = getDB();
    const results = await db
      .collection("products")
      .aggregate([
        { $match: { isAvailable: true } },
        { $group: { _id: "$category", count: { $sum: 1 } } },
        { $match: { _id: { $ne: null } } },
        { $sort: { _id: 1 } },
      ])
      .toArray();

    const categories = results.map((r) => ({
      category: r._id,
      count: r.count,
    }));
    res.json({ categories });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to fetch categories", error: err.message });
  }
});

// ── GET /  (public) ────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const { category, bestseller, featured, search, available, type, section } =
      req.query;
    const db = getDB();
    const query = {};

    // Default: only show available products (pass available=false to override)
    if (available !== "false") query.isAvailable = true;

    // Category filter — supports multiple values (repeating ?category=x&category=y)
    if (category) {
      const cats = Array.isArray(category) ? category : [category];
      query.category = cats.length === 1 ? cats[0] : { $in: cats };
    }

    // Section filter (maps to the section's category list)
    if (section && !category && SECTION_CATEGORIES[section]) {
      query.category = { $in: SECTION_CATEGORIES[section] };
    }

    // Legacy type filter: juice | food
    if (!category && !section) {
      const FOOD_CATS = [
        ...SECTION_CATEGORIES.salads,
        ...SECTION_CATEGORIES.sandwiches,
      ];
      if (type === "food") query.category = { $in: FOOD_CATS };
      if (type === "juice") query.category = { $nin: FOOD_CATS };
    }

    if (bestseller === "true") query.isBestseller = true;
    if (featured === "true") query.isFeatured = true;

    // Text search
    if (search) {
      const re = new RegExp(search, "i");
      query.$or = [{ name: re }, { description: re }, { tags: { $in: [re] } }];
    }

    const products = await db
      .collection("products")
      .find(query)
      .sort({ isBestseller: -1, createdAt: -1 })
      .toArray();

    res.json(products);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to fetch products", error: err.message });
  }
});

// ── GET /:id  (public) ─────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const _id = toObjectId(req.params.id);
    if (!_id) return res.status(400).json({ message: "Invalid product ID" });

    const db = getDB();
    const product = await db.collection("products").findOne({ _id });

    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch product" });
  }
});

// ── POST /  (admin) ────────────────────────────────────
router.post("/", adminAuth, async (req, res) => {
  try {
    const now = new Date();
    const doc = {
      ...req.body,
      isAvailable: req.body.isAvailable ?? true,
      stock: req.body.stock ?? 30,
      rating: req.body.rating ?? 4.5,
      reviewCount: req.body.reviewCount ?? 0,
      createdAt: now,
      updatedAt: now,
    };

    if (!doc.name || !doc.price || !doc.category)
      return res
        .status(400)
        .json({ message: "name, price, and category are required" });

    const db = getDB();
    const result = await db.collection("products").insertOne(doc);
    await logAction(
      req.user,
      "product_added",
      "Product",
      result.insertedId,
      { name: doc.name, price: doc.price, category: doc.category },
      req,
    );

    res.status(201).json({ ...doc, _id: result.insertedId });
  } catch (err) {
    res
      .status(400)
      .json({ message: "Failed to create product", error: err.message });
  }
});

// ── PUT /:id  (admin) ──────────────────────────────────
router.put("/:id", adminAuth, async (req, res) => {
  try {
    const _id = toObjectId(req.params.id);
    if (!_id) return res.status(400).json({ message: "Invalid product ID" });

    const db = getDB();
    const update = { ...req.body, updatedAt: new Date() };
    delete update._id;

    const result = await db
      .collection("products")
      .findOneAndUpdate({ _id }, { $set: update }, { returnDocument: "after" });

    if (!result) return res.status(404).json({ message: "Product not found" });
    await logAction(
      req.user,
      "product_updated",
      "Product",
      req.params.id,
      { name: result.name },
      req,
    );

    res.json(result);
  } catch (err) {
    res
      .status(400)
      .json({ message: "Failed to update product", error: err.message });
  }
});

// ── PATCH /:id/stock  (admin) ──────────────────────────
router.patch("/:id/stock", adminAuth, async (req, res) => {
  try {
    const _id = toObjectId(req.params.id);
    if (!_id) return res.status(400).json({ message: "Invalid product ID" });

    const { stock, isAvailable } = req.body;
    const db = getDB();
    const update = { updatedAt: new Date() };
    if (stock !== undefined) update.stock = parseInt(stock, 10);
    if (isAvailable !== undefined) update.isAvailable = Boolean(isAvailable);

    const result = await db
      .collection("products")
      .findOneAndUpdate({ _id }, { $set: update }, { returnDocument: "after" });

    if (!result) return res.status(404).json({ message: "Product not found" });
    res.json(result);
  } catch (err) {
    res
      .status(400)
      .json({ message: "Failed to update stock", error: err.message });
  }
});

// ── DELETE /:id  (admin) ───────────────────────────────
router.delete("/:id", adminAuth, async (req, res) => {
  try {
    const _id = toObjectId(req.params.id);
    if (!_id) return res.status(400).json({ message: "Invalid product ID" });

    const db = getDB();
    const result = await db.collection("products").deleteOne({ _id });

    if (result.deletedCount === 0)
      return res.status(404).json({ message: "Product not found" });

    await logAction(
      req.user,
      "product_deleted",
      "Product",
      req.params.id,
      {},
      req,
    );
    res.json({ message: "Product deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete product" });
  }
});

// ── POST /seed  (admin) ────────────────────────────────
router.post("/seed", adminAuth, async (req, res) => {
  try {
    const db = getDB();
    const col = db.collection("products");

    if (req.query.clear === "true") await col.deleteMany({});

    const jsonPath = path.join(__dirname, "../data/products.json");
    const products = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    const now = new Date();
    const docs = products.map((p) => ({
      ...p,
      createdAt: now,
      updatedAt: now,
    }));

    const result = await col.insertMany(docs);
    res.json({ message: `${result.insertedCount} products seeded` });
  } catch (err) {
    res.status(500).json({ message: "Seeding failed", error: err.message });
  }
});

module.exports = router;
