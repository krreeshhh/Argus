(function () {
  const NAME = (window.SBZ_COOKIE && SBZ_COOKIE.name) || 'sbz_cookie_consent';
  const DAYS = (window.SBZ_COOKIE && SBZ_COOKIE.days) || 180;
  const POLICY_VERSION = (window.SBZ_COOKIE && SBZ_COOKIE.policyVersion) || null;

  function getCookie(n) {
    return document.cookie.split('; ').find(r => r.startsWith(n + '='))?.split('=')[1];
  }

  function setCookie(n, v, days) {
    const d = new Date();
    d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
    let domainPart = '';
    const host = location.hostname;
    const parts = host.split('.');
    if (parts.length >= 2 && !/localhost|\.local$/.test(host)) {
      domainPart = `; domain=.${parts.slice(-2).join('.')}`;
    }
    document.cookie = `${n}=${encodeURIComponent(v)}; expires=${d.toUTCString()}; path=/; SameSite=Lax${domainPart}`;
  }

  function getStoredPolicyVersion() {
    return localStorage.getItem('sbz_policy_version') || null;
  }
  function setStoredPolicyVersion(v) {
    try { localStorage.setItem('sbz_policy_version', v); } catch (_) {}
    try { if (v) setCookie('sbz_policy_version', v, DAYS); } catch (_) {}
  }

  function versionSatisfied() {
    if (!POLICY_VERSION) return true;
    const stored = getStoredPolicyVersion();
    return stored === POLICY_VERSION;
  }

  function consentFlagSet() {
    return !!(getCookie(NAME) || localStorage.getItem(NAME) === 'yes');
  }

  function alreadyConsented() {
    return consentFlagSet() && versionSatisfied();
  }

  function getCategoriesFromUI(container) {
    const picks = [];
    const nodes = container.querySelectorAll('[data-cookie-cat], input[name="cookie-cat"]');
    nodes.forEach(n => {
      const isCheck = n.type === 'checkbox' || n.type === 'radio';
      if ((isCheck && n.checked) || (!isCheck && n.value)) {
        const v = (n.value || '').trim();
        if (v) picks.push(v);
      }
    });
    return picks.length ? picks.join(',') : 'all';
  }

  async function logToServer(payload) {
    if (!window.SBZ_COOKIE || !SBZ_COOKIE.endpoint) return;
    try {
      await fetch(SBZ_COOKIE.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-WP-Nonce': SBZ_COOKIE.nonce || ''
        },
        body: JSON.stringify({
          consent: true,
          categories: payload.categories || 'all',
          policyVersion: POLICY_VERSION || '1.0'
        })
      });
    } catch (_) { /* non-blocking */ }
  }

  function wireExistingMarkup(container) {
    if (container.dataset.wired === '1') return; // prevent double-wiring
    container.dataset.wired = '1';

    const acceptBtn =
      container.querySelector('[data-cookie-accept]') ||
      container.querySelector('button');

    const dismissBtn =
      container.querySelector('[data-cookie-dismiss]') || null;

    function accept(e) {
      e && e.preventDefault();
      if (acceptBtn) acceptBtn.disabled = true; // guard double-clicks

      setCookie(NAME, 'yes', DAYS);
      try { localStorage.setItem(NAME, 'yes'); } catch (_) {}

      if (POLICY_VERSION) setStoredPolicyVersion(POLICY_VERSION);

      const categories = getCategoriesFromUI(container);

      logToServer({ categories });

      try {
        window.dispatchEvent(new CustomEvent('sbz:cookie:accepted', {
          detail: { categories, policyVersion: POLICY_VERSION || '1.0' }
        }));
      } catch (_) {}

      container.classList.remove('visible');
      container.classList.add('hidden');
      setTimeout(() => container.remove(), 300);
    }

    function dismiss(e) {
      e && e.preventDefault();
      try { window.dispatchEvent(new CustomEvent('sbz:cookie:dismissed')); } catch (_) {}
      container.classList.remove('visible');
      container.classList.add('hidden');
      setTimeout(() => container.remove(), 300);
    }

    // support inline onclick="acceptCookies()" if present
    window.acceptCookies = accept;

    if (!alreadyConsented()) {
      container.classList.remove('hidden');
      container.classList.add('visible');
      if (acceptBtn) acceptBtn.addEventListener('click', accept, { once: true });
      if (dismissBtn) dismissBtn.addEventListener('click', dismiss, { once: true });
    } else {
      container.remove();
    }
  }

  function renderFallback() {
    if (alreadyConsented()) return;
    const container = document.createElement('div');
    container.id = 'cookieConsentBanner';
    container.className = 'cookie-banner-container visible';
    container.innerHTML = `
      <div class="cookie-banner">
        <p>
          We use cookies to improve your experience and analyze site usage.
          By continuing to use our site, you agree to our
          <a href="/privacy-policy">Privacy Policy</a>.
        </p>
        <button data-cookie-accept type="button" aria-label="Accept cookies">Got it</button>
      </div>`;
    document.body.appendChild(container);
    wireExistingMarkup(container);
  }

  function init() {
    const existing = document.getElementById('cookieConsentBanner');
    if (existing) {
      wireExistingMarkup(existing);
    } else {
      renderFallback();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
