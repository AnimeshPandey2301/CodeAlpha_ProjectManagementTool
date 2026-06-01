const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// In-memory store for simulated password reset codes (email -> { code, expires })
const resetCodes = new Map();

// Avatar color palette
const AVATAR_COLORS = [
    '#6C63FF', '#FF6584', '#43AA8B', '#F9C74F', '#F3722C',
    '#577590', '#90BE6D', '#F94144', '#277DA1', '#4D908E'
];

// POST /api/auth/register
router.post('/register', (req, res) => {
    try {
        const db = getDb();
        const { username, email, password, full_name } = req.body;

        if (!username || !email || !password || !full_name) {
            return res.status(400).json({ error: 'All fields are required.' });
        }

        if (username.length < 3 || username.length > 30) {
            return res.status(400).json({ error: 'Username must be 3-30 characters.' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters.' });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Invalid email format.' });
        }

        const existingUser = db.prepare(
            'SELECT id FROM users WHERE username = ? OR email = ?'
        ).get(username.toLowerCase(), email.toLowerCase());

        if (existingUser) {
            return res.status(409).json({ error: 'Username or email already taken.' });
        }

        const salt = bcrypt.genSaltSync(12);
        const passwordHash = bcrypt.hashSync(password, salt);
        const userId = uuidv4();
        const avatarColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];

        db.prepare(`
            INSERT INTO users (id, username, email, password_hash, full_name, avatar_color)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(userId, username.toLowerCase(), email.toLowerCase(), passwordHash, full_name, avatarColor);

        const token = jwt.sign({ userId }, process.env.JWT_SECRET, {
            expiresIn: process.env.JWT_EXPIRES_IN || '7d'
        });

        res.cookie('token', token, {
            httpOnly: true,
            secure: false,
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        res.status(201).json({
            message: 'Account created successfully!',
            token,
            user: {
                id: userId,
                username: username.toLowerCase(),
                email: email.toLowerCase(),
                full_name,
                avatar_color: avatarColor
            }
        });
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ error: 'Server error during registration.' });
    }
});

// POST /api/auth/login
router.post('/login', (req, res) => {
    try {
        const db = getDb();
        const { login, password } = req.body;

        if (!login || !password) {
            return res.status(400).json({ error: 'Email/username and password are required.' });
        }

        const user = db.prepare(
            'SELECT * FROM users WHERE username = ? OR email = ?'
        ).get(login.toLowerCase(), login.toLowerCase());

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        const validPassword = bcrypt.compareSync(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
            expiresIn: process.env.JWT_EXPIRES_IN || '7d'
        });

        res.cookie('token', token, {
            httpOnly: true,
            secure: false,
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        res.json({
            message: 'Login successful!',
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                full_name: user.full_name,
                avatar_color: user.avatar_color,
                bio: user.bio
            }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Server error during login.' });
    }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ message: 'Logged out successfully.' });
});

// GET /api/auth/me
router.get('/me', authenticateToken, (req, res) => {
    res.json({ user: req.user });
});

// PUT /api/auth/profile
router.put('/profile', authenticateToken, (req, res) => {
    try {
        const db = getDb();
        const { full_name, bio, avatar_color } = req.body;

        const updates = [];
        const values = [];

        if (full_name !== undefined) { updates.push('full_name = ?'); values.push(full_name); }
        if (bio !== undefined) { updates.push('bio = ?'); values.push(bio); }
        if (avatar_color !== undefined) { updates.push('avatar_color = ?'); values.push(avatar_color); }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update.' });
        }

        updates.push('updated_at = CURRENT_TIMESTAMP');
        values.push(req.user.id);

        db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);

        const updatedUser = db.prepare(
            'SELECT id, username, email, full_name, avatar_color, bio FROM users WHERE id = ?'
        ).get(req.user.id);

        res.json({ message: 'Profile updated.', user: updatedUser });
    } catch (err) {
        console.error('Profile update error:', err);
        res.status(500).json({ error: 'Failed to update profile.' });
    }
});

// PUT /api/auth/password
router.put('/password', authenticateToken, (req, res) => {
    try {
        const db = getDb();
        const { current_password, new_password } = req.body;

        if (!current_password || !new_password) {
            return res.status(400).json({ error: 'Both current and new passwords are required.' });
        }

        if (new_password.length < 6) {
            return res.status(400).json({ error: 'New password must be at least 6 characters.' });
        }

        const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);

        if (!bcrypt.compareSync(current_password, user.password_hash)) {
            return res.status(401).json({ error: 'Current password is incorrect.' });
        }

        const salt = bcrypt.genSaltSync(12);
        const newHash = bcrypt.hashSync(new_password, salt);

        db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(newHash, req.user.id);

        res.json({ message: 'Password changed successfully.' });
    } catch (err) {
        console.error('Password change error:', err);
        res.status(500).json({ error: 'Failed to change password.' });
    }
});

// GET /api/auth/search?q=query
router.get('/search', authenticateToken, (req, res) => {
    try {
        const db = getDb();
        const query = req.query.q;
        if (!query || query.length < 2) {
            return res.json({ users: [] });
        }

        const users = db.prepare(`
            SELECT id, username, email, full_name, avatar_color
            FROM users
            WHERE (username LIKE ? OR email LIKE ? OR full_name LIKE ?)
            AND id != ?
            LIMIT 10
        `).all(`%${query}%`, `%${query}%`, `%${query}%`, req.user.id);

        res.json({ users });
    } catch (err) {
        console.error('User search error:', err);
        res.status(500).json({ error: 'Failed to search users.' });
    }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', (req, res) => {
    try {
        const db = getDb();
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Email address is required.' });
        }

        const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
        if (!user) {
            return res.status(404).json({ error: 'No account found with this email address.' });
        }

        // Generate a 6-digit verification code
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Store code with a 10-minute expiry
        resetCodes.set(email.toLowerCase(), {
            code,
            expires: Date.now() + 10 * 60 * 1000
        });

        // In production, an email would be sent here.
        // For local development, we return the code directly to make testing seamless.
        res.json({
            message: 'A verification code has been generated.',
            code: code // Included for easy access in our local environment
        });
    } catch (err) {
        console.error('Forgot password error:', err);
        res.status(500).json({ error: 'Failed to process forgot password request.' });
    }
});

// POST /api/auth/reset-password
router.post('/reset-password', (req, res) => {
    try {
        const db = getDb();
        const { email, code, new_password } = req.body;

        if (!email || !code || !new_password) {
            return res.status(400).json({ error: 'Email, code, and new password are required.' });
        }

        if (new_password.length < 6) {
            return res.status(400).json({ error: 'New password must be at least 6 characters.' });
        }

        const storedData = resetCodes.get(email.toLowerCase());
        if (!storedData || storedData.code !== code || Date.now() > storedData.expires) {
            return res.status(400).json({ error: 'Invalid or expired verification code.' });
        }

        // Hash the new password and update in database
        const salt = bcrypt.genSaltSync(12);
        const passwordHash = bcrypt.hashSync(new_password, salt);

        db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE email = ?')
            .run(passwordHash, email.toLowerCase());

        // Remove the used code
        resetCodes.delete(email.toLowerCase());

        res.json({ message: 'Password reset successfully! You can now sign in with your new password.' });
    } catch (err) {
        console.error('Reset password error:', err);
        res.status(500).json({ error: 'Failed to reset password.' });
    }
});

module.exports = router;
