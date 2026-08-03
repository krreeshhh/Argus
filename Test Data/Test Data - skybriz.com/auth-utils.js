// 📁 /auth/js/auth-utils.js
// Security-first utilities. No token exposure; verify session server-side before redirecting.

(() => {
  'use strict';
  if (window.__SBZ_AUTH_UTILS_INIT__) return;
  window.__SBZ_AUTH_UTILS_INIT__ = true;
  const ME_CACHE_KEY = 'sbz_me_cache_v1';
  const ME_CACHE_TTL_MS = 5 * 60 * 1000;

  function getRestNonce() {
    return (window.SBZ_AUTH && SBZ_AUTH.nonce)
        || (window.SBZ_COOKIE && SBZ_COOKIE.nonce)
        || (window.wpApiSettings && wpApiSettings.nonce)
        || '';
  }

  function nowMs() { return Date.now(); }

  function readMeCache() {
    try {
      const raw = sessionStorage.getItem(ME_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      if (!parsed.user || !parsed.cachedAt) return null;
      if ((nowMs() - Number(parsed.cachedAt)) > ME_CACHE_TTL_MS) return null;
      return parsed.user;
    } catch {
      return null;
    }
  }

  function writeMeCache(user) {
    try {
      if (!user) return;
      sessionStorage.setItem(ME_CACHE_KEY, JSON.stringify({ user, cachedAt: nowMs() }));
      sessionStorage.setItem('skynestUser', JSON.stringify(user));
    } catch {}
  }

  function clearMeCache() {
    try { sessionStorage.removeItem(ME_CACHE_KEY); } catch {}
    try { sessionStorage.removeItem('skynestUser'); } catch {}
  }

  async function fetchMe() {
    const state = await fetchSessionState({ force: false });
    if (state.transient) {
      throw new Error('Unable to verify the current session.');
    }
    return state.user;
  }

  async function fetchSessionState(opts = {}) {
    const force = !!opts.force;
    if (!force) {
      const cached = readMeCache();
      if (cached) {
        return { user: cached, authenticated: true, transient: false, cached: true };
      }
    }
    try {
      const r = await fetch('/wp-json/skybriz/v1/me', { credentials: 'include', cache: 'no-store' });
      if (r.status === 401) {
        clearMeCache();
        return { user: null, authenticated: false, transient: false };
      }
      if (!r.ok) {
        throw new Error('profile fetch failed');
      }
      const user = await r.json().catch(() => null);
      if (user) writeMeCache(user);
      return { user, authenticated: !!user, transient: false };
    } catch {
      const cached = readMeCache();
      if (cached) {
        return { user: cached, authenticated: true, transient: false, cached: true };
      }
      return { user: null, authenticated: false, transient: true };
    }
  }

  async function serverLogoutSafe() {
    try {
      await fetch('/wp-json/skybriz/v1/logout?logout_wp=1', {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-WP-Nonce': getRestNonce() },
        cache: 'no-store'
      });
    } catch {/* network errors ignored */}
  }

  function showToastSafe(msg, type) {
    if (typeof window.showToast === 'function') {
      try { window.showToast(msg, type); } catch {}
    } else {
      console.log(`[toast:${type||'info'}] ${msg}`);
    }
  }

  /**
   * Clears local UI state and redirects to login ONLY if the server confirms the session is invalid.
   * Use {force:true} to perform a real logout and redirect regardless of /me.
   */
  window.clearUserSessionAndRedirect = async function (redirectPath = '/login-signup/', opts = {}) {
    const { force = false, reason = '' } = opts;

    // 1) Verify session truth unless forced
    let isExpired = true;
    if (!force) {
      const state = await fetchSessionState();
      if (state.transient) {
        showToastSafe('Unable to verify your session right now. Please try again.', 'error');
        console.warn('🔒 Blocked redirect during transient session check failure.', { reason });
        return;
      }
      isExpired = !state.user;
      if (!isExpired) {
        // Session is valid -> do NOT redirect; let caller handle transient error.
        showToastSafe('Unable to complete that action right now. Please try again.', 'error');
        console.warn('🔒 Blocked false session-expired redirect.', { reason });
        return;
      }
    }

    // 2) Client-side cleanup (no tokens are stored, but clear legacy keys defensively)
    try {
      clearMeCache();
      sessionStorage.removeItem('jwt');  // legacy
      localStorage.removeItem('jwt');    // legacy
    } catch {}

    // 3) Clear in-memory access (defense-in-depth) & broadcast
    try { window.__sbzAccessToken = null; } catch {}
    try { window.dispatchEvent(new Event('auth:logout')); } catch {}

    // 4) Tell backend to clear HttpOnly cookies (real logout)
    await serverLogoutSafe();

    // 5) UX + redirect
    showToastSafe('Session expired. Redirecting to login…', 'error');
    setTimeout(() => {
      console.log('🔁 Redirecting to:', redirectPath);
      window.location.replace(redirectPath);
    }, 900);
  };

  // Optional helper others can use
  window.fetchMe = window.fetchMe || fetchMe;
  window.ensureAuthenticated = fetchMe;
  window.sbzFetchSessionState = fetchSessionState;
  window.sbzInvalidateMeCache = clearMeCache;

  console.log('✅ auth-utils initialized.');
})();
