// js/auth-api.js — HttpOnly cookie auth via WP proxy (SECURE build)
(function () {
  if (window.__SBZ_AUTH_INIT__) return;
  window.__SBZ_AUTH_INIT__ = true;

  /* ===========================
     Utils
     =========================== */
  function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0,
        v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
  function broadcast(name, detail) {
    try {
      window.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
    } catch (e) {}
  }
  function showToast(msg) {
    if (typeof window.showToast === 'function') {
      try { window.showToast(msg); } catch (e) {}
    }
  }
  function safeVal(el) {
    return el ? String(el.value || '').trim() : '';
  }
  function isIsoDate(v) {
    return /^\d{4}-\d{2}-\d{2}$/.test(v);
  }
  function dateNotPast(v) {
    if (!isIsoDate(v)) return false;
    try {
      var today = new Date();
      today.setHours(0, 0, 0, 0);
      var parts = v.split('-');
      var d = new Date(Date.UTC(+parts[0], +parts[1] - 1, +parts[2]));
      var cmp = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
      return d.getTime() >= cmp.getTime();
    } catch (e) { return false; }
  }

  /* ===========================
     Avatar helpers (redirect → signed URL)
     =========================== */
  var SBZ_AVATAR_FALLBACK = '/wp-content/themes/skybriz-custom-theme-2/auth/img/profilepic.png';
  function getAvatarSrc(userId, version) {
    if (!userId) return SBZ_AVATAR_FALLBACK;
    var v = (version !== undefined && version !== null)
      ? ('?v=' + encodeURIComponent(String(version)))
      : ('?v=' + Date.now()); // cache-bust if no version provided
    return '/wp-json/skybriz/v1/avatar/' + encodeURIComponent(userId) + v;
  }
  function setAvatar(imgEl, userId, version) {
    if (!imgEl) return;
    var retried = false;
    imgEl.onerror = function () {
      if (!retried && userId) {
        retried = true;
        imgEl.src = getAvatarSrc(userId, Date.now());
        return;
      }
      if (imgEl.src.indexOf(SBZ_AVATAR_FALLBACK) === -1) {
        imgEl.onerror = null; // avoid loops
        imgEl.src = SBZ_AVATAR_FALLBACK;
      }
    };
    imgEl.referrerPolicy = 'same-origin';
    imgEl.src = getAvatarSrc(userId, version);
  }

  /* ===========================
     REST base resolution (/wp-json vs ?rest_route=)
     =========================== */
  var __restBase = null;
  function getRestNonce() {
    if (window.SBZ_AUTH && window.SBZ_AUTH.nonce) return window.SBZ_AUTH.nonce;
    if (window.SBZ_COOKIE && window.SBZ_COOKIE.nonce) return window.SBZ_COOKIE.nonce;
    if (window.wpApiSettings && window.wpApiSettings.nonce) return window.wpApiSettings.nonce;
    return '';
  }
  async function resolveRestBase() {
    if (__restBase) return __restBase;
    var pretty = '/wp-json/skybriz/v1';
    var query = '/?rest_route=/skybriz/v1';
    try {
      var r = await fetch(pretty + '/ping', { credentials: 'include' });
      if (r.ok) { __restBase = pretty; return __restBase; }
    } catch (e) {}
    try {
      var r2 = await fetch(query + '/ping', { credentials: 'include' });
      if (r2.ok) { __restBase = query; return __restBase; }
    } catch (e) {}
    __restBase = pretty;
    return __restBase;
  }
  async function restURL(path) {
    var base = await resolveRestBase();
    return base + path;
  }

  /* ===========================
     Minimal UI state (never store tokens)
     =========================== */
  function rememberUserForUI(user) {
    try { sessionStorage.setItem('skynestUser', JSON.stringify(user || {})); } catch (e) {}
  }
  function clearAuth() {
    try {
      sessionStorage.removeItem('skynestUser');
      // legacy cleanup
      sessionStorage.removeItem('jwt');
      localStorage.removeItem('jwt');
    } catch (e) {}
  }

  /* ===========================
     Socket token (in-memory only)
     =========================== */
  window.__sbzAccessToken = null;
  window.getSocketToken = (function () {
    var inflight = null;
    async function rehydrate() {
      var url = await restURL('/socket-token');
      var resp = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-WP-Nonce': getRestNonce()
        }
      });
      if (!resp.ok) { try { await resp.text(); } catch (e) {} return null; }
      var json = null;
      try { json = await resp.json(); } catch (e) {}
      if (!json || !json.token) return null;
      window.__sbzAccessToken = json.token;
      if (json.expiresIn && window.__sbzAccessToken) {
        setTimeout(function () {
          if (window.__sbzAccessToken === json.token) window.__sbzAccessToken = null;
        }, Math.max(5, json.expiresIn - 5) * 1000);
      }
      return window.__sbzAccessToken;
    }
    return async function () {
      if (window.__sbzAccessToken) return window.__sbzAccessToken;
      if (!inflight) inflight = rehydrate().finally(function () { inflight = null; });
      return inflight;
    };
  })();

  /* ===========================
     Default profile image helper (bytes/MIME/ext aligned)
     =========================== */
  async function getDefaultProfileFile() {
    // 1) Try theme fallback (keeps real MIME)
    try {
      const resp = await fetch(window.SBZ_AVATAR_FALLBACK, { cache: 'no-store' });
      if (resp.ok) {
        const blob = await resp.blob(); // e.g., image/png
        const type = blob.type || 'image/png';
        const ext = type === 'image/webp' ? 'webp'
                 : type === 'image/jpeg' ? 'jpg'
                 : 'png';
        return new File([blob], `default-profile.${ext}`, { type });
      }
    } catch (e) {}
    // 2) Guaranteed tiny transparent PNG (1x1)
    const tinyPngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQImWNgYGBgAAAABQABhqG1WQAAAABJRU5ErkJggg==';
    const bytes = Uint8Array.from(atob(tinyPngBase64), c => c.charCodeAt(0));
    return new File([bytes], 'default-profile.png', { type: 'image/png' });
  }

  /* ===========================
     API: register / login / me / logout
     =========================== */
  async function registerUser(userData) {
    var formData = new FormData();

    // add camelCase + snake_case aliases to satisfy upstream validators
    var aliases = {
      userName: 'username',
      firstName: 'first_name',
      lastName: 'last_name',
      userType: 'user_type',
      isLandlord: 'is_landlord',
      isRealtor: 'is_realtor',
      isRenter: 'is_renter',
      isPropertyManager: 'is_property_manager',
      licenseId: 'license_id',
      licenseExpiration: 'license_expiration',
      licenseState: 'license_state',
      entityName: 'entity_name',
      corpType: 'corp_type',
      authorizedRole: 'authorized_role',
      authorizedRoleOther: 'authorized_role_other',
      acceptTerms: 'accept_terms',
      acceptPrivacy: 'accept_privacy',
      skybrizResident: 'skybriz_resident',
      captchaPassed: 'captcha_passed'
    };

    for (var key in userData) {
      if (!Object.prototype.hasOwnProperty.call(userData, key)) continue;
      var val = userData[key];
      if (val === undefined || val === null) continue;

      if (key === 'profileImage' && val instanceof File) {
        formData.append('profileImage', val);
      } else {
        formData.append(key, val);
        if (aliases[key]) formData.append(aliases[key], val);
      }
    }

    // Optional anti-bot timing; harmless if backend ignores it
    var startedAt = document.getElementById('form_started_at')?.value;
    if (startedAt) formData.append('form_started_at', startedAt);

    var url = await restURL('/register-user');
    var res = await fetch(url, {
      method: 'POST',
      body: formData,
      credentials: 'include',
      headers: {
        // Do NOT send X-WP-Nonce; endpoint is public and CF/WP will 403 on stale/absent nonce
        'Accept': 'application/json'
      }
    });

    var json = null, text = '';
    try { json = await res.json(); } catch (e) { try { text = await res.text(); } catch (e2) {} }

    if (!res.ok) {
      // Keep end-user messages generic to prevent info leaks
      if (json && (json.error || json.message)) {
        console.warn('[register-user] detail:', json); // dev-only, no PII
      } else if (text) {
        console.warn('[register-user] detail (text):', text);
      }
      throw new Error('Registration failed. Please check your inputs and try again.');
    }
    return json || {};
  }

  async function fetchMe() {
    if (typeof window.sbzFetchSessionState === 'function') {
      var state = await window.sbzFetchSessionState({ force: false });
      if (state && state.transient) throw new Error('Unable to load profile.');
      return (state && state.user) ? state.user : null;
    }
    var url = await restURL('/me');
    var r = await fetch(url, { credentials: 'include', cache: 'no-store' });
    if (r.status === 401) return null;
    if (!r.ok) throw new Error('Unable to load profile.');
    var me = await r.json();
    rememberUserForUI(me);
    return me;
  }

  async function loginAndLoadProfile(email, password, remember) {
    var url = await restURL('/login-user');
    var resp = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }, // no nonce
      body: JSON.stringify({ email: email, password: password, remember: !!remember }),
    });

    var loginJson = null;
    try { loginJson = await resp.json(); } catch (e) {}

    // 2FA handling
    if (resp.status === 202 && loginJson && loginJson.twoFactorRequired) {
      showToast('Two-factor authentication required. Check your email/app.');
      return null;
    }

    // Unverified email handling (generic to users; precise to devs only)
    var msgText = (loginJson && (loginJson.error || loginJson.message || '')).toLowerCase();
    if (resp.status === 401 && /unverified|verify/.test(msgText)) {
      showToast('Please verify your email before logging in. We’ve sent you a link.');
      throw new Error('Email not verified.');
    }

    if (!resp.ok) {
      var msg = (loginJson && (loginJson.error || loginJson.message)) || 'Login failed.';
      throw new Error(msg);
    }

    var me = await fetchMe();
    broadcast('auth:login', { user: me || null });
    try { await window.getSocketToken(); } catch (e) {}
    return me;
  }

  async function logout() {
    var url = await restURL('/logout?logout_wp=1');
    try {
      await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-WP-Nonce': getRestNonce() }
      });
    } catch (e) {}
    if (typeof window.sbzInvalidateMeCache === 'function') {
      try { window.sbzInvalidateMeCache(); } catch (e) {}
    }
    clearAuth();
    window.__sbzAccessToken = null;
    broadcast('auth:logout');
    return true;
  }

  /* ===========================
     Signup flow (collects new PM and license fields)
     =========================== */
  var signupForm = document.getElementById('signupForm');
  if (signupForm) {
    // Clear stale "unsupported image" errors if user picks a new file
    var fileInput = signupForm.querySelector('input[name="profile_pic"]');
    if (fileInput) {
      fileInput.addEventListener('change', function () {
        var msg = document.getElementById('auth-message');
        if (msg && /Unsupported image type/i.test(msg.textContent)) msg.textContent = '';
      });
    }

    signupForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      var form = e.target;

      // read basic fields
      var userId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : generateUUID();
      var userType = safeVal(form.user_type);
      var isLandlord = userType === 'landlord';
      var isRealtor  = userType === 'realtor';
      var isRenter   = userType === 'renter';
      var isPM       = userType === 'property_manager';

      // policy checkbox
      var policyEl = document.getElementById('policy-checkbox');
      var accept = !!(policyEl && policyEl.checked);

      // resident toggle (may be hidden for PM)
      var residentCb = document.getElementById('skybriz_resident');
      var skybrizResident = !!(residentCb && residentCb.checked && !isPM);

      // license fields (realtor & PM)
      var licenseId  = safeVal(form.license_id);
      var licenseExp = safeVal(form.license_expiration);
      var licenseSt  = safeVal(form.license_state);

      // business fields (PM only)
      var entityName     = safeVal(form.entity_name);
      var corpType       = safeVal(form.corp_type);
      var authorizedRole = safeVal(form.authorized_role);
      var authRoleOther  = safeVal(form.authorized_role_other);

      // CAPTCHA values if present
      var captchaPassed  = safeVal(form.captcha_passed);
      var captchaSig     = safeVal(form.captchaSig);
      var challengeId    = safeVal(form.challengeId);

      // Client-side guardrails
      var msgEl = document.getElementById('auth-message');
      function fail(msg) {
        if (msgEl) msgEl.textContent = msg;
        showToast(msg);
      }

      if (!accept) return fail('Please agree to the Privacy Policy and Terms.');
      if (!userType) return fail('Please choose your user type.');

      // License requirements
      if (isRealtor || isPM) {
        if (!licenseId) return fail('License ID is required.');
        if (!isIsoDate(licenseExp)) return fail('License expiration must be in YYYY-MM-DD.');
        if (!dateNotPast(licenseExp)) return fail('License expiration date cannot be in the past.');
        if (!licenseSt) return fail('Issuing state is required.');
      }

      // PM business details
      if (isPM) {
        if (!entityName) return fail('Entity legal name is required.');
        if (!corpType) return fail('Please select an entity type.');
        if (!authorizedRole) return fail('Please select the authorized person role.');
        if (authorizedRole === 'Other' && !authRoleOther) return fail('Please specify the authorized role.');
      }

      // Profile image (required by server) — attach user file or safe default
      var profileImage =
        form.profile_pic && form.profile_pic.files && form.profile_pic.files[0]
          ? form.profile_pic.files[0]
          : null;
      if (!profileImage) {
        try {
          profileImage = await getDefaultProfileFile(); // bytes/MIME/ext aligned
        } catch (e) { /* final resort added above guarantees a file */ }
      }

      // Build payload for /register-user
      var userData = {
        // core
        userId: userId,
        username: safeVal(form.username),  // send both username & userName for backend compatibility
        userName: safeVal(form.username),
        email: safeVal(form.email),
        password: safeVal(form.password),
        firstName: safeVal(form.first_name),
        lastName: safeVal(form.last_name),

        // roles & type flags
        userType: userType,
        isLandlord: isLandlord,
        isRealtor: isRealtor,
        isRenter: isRenter,
        isPropertyManager: isPM,

        // license (shared realtor/pm)
        licenseId: (isRealtor || isPM) ? licenseId : '',
        licenseExpiration: (isRealtor || isPM) ? licenseExp : '',
        licenseState: (isRealtor || isPM) ? licenseSt : '',

        // PM business info
        entityName: isPM ? entityName : '',
        corpType: isPM ? corpType : '',
        authorizedRole: isPM ? authorizedRole : '',
        authorizedRoleOther: (isPM && authorizedRole === 'Other') ? authRoleOther : '',

        // policy & resident
        acceptTerms: accept,
        acceptPrivacy: accept,
        skybrizResident: skybrizResident,

        // captcha passthrough
        captchaPassed: captchaPassed,
        captchaSig: captchaSig,
        challengeId: challengeId,

        // file
        profileImage: profileImage
      };

      try {
        if (typeof window.showSpinner === 'function') window.showSpinner('#auth-message', 'Registering...');
        var res = await registerUser(userData);

        // Determine "success" UI state for pending/verification flows
        var isPending =
          res && (
            res.success === true ||
            res.status === 'PENDING_VERIFICATION' ||
            res.status === 'EXISTING_UNVERIFIED'
          );

        // Fire event for analytics/hooks
        broadcast('auth:registered', { userType: userType, ok: !!isPending });

        if (isPending || (res && res.user)) {
          // Hide the form to avoid confusion
          if (form) form.style.display = 'none';

          // Friendly success copy
          var msg = (res && res.message) ||
            (res && res.status === 'EXISTING_UNVERIFIED'
              ? 'Account exists but is not verified. We just sent you a new verification link.'
              : 'Signup received. We sent you a verification link.');

          var msgElOk = document.getElementById('auth-message');
          if (msgElOk) {
            msgElOk.innerHTML =
              '<div class="success-message theme-box">' +
              '<h3 class="theme-title">🎉 Thank you for signing up!</h3>' +
              '<p class="theme-text">' + msg + ' Please verify your email before you can access your account.</p>' +
              '</div>';
          }
          showToast('📧 Please verify your email before logging in.');
          return;
        }

        // Not a recognized success response → show best available message
        var fallbackMsg = (res && (res.error || res.message)) || 'Registration failed. Please try again.';
        var el = document.getElementById('auth-message');
        if (el) el.textContent = fallbackMsg;

      } catch (err2) {
        broadcast('auth:registered', { userType: userType, ok: false });
        var el2 = document.getElementById('auth-message');
        if (el2) el2.textContent = err2 && err2.message ? err2.message : 'Registration failed.';
      } finally {
        if (typeof window.hideSpinner === 'function') window.hideSpinner('#auth-message');
      }
    });
  }

  /* ===========================
     Login flow
     =========================== */
  var loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async function (e) {
      e.preventDefault();

      var emailEl = loginForm.querySelector('[name="email"]');
      var passEl = loginForm.querySelector('[name="password"]');
      var rememberEl = document.getElementById('rememberMe');

      var email = emailEl ? (emailEl.value || '').trim() : '';
      var password = passEl ? (passEl.value || '').trim() : '';
      var rememberMe = !!(rememberEl && rememberEl.checked);

      var msgEl = document.getElementById('auth-message');
      if (!email || !password) {
        if (msgEl) msgEl.textContent = 'Please enter both email and password.';
        return;
      }

      if (typeof window.showSpinner === 'function') window.showSpinner('Logging in...');
      try {
        var me = await loginAndLoadProfile(email, password, rememberMe);
        if (typeof window.hideSpinner === 'function') window.hideSpinner();
        if (!me) {
          if (msgEl && (!msgEl.textContent || msgEl.textContent === 'Login failed.')) {
            msgEl.textContent = 'Check your email/app to complete sign-in.';
          }
          return;
        }
        if (msgEl) msgEl.textContent = 'Login successful!';
        window.location.href = '/user-account';
      } catch (e2) {
        if (typeof window.hideSpinner === 'function') window.hideSpinner();
        if (msgEl) msgEl.textContent = (e2 && e2.message) ? e2.message : 'An error occurred. Please try again.';
      }
    });
  }

  /* ===========================
     Bootstrap: refresh UI cache
     =========================== */
  (async function () {
    try { await fetchMe(); } catch (e) {}
  })();

  /* ===========================
     Expose for other scripts
     =========================== */
  window.registerUser = registerUser;
  window.loginAndLoadProfile = loginAndLoadProfile;
  window.fetchMe = fetchMe;
  window.logout = logout;
  window.generateUUID = generateUUID;
  window.clearAuth = clearAuth;
  window.rememberUserForUI = rememberUserForUI;
  window.getAvatarSrc = getAvatarSrc;
  window.setAvatar = setAvatar;
  window.SBZ_AVATAR_FALLBACK = SBZ_AVATAR_FALLBACK;
})();
