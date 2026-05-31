const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/db');
const { authenticateToken, requireProjectAccess } = require('../middleware/auth');

const router = express.Router();

const DEFAULT_COLUMNS = [
    { name: 'Backlog', color: '#8B8FA3' },
    { name: 'To Do', color: '#6C63FF' },
    { name: 'In Progress', color: '#F9C74F' },
    { name: 'Review', color: '#F3722C' },
    { name: 'Done', color: '#43AA8B' }
];

const PROJECT_ICONS = ['📋', '🚀', '💡', '🎯', '⚡', '🔥', '🌟', '📊', '🎨', '🛠️'];
const PROJECT_COLORS = [
    '#6C63FF', '#FF6584', '#43AA8B', '#F9C74F', '#F3722C',
    '#577590', '#90BE6D', '#F94144', '#277DA1', '#4D908E'
];

// POST /api/projects
router.post('/', authenticateToken, (req, res) => {
    try {
        const db = getDb();
        const { name, description, color, icon } = req.body;

        if (!name || name.trim().length === 0) {
            return res.status(400).json({ error: 'Project name is required.' });
        }

        const projectId = uuidv4();
        const memberId = uuidv4();
        const projectColor = color || PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)];
        const projectIcon = icon || PROJECT_ICONS[Math.floor(Math.random() * PROJECT_ICONS.length)];

        const createProject = db.transaction(() => {
            db.prepare(`
                INSERT INTO projects (id, name, description, color, icon, owner_id)
                VALUES (?, ?, ?, ?, ?, ?)
            `).run(projectId, name.trim(), description || '', projectColor, projectIcon, req.user.id);

            db.prepare(`
                INSERT INTO project_members (id, project_id, user_id, role)
                VALUES (?, ?, ?, 'owner')
            `).run(memberId, projectId, req.user.id);

            DEFAULT_COLUMNS.forEach((col, index) => {
                db.prepare(`
                    INSERT INTO board_columns (id, project_id, name, position, color)
                    VALUES (?, ?, ?, ?, ?)
                `).run(uuidv4(), projectId, col.name, index, col.color);
            });

            db.prepare(`
                INSERT INTO activity_log (id, project_id, user_id, action, entity_type, entity_id, details)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(uuidv4(), projectId, req.user.id, 'created', 'project', projectId, JSON.stringify({ name: name.trim() }));
        });

        createProject();

        const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
        const columns = db.prepare('SELECT * FROM board_columns WHERE project_id = ? ORDER BY position').all(projectId);

        res.status(201).json({
            message: 'Project created!',
            project: { ...project, columns }
        });
    } catch (err) {
        console.error('Create project error:', err);
        res.status(500).json({ error: 'Failed to create project.' });
    }
});

// GET /api/projects
router.get('/', authenticateToken, (req, res) => {
    try {
        const db = getDb();
        const projects = db.prepare(`
            SELECT p.*, pm.role,
                   (SELECT COUNT(*) FROM project_members WHERE project_id = p.id) AS member_count,
                   (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) AS task_count,
                   (SELECT COUNT(*) FROM tasks t
                    JOIN board_columns bc ON t.column_id = bc.id
                    WHERE t.project_id = p.id AND bc.name = 'Done') AS completed_count
            FROM projects p
            JOIN project_members pm ON p.id = pm.project_id
            WHERE pm.user_id = ?
            ORDER BY p.updated_at DESC
        `).all(req.user.id);

        res.json({ projects });
    } catch (err) {
        console.error('List projects error:', err);
        res.status(500).json({ error: 'Failed to fetch projects.' });
    }
});

// GET /api/projects/:projectId
router.get('/:projectId', authenticateToken, requireProjectAccess(), (req, res) => {
    try {
        const db = getDb();
        const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.projectId);

        const columns = db.prepare(
            'SELECT * FROM board_columns WHERE project_id = ? ORDER BY position'
        ).all(req.params.projectId);

        const tasks = db.prepare(`
            SELECT t.*, 
                   u1.full_name AS creator_name, u1.avatar_color AS creator_color,
                   u2.full_name AS assignee_name, u2.avatar_color AS assignee_color, u2.username AS assignee_username,
                   (SELECT COUNT(*) FROM comments WHERE task_id = t.id) AS comment_count
            FROM tasks t
            LEFT JOIN users u1 ON t.created_by = u1.id
            LEFT JOIN users u2 ON t.assigned_to = u2.id
            WHERE t.project_id = ?
            ORDER BY t.position
        `).all(req.params.projectId);

        const members = db.prepare(`
            SELECT u.id, u.username, u.full_name, u.email, u.avatar_color, pm.role
            FROM project_members pm
            JOIN users u ON pm.user_id = u.id
            WHERE pm.project_id = ?
            ORDER BY pm.role DESC, pm.joined_at
        `).all(req.params.projectId);

        res.json({
            project: {
                ...project,
                columns,
                tasks,
                members,
                user_role: req.projectRole
            }
        });
    } catch (err) {
        console.error('Get project error:', err);
        res.status(500).json({ error: 'Failed to fetch project.' });
    }
});

// PUT /api/projects/:projectId
router.put('/:projectId', authenticateToken, requireProjectAccess('admin'), (req, res) => {
    try {
        const db = getDb();
        const { name, description, color, icon } = req.body;
        const updates = [];
        const values = [];

        if (name !== undefined) { updates.push('name = ?'); values.push(name.trim()); }
        if (description !== undefined) { updates.push('description = ?'); values.push(description); }
        if (color !== undefined) { updates.push('color = ?'); values.push(color); }
        if (icon !== undefined) { updates.push('icon = ?'); values.push(icon); }

        if (updates.length === 0) return res.status(400).json({ error: 'No fields to update.' });

        updates.push('updated_at = CURRENT_TIMESTAMP');
        values.push(req.params.projectId);

        db.prepare(`UPDATE projects SET ${updates.join(', ')} WHERE id = ?`).run(...values);

        const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.projectId);
        res.json({ message: 'Project updated.', project });
    } catch (err) {
        console.error('Update project error:', err);
        res.status(500).json({ error: 'Failed to update project.' });
    }
});

// DELETE /api/projects/:projectId
router.delete('/:projectId', authenticateToken, requireProjectAccess('owner'), (req, res) => {
    try {
        const db = getDb();
        db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.projectId);
        res.json({ message: 'Project deleted.' });
    } catch (err) {
        console.error('Delete project error:', err);
        res.status(500).json({ error: 'Failed to delete project.' });
    }
});

// POST /api/projects/:projectId/members
router.post('/:projectId/members', authenticateToken, requireProjectAccess('admin'), (req, res) => {
    try {
        const db = getDb();
        const { user_id, role } = req.body;

        if (!user_id) return res.status(400).json({ error: 'User ID is required.' });

        const user = db.prepare('SELECT id, username, full_name, avatar_color FROM users WHERE id = ?').get(user_id);
        if (!user) return res.status(404).json({ error: 'User not found.' });

        const existing = db.prepare(
            'SELECT id FROM project_members WHERE project_id = ? AND user_id = ?'
        ).get(req.params.projectId, user_id);

        if (existing) return res.status(409).json({ error: 'User is already a member.' });

        const memberId = uuidv4();
        db.prepare(`
            INSERT INTO project_members (id, project_id, user_id, role)
            VALUES (?, ?, ?, ?)
        `).run(memberId, req.params.projectId, user_id, role || 'member');

        const project = db.prepare('SELECT name FROM projects WHERE id = ?').get(req.params.projectId);
        db.prepare(`
            INSERT INTO notifications (id, user_id, type, title, message, link)
            VALUES (?, ?, 'project_invite', ?, ?, ?)
        `).run(uuidv4(), user_id, 'Added to Project',
            `${req.user.full_name} added you to "${project.name}"`,
            `/board.html?id=${req.params.projectId}`);

        db.prepare(`
            INSERT INTO activity_log (id, project_id, user_id, action, entity_type, entity_id, details)
            VALUES (?, ?, ?, 'added_member', 'member', ?, ?)
        `).run(uuidv4(), req.params.projectId, req.user.id, user_id, JSON.stringify({ member_name: user.full_name }));

        res.status(201).json({ message: 'Member added.', member: { ...user, role: role || 'member' } });
    } catch (err) {
        console.error('Add member error:', err);
        res.status(500).json({ error: 'Failed to add member.' });
    }
});

// DELETE /api/projects/:projectId/members/:userId
router.delete('/:projectId/members/:userId', authenticateToken, requireProjectAccess('admin'), (req, res) => {
    try {
        const db = getDb();
        const member = db.prepare(
            'SELECT role FROM project_members WHERE project_id = ? AND user_id = ?'
        ).get(req.params.projectId, req.params.userId);

        if (!member) return res.status(404).json({ error: 'Member not found.' });
        if (member.role === 'owner') return res.status(403).json({ error: 'Cannot remove the project owner.' });

        db.prepare('DELETE FROM project_members WHERE project_id = ? AND user_id = ?')
            .run(req.params.projectId, req.params.userId);

        db.prepare('UPDATE tasks SET assigned_to = NULL WHERE project_id = ? AND assigned_to = ?')
            .run(req.params.projectId, req.params.userId);

        res.json({ message: 'Member removed.' });
    } catch (err) {
        console.error('Remove member error:', err);
        res.status(500).json({ error: 'Failed to remove member.' });
    }
});

// PUT /api/projects/:projectId/members/:userId/role
router.put('/:projectId/members/:userId/role', authenticateToken, requireProjectAccess('owner'), (req, res) => {
    try {
        const db = getDb();
        const { role } = req.body;
        if (!['admin', 'member'].includes(role)) return res.status(400).json({ error: 'Invalid role.' });

        db.prepare('UPDATE project_members SET role = ? WHERE project_id = ? AND user_id = ?')
            .run(role, req.params.projectId, req.params.userId);

        res.json({ message: 'Role updated.' });
    } catch (err) {
        console.error('Update role error:', err);
        res.status(500).json({ error: 'Failed to update role.' });
    }
});

// GET /api/projects/:projectId/activity
router.get('/:projectId/activity', authenticateToken, requireProjectAccess(), (req, res) => {
    try {
        const db = getDb();
        const activities = db.prepare(`
            SELECT al.*, u.full_name, u.avatar_color, u.username
            FROM activity_log al
            JOIN users u ON al.user_id = u.id
            WHERE al.project_id = ?
            ORDER BY al.created_at DESC
            LIMIT 50
        `).all(req.params.projectId);

        res.json({ activities });
    } catch (err) {
        console.error('Activity log error:', err);
        res.status(500).json({ error: 'Failed to fetch activity.' });
    }
});

// POST /api/projects/:projectId/columns
router.post('/:projectId/columns', authenticateToken, requireProjectAccess('admin'), (req, res) => {
    try {
        const db = getDb();
        const { name, color } = req.body;
        if (!name) return res.status(400).json({ error: 'Column name is required.' });

        const maxPos = db.prepare(
            'SELECT MAX(position) as max FROM board_columns WHERE project_id = ?'
        ).get(req.params.projectId);

        const columnId = uuidv4();
        db.prepare(`
            INSERT INTO board_columns (id, project_id, name, position, color)
            VALUES (?, ?, ?, ?, ?)
        `).run(columnId, req.params.projectId, name, ((maxPos && maxPos.max) || 0) + 1, color || '#6C63FF');

        const column = db.prepare('SELECT * FROM board_columns WHERE id = ?').get(columnId);
        res.status(201).json({ message: 'Column added.', column });
    } catch (err) {
        console.error('Add column error:', err);
        res.status(500).json({ error: 'Failed to add column.' });
    }
});

// PUT /api/projects/:projectId/columns/:columnId
router.put('/:projectId/columns/:columnId', authenticateToken, requireProjectAccess('admin'), (req, res) => {
    try {
        const db = getDb();
        const { name, color } = req.body;
        const updates = [];
        const values = [];

        if (name) { updates.push('name = ?'); values.push(name); }
        if (color) { updates.push('color = ?'); values.push(color); }

        if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update.' });

        values.push(req.params.columnId);
        db.prepare(`UPDATE board_columns SET ${updates.join(', ')} WHERE id = ?`).run(...values);

        res.json({ message: 'Column updated.' });
    } catch (err) {
        console.error('Update column error:', err);
        res.status(500).json({ error: 'Failed to update column.' });
    }
});

// DELETE /api/projects/:projectId/columns/:columnId
router.delete('/:projectId/columns/:columnId', authenticateToken, requireProjectAccess('admin'), (req, res) => {
    try {
        const db = getDb();
        const taskCount = db.prepare(
            'SELECT COUNT(*) as count FROM tasks WHERE column_id = ?'
        ).get(req.params.columnId);

        if (taskCount && taskCount.count > 0) {
            return res.status(400).json({ error: 'Cannot delete column with tasks. Move or delete tasks first.' });
        }

        db.prepare('DELETE FROM board_columns WHERE id = ?').run(req.params.columnId);
        res.json({ message: 'Column deleted.' });
    } catch (err) {
        console.error('Delete column error:', err);
        res.status(500).json({ error: 'Failed to delete column.' });
    }
});

module.exports = router;
