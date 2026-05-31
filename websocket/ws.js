const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const { getDb } = require('../database/db');

const userConnections = new Map();
const projectRooms = new Map();

function setupWebSocket(server) {
    const wss = new WebSocketServer({ server, path: '/ws' });

    wss.on('connection', (ws, req) => {
        let userId = null;
        let currentProjectId = null;

        const url = new URL(req.url, `http://${req.headers.host}`);
        const token = url.searchParams.get('token');

        if (token) {
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                userId = decoded.userId;

                if (!userConnections.has(userId)) {
                    userConnections.set(userId, new Set());
                }
                userConnections.get(userId).add(ws);

                ws.send(JSON.stringify({ type: 'connected', message: 'WebSocket connected' }));

                try {
                    const db = getDb();
                    const unread = db.prepare(
                        'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0'
                    ).get(userId);
                    ws.send(JSON.stringify({ type: 'notification_count', count: (unread && unread.count) || 0 }));
                } catch (e) {
                    // Database might not be ready yet
                }

            } catch (err) {
                ws.send(JSON.stringify({ type: 'error', message: 'Invalid token' }));
                ws.close(1008, 'Invalid token');
                return;
            }
        } else {
            ws.send(JSON.stringify({ type: 'error', message: 'No token provided' }));
            ws.close(1008, 'No token');
            return;
        }

        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());

                switch (message.type) {
                    case 'join_project':
                        if (currentProjectId && projectRooms.has(currentProjectId)) {
                            projectRooms.get(currentProjectId).delete(ws);
                        }

                        currentProjectId = message.projectId;

                        try {
                            const db = getDb();
                            const member = db.prepare(
                                'SELECT role FROM project_members WHERE project_id = ? AND user_id = ?'
                            ).get(currentProjectId, userId);

                            if (member) {
                                if (!projectRooms.has(currentProjectId)) {
                                    projectRooms.set(currentProjectId, new Set());
                                }
                                projectRooms.get(currentProjectId).add(ws);
                                ws.send(JSON.stringify({
                                    type: 'joined_project',
                                    projectId: currentProjectId
                                }));
                            }
                        } catch (e) {
                            // ignore
                        }
                        break;

                    case 'leave_project':
                        if (currentProjectId && projectRooms.has(currentProjectId)) {
                            projectRooms.get(currentProjectId).delete(ws);
                            currentProjectId = null;
                        }
                        break;

                    case 'ping':
                        ws.send(JSON.stringify({ type: 'pong' }));
                        break;
                }
            } catch (err) {
                console.error('WebSocket message error:', err);
            }
        });

        ws.on('close', () => {
            if (userId && userConnections.has(userId)) {
                userConnections.get(userId).delete(ws);
                if (userConnections.get(userId).size === 0) {
                    userConnections.delete(userId);
                }
            }

            if (currentProjectId && projectRooms.has(currentProjectId)) {
                projectRooms.get(currentProjectId).delete(ws);
                if (projectRooms.get(currentProjectId).size === 0) {
                    projectRooms.delete(currentProjectId);
                }
            }
        });

        ws.on('error', (err) => {
            console.error('WebSocket error:', err);
        });
    });

    // Heartbeat
    const heartbeat = setInterval(() => {
        wss.clients.forEach((ws) => {
            if (ws.isAlive === false) return ws.terminate();
            ws.isAlive = false;
            ws.ping();
        });
    }, 30000);

    wss.on('close', () => clearInterval(heartbeat));

    wss.on('connection', (ws) => {
        ws.isAlive = true;
        ws.on('pong', () => { ws.isAlive = true; });
    });

    console.log('WebSocket server initialized');
    return wss;
}

function notifyUser(userId, data) {
    if (userConnections.has(userId)) {
        const message = JSON.stringify(data);
        userConnections.get(userId).forEach((ws) => {
            if (ws.readyState === 1) ws.send(message);
        });
    }
}

function broadcastToProject(projectId, data, excludeUserId = null) {
    if (projectRooms.has(projectId)) {
        const message = JSON.stringify(data);
        projectRooms.get(projectId).forEach((ws) => {
            if (ws.readyState === 1) ws.send(message);
        });
    }
}

module.exports = { setupWebSocket, notifyUser, broadcastToProject };
