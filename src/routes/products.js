/**
 * routes/products.js  —  ProteinSpot
 *
 * PUBLIC
 *   GET  /api/products/sections      sections + subcategories + live counts
 *   GET  /api/products               product list  (?section= / ?category= / ?search= / ?bestseller=)
 *   GET  /api/products/:id           single product
 *
 * ADMIN
 *   POST   /api/products/cloudinary-sign
 *   POST   /api/products
 *   PUT    /api/products/:id
 *   DELETE /api/products/:id
 *   PATCH  /api/products/:id/stock
 *   POST   /api/products/seed
 */

const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { getDB, toObjectId } = require("../db");
const { adminAuth } = require("../middleware/auth");
const { logAction } = require("../middleware/auditLog");

/* ── Section + subcategory master list ─────────────────
   Single source of truth for the whole app.
   Add a new section/category here — nothing else changes.
─────────────────────────────────────────────────────── */
const SECTIONS = [
  {
    key: "juices",
    label: "Juices",
    emoji: "🥤",
    categories: [
      { key: "seasonal-juices", label: "Seasonal", emoji: "🌸" },
      { key: "citrus-juices", label: "Citrus", emoji: "🍊" },
      { key: "green-juices", label: "Green", emoji: "🥦" },
      { key: "berry-juices", label: "Berry", emoji: "🫐" },
      { key: "energy-shots", label: "Energy Shots", emoji: "⚡" },
      { key: "detox-juices", label: "Detox", emoji: "✨" },
      { key: "special-juices", label: "Special", emoji: "🌟" },
    ],
  },
  {
    key: "salads",
    label: "Salads",
    emoji: "🥗",
    categories: [
      { key: "fruit-salad", label: "Fruit Salad", emoji: "🍓" },
      { key: "bowls", label: "Bowls", emoji: "🥣" },
    ],
  },
  {
    key: "sandwiches",
    label: "Sandwiches",
    emoji: "🥪",
    categories: [
      { key: "veg-sandwiches", label: "Veg", emoji: "🥬" },
      { key: "grilled", label: "Grilled", emoji: "🔥" },
      { key: "wraps", label: "Wraps", emoji: "🌯" },
    ],
  },
  {
    key: "smoothies",
    label: "Smoothies",
    emoji: "🍓",
    categories: [
      { key: "protein-smoothies", label: "Protein", emoji: "💪" },
      { key: "fruit-smoothies", label: "Fruit", emoji: "🍑" },
      { key: "green-smoothies", label: "Green", emoji: "🥬" },
    ],
  },
];

// ── POST /cloudinary-sign  (admin) ──────────────────────
router.post("/cloudinary-sign", adminAuth, (req, res) => {
  try {
    const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } =
      process.env;
    if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET)
      return res
        .status(500)
        .json({ message: "Cloudinary env vars not configured." });

    const timestamp = Math.round(Date.now() / 1000);
    const folder = "proteinspot-products";
    const signature = crypto
      .createHash("sha1")
      .update(`folder=${folder}&timestamp=${timestamp}${CLOUDINARY_API_SECRET}`)
      .digest("hex");

    res.json({
      cloudName: CLOUDINARY_CLOUD_NAME,
      apiKey: CLOUDINARY_API_KEY,
      signature,
      timestamp,
      folder,
    });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to generate signature", error: err.message });
  }
});

