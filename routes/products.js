const express = require('express');
const router = express.Router();
const { getDB } = require('../db/connection');

// ─── GET /api/products ────────────────────────────────────────────────────────
// Query: ?category=citrus&type=juices&search=mango
router.get('/', async (req, res) => {
  try {
    
    const { category, type, search } = req.query;
    const db = getDB();

    // const filter = { isActive: true };
    // if (category && category !== 'all') filter.category = category;
    // if (type && type !== 'all')         filter.type = type;
    // if (search) {
    //   filter.$or = [
    //     { name:        { $regex: search, $options: 'i' } },
    //     { description: { $regex: search, $options: 'i' } },
    //   ];
    // }

    const products = await db
      .collection('products')
      .find()
      // .sort({ isBestseller: -1, createdAt: -1 })
      .toArray();
console.log(products)
    res.json({ products });
  } catch (err) {
    console.error('❌ Get products error:', err.message);
    res.status(500).json({ message: 'Failed to fetch products.' });
  }
});

// ─── GET /api/products/:id ────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { ObjectId } = require('mongodb');
    const db = getDB();

    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid product ID.' });
    }

    const product = await db.collection('products').findOne({ _id: new ObjectId(req.params.id) });
    if (!product) return res.status(404).json({ message: 'Product not found.' });

    res.json({ product });
  } catch (err) {
    console.error('❌ Get product error:', err.message);
    res.status(500).json({ message: 'Failed to fetch product.' });
  }
});

module.exports = router;
