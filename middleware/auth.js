const jwt = require('jsonwebtoken');
const { getDb } = require('../database/db');

function authenticateToken(req, res, next) {
    const db = getDb();

    // Check Authorization header first, then cookies
    const authHeader = req.headers['authorization'];
    let token = authHeader && authHeader.split(' ')[1];

    if (!token && req.cookies) {
        token = req.cookies.token;
    }

    if (!token) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = db.prepare('SELECT id, username, email, full_name, avatar_color, bio FROM users WHERE id = ?').get(decoded.userId);

        if (!user) {
            return res.status(401).json({ error: 'User not found.' });
        }

        req.user = user;
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expired. Please log in again.' });
        }
        return res.status(403).json({ error: 'Invalid token.' });
    }
}

function requireProjectAccess(requiredRole = 'member') {
    const roleHierarchy = { owner: 3, admin: 2, member: 1 };

    return (req, res, next) => {
        const db = getDb();
        const projectId = req.params.projectId || req.body.project_id;

        if (!projectId) {
            return res.status(400).json({ error: 'Project ID is required.' });
        }

        const membership = db.prepare(
            'SELECT role FROM project_members WHERE project_id = ? AND user_id = ?'
        ).get(projectId, req.user.id);

        if (!membership) {
            return res.status(403).json({ error: 'You are not a member of this project.' });
        }

        if (roleHierarchy[membership.role] < roleHierarchy[requiredRole]) {
            return res.status(403).json({ error: `Requires ${requiredRole} role or higher.` });
        }

        req.projectRole = membership.role;
        next();
    };
}

module.exports = { authenticateToken, requireProjectAccess };
