const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// GET /api/notifications
router.get('/', authenticateToken, (req, res) => {
    try {
        const db = getDb();
        const limit = parseInt(req.query.limit) || 30;
        const offset = parseInt(req.query.offset) || 0;

        const notifications = db.prepare(`
            SELECT * FROM notifications
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        `).all(req.user.id, limit, offset);

        const unreadCount = db.prepare(
            'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0'
        ).get(req.user.id);

        res.json({
            notifications,
            unread_count: (unreadCount && unreadCount.count) || 0
        });
    } catch (err) {
        console.error('Get notifications error:', err);
        res.status(500).json({ error: 'Failed to fetch notifications.' });
    }
});

// PUT /api/notifications/read-all – must be before /:id
router.put('/read-all', authenticateToken, (req, res) => {
    try {
        const db = getDb();
        db.prepare(
            'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0'
        ).run(req.user.id);

        res.json({ message: 'All notifications marked as read.' });
    } catch (err) {
        console.error('Mark all read error:', err);
        res.status(500).json({ error: 'Failed to mark notifications.' });
    }
});

// PUT /api/notifications/:id/read
router.put('/:id/read', authenticateToken, (req, res) => {
    try {
        const db = getDb();
        db.prepare(
            'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?'
        ).run(req.params.id, req.user.id);

        res.json({ message: 'Notification marked as read.' });
    } catch (err) {
        console.error('Mark read error:', err);
        res.status(500).json({ error: 'Failed to mark notification.' });
    }
});

// DELETE /api/notifications/:id
router.delete('/:id', authenticateToken, (req, res) => {
    try {
        const db = getDb();
        db.prepare(
            'DELETE FROM notifications WHERE id = ? AND user_id = ?'
        ).run(req.params.id, req.user.id);

        res.json({ message: 'Notification deleted.' });
    } catch (err) {
        console.error('Delete notification error:', err);
        res.status(500).json({ error: 'Failed to delete notification.' });
    }
});

module.exports = router;
