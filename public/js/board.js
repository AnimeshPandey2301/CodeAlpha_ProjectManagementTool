// ============================================
// TaskFlow Pro – Kanban Board Logic
// ============================================

let currentProject = null;
let currentTask = null;
let projectId = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (!requireAuth()) return;

    // Get project ID from URL
    const params = new URLSearchParams(window.location.search);
    projectId = params.get('id');

    if (!projectId) {
        window.location.href = '/dashboard.html';
        return;
    }

    // Verify token
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
    wsManager.joinProject(projectId);

    // Highlight current project in sidebar
    document.querySelectorAll('.project-list-item').forEach(el => {
        if (el.dataset.projectId === projectId) {
            el.classList.add('active');
        }
    });

    await loadBoard();
    setupBoardEvents();

    // Check if we should open a specific task
    const taskParam = params.get('task');
    if (taskParam) {
        setTimeout(() => openTaskDetail(taskParam), 500);
    }

    // WebSocket listeners for real-time updates
    wsManager.on('task_created', () => loadBoard());
    wsManager.on('task_updated', () => loadBoard());
    wsManager.on('task_moved', () => loadBoard());
    wsManager.on('task_deleted', () => loadBoard());
    wsManager.on('member_added', () => loadBoard());
});

async function loadBoard() {
    try {
        const data = await api.get(`/projects/${projectId}`);
        currentProject = data.project;
        renderBoardHeader();
        renderBoard();
    } catch (err) {
        showToast('Failed to load board: ' + err.message, 'error');
        document.getElementById('board-container').innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">😕</div>
                <h3>Unable to load project</h3>
                <p>${err.message}</p>
                <a href="/dashboard.html" class="btn btn-primary" style="margin-top: 16px;">Back to Dashboard</a>
            </div>
        `;
    }
}

function renderBoardHeader() {
    const p = currentProject;
    document.title = `${p.name} – TaskFlow Pro`;

    document.getElementById('board-project-icon').textContent = p.icon;
    document.getElementById('board-project-icon').style.background = `${p.color}20`;
    document.getElementById('board-project-name').textContent = p.name;
    document.getElementById('board-project-meta').textContent =
        `${p.members.length} member${p.members.length !== 1 ? 's' : ''} · ${p.tasks.length} task${p.tasks.length !== 1 ? 's' : ''}`;
}

function renderBoard() {
    const container = document.getElementById('board-container');
    const columns = currentProject.columns;
    const tasks = currentProject.tasks;

    container.innerHTML = columns.map(col => {
        const colTasks = tasks
            .filter(t => t.column_id === col.id)
            .sort((a, b) => a.position - b.position);

        return `
            <div class="board-column" data-column-id="${col.id}">
                <div class="column-header">
                    <div class="column-title">
                        <span class="column-dot" style="background: ${col.color};"></span>
                        <span class="column-name">${escapeHtml(col.name)}</span>
                        <span class="column-count">${colTasks.length}</span>
                    </div>
                    <button class="add-task-btn" onclick="openNewTaskModal('${col.id}')" title="Add task">+</button>
                </div>
                <div class="column-tasks" data-column-id="${col.id}"
                     ondragover="handleDragOver(event)" ondrop="handleDrop(event, '${col.id}')"
                     ondragenter="event.currentTarget.classList.add('drag-over')"
                     ondragleave="handleDragLeave(event)">
                    ${colTasks.map(t => renderTaskCard(t)).join('')}
                    ${colTasks.length === 0 ? '<div style="text-align: center; padding: 24px; color: var(--text-muted); font-size: 0.8125rem;">Drop tasks here</div>' : ''}
                </div>
            </div>
        `;
    }).join('');

    // Populate assignee dropdowns
    populateAssigneeDropdowns();
}

function renderTaskCard(task) {
    const labels = safeParseJSON(task.labels, []);
    const labelHtml = labels.map(l =>
        `<span class="task-label label-${l}">${l}</span>`
    ).join('');

    const dueClass = task.due_date && isOverdue(task.due_date) ? 'overdue' : '';

    return `
        <div class="task-card" draggable="true" data-task-id="${task.id}"
             ondragstart="handleDragStart(event, '${task.id}')"
             ondragend="handleDragEnd(event)"
             onclick="openTaskDetail('${task.id}')">
            ${labelHtml ? `<div class="task-labels">${labelHtml}</div>` : ''}
            <div class="task-title">${escapeHtml(task.title)}</div>
            ${task.description ? `<div class="task-desc-preview">${escapeHtml(task.description)}</div>` : ''}
            <div class="task-meta">
                <div class="task-meta-left">
                    <span class="task-priority priority-${task.priority}">${task.priority}</span>
                    ${task.due_date ? `<span class="task-due ${dueClass}">📅 ${formatDate(task.due_date + 'T00:00:00')}</span>` : ''}
                    ${task.comment_count > 0 ? `<span class="comment-count">💬 ${task.comment_count}</span>` : ''}
                </div>
                ${task.assignee_name ? `
                    <div class="task-assignee" style="background: ${task.assignee_color};" title="${escapeHtml(task.assignee_name)}">
                        ${getInitials(task.assignee_name)}
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

// ── Drag & Drop ──
let draggedTaskId = null;

function handleDragStart(event, taskId) {
    draggedTaskId = taskId;
    event.target.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', taskId);
}

function handleDragEnd(event) {
    event.target.classList.remove('dragging');
    document.querySelectorAll('.column-tasks').forEach(el => el.classList.remove('drag-over'));
}

function handleDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
}

function handleDragLeave(event) {
    // Only remove if leaving the column-tasks container
    if (!event.currentTarget.contains(event.relatedTarget)) {
        event.currentTarget.classList.remove('drag-over');
    }
}

async function handleDrop(event, columnId) {
    event.preventDefault();
    event.currentTarget.classList.remove('drag-over');

    const taskId = event.dataTransfer.getData('text/plain') || draggedTaskId;
    if (!taskId) return;

    // Calculate position based on drop location
    const taskCards = [...event.currentTarget.querySelectorAll('.task-card')];
    let position = 0;

    for (let i = 0; i < taskCards.length; i++) {
        const rect = taskCards[i].getBoundingClientRect();
        if (event.clientY > rect.top + rect.height / 2) {
            position = i + 1;
        }
    }

    try {
        await api.put(`/tasks/${taskId}/move`, {
            column_id: columnId,
            position
        });

        // Reload board to reflect changes
        await loadBoard();
        showToast('Task moved', 'success');
    } catch (err) {
        showToast('Failed to move task: ' + err.message, 'error');
    }

    draggedTaskId = null;
}

// ── New Task ──
function openNewTaskModal(columnId) {
    document.getElementById('new-task-column-id').value = columnId;
    document.getElementById('task-title').value = '';
    document.getElementById('task-description').value = '';
    document.getElementById('task-priority').value = 'medium';
    document.getElementById('task-due-date').value = '';
    document.getElementById('task-assignee').value = '';

    // Clear label checkboxes
    document.querySelectorAll('#label-checkboxes input[type="checkbox"]').forEach(cb => {
        cb.checked = false;
    });

    populateAssigneeDropdowns();
    openModal('new-task-modal');
    document.getElementById('task-title').focus();
}

async function createTask() {
    const title = document.getElementById('task-title').value.trim();
    const columnId = document.getElementById('new-task-column-id').value;

    if (!title) {
        showToast('Please enter a task title', 'error');
        return;
    }

    const labels = [];
    document.querySelectorAll('#label-checkboxes input[type="checkbox"]:checked').forEach(cb => {
        labels.push(cb.value);
    });

    try {
        const btn = document.getElementById('btn-create-task');
        btn.disabled = true;
        btn.innerHTML = '<span class="loading-spinner"></span> Creating...';

        await api.post('/tasks', {
            project_id: projectId,
            column_id: columnId,
            title,
            description: document.getElementById('task-description').value.trim(),
            priority: document.getElementById('task-priority').value,
            due_date: document.getElementById('task-due-date').value || null,
            assigned_to: document.getElementById('task-assignee').value || null,
            labels
        });

        closeModal('new-task-modal');
        btn.disabled = false;
        btn.textContent = 'Create Task';
        showToast('Task created! ✨', 'success');
        await loadBoard();
    } catch (err) {
        showToast(err.message, 'error');
        const btn = document.getElementById('btn-create-task');
        btn.disabled = false;
        btn.textContent = 'Create Task';
    }
}

// ── Task Detail ──
async function openTaskDetail(taskId) {
    try {
        const data = await api.get(`/tasks/${taskId}`);
        currentTask = data.task;

        // Populate detail modal
        document.getElementById('detail-task-title').textContent = currentTask.title;
        document.getElementById('detail-description').value = currentTask.description || '';

        // Status (column) dropdown
        const statusSelect = document.getElementById('detail-status');
        statusSelect.innerHTML = currentProject.columns.map(c =>
            `<option value="${c.id}" ${c.id === currentTask.column_id ? 'selected' : ''}>${c.name}</option>`
        ).join('');

        document.getElementById('detail-priority').value = currentTask.priority;

        // Assignee dropdown
        const assigneeSelect = document.getElementById('detail-assignee');
        assigneeSelect.innerHTML = '<option value="">Unassigned</option>' +
            currentProject.members.map(m =>
                `<option value="${m.id}" ${m.id === currentTask.assigned_to ? 'selected' : ''}>${m.full_name} (@${m.username})</option>`
            ).join('');

        document.getElementById('detail-due-date').value = currentTask.due_date || '';
        document.getElementById('detail-created-by').textContent =
            `${currentTask.creator_name} (@${currentTask.creator_username})`;
        document.getElementById('detail-created-at').textContent = formatFullDate(currentTask.created_at);

        // Load comments
        renderComments(data.comments);

        openModal('task-detail-modal');
    } catch (err) {
        showToast('Failed to load task: ' + err.message, 'error');
    }
}

function renderComments(comments) {
    const list = document.getElementById('comments-list');
    const countEl = document.getElementById('comment-count');
    const user = getCurrentUser();

    countEl.textContent = `(${comments.length})`;

    if (comments.length === 0) {
        list.innerHTML = '<p style="color: var(--text-muted); font-size: 0.875rem; padding: 8px 0;">No comments yet. Start the conversation!</p>';
        return;
    }

    list.innerHTML = comments.map(c => `
        <div class="comment-item" data-comment-id="${c.id}">
            <div class="comment-avatar" style="background: ${c.avatar_color};">${getInitials(c.full_name)}</div>
            <div class="comment-body">
                <div class="comment-header">
                    <span class="comment-author">${escapeHtml(c.full_name)}</span>
                    <span class="comment-time">${formatDate(c.created_at)}</span>
                    ${c.edited ? '<span class="comment-edited">(edited)</span>' : ''}
                </div>
                <div class="comment-text">${escapeHtml(c.content)}</div>
                ${c.user_id === user.id ? `
                    <div class="comment-actions">
                        <button class="comment-action-btn" onclick="editComment('${c.id}', this)">Edit</button>
                        <button class="comment-action-btn" onclick="deleteComment('${c.id}')">Delete</button>
                    </div>
                ` : ''}
            </div>
        </div>
    `).join('');
}

async function sendComment() {
    const input = document.getElementById('comment-input');
    const content = input.value.trim();

    if (!content || !currentTask) return;

    try {
        const data = await api.post('/comments', {
            task_id: currentTask.id,
            content
        });

        input.value = '';
        
        // Reload comments
        const taskData = await api.get(`/tasks/${currentTask.id}`);
        renderComments(taskData.comments);

        // Update comment count on the board card
        await loadBoard();
    } catch (err) {
        showToast('Failed to send comment: ' + err.message, 'error');
    }
}

async function editComment(commentId, btnEl) {
    const commentItem = btnEl.closest('.comment-item');
    const textEl = commentItem.querySelector('.comment-text');
    const currentText = textEl.textContent;

    // Replace text with editable textarea
    const textarea = document.createElement('textarea');
    textarea.className = 'comment-input';
    textarea.value = currentText;
    textarea.rows = 2;
    textEl.replaceWith(textarea);
    textarea.focus();

    // Replace edit button with save button
    btnEl.textContent = 'Save';
    btnEl.onclick = async () => {
        const newContent = textarea.value.trim();
        if (!newContent) return;

        try {
            await api.put(`/comments/${commentId}`, { content: newContent });
            const taskData = await api.get(`/tasks/${currentTask.id}`);
            renderComments(taskData.comments);
            showToast('Comment updated', 'success');
        } catch (err) {
            showToast('Failed to update comment', 'error');
        }
    };
}

async function deleteComment(commentId) {
    if (!confirm('Delete this comment?')) return;

    try {
        await api.delete(`/comments/${commentId}`);
        const taskData = await api.get(`/tasks/${currentTask.id}`);
        renderComments(taskData.comments);
        showToast('Comment deleted', 'success');
    } catch (err) {
        showToast('Failed to delete comment', 'error');
    }
}

async function saveTaskChanges() {
    if (!currentTask) return;

    try {
        const btn = document.getElementById('btn-save-task');
        btn.disabled = true;
        btn.innerHTML = '<span class="loading-spinner"></span> Saving...';

        await api.put(`/tasks/${currentTask.id}`, {
            description: document.getElementById('detail-description').value,
            column_id: document.getElementById('detail-status').value,
            priority: document.getElementById('detail-priority').value,
            assigned_to: document.getElementById('detail-assignee').value || null,
            due_date: document.getElementById('detail-due-date').value || null
        });

        btn.disabled = false;
        btn.textContent = 'Save Changes';
        showToast('Task updated ✅', 'success');
        await loadBoard();
    } catch (err) {
        showToast('Failed to save: ' + err.message, 'error');
        const btn = document.getElementById('btn-save-task');
        btn.disabled = false;
        btn.textContent = 'Save Changes';
    }
}

async function deleteTask() {
    if (!currentTask) return;
    if (!confirm(`Delete "${currentTask.title}"? This cannot be undone.`)) return;

    try {
        await api.delete(`/tasks/${currentTask.id}`);
        closeModal('task-detail-modal');
        currentTask = null;
        showToast('Task deleted', 'success');
        await loadBoard();
    } catch (err) {
        showToast('Failed to delete task', 'error');
    }
}

// ── Members ──
async function openMembersModal() {
    openModal('members-modal');
    renderMembersList();
}

function renderMembersList() {
    const list = document.getElementById('members-list');
    const user = getCurrentUser();
    const isOwnerOrAdmin = ['owner', 'admin'].includes(currentProject.user_role);

    list.innerHTML = currentProject.members.map(m => `
        <div class="member-item">
            <div class="user-avatar" style="background: ${m.avatar_color}; width: 36px; height: 36px; font-size: 0.8125rem;">${getInitials(m.full_name)}</div>
            <div class="member-details">
                <div class="member-name">${escapeHtml(m.full_name)} ${m.id === user.id ? '(You)' : ''}</div>
                <div class="member-role">${m.role} · @${m.username}</div>
            </div>
            <div class="member-actions">
                ${isOwnerOrAdmin && m.role !== 'owner' && m.id !== user.id ? `
                    <button class="btn btn-ghost btn-sm" onclick="removeMember('${m.id}', '${escapeHtml(m.full_name)}')" title="Remove member">✕</button>
                ` : ''}
            </div>
        </div>
    `).join('');
}

async function removeMember(userId, name) {
    if (!confirm(`Remove ${name} from the project?`)) return;

    try {
        await api.delete(`/projects/${projectId}/members/${userId}`);
        showToast(`${name} removed from project`, 'success');
        await loadBoard();
        renderMembersList();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ── Member Search ──
let searchTimeout = null;

function setupMemberSearch() {
    const input = document.getElementById('member-search');
    const results = document.getElementById('member-search-results');

    input.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        const query = input.value.trim();

        if (query.length < 2) {
            results.classList.add('hidden');
            results.innerHTML = '';
            return;
        }

        searchTimeout = setTimeout(async () => {
            try {
                const data = await api.get(`/auth/search?q=${encodeURIComponent(query)}`);
                const existingIds = new Set(currentProject.members.map(m => m.id));

                const available = data.users.filter(u => !existingIds.has(u.id));

                if (available.length === 0) {
                    results.innerHTML = '<div style="padding: 12px; color: var(--text-muted); font-size: 0.875rem;">No users found</div>';
                } else {
                    results.innerHTML = available.map(u => `
                        <div class="search-result-item" onclick="addMember('${u.id}')">
                            <div class="user-avatar" style="background: ${u.avatar_color}; width: 28px; height: 28px; font-size: 0.625rem;">${getInitials(u.full_name)}</div>
                            <div>
                                <div class="result-name">${escapeHtml(u.full_name)}</div>
                                <div class="result-email">@${u.username} · ${u.email}</div>
                            </div>
                        </div>
                    `).join('');
                }

                results.classList.remove('hidden');
            } catch (err) {
                results.innerHTML = '<div style="padding: 12px; color: var(--text-muted);">Search failed</div>';
                results.classList.remove('hidden');
            }
        }, 300);
    });
}

async function addMember(userId) {
    try {
        await api.post(`/projects/${projectId}/members`, { user_id: userId });
        showToast('Member added! 🎉', 'success');

        document.getElementById('member-search').value = '';
        document.getElementById('member-search-results').classList.add('hidden');

        await loadBoard();
        renderMembersList();
        populateAssigneeDropdowns();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ── Activity ──
async function openActivityModal() {
    openModal('activity-modal');
    const feed = document.getElementById('activity-feed');
    feed.innerHTML = '<div class="loading-overlay"><div class="loading-spinner"></div></div>';

    try {
        const data = await api.get(`/projects/${projectId}/activity`);
        const activities = data.activities || [];

        if (activities.length === 0) {
            feed.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>No activity yet</p></div>';
            return;
        }

        feed.innerHTML = activities.map(a => {
            const details = safeParseJSON(a.details, {});
            let text = '';

            switch (a.action) {
                case 'created':
                    text = `<strong>${escapeHtml(a.full_name)}</strong> created ${a.entity_type} "${escapeHtml(details.title || details.name || '')}"`;
                    break;
                case 'updated':
                    text = `<strong>${escapeHtml(a.full_name)}</strong> updated task`;
                    if (details.title) text += ` "${escapeHtml(details.title)}"`;
                    if (details.priority) text += ` → priority: ${details.priority}`;
                    break;
                case 'moved':
                    text = `<strong>${escapeHtml(a.full_name)}</strong> moved "${escapeHtml(details.title || '')}" from ${details.from} → ${details.to}`;
                    break;
                case 'deleted':
                    text = `<strong>${escapeHtml(a.full_name)}</strong> deleted "${escapeHtml(details.title || '')}"`;
                    break;
                case 'commented':
                    text = `<strong>${escapeHtml(a.full_name)}</strong> commented on "${escapeHtml(details.task_title || '')}"`;
                    break;
                case 'added_member':
                    text = `<strong>${escapeHtml(a.full_name)}</strong> added ${escapeHtml(details.member_name || '')} to the project`;
                    break;
                default:
                    text = `<strong>${escapeHtml(a.full_name)}</strong> ${a.action} ${a.entity_type}`;
            }

            return `
                <div class="activity-item">
                    <div class="activity-avatar" style="background: ${a.avatar_color};">${getInitials(a.full_name)}</div>
                    <div>
                        <div class="activity-text">${text}</div>
                        <div class="activity-time">${formatDate(a.created_at)}</div>
                    </div>
                </div>
            `;
        }).join('');
    } catch (err) {
        feed.innerHTML = `<div class="empty-state"><p>Failed to load activity</p></div>`;
    }
}

// ── Helpers ──
function populateAssigneeDropdowns() {
    if (!currentProject) return;

    const dropdowns = ['task-assignee', 'detail-assignee'];
    dropdowns.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            const currentVal = el.value;
            el.innerHTML = '<option value="">Unassigned</option>' +
                currentProject.members.map(m =>
                    `<option value="${m.id}">${m.full_name} (@${m.username})</option>`
                ).join('');
            el.value = currentVal;
        }
    });
}

function safeParseJSON(str, fallback) {
    try {
        return typeof str === 'string' ? JSON.parse(str) : str || fallback;
    } catch {
        return fallback;
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ── Event Setup ──
function setupBoardEvents() {
    // Create task
    document.getElementById('btn-create-task').addEventListener('click', createTask);
    document.getElementById('task-title').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            createTask();
        }
    });

    // Save task changes
    document.getElementById('btn-save-task').addEventListener('click', saveTaskChanges);

    // Delete task
    document.getElementById('btn-delete-task').addEventListener('click', deleteTask);

    // Send comment
    document.getElementById('btn-send-comment').addEventListener('click', sendComment);
    document.getElementById('comment-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendComment();
        }
    });

    // Members modal
    document.getElementById('btn-members').addEventListener('click', () => {
        openMembersModal();
        setupMemberSearch();
    });

    // Activity modal
    document.getElementById('btn-activity').addEventListener('click', openActivityModal);

    // My Tasks
    const myTasksNav = document.getElementById('nav-my-tasks');
    if (myTasksNav) {
        myTasksNav.addEventListener('click', (e) => {
            e.preventDefault();
            window.location.href = '/dashboard.html';
        });
    }
}
