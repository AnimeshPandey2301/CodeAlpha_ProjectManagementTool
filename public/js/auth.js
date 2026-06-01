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
    const forgotCard = document.getElementById('forgot-card');
    const showForgot = document.getElementById('show-forgot');
    const showLoginFromForgot = document.getElementById('show-login-from-forgot');
    const forgotEmailForm = document.getElementById('forgot-email-form');
    const forgotResetForm = document.getElementById('forgot-reset-form');
    const forgotError = document.getElementById('forgot-error');
    const forgotSuccess = document.getElementById('forgot-success');
    let recoveryEmail = '';

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

    showForgot.addEventListener('click', (e) => {
        e.preventDefault();
        loginCard.classList.add('hidden');
        forgotCard.classList.remove('hidden');
        forgotCard.style.animation = 'fadeInUp 0.4s ease-out';
        loginError.classList.remove('show');
        forgotError.classList.remove('show');
        forgotSuccess.classList.remove('show');
        forgotEmailForm.classList.remove('hidden');
        forgotResetForm.classList.add('hidden');
        forgotEmailForm.reset();
        forgotResetForm.reset();
    });

    showLoginFromForgot.addEventListener('click', (e) => {
        e.preventDefault();
        forgotCard.classList.add('hidden');
        loginCard.classList.remove('hidden');
        loginCard.style.animation = 'fadeInUp 0.4s ease-out';
        forgotError.classList.remove('show');
        forgotSuccess.classList.remove('show');
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

    // Forgot Password - Step 1: Request Code
    forgotEmailForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('forgot-email-btn');
        const originalText = btn.textContent;

        try {
            btn.disabled = true;
            btn.innerHTML = '<span class="loading-spinner"></span> Sending...';
            forgotError.classList.remove('show');
            forgotSuccess.classList.remove('show');

            const email = document.getElementById('forgot-email').value.trim();
            const data = await api.post('/auth/forgot-password', { email });

            recoveryEmail = email;
            
            // Render simulated recovery code message
            forgotSuccess.textContent = `Reset code generated! Simulated Code: ${data.code}`;
            forgotSuccess.classList.add('show');

            showToast('Verification code generated!', 'success');

            // Toggle form views
            forgotEmailForm.classList.add('hidden');
            forgotResetForm.classList.remove('hidden');
            forgotResetForm.style.animation = 'fadeInUp 0.4s ease-out';
            
            // Prefill verification code for ease of testing in local development
            document.getElementById('reset-code').value = data.code;
            
            btn.disabled = false;
            btn.textContent = originalText;
        } catch (err) {
            forgotError.textContent = err.message;
            forgotError.classList.add('show');
            btn.disabled = false;
            btn.textContent = originalText;
        }
    });

    // Forgot Password - Step 2: Reset Password
    forgotResetForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('forgot-reset-btn');
        const originalText = btn.textContent;

        try {
            btn.disabled = true;
            btn.innerHTML = '<span class="loading-spinner"></span> Resetting...';
            forgotError.classList.remove('show');

            const code = document.getElementById('reset-code').value.trim();
            const new_password = document.getElementById('reset-password').value;

            const data = await api.post('/auth/reset-password', {
                email: recoveryEmail,
                code,
                new_password
            });

            showToast(data.message, 'success');

            // Success: clear forms and return to login
            forgotCard.classList.add('hidden');
            loginCard.classList.remove('hidden');
            loginCard.style.animation = 'fadeInUp 0.4s ease-out';
            
            // Clean up
            forgotEmailForm.reset();
            forgotResetForm.reset();
            forgotSuccess.classList.remove('show');
            recoveryEmail = '';

            btn.disabled = false;
            btn.textContent = originalText;
        } catch (err) {
            forgotError.textContent = err.message;
            forgotError.classList.add('show');
            btn.disabled = false;
            btn.textContent = originalText;
        }
    });
});
