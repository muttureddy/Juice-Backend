const express    = require('express');
const router     = express.Router();
const { ObjectId } = require('mongodb');
const { getDB }  = require('../db/connection');
const { verifyToken } = require('../middleware/auth');

router.use(verifyToken);

// ── GET /api/notifications ──────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const db   = getDB();
    const docs = await db.collection('notifications')
      .find({ userId: new ObjectId(req.user.userId) })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();
    const unreadCount = docs.filter(n => !n.isRead).length;
    res.json({ notifications: docs, unreadCount });
  } catch (err) {
    console.error('Get notifications error:', err.message);
    res.status(500).json({ message: 'Failed to fetch notifications.' });
  }
});

// ── PATCH /api/notifications/read-all — MUST be before /:id ─────────────────
router.patch('/read-all', async (req, res) => {
  try {
    await getDB().collection('notifications').updateMany(
      { userId: new ObjectId(req.user.userId), isRead: false },
      { $set: { isRead: true, readAt: new Date() } }
    );
    res.json({ message: 'All notifications marked as read.' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to mark all as read.' });
  }
});

// ── DELETE /api/notifications — clear all read notifications ──────────────
router.delete('/', async (req, res) => {
  try {
    await getDB().collection('notifications').deleteMany(
      { userId: new ObjectId(req.user.userId), isRead: true }
    );
    res.json({ message: 'Read notifications cleared.' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to clear notifications.' });
  }
});

// ── PATCH /api/notifications/:id/read ────────────────────────────────────────
router.patch('/:id/read', async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id))
      return res.status(400).json({ message: 'Invalid notification ID.' });
    await getDB().collection('notifications').updateOne(
      { _id: new ObjectId(req.params.id), userId: new ObjectId(req.user.userId) },
      { $set: { isRead: true, readAt: new Date() } }
    );
    res.json({ message: 'Marked as read.' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to mark as read.' });
  }
});

// ── DELETE /api/notifications/:id ────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id))
      return res.status(400).json({ message: 'Invalid notification ID.' });
    await getDB().collection('notifications').deleteOne(
      { _id: new ObjectId(req.params.id), userId: new ObjectId(req.user.userId) }
    );
    res.json({ message: 'Notification deleted.' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete notification.' });
  }
});

module.exports = router;
