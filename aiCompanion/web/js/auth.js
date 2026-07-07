async function doLogin(e) {
  e.preventDefault();
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';
  try {
    const data = await window.api.apiFetch('/auth/login', { method: 'POST', body: { username, password } });
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    location.href = 'admin.html';
  } catch (err) {
    errEl.textContent = err.message;
  }
}
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('login-form').addEventListener('submit', doLogin);
});
