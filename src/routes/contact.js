/**
 * routes/contact.js  —  ProteinSpot
 *
 * PUBLIC:
 *   POST /api/contact        → submit a query/message
 *
 * ADMIN:
 *   GET  /api/contact/queries          → list all queries (paginated)
 *   PATCH /api/contact/queries/:id     → mark as read / update status
 *   DELETE /api/contact/queries/:id    → delete a query
 */

const express = require("express");
const router = express.Router();
const { getDB, toObjectId } = require("../db");
const { adminAuth } = require("../middleware/auth");

const DEFAULT_INFO = {
  address: "12, Green Valley Road, Indiranagar, Bengaluru 560038",
  phone: "+91 98765 43210",
  email: "info@proteinspot.in",
  hours: "Every day, 8 am – 9 pm",
  mapLabel: "Indiranagar, Bengaluru",
  mapUrl: "https://maps.google.com/?q=Indiranagar+Bengaluru",
  mapEmbed: "",
};

// ── GET /info  (public) ──────────────────────────────
// Returns the contact info shown on the Contact page.
// Stored as a single document in the 'contactInfo' collection.
router.get("/info", async (req, res) => {
  try {
    const db = getDB();
    const info = await db.collection("contactInfo").findOne({ _id: "main" });
    // Return saved info or sensible defaults
    res.json(info || DEFAULT_INFO);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to fetch contact info", error: err.message });
  }
});

// ── PUT /info  (admin) ────────────────────────────────
// Saves/updates the contact info block.
router.put("/info", adminAuth, async (req, res) => {
  try {
    const { address, phone, email, hours, mapLabel, mapUrl, mapEmbed } =
      req.body;
    const db = getDB();
    const update = {
      _id: "main",
      address: address || "",
      phone: phone || "",
      email: email || "",
      hours: hours || "",
      mapLabel: mapLabel || "",
      mapUrl: mapUrl || "",
      mapEmbed: mapEmbed || "",
      updatedAt: new Date(),
    };
    await db
      .collection("contactInfo")
      .replaceOne({ _id: "main" }, update, { upsert: true });
    res.json({ message: "Contact info updated", info: update });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to update contact info", error: err.message });
  }
});

// ── POST /  (public) ─────────────────────────────────
// Anyone can submit a contact query — no auth required.
router.post("/", async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body;

    if (!name?.trim())
      return res.status(400).json({ message: "Name is required" });
    if (!message?.trim())
      return res.status(400).json({ message: "Message is required" });

    const db = getDB();
    const doc = {
      name: name.trim(),
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      subject: subject?.trim() || null,
      message: message.trim(),
      status: "unread", // unread | read | resolved
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection("contactQueries").insertOne(doc);
    res.status(201).json({
      message: "Message received! We will get back to you soon.",
      id: result.insertedId,
    });
  } catch (err) {
    console.error("Contact submit error:", err);
    res
      .status(500)
      .json({ message: "Failed to submit message", error: err.message });
  }
});

// ── GET /queries  (admin) ─────────────────────────────
router.get("/queries", adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const db = getDB();
    const query = {};
    if (status && status !== "all") query.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [queries, total, unreadCount] = await Promise.all([
      db
        .collection("contactQueries")
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .toArray(),
      db.collection("contactQueries").countDocuments(query),
      db.collection("contactQueries").countDocuments({ status: "unread" }),
    ]);

    res.json({
      queries,
      total,
      unreadCount,
      pages: Math.ceil(total / parseInt(limit)),
    });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to fetch queries", error: err.message });
  }
});

// ── PATCH /queries/:id  (admin) ───────────────────────
router.patch("/queries/:id", adminAuth, async (req, res) => {
  try {
    const _id = toObjectId(req.params.id);
    if (!_id) return res.status(400).json({ message: "Invalid query ID" });

    const { status } = req.body;
    const validStatuses = ["unread", "read", "resolved"];
    if (!validStatuses.includes(status))
      return res.status(400).json({
        message: `Status must be one of: ${validStatuses.join(", ")}`,
      });

    const result = await getDB()
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

// ── DELETE /queries/:id  (admin) ──────────────────────
router.delete("/queries/:id", adminAuth, async (req, res) => {
  try {
    const _id = toObjectId(req.params.id);
    if (!_id) return res.status(400).json({ message: "Invalid query ID" });

    const result = await getDB()
      .collection("contactQueries")
      .deleteOne({ _id });
    if (result.deletedCount === 0)
      return res.status(404).json({ message: "Query not found" });
    res.json({ message: "Query deleted" });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to delete query", error: err.message });
  }
});

module.exports = router;
