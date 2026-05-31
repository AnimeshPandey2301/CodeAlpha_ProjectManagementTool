const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// POST /api/comments
router.post('/', authenticateToken, (req, res) => {
    try {
        const db = getDb();
        const { task_id, content } = req.body;

        if (!task_id || !content || content.trim().length === 0) {
            return res.status(400).json({ error: 'Task ID and comment content are required.' });
        }

        const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(task_id);
        if (!task) return res.status(404).json({ error: 'Task not found.' });

        const member = db.prepare(
            'SELECT role FROM project_members WHERE project_id = ? AND user_id = ?'
        ).get(task.project_id, req.user.id);
        if (!member) return res.status(403).json({ error: 'Not a project member.' });

        const commentId = uuidv4();

        db.prepare(`
            INSERT INTO comments (id, task_id, user_id, content)
            VALUES (?, ?, ?, ?)
        `).run(commentId, task_id, req.user.id, content.trim());

        // Notify task creator and assignee
        const notifyUsers = new Set();
        if (task.created_by && task.created_by !== req.user.id) notifyUsers.add(task.created_by);
        if (task.assigned_to && task.assigned_to !== req.user.id) notifyUsers.add(task.assigned_to);

        const project = db.prepare('SELECT name FROM projects WHERE id = ?').get(task.project_id);

        for (const userId of notifyUsers) {
            db.prepare(`
                INSERT INTO notifications (id, user_id, type, title, message, link)
                VALUES (?, ?, 'comment', ?, ?, ?)
            `).run(uuidv4(), userId, 'New Comment',
                `${req.user.full_name} commented on "${task.title}" in "${project.name}"`,
                `/board.html?id=${task.project_id}&task=${task_id}`);
        }

        db.prepare(`
            INSERT INTO activity_log (id, project_id, user_id, action, entity_type, entity_id, details)
            VALUES (?, ?, ?, 'commented', 'task', ?, ?)
        `).run(uuidv4(), task.project_id, req.user.id, task_id, JSON.stringify({ task_title: task.title }));

        db.prepare('UPDATE tasks SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(task_id);

        const comment = db.prepare(`
            SELECT c.*, u.full_name, u.username, u.avatar_color
            FROM comments c
            JOIN users u ON c.user_id = u.id
            WHERE c.id = ?
        `).get(commentId);

        res.status(201).json({ message: 'Comment added.', comment });
    } catch (err) {
        console.error('Add comment error:', err);
        res.status(500).json({ error: 'Failed to add comment.' });
    }
});

// GET /api/comments/task/:taskId
router.get('/task/:taskId', authenticateToken, (req, res) => {
    try {
        const db = getDb();
        const task = db.prepare('SELECT project_id FROM tasks WHERE id = ?').get(req.params.taskId);
        if (!task) return res.status(404).json({ error: 'Task not found.' });

        const member = db.prepare(
            'SELECT role FROM project_members WHERE project_id = ? AND user_id = ?'
        ).get(task.project_id, req.user.id);
        if (!member) return res.status(403).json({ error: 'Not a project member.' });

        const comments = db.prepare(`
            SELECT c.*, u.full_name, u.username, u.avatar_color
            FROM comments c
            JOIN users u ON c.user_id = u.id
            WHERE c.task_id = ?
            ORDER BY c.created_at ASC
        `).all(req.params.taskId);

        res.json({ comments });
    } catch (err) {
        console.error('Get comments error:', err);
        res.status(500).json({ error: 'Failed to fetch comments.' });
    }
});

// PUT /api/comments/:commentId
router.put('/:commentId', authenticateToken, (req, res) => {
    try {
        const db = getDb();
        const { content } = req.body;
        if (!content || content.trim().length === 0) {
            return res.status(400).json({ error: 'Comment content is required.' });
        }

        const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(req.params.commentId);
        if (!comment) return res.status(404).json({ error: 'Comment not found.' });

        if (comment.user_id !== req.user.id) {
            return res.status(403).json({ error: 'You can only edit your own comments.' });
        }

        db.prepare(`
            UPDATE comments SET content = ?, edited = 1, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(content.trim(), req.params.commentId);

        const updatedComment = db.prepare(`
            SELECT c.*, u.full_name, u.username, u.avatar_color
            FROM comments c
            JOIN users u ON c.user_id = u.id
            WHERE c.id = ?
        `).get(req.params.commentId);

        res.json({ message: 'Comment updated.', comment: updatedComment });
    } catch (err) {
        console.error('Edit comment error:', err);
        res.status(500).json({ error: 'Failed to edit comment.' });
    }
});

// DELETE /api/comments/:commentId
router.delete('/:commentId', authenticateToken, (req, res) => {
    try {
        const db = getDb();
        const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(req.params.commentId);
        if (!comment) return res.status(404).json({ error: 'Comment not found.' });

        const task = db.prepare('SELECT project_id FROM tasks WHERE id = ?').get(comment.task_id);
        const member = db.prepare(
            'SELECT role FROM project_members WHERE project_id = ? AND user_id = ?'
        ).get(task.project_id, req.user.id);

        if (comment.user_id !== req.user.id && (!member || member.role === 'member')) {
            return res.status(403).json({ error: 'Not authorized to delete this comment.' });
        }

        db.prepare('DELETE FROM comments WHERE id = ?').run(req.params.commentId);
        res.json({ message: 'Comment deleted.' });
    } catch (err) {
        console.error('Delete comment error:', err);
        res.status(500).json({ error: 'Failed to delete comment.' });
    }
});

module.exports = router;
