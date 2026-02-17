/**
 * routes/products.js
 * ─────────────────────────────────────────────────────
 * PURPOSE: Product catalogue CRUD.
 *
 * ROUTES (public):
 *   GET  /api/products           – list / filter / search
 *   GET  /api/products/:id       – single product
 *
 * ROUTES (admin only):
 *   POST   /api/products         – create product
 *   PUT    /api/products/:id     – update product
 *   DELETE /api/products/:id     – delete product
 *   PATCH  /api/products/:id/stock – update stock
 *   POST   /api/products/seed    – load from products.json
 *
 * DATA SHAPE (collection: "products"):
 *   See  src/data/products.json  for field reference.
 *   Extra fields always set by API:
 *     createdAt, updatedAt, isAvailable (default true), stock (default 30)
 * ─────────────────────────────────────────────────────
 */

const express    = require('express');
const router     = express.Router();
const path       = require('path');
const fs         = require('fs');
const { getDB, toObjectId } = require('../db');
const { adminAuth }         = require('../middleware/auth');

// ── GET /  (public) ────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { category, bestseller, featured, search, available } = req.query;
    const db    = getDB();
    const query = {};

    // Filters
    if (available !== 'false') query.isAvailable = true;  // default: show only available
    if (category)              query.category     = category;
    if (bestseller === 'true') query.isBestseller = true;
    if (featured   === 'true') query.isFeatured   = true;

    // Text search — uses the text index on name + description
    if (search) {
      query.$or = [
        { name:        { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags:        { $in:    [new RegExp(search, 'i')] } },
      ];
    }

    const products = await db.collection('products')
      .find(query)
      .sort({ isBestseller: -1, createdAt: -1 })
      .toArray();

    res.json(products);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch products', error: err.message });
  }
});

// ── GET /:id  (public) ─────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const _id = toObjectId(req.params.id);
    if (!_id) return res.status(400).json({ message: 'Invalid product ID' });

    const db      = getDB();
    const product = await db.collection('products').findOne({ _id });

    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch product' });
  }
});

// ── POST /  (admin) ────────────────────────────────────
router.post('/', adminAuth, async (req, res) => {
  try {
    const now = new Date();
    const doc = {
      ...req.body,
      isAvailable: req.body.isAvailable ?? true,
      stock:       req.body.stock       ?? 30,
      rating:      req.body.rating      ?? 4.5,
      reviewCount: req.body.reviewCount ?? 0,
      createdAt:   now,
      updatedAt:   now,
    };

    // Basic validation
    if (!doc.name || !doc.price || !doc.category) {
      return res.status(400).json({ message: 'name, price, and category are required' });
    }

    const db     = getDB();
    const result = await db.collection('products').insertOne(doc);
    res.status(201).json({ ...doc, _id: result.insertedId });
  } catch (err) {
    res.status(400).json({ message: 'Failed to create product', error: err.message });
  }
});

// ── PUT /:id  (admin) ──────────────────────────────────
router.put('/:id', adminAuth, async (req, res) => {
  try {
    const _id = toObjectId(req.params.id);
    if (!_id) return res.status(400).json({ message: 'Invalid product ID' });

    const db     = getDB();
    const update = { ...req.body, updatedAt: new Date() };
    delete update._id; // never update _id

    const result = await db.collection('products').findOneAndUpdate(
      { _id },
      { $set: update },
      { returnDocument: 'after' }
    );

    if (!result) return res.status(404).json({ message: 'Product not found' });
    res.json(result);
  } catch (err) {
    res.status(400).json({ message: 'Failed to update product', error: err.message });
  }
});

// ── PATCH /:id/stock  (admin) ──────────────────────────
router.patch('/:id/stock', adminAuth, async (req, res) => {
  try {
    const _id = toObjectId(req.params.id);
    if (!_id) return res.status(400).json({ message: 'Invalid product ID' });

    const { stock, isAvailable } = req.body;
    const db = getDB();
    const update = { updatedAt: new Date() };
    if (stock       !== undefined) update.stock       = parseInt(stock, 10);
    if (isAvailable !== undefined) update.isAvailable = Boolean(isAvailable);

    const result = await db.collection('products').findOneAndUpdate(
      { _id },
      { $set: update },
      { returnDocument: 'after' }
    );

    if (!result) return res.status(404).json({ message: 'Product not found' });
    res.json(result);
  } catch (err) {
    res.status(400).json({ message: 'Failed to update stock', error: err.message });
  }
});

// ── DELETE /:id  (admin) ───────────────────────────────
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const _id = toObjectId(req.params.id);
    if (!_id) return res.status(400).json({ message: 'Invalid product ID' });

    const db     = getDB();
    const result = await db.collection('products').deleteOne({ _id });

    if (result.deletedCount === 0)
      return res.status(404).json({ message: 'Product not found' });

    res.json({ message: 'Product deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete product' });
  }
});

// ── POST /seed  (admin) ────────────────────────────────
// Loads src/data/products.json into the collection.
// Add --clear query param to wipe first: POST /api/products/seed?clear=true
router.post('/seed', adminAuth, async (req, res) => {
  try {
    const db  = getDB();
    const col = db.collection('products');

    if (req.query.clear === 'true') await col.deleteMany({});

    const jsonPath = path.join(__dirname, '../data/products.json');
    const products = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

    const now  = new Date();
    const docs = products.map(p => ({ ...p, createdAt: now, updatedAt: now }));

    const result = await col.insertMany(docs);
    res.json({ message: `${result.insertedCount} products seeded` });
  } catch (err) {
    res.status(500).json({ message: 'Seeding failed', error: err.message });
  }
});

module.exports = router;
