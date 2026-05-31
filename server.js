require('dotenv').config();

const express = require('express');
const http = require('http');
const path = require('path');
const cookieParser = require('cookie-parser');
const { initializeDatabase } = require('./database/db');
const { setupWebSocket } = require('./websocket/ws');

const app = express();
const server = http.createServer(app);

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/comments', require('./routes/comments'));
app.use('/api/notifications', require('./routes/notifications'));

// Serve specific HTML pages
app.get('/dashboard.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/board.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'board.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error.' });
});

const PORT = process.env.PORT || 3000;

// Initialize database then start server
async function start() {
    try {
        await initializeDatabase();

        // Setup WebSocket after DB is ready
        setupWebSocket(server);

        server.listen(PORT, () => {
            console.log(`
    ╔══════════════════════════════════════════╗
    ║                                          ║
    ║     TaskFlow Pro is running! 🚀          ║
    ║                                          ║
    ║     Local:  http://localhost:${PORT}        ║
    ║                                          ║
    ╚══════════════════════════════════════════╝
            `);
        });
    } catch (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
    }
}

start();
