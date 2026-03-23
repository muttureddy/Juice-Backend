/**
 * routes/admin.js  — All admin-only endpoints.
 *
 * 1. DASHBOARD   GET  /api/admin/dashboard
 * 2. ORDERS      GET/PATCH /api/admin/orders
 * 3. USERS       GET/PATCH/DELETE /api/admin/users
 * 4. INVENTORY   GET /api/admin/inventory  |  PATCH /api/admin/inventory/:id
 * 5. SETUP       POST /api/admin/setup
 * 6. AUDIT LOGS  GET  /api/admin/audit-logs  (action / entity / role / search filters)
 * 7. PAYMENTS    GET  /api/admin/payments
 */

const express = require("express");
const router = express.Router();
const { getDB, toObjectId } = require("../db");
const { adminAuth, invalidateUserCache } = require("../middleware/auth");
const { logAction } = require("../middleware/auditLog");

const VALID_STATUSES = [
  "pending",
  "confirmed",
  "preparing",
  "shipped",
  "out_for_delivery",
  "delivered",
  "cancelled",
];

/* Section → categories: resolved dynamically from DB + hardcoded fallback */
const HARDCODED_SECTIONS = {
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

// Returns category keys for a section, checking DB overrides first
async function getCatsForSection(db, sectionKey) {
  try {
    const custom = await db.collection("sections").findOne({ key: sectionKey });
    if (custom?.categories?.length) return custom.categories.map((c) => c.key);
  } catch (_) {}
  return HARDCODED_SECTIONS[sectionKey] || [];
}

/* ══ 1. DASHBOARD ═══════════════════════════════════ */

router.get("/dashboard", adminAuth, async (req, res) => {
  try {
    const db = getDB();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tom = new Date(today);
    tom.setDate(tom.getDate() + 1);

    const [
      totalOrders,
      todayOrders,
      totalUsers,
      totalProducts,
      revenueResult,
      ordersByStatus,
      recentOrders,
      lowStockCount,
    ] = await Promise.all([
      db.collection("orders").countDocuments(),
      db
        .collection("orders")
        .countDocuments({ createdAt: { $gte: today, $lt: tom } }),
      db.collection("users").countDocuments({ role: "user" }),
      db.collection("products").countDocuments({ isAvailable: true }),

      db
        .collection("orders")
        .aggregate([
          { $match: { orderStatus: { $ne: "cancelled" } } },
          { $group: { _id: null, total: { $sum: "$total" } } },
        ])
        .toArray(),

      db
        .collection("orders")
        .aggregate([{ $group: { _id: "$orderStatus", count: { $sum: 1 } } }])
        .toArray(),

      db
        .collection("orders")
        .aggregate([
          { $sort: { createdAt: -1 } },
          { $limit: 5 },
          {
            $lookup: {
              from: "users",
              localField: "userId",
              foreignField: "_id",
              as: "user",
            },
          },
          { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
          {
            $project: {
              orderId: 1,
              total: 1,
              orderStatus: 1,
              createdAt: 1,
              "customerDetails.name": 1,
              "customerDetails.phone": 1,
              "user.name": 1,
              "user.phone": 1,
            },
          },
        ])
        .toArray(),

      db.collection("products").countDocuments({ stock: { $lt: 10 } }),
    ]);

    res.json({
      stats: {
        totalOrders,
        todayOrders,
        totalUsers,
        totalProducts,
        totalRevenue: revenueResult[0]?.total || 0,
        lowStockCount,
      },
      ordersByStatus,
      recentOrders,
    });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Dashboard fetch failed", error: err.message });
  }
});

/* ══ 2. ORDERS ══════════════════════════════════════ */

router.get("/orders", adminAuth, async (req, res) => {
  try {
    const { status, page = 1, limit = 15, search } = req.query;
    const db = getDB();
    const query = {};

    if (status && status !== "all") query.orderStatus = status;
    if (search) {
      query.$or = [
        { orderId: { $regex: search, $options: "i" } },
        { "customerDetails.name": { $regex: search, $options: "i" } },
        { "customerDetails.phone": { $regex: search, $options: "i" } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [orders, total] = await Promise.all([
      db
        .collection("orders")
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .toArray(),
      db.collection("orders").countDocuments(query),
    ]);

    res.json({ orders, total, pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch orders" });
  }
});

router.get("/orders/:id", adminAuth, async (req, res) => {
  try {
    const _id = toObjectId(req.params.id);
    const db = getDB();
    const order = await db
      .collection("orders")
      .findOne(
        _id
          ? { $or: [{ _id }, { orderId: req.params.id }] }
          : { orderId: req.params.id },
      );
    if (!order) return res.status(404).json({ message: "Order not found" });
    res.json(order);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch order" });
  }
});

router.patch("/orders/:id/status", adminAuth, async (req, res) => {
  try {
    const { status, note } = req.body;
    if (!VALID_STATUSES.includes(status))
      return res.status(400).json({ message: "Invalid order status" });

    const _id = toObjectId(req.params.id);
    if (!_id) return res.status(400).json({ message: "Invalid order ID" });

    const db = getDB();
    const now = new Date();
    const setFields = { orderStatus: status, updatedAt: now };
    if (status === "delivered") {
      setFields.deliveredAt = now;
      setFields.paymentStatus = "paid";
    }

    const existingOrder = await db
      .collection("orders")
      .findOne({ _id }, { projection: { orderStatus: 1 } });

    const result = await db.collection("orders").findOneAndUpdate(
      { _id },
      {
        $set: setFields,
        $push: {
          statusHistory: {
            status,
            note: note || `Updated to ${status}`,
            timestamp: now,
          },
        },
      },
      { returnDocument: "after" },
    );

    if (!result) return res.status(404).json({ message: "Order not found" });

    await logAction(
      req.user,
      "order_status",
      "Order",
      req.params.id,
      { from: existingOrder?.orderStatus, to: status },
      req,
    );

    res.json({ message: `Status → ${status}`, order: result });
  } catch (err) {
    res.status(500).json({ message: "Failed to update order status" });
  }
});

/* ── PATCH /orders/:id/admin-note  (admin) ──────────
   Set or update a freeform admin message on an order.
   Visible to the customer in their order history.
─────────────────────────────────────────────────── */
router.patch("/orders/:id/admin-note", adminAuth, async (req, res) => {
  try {
    const { adminNote } = req.body;
    if (adminNote === undefined)
      return res.status(400).json({ message: "adminNote is required" });

    const _id = toObjectId(req.params.id);
    if (!_id) return res.status(400).json({ message: "Invalid order ID" });

    const db = getDB();
    const result = await db
      .collection("orders")
      .findOneAndUpdate(
        { _id },
        { $set: { adminNote: adminNote.trim(), updatedAt: new Date() } },
        { returnDocument: "after" },
      );

    if (!result) return res.status(404).json({ message: "Order not found" });

    await logAction(
      req.user,
      "order_note",
      "Order",
      req.params.id,
      { note: adminNote.trim() },
      req,
    );

    res.json({ message: "Note saved", order: result });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to save note", error: err.message });
  }
});

/* ── PATCH /orders/:id/items  (admin) ───────────────
   Admin can mark items as removed (struck off).
   Recalculates subtotal, deliveryFee, and total.
   Each item gets a `removed: true` flag + removedAt timestamp.
─────────────────────────────────────────────────── */
const DELIVERY_THRESHOLD = 299;
const DELIVERY_FEE_AMOUNT = 40;

router.patch("/orders/:id/items", adminAuth, async (req, res) => {
  try {
    const { removedItemIndexes } = req.body;
    // removedItemIndexes: array of item indexes (0-based) to mark as removed

    if (!Array.isArray(removedItemIndexes))
      return res
        .status(400)
        .json({ message: "removedItemIndexes must be an array" });

    const _id = toObjectId(req.params.id);
    if (!_id) return res.status(400).json({ message: "Invalid order ID" });

    const db = getDB();
    const order = await db.collection("orders").findOne({ _id });
    if (!order) return res.status(404).json({ message: "Order not found" });

    // Mark items as removed / restore them
    const now = new Date();
    const items = order.items.map((item, i) => ({
      ...item,
      removed: removedItemIndexes.includes(i),
      removedAt: removedItemIndexes.includes(i) ? now : null,
    }));

    // Recalculate totals using only active (non-removed) items
    const subtotal = items
      .filter((i) => !i.removed)
      .reduce((s, i) => s + i.price * i.quantity, 0);
    const deliveryFee =
      subtotal === 0
        ? 0
        : subtotal >= DELIVERY_THRESHOLD
          ? 0
          : DELIVERY_FEE_AMOUNT;
    const total = subtotal + deliveryFee;
    const removedCount = items.filter((i) => i.removed).length;

    const result = await db.collection("orders").findOneAndUpdate(
      { _id },
      {
        $set: {
          items,
          subtotal,
          deliveryFee,
          total,
          updatedAt: now,
        },
        $push: {
          statusHistory: {
            status: order.orderStatus,
            note: `Admin adjusted order: ${removedCount} item(s) removed. New total: ₹${total}`,
            timestamp: now,
          },
        },
      },
      { returnDocument: "after" },
    );

    await logAction(
      req.user,
      "order_items_updated",
      "Order",
      req.params.id,
      { removedCount, newTotal: total },
      req,
    );

    res.json({ message: "Order items updated", order: result });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to update items", error: err.message });
  }
});

/* ══ 3. USERS ═══════════════════════════════════════ */

router.get("/users", adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 20, search, role } = req.query;
    const db = getDB();
    const query = {};

    if (role && role !== "all") query.role = role;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [users, total] = await Promise.all([
      db
        .collection("users")
        .find(query, { projection: { otp: 0 } })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .toArray(),
      db.collection("users").countDocuments(query),
    ]);

    res.json({ users, total, pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch users" });
  }
});

router.get("/users/:id", adminAuth, async (req, res) => {
  try {
    const _id = toObjectId(req.params.id);
    if (!_id) return res.status(400).json({ message: "Invalid user ID" });

    const db = getDB();
    const user = await db
      .collection("users")
      .findOne({ _id }, { projection: { otp: 0 } });
    if (!user) return res.status(404).json({ message: "User not found" });

    const [orderCount, spendResult] = await Promise.all([
      db.collection("orders").countDocuments({ userId: _id }),
      db
        .collection("orders")
        .aggregate([
          { $match: { userId: _id, orderStatus: { $ne: "cancelled" } } },
          { $group: { _id: null, total: { $sum: "$total" } } },
        ])
        .toArray(),
    ]);

    res.json({ ...user, orderCount, totalSpend: spendResult[0]?.total || 0 });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch user" });
  }
});

router.patch("/users/:id/role", adminAuth, async (req, res) => {
  try {
    const _id = toObjectId(req.params.id);
    if (!_id) return res.status(400).json({ message: "Invalid user ID" });

    const { role } = req.body;
    if (!["user", "admin"].includes(role))
      return res
        .status(400)
        .json({ message: 'Role must be "user" or "admin"' });

    const db = getDB();
    const user = await db
      .collection("users")
      .findOneAndUpdate(
        { _id },
        { $set: { role, updatedAt: new Date() } },
        { returnDocument: "after", projection: { otp: 0 } },
      );

    if (!user) return res.status(404).json({ message: "User not found" });
    invalidateUserCache(req.params.id);
    await logAction(
      req.user,
      "role_changed",
      "User",
      req.params.id,
      { newRole: role },
      req,
    );
    res.json({ message: `Role updated to ${role}`, user });
  } catch (err) {
    res.status(500).json({ message: "Failed to update role" });
  }
});

router.delete("/users/:id", adminAuth, async (req, res) => {
  try {
    const _id = toObjectId(req.params.id);
    if (!_id) return res.status(400).json({ message: "Invalid user ID" });

    if (_id.toString() === req.user._id.toString())
      return res
        .status(400)
        .json({ message: "Cannot delete your own account" });

    const db = getDB();
    const [userDel, ordersDel] = await Promise.all([
      db.collection("users").deleteOne({ _id }),
      db.collection("orders").deleteMany({ userId: _id }),
    ]);

    if (userDel.deletedCount === 0)
      return res.status(404).json({ message: "User not found" });

    invalidateUserCache(req.params.id);
    await logAction(req.user, "user_deleted", "User", req.params.id, {}, req);
    res.json({
      message: "User and their orders deleted",
      ordersDeleted: ordersDel.deletedCount,
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete user" });
  }
});

/* ══ 4. INVENTORY ═══════════════════════════════════ */

router.get("/inventory", adminAuth, async (req, res) => {
  try {
    const { category, lowStock, section } = req.query;
    const db = getDB();
    const query = {};

    /* Support multiple category values:
       ?category=seasonal-juices&category=citrus-juices
       (sent by frontend when a section tab is selected) */
    if (category) {
      const cats = Array.isArray(category) ? category : [category];
      query.category = cats.length === 1 ? cats[0] : { $in: cats };
    } else if (section && section !== "all") {
      const sectionCats = await getCatsForSection(db, section);
      if (sectionCats.length > 0) query.category = { $in: sectionCats };
    }

    if (lowStock === "true") query.stock = { $lt: 10 };

    const products = await db
      .collection("products")
      .find(query)
      .sort({ stock: 1, name: 1 })
      .toArray();

    const summary = {
      total: products.length,
      outOfStock: products.filter((p) => (p.stock ?? 0) === 0).length,
      lowStock: products.filter(
        (p) => (p.stock ?? 0) > 0 && (p.stock ?? 0) < 10,
      ).length,
      inStock: products.filter((p) => (p.stock ?? 0) >= 10).length,
    };

    res.json({ products, summary });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch inventory" });
  }
});

router.patch("/inventory/:id", adminAuth, async (req, res) => {
  try {
    const _id = toObjectId(req.params.id);
    if (!_id) return res.status(400).json({ message: "Invalid product ID" });

    const { stock, isAvailable } = req.body;
    const update = { updatedAt: new Date() };
    if (stock !== undefined) update.stock = Math.max(0, parseInt(stock, 10));
    if (isAvailable !== undefined) update.isAvailable = Boolean(isAvailable);

    const db = getDB();
    const result = await db
      .collection("products")
      .findOneAndUpdate({ _id }, { $set: update }, { returnDocument: "after" });

    if (!result) return res.status(404).json({ message: "Product not found" });
    res.json({ message: "Inventory updated", product: result });
  } catch (err) {
    res.status(500).json({ message: "Failed to update inventory" });
  }
});

/* ══ 5. SETUP ═══════════════════════════════════════ */

router.post("/setup", async (req, res) => {
  try {
    const { phone, secretKey } = req.body;
    const expectedKey = process.env.ADMIN_SECRET_KEY || "SARVA_ADMIN_2024";

    if (secretKey !== expectedKey)
      return res.status(403).json({ message: "Invalid secret key" });

    const db = getDB();
    const result = await db.collection("users").findOneAndUpdate(
      { phone },
      {
        $set: { role: "admin", updatedAt: new Date() },
        $setOnInsert: {
          phone,
          name: "Admin",
          isVerified: true,
          createdAt: new Date(),
        },
      },
      { upsert: true, returnDocument: "after", projection: { otp: 0 } },
    );

    res.json({ message: "Admin account ready", phone: result.phone });
  } catch (err) {
    res.status(500).json({ message: "Setup failed", error: err.message });
  }
});

/* ══ 6. AUDIT LOGS ══════════════════════════════════ */

router.get("/audit-logs", adminAuth, async (req, res) => {
  try {
    const { action, entity, role, search, page = 1, limit = 50 } = req.query;
    const db = getDB();
    const query = {};

    if (action && action !== "all" && action !== "All") query.action = action;
    if (entity && entity !== "All" && entity !== "All Entities")
      query.entityType = entity;
    if (role && role !== "All") query.userRole = role;

    // Search by phone number or entity ID
    if (search && search.trim()) {
      query.$or = [
        { userPhone: { $regex: search.trim(), $options: "i" } },
        { entityId: { $regex: search.trim(), $options: "i" } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [logs, total] = await Promise.all([
      db
        .collection("auditLogs")
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .toArray(),
      db.collection("auditLogs").countDocuments(query),
    ]);

    res.json({ logs, total, pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to fetch audit logs", error: err.message });
  }
});

/* ══ 7. PAYMENTS ════════════════════════════════════ */

/* GET /payments/summary — revenue stats */
router.get("/payments/summary", adminAuth, async (req, res) => {
  try {
    const db = getDB();
    const [revenue, byMethod, byStatus] = await Promise.all([
      db
        .collection("orders")
        .aggregate([
          {
            $group: {
              _id: "$paymentStatus",
              total: { $sum: "$total" },
              count: { $sum: 1 },
            },
          },
        ])
        .toArray(),
      db
        .collection("orders")
        .aggregate([
          { $match: { paymentStatus: "paid" } },
          {
            $group: {
              _id: "$paymentMethod",
              total: { $sum: "$total" },
              count: { $sum: 1 },
            },
          },
          { $sort: { total: -1 } },
        ])
        .toArray(),
      db
        .collection("orders")
        .aggregate([{ $group: { _id: "$paymentStatus", count: { $sum: 1 } } }])
        .toArray(),
    ]);

    const getAmt = (s) => revenue.find((r) => r._id === s)?.total || 0;
    const getCnt = (s) => byStatus.find((r) => r._id === s)?.count || 0;

    res.json({
      totalRevenue: getAmt("paid"),
      pendingAmount: getAmt("pending"),
      failedAmount: getAmt("failed"),
      refundAmount: getAmt("refunded"),
      paidCount: getCnt("paid"),
      pendingCount: getCnt("pending"),
      failedCount: getCnt("failed"),
      byMethod,
    });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to fetch summary", error: err.message });
  }
});

/* GET /payments — paginated list with search */
router.get("/payments", adminAuth, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      paymentStatus,
      paymentMethod,
      search,
    } = req.query;
    const db = getDB();
    const query = {};
    if (paymentStatus && paymentStatus !== "all")
      query.paymentStatus = paymentStatus;
    if (paymentMethod && paymentMethod !== "all")
      query.paymentMethod = paymentMethod;
    if (search?.trim()) {
      const re = new RegExp(search.trim(), "i");
      query.$or = [
        { orderId: re },
        { "customerDetails.name": re },
        { "customerDetails.phone": re },
        { razorpayPaymentId: re },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [payments, total] = await Promise.all([
      db
        .collection("orders")
        .find(query, {
          projection: {
            orderId: 1,
            total: 1,
            deliveryFee: 1,
            subtotal: 1,
            paymentMethod: 1,
            paymentStatus: 1,
            orderStatus: 1,
            razorpayOrderId: 1,
            razorpayPaymentId: 1,
            createdAt: 1,
            updatedAt: 1,
            "customerDetails.name": 1,
            "customerDetails.phone": 1,
            "customerDetails.email": 1,
          },
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .toArray(),
      db.collection("orders").countDocuments(query),
    ]);

    res.json({ payments, total, pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to fetch payments", error: err.message });
  }
});

/* PATCH /payments/:id/status — manually update payment status */
router.patch("/payments/:id/status", adminAuth, async (req, res) => {
  try {
    const { paymentStatus } = req.body;
    const valid = ["paid", "pending", "failed", "refunded"];
    if (!valid.includes(paymentStatus))
      return res.status(400).json({ message: "Invalid payment status" });

    const _id = toObjectId(req.params.id);
    if (!_id) return res.status(400).json({ message: "Invalid order ID" });

    const db = getDB();
    const now = new Date();
    const update = { $set: { paymentStatus, updatedAt: now } };

    // Auto-confirm order when manually marking paid
    if (paymentStatus === "paid") {
      update.$set.orderStatus = "confirmed";
      update.$push = {
        statusHistory: {
          status: "confirmed",
          note: "Payment manually marked as paid by admin",
          timestamp: now,
        },
      };
    }

    const result = await db
      .collection("orders")
      .findOneAndUpdate({ _id }, update, { returnDocument: "after" });
    if (!result) return res.status(404).json({ message: "Order not found" });

    await logAction(
      req.user,
      "payment_status",
      "Order",
      req.params.id,
      { paymentStatus },
      req,
    );

    res.json({ message: `Payment status → ${paymentStatus}`, order: result });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to update payment status", error: err.message });
  }
});

// ══ CONTACT QUERIES ═══════════════════════════════════

// POST /api/admin/contact  (public — no auth needed)
// Anyone can submit a contact query
router.post("/contact", async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body;
    if (!name?.trim())
      return res.status(400).json({ message: "Name is required" });
    if (!message?.trim())
      return res.status(400).json({ message: "Message is required" });
    if (!email?.trim() && !phone?.trim())
      return res.status(400).json({ message: "Email or phone is required" });

    const db = getDB();
    const doc = {
      name: name.trim(),
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      subject: subject?.trim() || "General Enquiry",
      message: message.trim(),
      status: "new", // new | read | replied
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = await db.collection("contactQueries").insertOne(doc);
    res
      .status(201)
      .json({ message: "Query submitted successfully", id: result.insertedId });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to submit query", error: err.message });
  }
});

// GET /api/admin/contact  (admin)
router.get("/contact", adminAuth, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const db = getDB();
    const query = {};
    if (status && status !== "all") query.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [queries, total, newCount] = await Promise.all([
      db
        .collection("contactQueries")
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .toArray(),
      db.collection("contactQueries").countDocuments(query),
      db.collection("contactQueries").countDocuments({ status: "new" }),
    ]);
    res.json({
      queries,
      total,
      newCount,
      pages: Math.ceil(total / parseInt(limit)),
    });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to fetch queries", error: err.message });
  }
});

// PATCH /api/admin/contact/:id  (admin) — update status
router.patch("/contact/:id", adminAuth, async (req, res) => {
  try {
    const _id = toObjectId(req.params.id);
    if (!_id) return res.status(400).json({ message: "Invalid ID" });

    const { status } = req.body;
    if (!["new", "read", "replied"].includes(status))
      return res.status(400).json({ message: "Invalid status" });

    const db = getDB();
    const result = await db
      .collection("contactQueries")
      .findOneAndUpdate(
        { _id },
        { $set: { status, updatedAt: new Date() } },
        { returnDocument: "after" },
      );
    if (!result) return res.status(404).json({ message: "Query not found" });
    res.json({ message: "Status updated", query: result });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to update query", error: err.message });
  }
});

// DELETE /api/admin/contact/:id  (admin)
router.delete("/contact/:id", adminAuth, async (req, res) => {
  try {
    const _id = toObjectId(req.params.id);
    if (!_id) return res.status(400).json({ message: "Invalid ID" });
    const db = getDB();
    await db.collection("contactQueries").deleteOne({ _id });
    res.json({ message: "Query deleted" });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to delete query", error: err.message });
  }
}); 

module.exports = router;