// ── GET /sections  (public) ─────────────────────────────
// One call gives the frontend everything it needs to build the tab bar
// and subcategory pills. Only returns subcategories that have ≥1 product.
//
// Response:
// {
//   sections: [
//     { key, label, emoji, totalCount,
//       categories: [{ key, label, emoji, count }, ...] }
//   ]
// }
router.get("/sections", async (req, res) => {
  try {
    const db = getDB();

    // Count available products grouped by category — single DB round trip
    const rows = await db
      .collection("products")
      .aggregate([
        { $match: { isAvailable: true } },
        { $group: { _id: "$category", count: { $sum: 1 } } },
      ])
      .toArray();

    const countMap = {};
    rows.forEach((r) => {
      if (r._id) countMap[r._id] = r.count;
    });

    // Merge hardcoded SECTIONS with any custom overrides in the sections collection
    const customDocs = await db.collection("sections").find({}).toArray();
    const customMap = {};
    customDocs.forEach((d) => {
      customMap[d.key] = d;
    });

    // Build base list: start with hardcoded, apply custom overlays, then add extra custom sections
    const hardcodedKeys = SECTIONS.map((s) => s.key);

    let allSections = SECTIONS.map((sec) => {
      const override = customMap[sec.key];
      const catList = override?.categories || sec.categories;
      const categories = catList
        .map((cat) => ({
          key: cat.key,
          label: cat.label,
          emoji: cat.emoji,
          count: countMap[cat.key] || 0,
        }))
        .filter((cat) => cat.count > 0);
      return {
        key: sec.key,
        label: override?.label || sec.label,
        emoji: override?.emoji || sec.emoji,
        totalCount: categories.reduce((s, c) => s + c.count, 0),
        categories,
      };
    });

    // Add fully custom sections not in hardcoded list
    customDocs
      .filter((d) => !hardcodedKeys.includes(d.key))
      .forEach((sec) => {
        const categories = (sec.categories || [])
          .map((cat) => ({
            key: cat.key,
            label: cat.label,
            emoji: cat.emoji,
            count: countMap[cat.key] || 0,
          }))
          .filter((cat) => cat.count > 0);
        if (categories.length > 0) {
          allSections.push({
            key: sec.key,
            label: sec.label,
            emoji: sec.emoji,
            totalCount: categories.reduce((s, c) => s + c.count, 0),
            categories,
          });
        }
      });

    // Only return sections that have at least one product
    const sections = allSections.filter((s) => s.totalCount > 0);

    res.json({ sections });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to fetch sections", error: err.message });
  }
});

