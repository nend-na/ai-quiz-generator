const QUIZEL_ACCOUNT_KEY = 'quizel-account';
const QUIZEL_SESSION_KEY = 'quizel-session';
const QUIZEL_LOGIN_PAGE = 'login.html';
const QUIZEL_HOME_PAGE = 'index.html';

function getStoredAccount() {
  try {
    return JSON.parse(localStorage.getItem(QUIZEL_ACCOUNT_KEY) || 'null');
  } catch (err) {
    return null;
  }
}

function isAuthenticated() {
  return Boolean(localStorage.getItem(QUIZEL_SESSION_KEY));
}

function createAccount(username, password) {
  const trimmed = username?.trim();
  if (!trimmed || !password) {
    throw new Error('Username and password are required.');
  }
  if (getStoredAccount()) {
    throw new Error('An account already exists. Please log in.');
  }
  localStorage.setItem(QUIZEL_ACCOUNT_KEY, JSON.stringify({
    username: trimmed,
    password: btoa(password)
  }));
}

function verifyAccount(username, password) {
  const account = getStoredAccount();
  if (!account) return false;
  return account.username === username?.trim() && account.password === btoa(password);
}

function signIn(username) {
  localStorage.setItem(QUIZEL_SESSION_KEY, username.trim());
}

function signOut() {
  localStorage.removeItem(QUIZEL_SESSION_KEY);
}

function requireAuth() {
  if (!isAuthenticated()) {
    window.location.replace(QUIZEL_LOGIN_PAGE);
  }
}

function redirectIfAuthenticated() {
  if (isAuthenticated() && window.location.pathname.endsWith(QUIZEL_LOGIN_PAGE)) {
    window.location.replace(QUIZEL_HOME_PAGE);
  }
}

function setupAuthAction() {
  const action = document.querySelector('.auth-action');
  if (!action) return;
  if (isAuthenticated()) {
    action.textContent = 'Logout';
    action.href = '#';
    action.addEventListener('click', event => {
      event.preventDefault();
      signOut();
      window.location.replace(QUIZEL_LOGIN_PAGE);
    });
  } else {
    action.textContent = 'Login';
    action.href = QUIZEL_LOGIN_PAGE;
  }
}

(function initAuth() {
  if (window.location.pathname.endsWith(QUIZEL_LOGIN_PAGE)) {
    redirectIfAuthenticated();
  } else {
    requireAuth();
  }
})();

document.addEventListener('DOMContentLoaded', setupAuthAction);
