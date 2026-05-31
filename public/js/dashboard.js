// ============================================
// TaskFlow Pro – Dashboard Logic
// ============================================

let projects = [];

document.addEventListener('DOMContentLoaded', async () => {
    if (!requireAuth()) return;

    // Verify token is valid and refresh user data
    try {
        const data = await api.get('/auth/me');
        setCurrentUser(data.user);
    } catch (err) {
        clearToken();
        window.location.href = '/index.html';
        return;
    }

    await setupSidebar();
    wsManager.connect();
    loadDashboard();
    setupDashboardEvents();
});

async function loadDashboard() {
    try {
        const data = await api.get('/projects');
        projects = data.projects || [];
        renderStats();
        renderProjects();
    } catch (err) {
        showToast('Failed to load projects', 'error');
    }
}

function renderStats() {
    const totalProjects = projects.length;
    const totalTasks = projects.reduce((sum, p) => sum + (p.task_count || 0), 0);
    const completedTasks = projects.reduce((sum, p) => sum + (p.completed_count || 0), 0);
    const totalMembers = new Set(projects.map(p => p.member_count)).size > 0
        ? projects.reduce((sum, p) => sum + (p.member_count || 0), 0) : 0;

    document.getElementById('stat-projects').textContent = totalProjects;
    document.getElementById('stat-tasks').textContent = totalTasks;
    document.getElementById('stat-completed').textContent = completedTasks;
    document.getElementById('stat-members').textContent = totalMembers;

    // Animate stat numbers
    document.querySelectorAll('.stat-value').forEach(el => {
        el.style.animation = 'fadeInUp 0.5s ease-out';
    });
}

function renderProjects() {
    const grid = document.getElementById('projects-grid');

    if (projects.length === 0) {
        grid.innerHTML = `
            <div class="new-project-card" onclick="openModal('new-project-modal')">
                <div class="plus-icon">+</div>
                <h3>Create Your First Project</h3>
                <p style="font-size: 0.875rem;">Start organizing your work with boards and tasks</p>
            </div>
        `;
        return;
    }

    const projectCards = projects.map(p => {
        const progress = p.task_count > 0
            ? Math.round((p.completed_count / p.task_count) * 100) : 0;

        return `
            <div class="project-card" style="--project-color: ${p.color};" onclick="window.location.href='/board.html?id=${p.id}'">
                <div class="card-header">
                    <div class="project-icon" style="background: ${p.color}20;">${p.icon}</div>
                    <span class="task-priority" style="background: ${p.color}20; color: ${p.color};">${p.role}</span>
                </div>
                <h3>${escapeHtml(p.name)}</h3>
                <p class="project-desc">${escapeHtml(p.description || 'No description')}</p>
                <div class="card-footer">
                    <div class="task-progress">
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${progress}%;"></div>
                        </div>
                        <span>${p.completed_count || 0}/${p.task_count || 0}</span>
                    </div>
                    <span style="font-size: 0.8125rem; color: var(--text-muted);">
                        👥 ${p.member_count || 0}
                    </span>
                </div>
            </div>
        `;
    }).join('');

    grid.innerHTML = projectCards + `
        <div class="new-project-card" onclick="openModal('new-project-modal')">
            <div class="plus-icon">+</div>
            <h3>New Project</h3>
        </div>
    `;
}

function setupDashboardEvents() {
    // New Project button
    document.getElementById('btn-new-project').addEventListener('click', () => {
        openModal('new-project-modal');
    });

    // Icon picker
    document.getElementById('icon-picker').addEventListener('click', (e) => {
        const option = e.target.closest('.icon-option');
        if (!option) return;
        document.querySelectorAll('#icon-picker .icon-option').forEach(o => o.classList.remove('selected'));
        option.classList.add('selected');
    });

    // Color picker
    document.getElementById('color-picker').addEventListener('click', (e) => {
        const option = e.target.closest('.color-option');
        if (!option) return;
        document.querySelectorAll('#color-picker .color-option').forEach(o => o.classList.remove('selected'));
        option.classList.add('selected');
    });

    // Create project
    document.getElementById('btn-create-project').addEventListener('click', createProject);

    // Enter key on project name
    document.getElementById('project-name').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            createProject();
        }
    });

    // My Tasks navigation
    document.getElementById('nav-my-tasks').addEventListener('click', async (e) => {
        e.preventDefault();
        await showMyTasks();
    });
}

async function createProject() {
    const nameInput = document.getElementById('project-name');
    const descInput = document.getElementById('project-desc');
    const selectedIcon = document.querySelector('#icon-picker .icon-option.selected');
    const selectedColor = document.querySelector('#color-picker .color-option.selected');

    const name = nameInput.value.trim();
    if (!name) {
        showToast('Please enter a project name', 'error');
        nameInput.focus();
        return;
    }

    try {
        const btn = document.getElementById('btn-create-project');
        btn.disabled = true;
        btn.innerHTML = '<span class="loading-spinner"></span> Creating...';

        const data = await api.post('/projects', {
            name,
            description: descInput.value.trim(),
            icon: selectedIcon?.dataset.icon || '📋',
            color: selectedColor?.dataset.color || '#6C63FF'
        });

        closeModal('new-project-modal');
        nameInput.value = '';
        descInput.value = '';
        btn.disabled = false;
        btn.textContent = 'Create Project';

        showToast(`Project "${name}" created! 🎉`, 'success');

        // Redirect to the new board
        window.location.href = `/board.html?id=${data.project.id}`;
    } catch (err) {
        showToast(err.message, 'error');
        const btn = document.getElementById('btn-create-project');
        btn.disabled = false;
        btn.textContent = 'Create Project';
    }
}

async function showMyTasks() {
    const content = document.getElementById('dashboard-content');
    const pageTitle = document.querySelector('.top-header .page-title h2');
    
    pageTitle.textContent = 'My Tasks';

    // Update nav active state
    document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
    document.getElementById('nav-my-tasks').classList.add('active');

    content.innerHTML = '<div class="loading-overlay"><div class="loading-spinner lg"></div><p>Loading tasks...</p></div>';

    try {
        const data = await api.get('/tasks/user/assigned');
        const tasks = data.tasks || [];

        if (tasks.length === 0) {
            content.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">✅</div>
                    <h3>No tasks assigned to you</h3>
                    <p>When someone assigns a task to you, it will appear here.</p>
                </div>
            `;
            return;
        }

        content.innerHTML = `
            <div style="padding: 0;">
                ${tasks.map(t => `
                    <div class="task-card" style="margin-bottom: 8px; cursor: pointer;" onclick="window.location.href='/board.html?id=${t.project_id}&task=${t.id}'">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                            <span style="font-size: 1rem;">${t.project_icon}</span>
                            <span style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(t.project_name)}</span>
                            <span class="task-priority priority-${t.priority}">${t.priority}</span>
                            <span style="font-size: 0.75rem; color: var(--text-muted); margin-left: auto;">${t.column_name}</span>
                        </div>
                        <div class="task-title">${escapeHtml(t.title)}</div>
                        <div class="task-meta">
                            <div class="task-meta-left">
                                ${t.due_date ? `<span class="task-due ${isOverdue(t.due_date) ? 'overdue' : ''}">📅 ${formatFullDate(t.due_date)}</span>` : ''}
                            </div>
                            ${t.comment_count > 0 ? `<span class="comment-count">💬 ${t.comment_count}</span>` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    } catch (err) {
        content.innerHTML = `<div class="empty-state"><h3>Failed to load tasks</h3><p>${err.message}</p></div>`;
    }
}

// HTML escape utility
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
