const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

let db = null;
let inTransaction = false;
const DB_PATH = process.env.DB_PATH || './database/taskflow.db';

async function initializeDatabase() {
    const dbDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }

    const SQL = await initSqlJs();

    // Load existing database if it exists
    if (fs.existsSync(DB_PATH)) {
        const buffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(buffer);
    } else {
        db = new SQL.Database();
    }

    db.run('PRAGMA foreign_keys = ON;');

    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            full_name TEXT NOT NULL,
            avatar_color TEXT DEFAULT '#6C63FF',
            bio TEXT DEFAULT '',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            color TEXT DEFAULT '#6C63FF',
            icon TEXT DEFAULT '📋',
            owner_id TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS project_members (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            role TEXT DEFAULT 'member' CHECK(role IN ('owner', 'admin', 'member')),
            joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(project_id, user_id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS board_columns (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            name TEXT NOT NULL,
            position INTEGER NOT NULL DEFAULT 0,
            color TEXT DEFAULT '#6C63FF',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            column_id TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            priority TEXT DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high', 'urgent')),
            position INTEGER NOT NULL DEFAULT 0,
            due_date TEXT,
            created_by TEXT NOT NULL,
            assigned_to TEXT,
            labels TEXT DEFAULT '[]',
            attachments TEXT DEFAULT '[]',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
            FOREIGN KEY (column_id) REFERENCES board_columns(id) ON DELETE CASCADE,
            FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS comments (
            id TEXT PRIMARY KEY,
            task_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            content TEXT NOT NULL,
            edited INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS notifications (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            link TEXT DEFAULT '',
            is_read INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS activity_log (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            action TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            details TEXT DEFAULT '{}',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    // Create indexes (ignore if they exist)
    const indexes = [
        'CREATE INDEX IF NOT EXISTS idx_project_members_project ON project_members(project_id)',
        'CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(user_id)',
        'CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id)',
        'CREATE INDEX IF NOT EXISTS idx_tasks_column ON tasks(column_id)',
        'CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to)',
        'CREATE INDEX IF NOT EXISTS idx_comments_task ON comments(task_id)',
        'CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id)',
        'CREATE INDEX IF NOT EXISTS idx_activity_project ON activity_log(project_id)'
    ];

    indexes.forEach(sql => db.run(sql));

    saveDatabase();
    console.log('Database initialized successfully');
}

// Save database to disk
function saveDatabase() {
    if (!db || inTransaction) return;
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
}

// Auto-save every 10 seconds
setInterval(() => {
    saveDatabase();
}, 10000);

// ── Helper wrappers to match better-sqlite3-like API ──
const dbHelper = {
    prepare(sql) {
        return {
            run(...params) {
                db.run(sql, params);
                saveDatabase();
            },
            get(...params) {
                const stmt = db.prepare(sql);
                stmt.bind(params);
                if (stmt.step()) {
                    const row = stmt.getAsObject();
                    stmt.free();
                    return row;
                }
                stmt.free();
                return undefined;
            },
            all(...params) {
                const results = [];
                const stmt = db.prepare(sql);
                stmt.bind(params);
                while (stmt.step()) {
                    results.push(stmt.getAsObject());
                }
                stmt.free();
                return results;
            }
        };
    },
    transaction(fn) {
        return (...args) => {
            inTransaction = true;
            db.run('BEGIN TRANSACTION');
            try {
                const result = fn(...args);
                db.run('COMMIT');
                inTransaction = false;
                saveDatabase();
                return result;
            } catch (err) {
                inTransaction = false;
                try {
                    db.run('ROLLBACK');
                } catch (rollbackErr) {
                    console.error('Failed to rollback transaction:', rollbackErr);
                }
                throw err;
            }
        };
    }
};

function getDb() {
    return dbHelper;
}

module.exports = { getDb, initializeDatabase, saveDatabase };
