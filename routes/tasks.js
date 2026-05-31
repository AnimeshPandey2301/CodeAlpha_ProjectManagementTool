const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/db');
const { authenticateToken, requireProjectAccess } = require('../middleware/auth');

const router = express.Router();

// GET /api/tasks/user/assigned – must be before /:taskId route
router.get('/user/assigned', authenticateToken, (req, res) => {
    try {
        const db = getDb();
        const tasks = db.prepare(`
            SELECT t.*, p.name AS project_name, p.color AS project_color, p.icon AS project_icon,
                   bc.name AS column_name,
                   (SELECT COUNT(*) FROM comments WHERE task_id = t.id) AS comment_count
            FROM tasks t
            JOIN projects p ON t.project_id = p.id
            JOIN board_columns bc ON t.column_id = bc.id
            WHERE t.assigned_to = ?
            ORDER BY 
                CASE t.priority
                    WHEN 'urgent' THEN 1
                    WHEN 'high' THEN 2
                    WHEN 'medium' THEN 3
                    WHEN 'low' THEN 4
                END,
                t.due_date ASC NULLS LAST
        `).all(req.user.id);

        res.json({ tasks });
    } catch (err) {
        console.error('Get assigned tasks error:', err);
        res.status(500).json({ error: 'Failed to fetch assigned tasks.' });
    }
});

