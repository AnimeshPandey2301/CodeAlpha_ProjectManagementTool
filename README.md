# TaskFlow Pro ⚡

A full-stack collaborative project management tool built with Node.js, Express, SQLite, and vanilla JavaScript. Features real-time updates via WebSockets, JWT authentication, Kanban boards, task management, team collaboration, and in-app notifications.

## Features

### 🔐 Authentication System
- User registration with email, username, and password
- JWT-based authentication with cookie support
- Password hashing with bcrypt (12 rounds)
- Profile management and password change
- User search for adding team members

### 📋 Project Management
- Create unlimited projects with custom icons and colors
- Role-based access control (Owner, Admin, Member)
- Add/remove team members with role management
- Project activity log tracking all changes
- Progress tracking with completion percentages

### 🗂️ Kanban Board
- 5 default columns: Backlog → To Do → In Progress → Review → Done
- Drag-and-drop task cards between columns
- Add custom columns with colors
- Real-time column task counts

### ✅ Task Management
- Create tasks with title, description, priority, due dates
- 4 priority levels: Low, Medium, High, Urgent
- Assign tasks to team members
- Label system: Bug, Feature, Enhancement, Design, Docs, Testing
- Task detail modal with full editing capabilities
- Overdue date highlighting

### 💬 Comments & Communication
- Comment on any task
- Edit and delete your own comments
- Real-time comment notifications to task creator and assignee
- Comment count displayed on task cards

### 🔔 Notifications
- In-app notification system
- Notification types: Project invites, task assignments, comments
- Mark as read / Mark all as read
- Notification badge with unread count
- Slide-out notification panel

### ⚡ Real-Time Updates (WebSocket)
- Live notification count updates
- Project room-based broadcasting
- Automatic reconnection with exponential backoff
- Heartbeat keep-alive mechanism

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Node.js + Express.js |
| **Database** | SQLite via sql.js (pure JavaScript) |
| **Auth** | JWT + bcryptjs |
| **Real-time** | WebSocket (ws library) |
| **Frontend** | Vanilla HTML/CSS/JavaScript |
| **Styling** | Custom CSS Design System (Dark Theme) |

## Getting Started

### Prerequisites
- Node.js 18+ installed

### Installation

```bash
# Clone the repository
cd Project-management

# Install dependencies
npm install

# Start the development server
npm run dev
```

The app will start at **http://localhost:3000**

### Usage

1. **Register** – Create a new account at the login page
2. **Create Project** – Click "New Project" on the dashboard
3. **Add Members** – Open the Members modal on a board and search for users
4. **Create Tasks** – Click the `+` button on any column
5. **Drag & Drop** – Move tasks between columns by dragging
6. **Comment** – Open any task and use the comment section
7. **Notifications** – Click the bell icon to view your notifications

## Project Structure

```
Project-management/
├── server.js                 # Express server entry point
├── package.json
├── .env                      # Environment variables
├── database/
│   └── db.js                 # SQLite database setup (sql.js)
├── middleware/
│   └── auth.js               # JWT auth & role-based access
├── routes/
│   ├── auth.js               # Auth endpoints
│   ├── projects.js           # Project CRUD + members
│   ├── tasks.js              # Task CRUD + move/assign
│   ├── comments.js           # Comment CRUD
│   └── notifications.js      # Notification endpoints
├── websocket/
│   └── ws.js                 # WebSocket server
└── public/
    ├── index.html            # Login/Register page
    ├── dashboard.html        # Project dashboard
    ├── board.html            # Kanban board
    ├── css/
    │   └── styles.css        # Design system
    └── js/
        ├── api.js            # API client + WebSocket manager
        ├── auth.js           # Auth page logic
        ├── dashboard.js      # Dashboard logic
        └── board.js          # Kanban board logic
```

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/me` | Get current user |
| PUT | `/api/auth/profile` | Update profile |
| PUT | `/api/auth/password` | Change password |
| GET | `/api/auth/search?q=` | Search users |

### Projects
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/projects` | List user's projects |
| POST | `/api/projects` | Create project |
| GET | `/api/projects/:id` | Get project details |
| PUT | `/api/projects/:id` | Update project |
| DELETE | `/api/projects/:id` | Delete project |
| POST | `/api/projects/:id/members` | Add member |
| DELETE | `/api/projects/:id/members/:userId` | Remove member |
| GET | `/api/projects/:id/activity` | Get activity log |

### Tasks
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/tasks` | Create task |
| GET | `/api/tasks/:id` | Get task with comments |
| PUT | `/api/tasks/:id` | Update task |
| DELETE | `/api/tasks/:id` | Delete task |
| PUT | `/api/tasks/:id/move` | Move task (drag & drop) |
| GET | `/api/tasks/user/assigned` | Get my assigned tasks |

### Comments
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/comments` | Add comment |
| GET | `/api/comments/task/:taskId` | Get task comments |
| PUT | `/api/comments/:id` | Edit comment |
| DELETE | `/api/comments/:id` | Delete comment |

### Notifications
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/notifications` | Get notifications |
| PUT | `/api/notifications/read-all` | Mark all as read |
| PUT | `/api/notifications/:id/read` | Mark one as read |
| DELETE | `/api/notifications/:id` | Delete notification |

## License

MIT
