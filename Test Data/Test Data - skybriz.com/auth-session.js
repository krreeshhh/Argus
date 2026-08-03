// 📁 /auth/js/auth-session.js
// Source of truth = server (/me) via HttpOnly cookie session. No token storage or cookie-string checks.

(() => {
  'use strict';
  if (window.__SBZ_AUTH_SESSION_INIT__) return;
  window.__SBZ_AUTH_SESSION_INIT__ = true;

  function showToastSafe(msg, type) {
    if (typeof window.showToast === 'function') {
      try { window.showToast(msg, type); } catch (e) {}
    } else {
      console.log(`[toast:${type || 'info'}] ${msg}`);
    }
  }

  function getRestNonce() {
    return (window.SBZ_AUTH && SBZ_AUTH.nonce)
        || (window.SBZ_COOKIE && SBZ_COOKIE.nonce)
        || (window.wpApiSettings && wpApiSettings.nonce)
        || '';
  }

  function getCachedUser() {
    try {
      const cached = JSON.parse(sessionStorage.getItem('skynestUser') || '{}');
      if (cached && (cached.email || cached.userId || cached.id)) {
        return cached;
      }
    } catch (e) {}
    return null;
  }

  async function getServerUserState() {
    try {
      if (typeof window.fetchMe === 'function') {
        const user = await window.fetchMe();
        return { user, unauthorized: !user, transient: false };
      }
      const r = await fetch('/wp-json/skybriz/v1/me', { credentials: 'include', cache: 'no-store' });
      if (r.status === 401) return { user: null, unauthorized: true, transient: false };
      if (!r.ok) throw new Error('profile fetch failed');
      const user = await r.json();
      return { user, unauthorized: !user, transient: false };
    } catch {
      return { user: null, unauthorized: false, transient: true };
    }
  }

  function uiToggle(id, show) {
    const el = document.getElementById(id);
    if (el) el.style.display = show ? 'block' : 'none';
  }

  function applyUserToUI(user, opts) {
    const options = opts || {};
    const allowProtectedRedirect = options.allowProtectedRedirect !== false;
    const isLoggedIn = !!(user && (user.email || user.userId));

    uiToggle('loginLink', !isLoggedIn);
    uiToggle('signupLink', !isLoggedIn);
    uiToggle('dashboardLink', isLoggedIn);
    uiToggle('inboxLink', isLoggedIn);
    uiToggle('logoutLink', isLoggedIn);

    // profile image is optional; avatars are served via signed URL redirect
    if (isLoggedIn && user.profileImageUrl) {
      const img = document.getElementById('userProfileImg');
      if (img) img.src = user.profileImageUrl;
    }

    // protect account pages if truly not logged in
    const p = window.location.pathname;
    if (allowProtectedRedirect && !isLoggedIn && (p.startsWith('/user-account') || p.startsWith('/my-rentals'))) {
      showToastSafe('Please log in to access your account.', 'error');
      window.location.replace('/login-signup/');
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const state = await getServerUserState();

    if (state.user) {
      try { sessionStorage.setItem('skynestUser', JSON.stringify(state.user)); } catch {}
      applyUserToUI(state.user);
    } else if (state.unauthorized) {
      try { sessionStorage.removeItem('skynestUser'); } catch {}
      applyUserToUI(null);
    } else {
      const cached = getCachedUser();
      if (cached) {
        applyUserToUI(cached, { allowProtectedRedirect: false });
      } else {
        applyUserToUI(null, { allowProtectedRedirect: false });
      }
      console.warn('⚠️ Session verification deferred after a transient /me failure.');
    }

    // React to login events from other modules
    window.addEventListener('auth:login', async (e) => {
      const state = await getServerUserState();
      const nextUser = state.user || e.detail?.user || null;
      try { sessionStorage.setItem('skynestUser', JSON.stringify(nextUser || {})); } catch {}
      applyUserToUI(nextUser);
    });

    // React to logout events
    window.addEventListener('auth:logout', () => {
      try { sessionStorage.removeItem('skynestUser'); } catch {}
      applyUserToUI(null);
    });
  });

  // Global, secure logout (server + local) — used by header/logout button
  async function logoutUser() {
    try {
      await fetch('/wp-json/skybriz/v1/logout?logout_wp=1', {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-WP-Nonce': getRestNonce() },
        cache: 'no-store'
      });
    } catch {}
    try { sessionStorage.removeItem('skynestUser'); } catch {}
    try { window.dispatchEvent(new Event('auth:logout')); } catch {}
    window.location.replace('/');
  }

  // Optional: expose helpers
  window.logoutUser = logoutUser;
  window.getServerUser = async function () {
    const state = await getServerUserState();
    return state.user;
  };
  window.getServerUserState = getServerUserState;

  console.log('✅ auth-session initialized.');
})();
