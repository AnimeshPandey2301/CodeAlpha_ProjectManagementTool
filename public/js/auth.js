// ============================================
// TaskFlow Pro – Auth Page Logic
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    // If already logged in, redirect to dashboard
    if (getToken()) {
        window.location.href = '/dashboard.html';
        return;
    }

    const loginCard = document.getElementById('login-card');
    const registerCard = document.getElementById('register-card');
    const showRegister = document.getElementById('show-register');
    const showLogin = document.getElementById('show-login');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const loginError = document.getElementById('login-error');
    const registerError = document.getElementById('register-error');

    // Toggle between login and register
    showRegister.addEventListener('click', (e) => {
        e.preventDefault();
        loginCard.classList.add('hidden');
        registerCard.classList.remove('hidden');
        registerCard.style.animation = 'fadeInUp 0.4s ease-out';
        loginError.classList.remove('show');
    });

    showLogin.addEventListener('click', (e) => {
        e.preventDefault();
        registerCard.classList.add('hidden');
        loginCard.classList.remove('hidden');
        loginCard.style.animation = 'fadeInUp 0.4s ease-out';
        registerError.classList.remove('show');
    });

    // Login form submission
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('login-btn');
        const originalText = btn.textContent;

        try {
            btn.disabled = true;
            btn.innerHTML = '<span class="loading-spinner"></span> Signing in...';
            loginError.classList.remove('show');

            const login = document.getElementById('login-email').value.trim();
            const password = document.getElementById('login-password').value;

            const data = await api.post('/auth/login', { login, password });

            setToken(data.token);
            setCurrentUser(data.user);

            showToast('Welcome back! 🎉', 'success');

            setTimeout(() => {
                window.location.href = '/dashboard.html';
            }, 500);
        } catch (err) {
            loginError.textContent = err.message;
            loginError.classList.add('show');
            btn.disabled = false;
            btn.textContent = originalText;
        }
    });

    // Register form submission
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('register-btn');
        const originalText = btn.textContent;

        try {
            btn.disabled = true;
            btn.innerHTML = '<span class="loading-spinner"></span> Creating account...';
            registerError.classList.remove('show');

            const full_name = document.getElementById('reg-fullname').value.trim();
            const username = document.getElementById('reg-username').value.trim();
            const email = document.getElementById('reg-email').value.trim();
            const password = document.getElementById('reg-password').value;

            const data = await api.post('/auth/register', {
                full_name, username, email, password
            });

            setToken(data.token);
            setCurrentUser(data.user);

            showToast('Account created! Welcome to TaskFlow Pro 🚀', 'success');

            setTimeout(() => {
                window.location.href = '/dashboard.html';
            }, 500);
        } catch (err) {
            registerError.textContent = err.message;
            registerError.classList.add('show');
            btn.disabled = false;
            btn.textContent = originalText;
        }
    });
});