// ── GET /  (public) ─────────────────────────────────────
// ?section=sandwiches            all products in that section
// ?category=veg-sandwiches       products in one subcategory
// ?search=paneer                 text search
// ?bestseller=true               only bestsellers
// ?available=false               include hidden products (admin)
router.get("/", async (req, res) => {
  try {
    const { section, category, bestseller, featured, search, available } =
      req.query;
    const db = getDB();
    const query = {};

    if (available !== "false") query.isAvailable = true;

    if (category) {
      // exact subcategory
      query.category = category;
    } else if (section) {
      // whole section — look up its category keys from master list
      const sec = SECTIONS.find((s) => s.key === section);
      if (sec) query.category = { $in: sec.categories.map((c) => c.key) };
    }

    if (bestseller === "true") query.isBestseller = true;
    if (featured === "true") query.isFeatured = true;

    if (search) {
      const re = new RegExp(search.trim(), "i");
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

// ── GET /:id  (public) ──────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const _id = toObjectId(req.params.id);
    if (!_id) return res.status(400).json({ message: "Invalid product ID" });

    const product = await getDB().collection("products").findOne({ _id });
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch product" });
  }
});

// ── POST /  (admin) ─────────────────────────────────────
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

// ── PUT /:id  (admin) ───────────────────────────────────
router.put("/:id", adminAuth, async (req, res) => {
  try {
    const _id = toObjectId(req.params.id);
    if (!_id) return res.status(400).json({ message: "Invalid product ID" });

    const update = { ...req.body, updatedAt: new Date() };
    delete update._id;

    const result = await getDB()
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

// ── PATCH /:id/stock  (admin) ───────────────────────────
router.patch("/:id/stock", adminAuth, async (req, res) => {
  try {
    const _id = toObjectId(req.params.id);
    if (!_id) return res.status(400).json({ message: "Invalid product ID" });

    const { stock, isAvailable } = req.body;
    const update = { updatedAt: new Date() };
    if (stock !== undefined) update.stock = parseInt(stock, 10);
    if (isAvailable !== undefined) update.isAvailable = Boolean(isAvailable);

    const result = await getDB()
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

// ── DELETE /:id  (admin) ────────────────────────────────
router.delete("/:id", adminAuth, async (req, res) => {
  try {
    const _id = toObjectId(req.params.id);
    if (!_id) return res.status(400).json({ message: "Invalid product ID" });

    const result = await getDB().collection("products").deleteOne({ _id });
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

// ── POST /seed  (admin) ─────────────────────────────────
router.post("/seed", adminAuth, async (req, res) => {
  try {
    const db = getDB();
    const col = db.collection("products");
    if (req.query.clear === "true") await col.deleteMany({});

    const products = JSON.parse(
      fs.readFileSync(path.join(__dirname, "../data/products.json"), "utf-8"),
    );
    const now = new Date();
    const result = await col.insertMany(
      products.map((p) => ({ ...p, createdAt: now, updatedAt: now })),
    );
    res.json({ message: `${result.insertedCount} products seeded` });
  } catch (err) {
    res.status(500).json({ message: "Seeding failed", error: err.message });
  }
});

// ── GET /sections/all  (admin) ──────────────────────────
// Returns ALL sections for admin UI — includes sections with zero products.
// Categories also show their product count.
router.get("/sections/all", adminAuth, async (req, res) => {
  try {
    const db = getDB();

    // Count ALL products (not just available) per category
    const rows = await db
      .collection("products")
      .aggregate([{ $group: { _id: "$category", count: { $sum: 1 } } }])
      .toArray();
    const countMap = {};
    rows.forEach((r) => {
      if (r._id) countMap[r._id] = r.count;
    });

    // Get any custom overrides stored in the sections collection
    const customDocs = await db.collection("sections").find({}).toArray();
    const customMap = {};
    customDocs.forEach((d) => {
      customMap[d.key] = d;
    });

    // Build list: hardcoded SECTIONS merged with custom overrides
    const hardcodedKeys = SECTIONS.map((s) => s.key);

    const result = SECTIONS.map((sec) => {
      const override = customMap[sec.key];
      // Use custom categories list if this section has been overridden, else hardcoded
      const catList = override?.categories || sec.categories;
      const categories = catList.map((cat) => ({
        key: cat.key,
        label: cat.label,
        emoji: cat.emoji || "🍃",
        count: countMap[cat.key] || 0,
      }));
      return {
        key: sec.key,
        label: override?.label || sec.label,
        emoji: override?.emoji || sec.emoji,
        categories,
        totalCount: categories.reduce((s, c) => s + c.count, 0),
      };
    });

    // Append fully-custom sections (not in hardcoded list)
    customDocs
      .filter((d) => !hardcodedKeys.includes(d.key))
      .forEach((sec) => {
        const categories = (sec.categories || []).map((cat) => ({
          key: cat.key,
          label: cat.label,
          emoji: cat.emoji || "🍃",
          count: countMap[cat.key] || 0,
        }));
        result.push({
          key: sec.key,
          label: sec.label,
          emoji: sec.emoji || "📦",
          categories,
          totalCount: categories.reduce((s, c) => s + c.count, 0),
        });
      });

    res.json({ sections: result });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to fetch sections", error: err.message });
  }
});

// ── POST /sections/manage  (admin) ──────────────────────
// Single endpoint for all section/category management.
//
// { action: 'add_section',    section: { key, label, emoji } }
// { action: 'add_category',   sectionKey, category: { key, label, emoji } }
// { action: 'delete_category', sectionKey, categoryKey }
// { action: 'delete_section',  sectionKey }
router.post("/sections/manage", adminAuth, async (req, res) => {
  try {
    const { action } = req.body;
    const db = getDB();
    const col = db.collection("sections");

    // ── add_section ───────────────────────────────────────
    if (action === "add_section") {
      const { key, label, emoji } = req.body.section || {};
      if (!label?.trim())
        return res.status(400).json({ message: "Section label is required" });
      if (!key?.trim())
        return res.status(400).json({ message: "Section key is required" });

      const slug = key
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      // Don't allow overwriting a hardcoded section this way
      if (SECTIONS.find((s) => s.key === slug))
        return res
          .status(400)
          .json({
            message: `"${slug}" is a built-in section and cannot be recreated`,
          });

      // Check duplicate
      const existing = await col.findOne({ key: slug });
      if (existing)
        return res
          .status(400)
          .json({ message: `Section "${slug}" already exists` });

      await col.insertOne({
        key: slug,
        label: label.trim(),
        emoji: emoji || "📦",
        categories: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await logAction(
        req.user,
        "section_added",
        "Section",
        slug,
        { label },
        req,
      );
      return res.json({ message: `Section "${label}" added`, key: slug });
    }

    // ── add_category ──────────────────────────────────────
    if (action === "add_category") {
      const { sectionKey, category } = req.body;
      if (!sectionKey)
        return res.status(400).json({ message: "sectionKey is required" });
      if (!category?.label?.trim())
        return res.status(400).json({ message: "Category label is required" });
      if (!category?.key?.trim())
        return res.status(400).json({ message: "Category key is required" });

      const catSlug = category.key
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      const newCat = {
        key: catSlug,
        label: category.label.trim(),
        emoji: category.emoji || "🍃",
      };

      const hardcoded = SECTIONS.find((s) => s.key === sectionKey);
      const existing = await col.findOne({ key: sectionKey });

      if (!hardcoded && !existing)
        return res
          .status(404)
          .json({ message: `Section "${sectionKey}" not found` });

      if (existing) {
        // Section already has a custom doc — just push to its categories
        const already = (existing.categories || []).find(
          (c) => c.key === catSlug,
        );
        if (already)
          return res
            .status(400)
            .json({
              message: `Subcategory "${catSlug}" already exists in this section`,
            });
        await col.updateOne(
          { key: sectionKey },
          { $push: { categories: newCat }, $set: { updatedAt: new Date() } },
        );
      } else {
        // Hardcoded section — create a custom overlay that includes all existing
        // hardcoded subcategories PLUS the new one
        const hardcodedCats = hardcoded.categories.map((c) => ({
          key: c.key,
          label: c.label,
          emoji: c.emoji || "🍃",
        }));
        const already = hardcodedCats.find((c) => c.key === catSlug);
        if (already)
          return res
            .status(400)
            .json({
              message: `Subcategory "${catSlug}" already exists in this section`,
            });

        await col.insertOne({
          key: sectionKey,
          label: hardcoded.label,
          emoji: hardcoded.emoji,
          categories: [...hardcodedCats, newCat],
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      await logAction(
        req.user,
        "category_added",
        "Section",
        sectionKey,
        { category: catSlug },
        req,
      );
      return res.json({
        message: `Subcategory "${category.label}" added to ${sectionKey}`,
      });
    }

    // ── delete_category ───────────────────────────────────
    if (action === "delete_category") {
      const { sectionKey, categoryKey } = req.body;
      if (!sectionKey || !categoryKey)
        return res
          .status(400)
          .json({ message: "sectionKey and categoryKey are required" });

      // Block delete if products still use this category
      const productCount = await db
        .collection("products")
        .countDocuments({ category: categoryKey });
      if (productCount > 0)
        return res
          .status(400)
          .json({
            message: `Cannot delete: ${productCount} product(s) are still using this subcategory`,
          });

      const hardcoded = SECTIONS.find((s) => s.key === sectionKey);
      const existing = await col.findOne({ key: sectionKey });

      if (existing) {
        // Remove from custom doc
        await col.updateOne(
          { key: sectionKey },
          {
            $pull: { categories: { key: categoryKey } },
            $set: { updatedAt: new Date() },
          },
        );
      } else if (hardcoded) {
        // No custom doc yet — create one with the category removed
        const cats = hardcoded.categories
          .filter((c) => c.key !== categoryKey)
          .map((c) => ({ key: c.key, label: c.label, emoji: c.emoji || "🍃" }));
        await col.insertOne({
          key: sectionKey,
          label: hardcoded.label,
          emoji: hardcoded.emoji,
          categories: cats,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      } else {
        return res
          .status(404)
          .json({ message: `Section "${sectionKey}" not found` });
      }

      await logAction(
        req.user,
        "category_deleted",
        "Section",
        sectionKey,
        { category: categoryKey },
        req,
      );
      return res.json({ message: `Subcategory "${categoryKey}" removed` });
    }

    // ── delete_section ────────────────────────────────────
    if (action === "delete_section") {
      const { sectionKey } = req.body;
      if (!sectionKey)
        return res.status(400).json({ message: "sectionKey is required" });

      if (SECTIONS.find((s) => s.key === sectionKey))
        return res
          .status(400)
          .json({
            message: `"${sectionKey}" is a built-in section and cannot be deleted`,
          });

      // Block delete if products exist in any of its categories
      const customDoc = await col.findOne({ key: sectionKey });
      const catKeys = (customDoc?.categories || []).map((c) => c.key);
      if (catKeys.length > 0) {
        const productCount = await db
          .collection("products")
          .countDocuments({ category: { $in: catKeys } });
        if (productCount > 0)
          return res
            .status(400)
            .json({
              message: `Cannot delete: ${productCount} product(s) are in this section`,
            });
      }

      await col.deleteOne({ key: sectionKey });
      await logAction(
        req.user,
        "section_deleted",
        "Section",
        sectionKey,
        {},
        req,
      );
      return res.json({ message: `Section "${sectionKey}" deleted` });
    }

    return res.status(400).json({ message: `Unknown action: "${action}"` });
  } catch (err) {
    console.error("Section manage error:", err);
    res
      .status(500)
      .json({ message: "Section management failed", error: err.message });
  }
});

module.exports = router;
