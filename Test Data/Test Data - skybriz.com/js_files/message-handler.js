// 📁 js/message-handler.js
// Hardened for Skybriz: no JWT in storage, no external token checks,
// server (/me) is the source of truth, and socket uses secure proxy token.

(() => {
  if (window.contactHandlerInitialized) return;

  // ---------- helpers ----------
  function getCachedUser() {
    try { return JSON.parse(sessionStorage.getItem('skynestUser') || '{}'); }
    catch { return {}; }
  }

  async function fetchMe() {
    try {
      const r = await fetch('/wp-json/skybriz/v1/me', { credentials: 'include', cache: 'no-store' });
      if (!r.ok) return null;
      return await r.json().catch(() => null);
    } catch { return null; }
  }

  async function ensureUser() {
    const me = await fetchMe();
    if (me) {
      try { sessionStorage.setItem('skynestUser', JSON.stringify(me)); } catch {}
      return me;
    }
    const cached = getCachedUser();
    return (cached && (cached.userId || cached.email)) ? cached : null;
  }

  function cooldownKey(id) { return `contacted_${id}`; }
  function setCooldown(id) { try { localStorage.setItem(cooldownKey(id), Date.now().toString()); } catch {} }
  function getCooldownAt(id) {
    try { return parseInt(localStorage.getItem(cooldownKey(id)), 10) || 0; }
    catch { return 0; }
  }
  function disableBtn(btn, label) { btn.disabled = true; btn.classList.add('disabled','faded'); if (label) btn.textContent = label; }
  function enableBtn(btn, label)  { btn.disabled = false; btn.classList.remove('disabled','faded'); if (label) btn.textContent = label; }

  async function isActuallyLoggedOut() {
    const me = await fetchMe();
    return !me;
  }

  // ---------- main ----------
  window.initContactButtonHandler = function () {
    const buttons = document.querySelectorAll('.contact-button');

    // 1) Shift+click on disabled button clears cooldown (but not for owners)
    document.addEventListener('pointerdown', async (event) => {
      const btn = event.target.closest('.contact-button');
      if (!btn || !btn.disabled || !event.shiftKey) return;

      const user = getCachedUser();
      if (user?.userId && String(user.userId) === String(btn.dataset.ownerId || '')) return;

      localStorage.removeItem(cooldownKey(btn.dataset.propertyId));
      enableBtn(btn, 'Contact Manager');
      window.showToast?.('🔓 Contact cooldown cleared temporarily.', 'info');
      event.preventDefault();
    }, true);

    // 2) Initial state: disable for owner or 24h cooldown
    (async () => {
      const user = await ensureUser() || {};
      buttons.forEach((btn) => {
        const id       = String(btn.dataset.propertyId || '');
        const ownerId  = String(btn.dataset.ownerId || '');
        const isOwner  = user.userId && String(user.userId) === ownerId;
        const ts       = getCooldownAt(id);
        const coolDown = ts && (Date.now() - ts < 24 * 3600 * 1000);

        if (isOwner)    return disableBtn(btn, 'Your Listing');
        if (coolDown)   return disableBtn(btn, 'Already Contacted');
        enableBtn(btn); if (!btn.textContent?.trim()) btn.textContent = 'Contact Manager';
      });
    })();

    // 3) Click → verify session via /me, ensure socket, then emit
    document.addEventListener('click', async (event) => {
      const btn = event.target.closest('.contact-button');
      if (!btn || btn.disabled) return;

      const propertyId      = String(btn.dataset.propertyId || '');
      const ownerId         = String(btn.dataset.ownerId || '');
      const ownerName       = btn.dataset.ownerName || 'Owner';
      const propertyAddress = btn.dataset.address || '';

      // Verify session (HttpOnly cookie-backed) — no JWT in JS
      const user = await fetchMe();
      if (!user || !user.userId) {
        if (await isActuallyLoggedOut()) {
          if (typeof window.clearUserSessionAndRedirect === 'function') {
            await window.clearUserSessionAndRedirect('/login-signup/', { reason: 'contact' });
          } else {
            window.location.href = '/login-signup/';
          }
          return;
        }
        window.showToast?.('Unable to verify session. Please try again.', 'error');
        return;
      }

      // Prevent contacting own listing
      if (String(user.userId) === ownerId) {
        window.showToast?.('👮 You can’t contact your own listing.', 'error');
        return;
      }

      // Ensure we have a connected socket from the secure proxy flow
      try {
        if (typeof window.ensurePropertySocket === 'function') {
          const socket = await window.ensurePropertySocket(false);
          if (!socket || socket.disconnected) {
            window.showToast?.('Real-time messaging is currently unavailable.', 'error');
            return;
          }
        } else if (typeof window.getSocketToken === 'function') {
          const tok = await window.getSocketToken();
          if (!tok) {
            window.showToast?.('Real-time auth unavailable. Please reload and try again.', 'error');
            return;
          }
        }
      } catch {
        window.showToast?.('Real-time auth unavailable. Please reload and try again.', 'error');
        return;
      }

      if (!window.socket || window.socket.disconnected) {
        window.showToast?.('Real-time messaging is currently unavailable.', 'error');
        return;
      }

      // Emit contact request (no sensitive tokens in payload)
      window.socket.emit(
        'initiate_contact',
        {
          currentUserId: String(user.userId),
          currentUserUsername: user.username || user.userName || user.name || 'User',
          propertyOwnerId: ownerId,
          propertyOwnerUsername: ownerName,
          propertyId,
          propertyAddress,
          interestedUserId: String(user.userId),
          interestedUser: user.name || user.userName || user.username || 'User',
        },
        (response) => {
          if (response?.error) {
            window.showToast?.(`❌ ${response.error}`, 'error');
            return;
          }
          setCooldown(propertyId);
          disableBtn(btn, 'Already Contacted');
          window.showToast?.('✅ Contact request sent! Please wait for a response.', 'success');
        }
      );
    }, true);

    window.contactHandlerInitialized = true;
  };
})();