// POST /api/tasks
router.post('/', authenticateToken, (req, res) => {
    try {
        const db = getDb();
        const { project_id, column_id, title, description, priority, due_date, assigned_to, labels } = req.body;

        if (!project_id || !column_id || !title) {
            return res.status(400).json({ error: 'Project ID, column ID, and title are required.' });
        }

        const member = db.prepare(
            'SELECT role FROM project_members WHERE project_id = ? AND user_id = ?'
        ).get(project_id, req.user.id);

        if (!member) return res.status(403).json({ error: 'Not a project member.' });

        const maxPos = db.prepare('SELECT MAX(position) as max FROM tasks WHERE column_id = ?').get(column_id);

        const taskId = uuidv4();

        db.prepare(`
            INSERT INTO tasks (id, project_id, column_id, title, description, priority, position, due_date, created_by, assigned_to, labels)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            taskId, project_id, column_id, title.trim(),
            description || '', priority || 'medium',
            ((maxPos && maxPos.max) || 0) + 1, due_date || null,
            req.user.id, assigned_to || null,
            JSON.stringify(labels || [])
        );

        db.prepare(`
            INSERT INTO activity_log (id, project_id, user_id, action, entity_type, entity_id, details)
            VALUES (?, ?, ?, 'created', 'task', ?, ?)
        `).run(uuidv4(), project_id, req.user.id, taskId, JSON.stringify({ title: title.trim() }));

        if (assigned_to && assigned_to !== req.user.id) {
            const project = db.prepare('SELECT name FROM projects WHERE id = ?').get(project_id);
            db.prepare(`
                INSERT INTO notifications (id, user_id, type, title, message, link)
                VALUES (?, ?, 'task_assigned', ?, ?, ?)
            `).run(uuidv4(), assigned_to, 'Task Assigned',
                `${req.user.full_name} assigned you "${title.trim()}" in "${project.name}"`,
                `/board.html?id=${project_id}`);
        }

        db.prepare('UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(project_id);

        const task = db.prepare(`
            SELECT t.*,
                   u1.full_name AS creator_name, u1.avatar_color AS creator_color,
                   u2.full_name AS assignee_name, u2.avatar_color AS assignee_color, u2.username AS assignee_username,
                   0 AS comment_count
            FROM tasks t
            LEFT JOIN users u1 ON t.created_by = u1.id
            LEFT JOIN users u2 ON t.assigned_to = u2.id
            WHERE t.id = ?
        `).get(taskId);

        res.status(201).json({ message: 'Task created!', task });
    } catch (err) {
        console.error('Create task error:', err);
        res.status(500).json({ error: 'Failed to create task.' });
    }
});

// GET /api/tasks/:taskId
router.get('/:taskId', authenticateToken, (req, res) => {
    try {
        const db = getDb();
        const task = db.prepare(`
            SELECT t.*,
                   u1.full_name AS creator_name, u1.avatar_color AS creator_color, u1.username AS creator_username,
                   u2.full_name AS assignee_name, u2.avatar_color AS assignee_color, u2.username AS assignee_username
            FROM tasks t
            LEFT JOIN users u1 ON t.created_by = u1.id
            LEFT JOIN users u2 ON t.assigned_to = u2.id
            WHERE t.id = ?
        `).get(req.params.taskId);

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

        res.json({ task, comments });
    } catch (err) {
        console.error('Get task error:', err);
        res.status(500).json({ error: 'Failed to fetch task.' });
    }
});

// PUT /api/tasks/:taskId
router.put('/:taskId', authenticateToken, (req, res) => {
    try {
        const db = getDb();
        const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.taskId);
        if (!task) return res.status(404).json({ error: 'Task not found.' });

        const member = db.prepare(
            'SELECT role FROM project_members WHERE project_id = ? AND user_id = ?'
        ).get(task.project_id, req.user.id);
        if (!member) return res.status(403).json({ error: 'Not a project member.' });

        const { title, description, priority, due_date, assigned_to, column_id, position, labels } = req.body;
        const updates = [];
        const values = [];
        const changes = {};

        if (title !== undefined) { updates.push('title = ?'); values.push(title.trim()); changes.title = title.trim(); }
        if (description !== undefined) { updates.push('description = ?'); values.push(description); }
        if (priority !== undefined) { updates.push('priority = ?'); values.push(priority); changes.priority = priority; }
        if (due_date !== undefined) { updates.push('due_date = ?'); values.push(due_date); }
        if (assigned_to !== undefined) {
            updates.push('assigned_to = ?');
            values.push(assigned_to || null);
            changes.assigned_to = assigned_to;

            if (assigned_to && assigned_to !== req.user.id && assigned_to !== task.assigned_to) {
                const project = db.prepare('SELECT name FROM projects WHERE id = ?').get(task.project_id);
                db.prepare(`
                    INSERT INTO notifications (id, user_id, type, title, message, link)
                    VALUES (?, ?, 'task_assigned', ?, ?, ?)
                `).run(uuidv4(), assigned_to, 'Task Assigned',
                    `${req.user.full_name} assigned you "${task.title}" in "${project.name}"`,
                    `/board.html?id=${task.project_id}`);
            }
        }
        if (column_id !== undefined) {
            updates.push('column_id = ?');
            values.push(column_id);

            if (column_id !== task.column_id) {
                const oldCol = db.prepare('SELECT name FROM board_columns WHERE id = ?').get(task.column_id);
                const newCol = db.prepare('SELECT name FROM board_columns WHERE id = ?').get(column_id);
                changes.moved = { from: oldCol?.name, to: newCol?.name };
            }
        }
        if (position !== undefined) { updates.push('position = ?'); values.push(position); }
        if (labels !== undefined) { updates.push('labels = ?'); values.push(JSON.stringify(labels)); }

        if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update.' });

        updates.push('updated_at = CURRENT_TIMESTAMP');
        values.push(req.params.taskId);

        db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...values);

        if (Object.keys(changes).length > 0) {
            db.prepare(`
                INSERT INTO activity_log (id, project_id, user_id, action, entity_type, entity_id, details)
                VALUES (?, ?, ?, 'updated', 'task', ?, ?)
            `).run(uuidv4(), task.project_id, req.user.id, req.params.taskId, JSON.stringify(changes));
        }

        db.prepare('UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(task.project_id);

        const updatedTask = db.prepare(`
            SELECT t.*,
                   u1.full_name AS creator_name, u1.avatar_color AS creator_color,
                   u2.full_name AS assignee_name, u2.avatar_color AS assignee_color, u2.username AS assignee_username,
                   (SELECT COUNT(*) FROM comments WHERE task_id = t.id) AS comment_count
            FROM tasks t
            LEFT JOIN users u1 ON t.created_by = u1.id
            LEFT JOIN users u2 ON t.assigned_to = u2.id
            WHERE t.id = ?
        `).get(req.params.taskId);

        res.json({ message: 'Task updated.', task: updatedTask });
    } catch (err) {
        console.error('Update task error:', err);
        res.status(500).json({ error: 'Failed to update task.' });
    }
});

// DELETE /api/tasks/:taskId
router.delete('/:taskId', authenticateToken, (req, res) => {
    try {
        const db = getDb();
        const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.taskId);
        if (!task) return res.status(404).json({ error: 'Task not found.' });

        const member = db.prepare(
            'SELECT role FROM project_members WHERE project_id = ? AND user_id = ?'
        ).get(task.project_id, req.user.id);
        if (!member) return res.status(403).json({ error: 'Not a project member.' });

        db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.taskId);

        db.prepare(`
            INSERT INTO activity_log (id, project_id, user_id, action, entity_type, entity_id, details)
            VALUES (?, ?, ?, 'deleted', 'task', ?, ?)
        `).run(uuidv4(), task.project_id, req.user.id, req.params.taskId, JSON.stringify({ title: task.title }));

        res.json({ message: 'Task deleted.' });
    } catch (err) {
        console.error('Delete task error:', err);
        res.status(500).json({ error: 'Failed to delete task.' });
    }
});

// PUT /api/tasks/:taskId/move
router.put('/:taskId/move', authenticateToken, (req, res) => {
    try {
        const db = getDb();
        const { column_id, position } = req.body;
        const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.taskId);

        if (!task) return res.status(404).json({ error: 'Task not found.' });

        const member = db.prepare(
            'SELECT role FROM project_members WHERE project_id = ? AND user_id = ?'
        ).get(task.project_id, req.user.id);
        if (!member) return res.status(403).json({ error: 'Not a project member.' });

        const moveTask = db.transaction(() => {
            if (position !== undefined) {
                db.prepare(`
                    UPDATE tasks SET position = position + 1
                    WHERE column_id = ? AND position >= ? AND id != ?
                `).run(column_id, position, req.params.taskId);
            }

            db.prepare(`
                UPDATE tasks SET column_id = ?, position = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(column_id, position || 0, req.params.taskId);

            if (column_id !== task.column_id) {
                const oldCol = db.prepare('SELECT name FROM board_columns WHERE id = ?').get(task.column_id);
                const newCol = db.prepare('SELECT name FROM board_columns WHERE id = ?').get(column_id);

                db.prepare(`
                    INSERT INTO activity_log (id, project_id, user_id, action, entity_type, entity_id, details)
                    VALUES (?, ?, ?, 'moved', 'task', ?, ?)
                `).run(uuidv4(), task.project_id, req.user.id, req.params.taskId,
                    JSON.stringify({ title: task.title, from: oldCol?.name, to: newCol?.name }));
            }
        });

        moveTask();

        res.json({ message: 'Task moved.' });
    } catch (err) {
        console.error('Move task error:', err);
        res.status(500).json({ error: 'Failed to move task.' });
    }
});

module.exports = router;
