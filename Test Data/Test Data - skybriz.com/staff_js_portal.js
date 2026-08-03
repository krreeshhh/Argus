// assets/js/staff.js
// Skybriz Staff Portal — front-end helpers (security-first)
// - Real login flow via Node.js /auth/login
// - Session stored in sessionStorage (short-lived)
// - deviceId stored in localStorage OR sessionStorage (remember device toggle; NOT fingerprinting)
// - /auth/me fetch uses no-store + X-Device-Id and includes credentials so Node-set session cookies persist
// - Logout calls Node /auth/logout then clears session
// - Dashboard protection + "My Summary" fetch
// - Time Center + Notifications + bfcache guard

(function () {
    const API_BASE = String(window.SBZ_STAFF && window.SBZ_STAFF.apiBaseUrl ? window.SBZ_STAFF.apiBaseUrl : "").replace(/\/+$/, "");
    const SESSION_KEY = "sbz_staff_session"; // sessionId from backend
  
    // Device identifiers
    // - If "Remember this device" is checked => persist in localStorage
    // - Otherwise => keep only in sessionStorage (device identity resets on browser restart)
    const DEVICE_KEY_LOCAL = "sbz_staff_device_id";
    const DEVICE_KEY_SESSION = "sbz_staff_device_id_session";
    let bootstrapSessionConsumed = false;
    let deviceStateCleared = false;
  
    // ─────────────────────────────────────────────
    // Safe storage helpers
    // ─────────────────────────────────────────────
    function safeGet(storage, key) {
      try { return storage.getItem(key) || ""; } catch (e) { return ""; }
    }
    function safeSet(storage, key, value) {
      try { storage.setItem(key, value); } catch (e) {}
    }
    function safeRemove(storage, key) {
      try { storage.removeItem(key); } catch (e) {}
    }

    function readCookie(name) {
      try {
        const escaped = name.replace(/[-[\]/{}()*+?.\\^$|]/g, '\\$&');
        const match = document.cookie.match(new RegExp('(?:^|; )' + escaped + '=([^;]*)'));
        return match ? decodeURIComponent(match[1]) : "";
      } catch (e) {
        return "";
      }
    }

    function sharedCookieDomain() {
      try {
        var host = String(window.location.hostname || '').toLowerCase();
        if (host === 'portal.skybriz.com' || host === 'staff.skybriz.com' || /(?:^|\.)skybriz\.com$/.test(host)) {
          return '; Domain=.skybriz.com';
        }
      } catch (e) {}
      return '';
    }

    function writeCookie(name, value, sessionOnly) {
      try {
        const maxAge = sessionOnly ? "" : "; Max-Age=31536000";
        const secure = window.location.protocol === "https:" ? "; Secure" : "";
        const domain = sharedCookieDomain();
        document.cookie = name + "=" + encodeURIComponent(value) + "; Path=/; SameSite=Lax" + maxAge + domain + secure;
      } catch (e) {}
    }

    function clearCookie(name) {
      try {
        const secure = window.location.protocol === "https:" ? "; Secure" : "";
        const domain = sharedCookieDomain();
        document.cookie = name + "=; Max-Age=0; Path=/; SameSite=Lax" + domain + secure;
      } catch (e) {}
    }

    function clearDeviceState() {
      deviceStateCleared = true;
      safeRemove(window.sessionStorage, DEVICE_KEY_SESSION);
      safeRemove(window.localStorage, DEVICE_KEY_LOCAL);
      clearCookie(DEVICE_KEY_LOCAL);
    }

    function readBootstrappedConfigValue(key) {
      try {
        var sources = [
          window.SBZ_MANAGEMENT_CONFIG,
          window.SBZ_REPORTS_CONFIG,
          window.SBZ_SETTINGS_CONFIG,
          window.SBZ_MARKETING_CONFIG,
          window.SBZ_PROPERTY_MANAGEMENT_CONFIG,
          window.SBZ_FINANCE_CONFIG,
          window.SBZ_CEO_OFFICE_CONFIG,
          window.SBZ_SECURITY_CLEARANCE_CONFIG,
          window.SBZ_HR_CONFIG,
          window.SBZ_TASKS_CONFIG,
          window.SBZ_DOCS_CONFIG,
          window.SBZ_STAFF,
        ];
        for (var i = 0; i < sources.length; i++) {
          var source = sources[i] || {};
          var raw = String(source[key] || "").trim();
          if (raw) return raw;
        }
      } catch (e) {
        return "";
      }
      return "";
    }

    function formatDepartmentSummary(value) {
      const items = Array.isArray(value)
        ? value
        : String(value || "")
          .split(/[,·]/)
          .map((item) => item.trim())
          .filter(Boolean);
      const uniqueItems = Array.from(new Set(items.map((item) => String(item || "").trim()).filter(Boolean)));
      return uniqueItems.join(" · ");
    }
  
    // ─────────────────────────────────────────────
    // Session helpers (front-end flag)
    // ─────────────────────────────────────────────
    function hasSession() {
      return !!getSessionId();
    }
  
    function getSessionId() {
      if (!bootstrapSessionConsumed) {
        var bootstrappedSession = readBootstrappedConfigValue("sessionId");
        if (bootstrappedSession) {
          bootstrapSessionConsumed = true;
          writeCookie(SESSION_KEY, String(bootstrappedSession), true);
          safeSet(window.sessionStorage, SESSION_KEY, String(bootstrappedSession));
          safeSet(window.sessionStorage, "sbz_staff_token", String(bootstrappedSession));
          safeSet(window.localStorage, SESSION_KEY, String(bootstrappedSession));
          safeSet(window.localStorage, "sbz_staff_token", String(bootstrappedSession));
        }
      }

      const cookieSession = readCookie(SESSION_KEY);
      if (cookieSession) {
        safeSet(window.sessionStorage, SESSION_KEY, String(cookieSession));
        safeSet(window.sessionStorage, "sbz_staff_token", String(cookieSession));
        safeSet(window.localStorage, SESSION_KEY, String(cookieSession));
        safeSet(window.localStorage, "sbz_staff_token", String(cookieSession));
        return String(cookieSession);
      }

      const storedSession =
        safeGet(window.sessionStorage, SESSION_KEY) ||
        safeGet(window.sessionStorage, "sbz_staff_token") ||
        safeGet(window.localStorage, SESSION_KEY) ||
        safeGet(window.localStorage, "sbz_staff_token") ||
        "";

      if (storedSession && !cookieSession) {
        clearSession();
        return "";
      }

      return String(storedSession);
    }
  
    function setSession(sessionId) {
      if (!sessionId) return;
      safeSet(window.sessionStorage, SESSION_KEY, String(sessionId));
      // Keep a same-site session cookie in sync so PHP-rendered layout can
      // make the same authorization decision as the browser session.
      writeCookie(SESSION_KEY, String(sessionId), true);
      // Compatibility bridge for older React bundles that still read sbz_staff_token.
      safeSet(window.sessionStorage, "sbz_staff_token", String(sessionId));
    }
  
    function clearSession() {
      bootstrapSessionConsumed = true;
      safeRemove(window.sessionStorage, SESSION_KEY);
      safeRemove(window.sessionStorage, "sbz_staff_token");
      safeRemove(window.localStorage, SESSION_KEY);
      safeRemove(window.localStorage, "sbz_staff_token");
      writeCookie(SESSION_KEY, "", true);
      writeCookie("sbz_staff_cookie_synced", "", true);
      clearDeviceState();
    }
  
    // ─────────────────────────────────────────────
    // Device ID helpers (NOT fingerprinting)
    // ─────────────────────────────────────────────
    function generateDeviceId() {
      if (window.crypto && typeof window.crypto.randomUUID === "function") {
        return window.crypto.randomUUID();
      }
      if (window.crypto && typeof window.crypto.getRandomValues === "function") {
        const bytes = new Uint8Array(16);
        window.crypto.getRandomValues(bytes);
        const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
        return "dev_" + hex;
      }
      return "dev_" + Date.now().toString(16);
    }
  
    // Choose where to persist device id based on remember flag
    function getOrCreateDeviceId(rememberDevice) {
      var bootstrappedDeviceId = readBootstrappedConfigValue("deviceId");
      if (bootstrappedDeviceId) {
        safeSet(window.localStorage, DEVICE_KEY_LOCAL, String(bootstrappedDeviceId));
        safeSet(window.sessionStorage, DEVICE_KEY_SESSION, String(bootstrappedDeviceId));
        if (!readCookie(DEVICE_KEY_LOCAL)) {
          writeCookie(DEVICE_KEY_LOCAL, String(bootstrappedDeviceId), false);
        }
      }

      let id = readCookie(DEVICE_KEY_LOCAL);
      if (!id) {
        const storedDeviceId =
          safeGet(window.localStorage, DEVICE_KEY_LOCAL) ||
          safeGet(window.sessionStorage, DEVICE_KEY_SESSION) ||
          "";
        if (storedDeviceId) {
          clearDeviceState();
        }
      }

      if (!id) {
        id = generateDeviceId();
      }
  
      if (id.length > 64) id = id.slice(0, 64);

      if (rememberDevice) {
        safeSet(window.localStorage, DEVICE_KEY_LOCAL, id);
        safeRemove(window.sessionStorage, DEVICE_KEY_SESSION);
        writeCookie(DEVICE_KEY_LOCAL, id, false);
      } else {
        safeSet(window.sessionStorage, DEVICE_KEY_SESSION, id);
        writeCookie(DEVICE_KEY_LOCAL, id, true);
        // Do NOT delete the local one here; user may have previously chosen remember.
      }

      return id;
    }
  
    // For requests on any page (not just login), pick best available deviceId.
    function getDeviceIdForRequests() {
      let id = readCookie(DEVICE_KEY_LOCAL);

      if (id) {
        safeSet(window.localStorage, DEVICE_KEY_LOCAL, id);
        safeSet(window.sessionStorage, DEVICE_KEY_SESSION, id);
      } else {
        const storedDeviceId =
          safeGet(window.localStorage, DEVICE_KEY_LOCAL) ||
          safeGet(window.sessionStorage, DEVICE_KEY_SESSION) ||
          "";
        if (storedDeviceId) {
          clearDeviceState();
        } else if (deviceStateCleared) {
          return "";
        }
        id = getOrCreateDeviceId(false);
      }
      if (id.length > 64) id = id.slice(0, 64);
      return id;
    }
  
    // ─────────────────────────────────────────────
    // Navigation helpers
    // ─────────────────────────────────────────────
    function redirectToLogin() {
      // Adjust if you change the login URL
      clearSession();
      if (window.location.pathname === "/") return;
      const lastRedirect = Number(safeGet(window.sessionStorage, "sbz_staff_last_login_redirect") || 0);
      const now = Date.now();
      if (lastRedirect && now - lastRedirect < 1500) return;
      safeSet(window.sessionStorage, "sbz_staff_last_login_redirect", String(now));
      window.location.replace("/");
    }
  
    function goToDashboard() {
      // Adjust if your staff dashboard slug changes
      window.location.href = "/staff-dashboard/";
    }
  
    function isStaffPath() {
      return /^\/staff-/.test(window.location.pathname);
    }
  
    // ─────────────────────────────────────────────
    // UI helpers (safe DOM; no HTML injection)
    // ─────────────────────────────────────────────
    function setStatus(statusEl, msg, color) {
      if (!statusEl) return;
      statusEl.textContent = msg || "";
      if (color) statusEl.style.color = color;
    }
  
    function clearStatus(statusEl) {
      if (!statusEl) return;
      statusEl.textContent = "";
    }

    function setTextById(id, value) {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = value;
    }

    function escapeHtml(value) {
      return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }
  
    // Create a safe "Force sign out other device" action inside statusEl
    function showForceLogoutAction(statusEl, onForce) {
      if (!statusEl) return;
  
      statusEl.textContent = "";
      statusEl.style.color = "#ff6b6b";
  
      const row = document.createElement("span");
      row.style.display = "inline-flex";
      row.style.flexWrap = "wrap";
      row.style.gap = "10px";
      row.style.alignItems = "center";
  
      const msg = document.createElement("span");
      msg.textContent = "You’re already signed in on another device.";
  
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "Force sign out other device";
      btn.style.padding = "10px 12px";
      btn.style.borderRadius = "999px";
      btn.style.border = "1px solid rgba(255,255,255,0.15)";
      btn.style.background = "rgba(255,255,255,0.06)";
      btn.style.color = "#e5e7eb";
      btn.style.cursor = "pointer";
  
      btn.addEventListener("click", function () {
        onForce && onForce();
      });
  
      row.appendChild(msg);
      row.appendChild(btn);
      statusEl.appendChild(row);
    }
  
    // ─────────────────────────────────────────────
    // API calls (no-store + device id header)
    // ─────────────────────────────────────────────
    async function apiMe(sessionId) {
      const devId = getDeviceIdForRequests();
      return fetch(API_BASE + "/auth/me", {
        method: "GET",
        cache: "no-store",
        credentials: "omit",
        headers: {
          Authorization: "Bearer " + sessionId,
          "X-Device-Id": devId
        }
      });
    }

    async function apiNotifications(sessionId) {
      const devId = getDeviceIdForRequests();
      return fetch(API_BASE + "/api/notifications?limit=12", {
        method: "GET",
        cache: "no-store",
        credentials: "omit",
        headers: {
          Authorization: "Bearer " + sessionId,
          "X-Device-Id": devId
        }
      });
    }

    async function apiReadAllNotifications(sessionId) {
      const devId = getDeviceIdForRequests();
      return fetch(API_BASE + "/api/notifications/read-all", {
        method: "POST",
        cache: "no-store",
        credentials: "omit",
        headers: {
          Authorization: "Bearer " + sessionId,
          "X-Device-Id": devId,
          "Content-Type": "application/json"
        }
      });
    }

    async function fetchJson(path, init = {}) {
      const sessionId = getSessionId();
      const devId = getDeviceIdForRequests();

      const resp = await fetch(API_BASE + path, {
        method: init.method || "GET",
        cache: "no-store",
        credentials: "omit",
        ...init,
        headers: {
          Authorization: sessionId ? "Bearer " + sessionId : "",
          "X-Device-Id": devId,
          "Content-Type": "application/json",
          ...(init.headers || {})
        }
      });

      const text = await resp.text().catch(() => "");
      let payload = null;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch (_err) {
        payload = null;
      }

      return {
        ok: resp.ok,
        status: resp.status,
        payload,
        error: payload && (payload.error || payload.message) ? String(payload.error || payload.message) : (text || `HTTP ${resp.status}`)
      };
    }

    async function apiPresenceHeartbeat(sessionId) {
      const devId = getDeviceIdForRequests();
      return fetch(API_BASE + "/api/presence/heartbeat", {
        method: "POST",
        cache: "no-store",
        credentials: "omit",
        headers: {
          Authorization: "Bearer " + sessionId,
          "X-Device-Id": devId,
          "Content-Type": "application/json"
        }
      });
    }

    async function apiPaySummary(sessionId) {
      const devId = getDeviceIdForRequests();
      return fetch(API_BASE + "/api/pay/me", {
        method: "GET",
        cache: "no-store",
        credentials: "omit",
        headers: {
          Authorization: "Bearer " + sessionId,
          "X-Device-Id": devId
        }
        });
    }

    function renderDashboardHomeSummary(payload) {
      const summary = payload?.summary || {};
      const hero = payload?.hero || {};
      const summaryTitle = document.getElementById("sbz-dashboard-home-title");
      const hours = summary.todayHoursLabel || '—';
      const status = summary.currentStatus || '—';
      const attendance = summary.attendanceState || '—';
      const workStatus = summary.workStatus || '—';
      const breakStatus = summary.breakStatus || '—';
      const inactivityStatus = summary.inactivityStatus || summary.timeTracking?.inactivityStatus || '—';
      const pendingCorrections = Number(summary.pendingCorrections ?? summary.timeTracking?.pendingCorrections ?? 0);
      const weekHours = summary.weekHoursLabel || '—';
      const taskCounts = summary.taskCounts || {};
      const leave = summary.leave || {};
      const goals = summary.goals || {};
      const overview = summary.overview || 'Live dashboard summary loaded.';
      const departmentSummary = Array.isArray(summary?.user?.departments) && summary.user.departments.length
        ? summary.user.departments.map((department) => String(department || "").trim()).filter(Boolean).join(" · ")
        : String(hero.team || summary.team || "").trim();

      if (summaryTitle) {
        summaryTitle.textContent = departmentSummary || 'Your current portal status';
      }
      setTextById("sbz-dashboard-home-overview", overview);
      setTextById("sbz-dashboard-home-time", `${status} · ${hours}`);
      setTextById("sbz-dashboard-home-tasks", `${Number(taskCounts.open || 0) + Number(taskCounts.inProgress || 0)} active / ${Number(taskCounts.overdue || 0)} overdue`);
      setTextById("sbz-dashboard-home-leave", leave.pendingCount > 0 ? `${Number(leave.pendingCount || 0)} pending` : (leave.upcomingLeave?.startDate ? `Next ${leave.upcomingLeave.startDate}` : 'None pending'));
      setTextById("sbz-dashboard-home-goals", `${Number(goals.atRisk || 0)} at risk / ${Number(goals.overdue || 0)} overdue`);
      setTextById("sbz-dashboard-time-summary", `${status} · ${attendance}`);
      setTextById("sbz-dashboard-time-status", status);
      setTextById("sbz-dashboard-time-work-state", workStatus);
      setTextById("sbz-dashboard-time-break-state", breakStatus);
      setTextById("sbz-dashboard-time-inactivity-state", inactivityStatus);
      setTextById("sbz-dashboard-time-corrections", pendingCorrections > 0 ? `${pendingCorrections} pending` : 'None pending');
      setTextById("sbz-dashboard-time-hours", hours);
      setTextById("sbz-dashboard-time-week", weekHours);
    }

    function clearDashboardHomeSummary() {
      setTextById("sbz-dashboard-home-title", 'Your current portal status');
      setTextById("sbz-dashboard-home-overview", 'Live dashboard summary is temporarily unavailable.');
      setTextById("sbz-dashboard-home-time", '');
      setTextById("sbz-dashboard-home-tasks", '');
      setTextById("sbz-dashboard-home-leave", '');
      setTextById("sbz-dashboard-home-goals", '');
      setTextById("sbz-dashboard-time-summary", '');
      setTextById("sbz-dashboard-time-status", '');
      setTextById("sbz-dashboard-time-work-state", '');
      setTextById("sbz-dashboard-time-break-state", '');
      setTextById("sbz-dashboard-time-inactivity-state", '');
      setTextById("sbz-dashboard-time-corrections", '');
      setTextById("sbz-dashboard-time-hours", '');
      setTextById("sbz-dashboard-time-week", '');
    }

    function formatPayHours(value) {
      const n = Number(value);
      if (!Number.isFinite(n)) return '—';
      return `${n.toFixed(2)}h`;
    }

    function renderDashboardPaySummary(payload) {
      const profile = payload?.profile || {};
      const paystubs = Array.isArray(payload?.paystubs) ? payload.paystubs : [];
      const latest = paystubs.length ? paystubs[0] : null;
      const benefits = Array.isArray(profile.benefitsSummary) ? profile.benefitsSummary : [];
      const benefitsEl = document.getElementById("sbz-dashboard-pay-benefits");
      const hoursEl = document.getElementById("sbz-dashboard-pay-hours");

      setTextById("sbz-dashboard-pay-summary", latest
        ? `Latest payout: ${Number(latest.netPay || 0).toLocaleString('en-US', { style: 'currency', currency: String(latest.currencyCode || 'USD').toUpperCase() })} on ${latest.payDate || '—'}`
        : 'No payroll records have been posted right now.');
      setTextById("sbz-dashboard-pay-type", profile.payType || 'Not set');
      setTextById("sbz-dashboard-pay-base-rate", profile.baseRateDisplay || 'Not set');
      setTextById("sbz-dashboard-pay-latest", latest
        ? `${Number(latest.netPay || 0).toLocaleString('en-US', { style: 'currency', currency: String(latest.currencyCode || 'USD').toUpperCase() })}`
        : 'No payouts are available right now');
      if (hoursEl) {
        hoursEl.textContent = latest
          ? `Hours worked: ${formatPayHours(latest.hoursWorked)}`
          : 'No hours worked are available right now.';
      }
      if (benefitsEl) {
        benefitsEl.innerHTML = benefits.length
          ? `
              <strong class="sbz-dashboard-home__metricValue">${benefits.length} live item${benefits.length === 1 ? '' : 's'}</strong>
              <ul class="sbz-dashboard-pay-benefits__list">
                ${benefits.slice(0, 4).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
              </ul>
              ${benefits.length > 4 ? `<span class="sbz-dashboard-home__metricMeta">${benefits.length - 4} more benefit item${benefits.length - 4 === 1 ? '' : 's'} available in payroll.</span>` : ""}
            `
          : `
              <strong class="sbz-dashboard-home__metricValue">No benefits summary is available right now.</strong>
              <span class="sbz-dashboard-home__metricMeta">Live benefits overview will render from secure payroll data.</span>
            `;
      }
    }

    function clearDashboardPaySummary() {
      setTextById("sbz-dashboard-pay-summary", 'Secure payroll data is temporarily unavailable.');
      setTextById("sbz-dashboard-pay-type", '');
      setTextById("sbz-dashboard-pay-base-rate", '');
      setTextById("sbz-dashboard-pay-latest", '');
      setTextById("sbz-dashboard-pay-hours", '');
      const benefitsEl = document.getElementById("sbz-dashboard-pay-benefits");
      if (benefitsEl) {
        benefitsEl.innerHTML = '';
        benefitsEl.textContent = '';
      }
    }

    function clearDashboardVisibleSummary() {
      clearCurrentUserSummary();
      clearDashboardHomeSummary();
      clearDashboardPaySummary();
    }

    async function loadDashboardHomeSummary() {
      const summaryTitle = document.getElementById("sbz-dashboard-home-title");
      const summaryOverview = document.getElementById("sbz-dashboard-home-overview");
      if (!summaryTitle && !summaryOverview) return;

      const sessionId = getSessionId();
      if (!sessionId) return;

      clearDashboardHomeSummary();

      try {
        const res = await fetchJson("/api/dashboard/home");
        if (res.status === 401 || res.status === 403) {
          clearDashboardVisibleSummary();
          clearSession();
          redirectToLogin();
          return;
        }
        if (!res.ok || !res.payload) {
          clearDashboardHomeSummary();
          return;
        }
        renderDashboardHomeSummary(res.payload);
      } catch (err) {
        console.error("Error loading dashboard home summary:", err);
        clearDashboardHomeSummary();
      }
    }

    async function loadDashboardPaySummary() {
      const paySummaryEl = document.getElementById("sbz-dashboard-pay-summary");
      if (!paySummaryEl) return;

      const sessionId = getSessionId();
      if (!sessionId) return;

      clearDashboardPaySummary();

      try {
        const res = await apiPaySummary(sessionId);
        if (res.status === 401 || res.status === 403) {
          clearDashboardVisibleSummary();
          clearSession();
          redirectToLogin();
          return;
        }
        if (!res.ok) {
          clearDashboardPaySummary();
          return;
        }
        const payload = await res.json();
        renderDashboardPaySummary(payload || {});
      } catch (err) {
        console.error("Error loading dashboard pay summary:", err);
        clearDashboardPaySummary();
      }
    }

    function setupDashboardLiveRefresh(isDashboardPage) {
      if (!isDashboardPage) return;

      let refreshInFlight = false;
      let refreshQueued = false;

      async function refreshDashboardLiveData() {
        if (!isDashboardPage || !hasSession()) return;
        if (refreshInFlight) {
          refreshQueued = true;
          return;
        }

        refreshInFlight = true;
        try {
          await loadCurrentUserSummary();
          await loadDashboardHomeSummary();
          await loadDashboardPaySummary();
        } finally {
          refreshInFlight = false;
          if (refreshQueued) {
            refreshQueued = false;
            void refreshDashboardLiveData();
          }
        }
      }

      window.addEventListener("pageshow", function (event) {
        if (!event || !event.persisted) return;
        void refreshDashboardLiveData();
      });

      document.addEventListener("visibilitychange", function () {
        if (document.visibilityState !== "visible") return;
        void refreshDashboardLiveData();
      });
    }

    function clearCurrentUserSummary() {
      const nameEl = document.getElementById("sbz-metric-name");
      const roleEl = document.getElementById("sbz-metric-role");
      const teamEl = document.getElementById("sbz-metric-team");
      const statusEl = document.getElementById("sbz-metric-status");
      const staffCodeEl = document.getElementById("sbz-metric-staff-code");

      if (nameEl) nameEl.textContent = "—";
      if (roleEl) roleEl.textContent = "—";
      if (teamEl) teamEl.textContent = "—";
      if (statusEl) statusEl.textContent = "";
      if (staffCodeEl) staffCodeEl.textContent = "—";
    }
  
    async function apiLogin(email, password, rememberDevice, forceLogoutExisting) {
      const devId = getOrCreateDeviceId(rememberDevice);
  
      return fetch(API_BASE + "/auth/login", {
        method: "POST",
        cache: "no-store",
        credentials: "omit",
        headers: {
          "Content-Type": "application/json",
          "X-Device-Id": devId
        },
        body: JSON.stringify({
          email,
          password,
          remember: !!rememberDevice,
          deviceId: devId,
          forceLogoutExisting: !!forceLogoutExisting
        })
      });
    }

    async function apiVerifyLogin(challengeId, code, forceLogoutExisting) {
      const devId = getDeviceIdForRequests();

      return fetch(API_BASE + "/auth/login/verify-otp", {
        method: "POST",
        cache: "no-store",
        credentials: "omit",
        headers: {
          "Content-Type": "application/json",
          "X-Device-Id": devId
        },
        body: JSON.stringify({
          challengeId,
          code,
          deviceId: devId,
          forceLogoutExisting: !!forceLogoutExisting
        })
      });
    }
  
    async function apiLogout(sessionId) {
      const devId = getDeviceIdForRequests();
      try {
        await fetch(API_BASE + "/auth/logout", {
          method: "POST",
          cache: "no-store",
          credentials: "omit",
          headers: {
            Authorization: "Bearer " + sessionId,
            "X-Device-Id": devId
          }
        });
      } catch (_e) {
        // ignore network issues on logout; we still clear local session
      }
    }
  
    // ─────────────────────────────────────────────
    // Dashboard helper: load /auth/me and populate metrics
    // ─────────────────────────────────────────────
    async function loadCurrentUserSummary() {
      const nameEl = document.getElementById("sbz-metric-name");
      const roleEl = document.getElementById("sbz-metric-role");
      const teamEl = document.getElementById("sbz-metric-team");
      const statusEl = document.getElementById("sbz-metric-status");
      const staffCodeEl = document.getElementById("sbz-metric-staff-code");
  
      if (!nameEl && !roleEl && !teamEl && !statusEl && !staffCodeEl) {
        return;
      }

      // Clear any stale values before revalidating the session so the shell
      // does not keep showing a previous user's department or role.
      clearCurrentUserSummary();
  
      const sessionId = getSessionId();
      if (!sessionId) {
        clearSession();
        redirectToLogin();
        return;
      }
  
      try {
        const resp = await apiMe(sessionId);

        if (resp.status === 401 || resp.status === 403) {
          clearSession();
          redirectToLogin();
          return;
        }
  
        let data = {};
        try { data = await resp.json(); } catch (_err) { data = {}; }
  
        if (!data || !data.user) return;
  
        const user = data.user;

        if (nameEl) nameEl.textContent = user.displayName || user.email || "Unknown";
        if (statusEl) statusEl.textContent = user.status || "—";
        if (staffCodeEl) staffCodeEl.textContent = user.staffCode || user.staff_code || "—";
  
        if (roleEl) {
          const roles = Array.isArray(user.roles)
            ? user.roles.join(", ")
            : (user.roles || "");
          roleEl.textContent = roles || "—";
        }
  
        if (teamEl) {
          const departments = Array.isArray(user.departments)
            ? user.departments.join(", ")
            : (user.departments || "");
          teamEl.textContent = departments || "—";
        }
      } catch (err) {
        console.error("Error loading /auth/me:", err);
      }
    }
  
    // ─────────────────────────────────────────────
    // Auth guard (client-side UX only; server must enforce too)
    // - On staff pages: if no session -> redirect
    // - If session exists: verify with /auth/me; if 401/403 -> clear + redirect
    // ─────────────────────────────────────────────
    async function authGuard() {
      if (!isStaffPath()) return;
  
      if (!hasSession()) {
        redirectToLogin();
        return;
      }
  
      const sessionId = getSessionId();
      try {
        const resp = await apiMe(sessionId);
        if (resp.status === 401 || resp.status === 403) {
          clearDashboardVisibleSummary();
          clearSession();
          redirectToLogin();
        }
      } catch (_e) {
        // Network down: don't auto-kick; protected data should not be shown without /auth/me.
      }
    }
  
    // ─────────────────────────────────────────────
    // Main DOMContentLoaded handler
    // ─────────────────────────────────────────────
    document.addEventListener("DOMContentLoaded", function () {
      const isLoginPage = !!document.querySelector(".sbz-login-wrapper");
      const isDashboardPage = !!document.querySelector(".sbz-dashboard");
  
      // 0) Guard staff pages early (prevents cached dashboard view after logout)
      if (!isLoginPage) {
        authGuard();
      }
  
      // ─────────────────────────────────────────────
      // 1) REAL login flow on login page
      // ─────────────────────────────────────────────
      if (isLoginPage) {
        const form = document.getElementById("sbz-login-form");
        const statusEl = document.getElementById("sbz-login-status");
        const otpPanel = document.getElementById("sbz-login-otp");
        const otpInput = document.getElementById("sbz-otp-code");
        const otpMeta = document.getElementById("sbz-login-otp-meta");
        const otpBackBtn = document.getElementById("sbz-login-otp-back");
        const otpResendBtn = document.getElementById("sbz-login-otp-resend");
        const submitLabel = document.getElementById("sbz-login-submit-label");
        const emailInput = document.getElementById("sbz-email");
        const passwordInput = document.getElementById("sbz-password");
        const rememberInput = document.getElementById("sbz-remember");
        const forgotLink = document.querySelector(".sbz-forgot-link");
        const credentialsPanel = document.getElementById("sbz-login-credentials");
        const auxPanel = document.getElementById("sbz-login-aux");
        let pendingChallenge = null;
        let pendingLogin = null;

        function setOtpVisible(visible) {
          if (form && form.classList) {
            // Toggle a stable class so CSS can animate panels in/out.
            form.classList.toggle("sbz-login-form--otp", !!visible);
          }
          if (otpPanel) otpPanel.setAttribute("aria-hidden", visible ? "false" : "true");
          if (credentialsPanel) credentialsPanel.setAttribute("aria-hidden", visible ? "true" : "false");
          if (auxPanel) auxPanel.setAttribute("aria-hidden", visible ? "true" : "false");
          if (forgotLink) forgotLink.setAttribute("aria-hidden", visible ? "true" : "false");
          if (submitLabel) submitLabel.textContent = visible ? "Verify code" : "Sign in";
          if (emailInput) emailInput.disabled = visible;
          if (passwordInput) passwordInput.disabled = visible;
          if (rememberInput) rememberInput.disabled = visible;
          if (otpInput) otpInput.disabled = !visible;
          if (otpBackBtn) otpBackBtn.disabled = !visible;
          if (otpResendBtn) otpResendBtn.disabled = !visible;
        }

        function resetOtpMode() {
          pendingChallenge = null;
          pendingLogin = null;
          if (otpInput) otpInput.value = "";
          if (otpMeta) otpMeta.textContent = "Check your email for the code. It expires in 10 minutes.";
          setOtpVisible(false);
        }

        function enterOtpMode(data) {
          pendingChallenge = data && data.challengeId ? String(data.challengeId) : null;
          if (otpMeta) {
            const emailNote = data && data.delivery && data.delivery.maskedEmail ? ` We sent it to ${data.delivery.maskedEmail}.` : "";
            const localNote = data && data.delivery && data.delivery.channel === "local_preview" && data.delivery.previewCode
              ? ` Local development code: ${String(data.delivery.previewCode)}.`
              : "";
            otpMeta.textContent = (data && data.message ? String(data.message) : "Check your email for the code.") + emailNote + localNote + " It expires in 10 minutes.";
          }
          setOtpVisible(true);
          if (otpInput) {
            otpInput.focus();
            otpInput.select();
          }
        }

        if (form) {
          async function attemptLogin(forceLogoutExisting) {
            const passwordValue = passwordInput ? passwordInput.value : "";
            const email = emailInput ? emailInput.value.trim() : "";
            const rememberDevice = !!(rememberInput && rememberInput.checked);

            if (!email || !passwordValue) {
              setStatus(statusEl, "Email and password are required.", "#ff6b6b");
              return;
            }

            pendingLogin = { email, password: passwordValue, rememberDevice, forceLogoutExisting: !!forceLogoutExisting };
            setStatus(statusEl, "Signing in...", "#adb5bd");

            try {
              const resp = await apiLogin(email, passwordValue, rememberDevice, forceLogoutExisting);
              let data = {};
              try { data = await resp.json(); } catch (_ignore) { data = {}; }

              if (resp.status === 409 && data && data.code === "ACTIVE_SESSION_EXISTS") {
                showForceLogoutAction(statusEl, async function () {
                  setStatus(statusEl, "Forcing sign out on other device...", "#adb5bd");
                  await attemptLogin(true);
                });
                return;
              }

              if (resp.status === 202 && data && data.code === "TWO_FACTOR_REQUIRED") {
                enterOtpMode(data);
                setStatus(statusEl, "Verification code sent. Check your email.", "#51cf66");
                return;
              }

              if (!resp.ok) {
                resetOtpMode();
                clearSession();
                setStatus(statusEl, data.error || "Login failed.", "#ff6b6b");
                return;
              }

              if (!data || !data.sessionId) {
                resetOtpMode();
                clearSession();
                setStatus(
                  statusEl,
                  "Login succeeded but session was not created. Please contact support.",
                  "#ff6b6b"
                );
                return;
              }

              resetOtpMode();
              setSession(data.sessionId);
              getOrCreateDeviceId(rememberDevice);
              setStatus(statusEl, "Login successful. Redirecting...", "#51cf66");
              goToDashboard();
            } catch (err) {
              resetOtpMode();
              clearSession();
              setStatus(statusEl, "Network error. Please try again.", "#ff6b6b");
            }
          }

          async function attemptVerify(forceLogoutExisting) {
            if (!pendingChallenge) {
              setStatus(statusEl, "Please sign in again to receive a new code.", "#ff6b6b");
              resetOtpMode();
              return;
            }

            const code = otpInput ? otpInput.value.trim().toUpperCase() : "";
            if (!code) {
              setStatus(statusEl, "Enter the verification code from your email.", "#ff6b6b");
              return;
            }

            setStatus(statusEl, "Verifying code...", "#adb5bd");

            try {
              const resp = await apiVerifyLogin(pendingChallenge, code, forceLogoutExisting);
              let data = {};
              try { data = await resp.json(); } catch (_ignore) { data = {}; }

              if (!resp.ok) {
                setStatus(statusEl, data.error || "Verification failed.", "#ff6b6b");
                if (resp.status === 410) {
                  resetOtpMode();
                }
                return;
              }

              if (!data || !data.sessionId) {
                resetOtpMode();
                clearSession();
                setStatus(statusEl, "Verification succeeded but session was not created.", "#ff6b6b");
                return;
              }

              resetOtpMode();
              setSession(data.sessionId);
              if (pendingLogin && pendingLogin.rememberDevice) {
                getOrCreateDeviceId(true);
              }
              setStatus(statusEl, "Login successful. Redirecting...", "#51cf66");
              goToDashboard();
            } catch (err) {
              setStatus(statusEl, "Network error. Please try again.", "#ff6b6b");
            }
          }

          if (otpBackBtn) {
            otpBackBtn.addEventListener("click", function () {
              resetOtpMode();
              setStatus(statusEl, "Return to your password and sign in again.", "#adb5bd");
            });
          }

          if (otpResendBtn) {
            otpResendBtn.addEventListener("click", async function () {
              if (!pendingLogin) {
                setStatus(statusEl, "Enter your password again to request a new code.", "#ff6b6b");
                resetOtpMode();
                return;
              }
              if (otpResendBtn instanceof HTMLButtonElement) otpResendBtn.disabled = true;
              setStatus(statusEl, "Sending a new code...", "#adb5bd");
              try {
              const resp = await apiLogin(pendingLogin.email, pendingLogin.password, pendingLogin.rememberDevice, pendingLogin.forceLogoutExisting);
                let data = {};
                try { data = await resp.json(); } catch (_ignore) { data = {}; }
                if (resp.status === 202 && data && data.code === "TWO_FACTOR_REQUIRED") {
                  enterOtpMode(data);
                  setStatus(statusEl, "A new verification code was sent.", "#51cf66");
                  return;
                }
                if (!resp.ok) {
                  resetOtpMode();
                  setStatus(statusEl, data.error || "Unable to send a new code.", "#ff6b6b");
                  return;
                }
                if (data && data.sessionId) {
                  resetOtpMode();
                  setSession(data.sessionId);
                  if (pendingLogin.rememberDevice) {
                    getOrCreateDeviceId(true);
                  }
                  setStatus(statusEl, "Login successful. Redirecting...", "#51cf66");
                  goToDashboard();
                }
              } finally {
                if (otpResendBtn instanceof HTMLButtonElement) otpResendBtn.disabled = false;
              }
            });
          }

          form.addEventListener("submit", async function (e) {
            e.preventDefault();
            if (form.classList.contains("sbz-login-form--otp")) {
              await attemptVerify(!!(pendingLogin && pendingLogin.forceLogoutExisting));
              return;
            }
            await attemptLogin(false);
          });
        }

        resetOtpMode();
      }
  
      // ─────────────────────────────────────────────
      // 2) Front-end protection for dashboard page + load summary
      // ─────────────────────────────────────────────
      if (isDashboardPage) {
        if (!hasSession()) {
          redirectToLogin();
          return;
        }
        setupDashboardLiveRefresh(isDashboardPage);
        loadCurrentUserSummary();
        loadDashboardHomeSummary();
        loadDashboardPaySummary();
      }
  
      // ─────────────────────────────────────────────
      // 3) Logout: call Node /auth/logout, clear session, redirect
      // ─────────────────────────────────────────────
      const logoutLink =
        document.querySelector("[data-sbz-logout]") ||
        document.querySelector(".sbz-topbar__logout");
  
      if (logoutLink) {
        logoutLink.addEventListener("click", async function (e) {
          e.preventDefault();
  
          const sessionId = getSessionId();
  
          // Clear local session immediately (prevents bfcache restore showing dashboard)
          clearSession();
  
          // Best-effort server logout
          if (sessionId) {
            await apiLogout(sessionId);
          }
  
          redirectToLogin();
        });
      }
  
      // ─────────────────────────────────────────────
      // 4) Time Center: simple front-end timer
      // ─────────────────────────────────────────────
      (function setupTimeCenter() {
        const timeCenter = document.querySelector(".sbz-time-center");
        if (!timeCenter) return;

        const CLOCK_KEY = "sbzStaffClockState";
        const statusEl = document.getElementById("sbz-clock-status");
        const timerEl = document.getElementById("sbz-clock-timer");
        const toggleBtn = document.getElementById("sbz-clock-toggle");
        let intervalId = null;
  
        function loadState() {
          try {
            const raw = window.sessionStorage.getItem(CLOCK_KEY);
            return raw ? JSON.parse(raw) : { status: "OUT", startedAt: null };
          } catch {
            return { status: "OUT", startedAt: null };
          }
        }
  
        function saveState(state) {
          try {
            window.sessionStorage.setItem(CLOCK_KEY, JSON.stringify(state));
          } catch {
            // ignore
          }
        }
  
        function formatDuration(ms) {
          if (!ms || ms < 0) ms = 0;
          const totalSeconds = Math.floor(ms / 1000);
          const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
          const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
          const seconds = String(totalSeconds % 60).padStart(2, "0");
          return `${hours}:${minutes}:${seconds}`;
        }
  
        function updateUI(state) {
          if (!statusEl || !timerEl || !toggleBtn) return;
  
          if (state.status === "IN") {
            statusEl.textContent = "On the clock";
            toggleBtn.textContent = "Clock Out";
          } else {
            statusEl.textContent = "Off the clock";
            toggleBtn.textContent = "Clock In";
            timerEl.textContent = "00:00:00";
          }
        }
  
        function startTimer(state) {
          if (!timerEl) return;
  
          if (intervalId) window.clearInterval(intervalId);
          if (state.status !== "IN" || !state.startedAt) {
            timerEl.textContent = "00:00:00";
            return;
          }
          const startMs = new Date(state.startedAt).getTime();
          intervalId = window.setInterval(() => {
            timerEl.textContent = formatDuration(Date.now() - startMs);
          }, 1000);
        }
  
        let state = loadState();
        updateUI(state);
        startTimer(state);

        if (toggleBtn) {
          toggleBtn.disabled = true;
          toggleBtn.setAttribute("aria-disabled", "true");
          toggleBtn.textContent = "Clock controls handled by server";
          toggleBtn.title = "The Node portal owns time entry writes.";
        }
      })();

      (function setupPayCenter() {
        const payCenter = document.querySelector(".sbz-pay");
        if (!payCenter) return;

        const payTypeEl = document.getElementById("sbz-pay-type");
        const baseRateEl = document.getElementById("sbz-pay-base-rate");
        const frequencyEl = document.getElementById("sbz-pay-frequency");
        const nextDateEl = document.getElementById("sbz-pay-next-date");
        const historyEl = document.getElementById("sbz-pay-history");
        const benefitsEl = document.getElementById("sbz-benefits-list");
        const latestSummaryEl = document.getElementById("sbz-pay-latest-summary");
        const emailNoteEl = document.getElementById("sbz-pay-email-note");

        function formatMoney(value, currencyCode) {
          try {
            return new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: String(currencyCode || "USD").toUpperCase()
            }).format(Number(value || 0));
          } catch (_err) {
            return String(value || "0");
          }
        }

        function formatDate(value) {
          if (!value) return "—";
          const date = new Date(value);
          if (Number.isNaN(date.getTime())) return "—";
          return date.toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric"
          });
        }

        function statusClass(status) {
          const upper = String(status || "").toUpperCase();
          if (upper === "PAID") return "sbz-pay-status sbz-pay-status--paid";
          if (upper === "DRAFT") return "sbz-pay-status sbz-pay-status--draft";
          return "sbz-pay-status";
        }

        function clearPaySummary() {
          if (payTypeEl) payTypeEl.textContent = "";
          if (baseRateEl) baseRateEl.textContent = "";
          if (frequencyEl) frequencyEl.textContent = "";
          if (nextDateEl) nextDateEl.textContent = "";
          if (latestSummaryEl) {
            latestSummaryEl.innerHTML =
              "<strong>Latest payout</strong><span>Secure payroll data is temporarily unavailable.</span>";
          }
          if (historyEl) {
            historyEl.innerHTML = `
              <tr class="sbz-pay-history__emptyRow">
                <td colspan="5">
                  <div class="sbz-pay-emptyState">
                    <span class="sbz-pay-emptyState__kicker">Live payroll</span>
                    <strong class="sbz-pay-emptyState__title">Payroll data could not be loaded right now.</strong>
                    <span class="sbz-pay-emptyState__meta">The browser will keep the safe unavailable state until the backend responds again.</span>
                  </div>
                </td>
              </tr>`;
          }
          if (benefitsEl) {
            benefitsEl.innerHTML = `
              <li class="sbz-pay-benefits__empty">
                <div class="sbz-pay-emptyState">
                  <span class="sbz-pay-emptyState__kicker">Live benefits</span>
                        <strong class="sbz-pay-emptyState__title">No benefits summary is available right now.</strong>
                        <span class="sbz-pay-emptyState__meta">The secure payroll profile keeps this view in sync when it returns benefits data.</span>
                </div>
              </li>`;
          }
        }

        async function loadPay() {
          const sessionId = getSessionId();
          if (!sessionId) return;

          clearPaySummary();

          try {
            const res = await apiPaySummary(sessionId);
            if (!res.ok) {
              throw new Error("pay_unavailable");
            }

            const json = await res.json();
            const profile = json.profile || null;
            const paystubs = Array.isArray(json.paystubs) ? json.paystubs : [];
            const latest = paystubs.length ? paystubs[0] : null;

            if (payTypeEl) payTypeEl.textContent = profile && profile.payType ? profile.payType : "Not set";
            if (baseRateEl) baseRateEl.textContent = profile && profile.baseRateDisplay ? profile.baseRateDisplay : "Not set";
            if (frequencyEl) frequencyEl.textContent = profile && profile.payFrequency ? profile.payFrequency : "Not set";
            if (nextDateEl) nextDateEl.textContent = profile && profile.nextPayDate ? formatDate(profile.nextPayDate) : "Not scheduled";

            if (latestSummaryEl) {
              if (latest) {
                latestSummaryEl.innerHTML =
                  "<strong>Latest payout</strong>" +
                  "<span>" + formatMoney(latest.netPay, latest.currencyCode) + " net on " + formatDate(latest.payDate) + "</span>";
              } else {
                latestSummaryEl.innerHTML =
                  "<strong>Latest payout</strong><span>No payroll records have been posted right now.</span>";
              }
            }

            if (emailNoteEl) {
              if (latest && latest.emailedAt) {
                emailNoteEl.textContent = "A pay summary email was sent for your latest posted payroll record.";
              } else {
                emailNoteEl.textContent = "When HR posts a paid record, they can automatically email your pay summary too.";
              }
            }

            if (historyEl) {
              if (!paystubs.length) {
                historyEl.innerHTML = `
                  <tr class="sbz-pay-history__emptyRow">
                    <td colspan="5">
                      <div class="sbz-pay-emptyState">
                        <span class="sbz-pay-emptyState__kicker">Live payroll</span>
                        <strong class="sbz-pay-emptyState__title">No payroll history is available right now.</strong>
                        <span class="sbz-pay-emptyState__meta">The secure payroll service is available right now and populates this view once it returns paid records.</span>
                      </div>
                    </td>
                  </tr>`;
              } else {
                historyEl.innerHTML = paystubs.map(function (stub) {
                  const period = formatDate(stub.payPeriodStart) + " - " + formatDate(stub.payPeriodEnd);
                  const href = API_BASE + (stub.downloadUrl || "");
                  return (
                    "<tr>" +
                      "<td>" + period + "</td>" +
                      "<td>" + formatMoney(stub.grossPay, stub.currencyCode) + "</td>" +
                      "<td>" + formatMoney(stub.netPay, stub.currencyCode) + "</td>" +
                      '<td><span class="' + statusClass(stub.status) + '">' + String(stub.status || "—") + "</span></td>" +
                      '<td><a class="sbz-pay-download" href="' + href + '">Download</a></td>' +
                    "</tr>"
                  );
                }).join("");
              }
            }

            if (benefitsEl) {
              const benefits = profile && Array.isArray(profile.benefitsSummary) ? profile.benefitsSummary : [];
              if (!benefits.length) {
                benefitsEl.innerHTML = `
                  <li class="sbz-pay-benefits__empty">
                    <div class="sbz-pay-emptyState">
                      <span class="sbz-pay-emptyState__kicker">Live benefits</span>
                      <strong class="sbz-pay-emptyState__title">No benefits summary is available right now.</strong>
                      <span class="sbz-pay-emptyState__meta">The secure payroll profile keeps this view in sync when it returns benefits data.</span>
                    </div>
                  </li>`;
              } else {
                benefitsEl.innerHTML = benefits.map(function (benefit) {
                  return '<li><span class="sbz-benefits-label">Coverage</span><span class="sbz-benefits-value">' + String(benefit) + "</span></li>";
                }).join("");
              }
            }
          } catch (err) {
            clearPaySummary();
          }
        }

        void loadPay();
      })();
  
      // ─────────────────────────────────────────────
      // 5) Notifications: open/close bottom sheet
      // ─────────────────────────────────────────────
      (function setupNotifications() {
        const trigger = document.getElementById("sbz-notify-trigger");
        const overlay = document.getElementById("sbz-notify-overlay");
        const backdrop = document.getElementById("sbz-notify-backdrop");
        const closeBtn = document.getElementById("sbz-notify-close");
        const refreshBtn = document.getElementById("sbz-notify-refresh");
        const markAllBtn = document.getElementById("sbz-notify-mark-read");
        const statusEl = document.getElementById("sbz-notify-status");
        const dot = document.getElementById("sbz-notify-dot");
        const list = document.getElementById("sbz-notify-list");
        const panel = overlay.querySelector(".sbz-notify-panel");
        const bodyEl = overlay.querySelector(".sbz-notify-panel__body");
        const isLoginPage = !!document.querySelector(".sbz-login-wrapper");
        const closeSelector = "#sbz-notify-close, #sbz-notify-backdrop";
        let unreadTotal = 0;

        if (!trigger || !overlay) return;

        if (isLoginPage) {
          trigger.hidden = true;
          overlay.classList.remove("is-open");
          overlay.setAttribute("aria-hidden", "true");
          resetNotificationsUi();
          return;
        }

        function resetNotificationsUi() {
          unreadTotal = 0;
          overlay.classList.remove("is-open");
          overlay.setAttribute("aria-hidden", "true");
          trigger.setAttribute("aria-expanded", "false");
          if (dot) {
            dot.textContent = "0";
            dot.hidden = true;
            dot.classList.remove("sbz-notify-dot--pulse");
          }
          if (statusEl) {
            statusEl.textContent = "No notifications loaded.";
          }
          if (markAllBtn) {
            markAllBtn.disabled = true;
          }
          if (list) {
            list.innerHTML =
              '<li class="sbz-notify-item sbz-notify-item--system">' +
              '<div class="sbz-notify-item__badge">System</div>' +
              '<div class="sbz-notify-item__content">' +
              '<h3>No notifications are available right now</h3>' +
              '<p>Your real task, HR, payroll, and chat notifications are available right now after sign-in.</p>' +
              '<div class="sbz-notify-item__meta"><span>Waiting for session</span></div>' +
              "</div></li>";
          }
        }

        if (!hasSession()) {
          trigger.hidden = true;
          resetNotificationsUi();
          return;
        }

        trigger.hidden = false;

        function escapeHtml(value) {
          return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
        }

        function timeAgo(value) {
          const date = new Date(value);
          if (Number.isNaN(date.getTime())) return "Recently";
          const diffMs = Date.now() - date.getTime();
          const diffMin = Math.max(1, Math.floor(diffMs / 60000));
          if (diffMin < 60) return diffMin + " min ago";
          const diffHr = Math.floor(diffMin / 60);
          if (diffHr < 24) return diffHr + " hr ago";
          const diffDay = Math.floor(diffHr / 24);
          return diffDay + " day" + (diffDay === 1 ? "" : "s") + " ago";
        }

        function badgeLabel(type) {
          const normalized = String(type || "").toUpperCase();
          if (normalized === "TASK" || normalized.indexOf("TASK_") === 0) return "Task";
          if (type === "announcement") return "News";
          return "System";
        }

        function badgeClass(type) {
          const normalized = String(type || "").toUpperCase();
          if (normalized === "TASK" || normalized.indexOf("TASK_") === 0) return "sbz-notify-item--task";
          if (type === "announcement") return "sbz-notify-item--news";
          return "sbz-notify-item--system";
        }

        function buildFallbackNotificationsFromDashboard(payload) {
          const items = [];
          const alerts = Array.isArray(payload?.alerts) ? payload.alerts : [];

          alerts.forEach(function (alert) {
            items.push({
              id: String(alert.id || alert.title || "dashboard-alert"),
              type: alert.tone === "critical" ? "TASK_CRITICAL" : alert.tone === "warning" ? "TASK_OVERDUE" : "announcement",
              title: alert.title || "Dashboard alert",
              body: alert.body || "Attention is required.",
              linkUrl: alert.actionHref || null,
              isRead: false,
              createdAt: alert.createdAt || new Date().toISOString(),
            });
          });

          const taskCounts = payload?.summary?.taskCounts || payload?.summary?.tasks || {};
          const overdueCount = Number(taskCounts.overdue || 0);
          if (overdueCount > 0 && !items.some(function (item) { return String(item.type || "").toUpperCase().indexOf("TASK_") === 0; })) {
            items.unshift({
              id: "dashboard-overdue-tasks",
              type: "TASK_OVERDUE",
              title: overdueCount === 1
                ? "1 overdue task"
                : overdueCount + " overdue tasks",
              body: "Your dashboard shows overdue work that needs attention.",
              linkUrl: "/staff-tasks/",
              isRead: false,
              createdAt: new Date().toISOString(),
            });
          }

          return items;
        }

        async function markNotificationRead(notificationId) {
          const sessionId = getSessionId();
          if (!sessionId || !notificationId) return;

          const response = await fetchJson("/api/notifications/" + encodeURIComponent(String(notificationId)) + "/read", {
            method: "POST",
          });

          if (!response.ok) {
            throw new Error(response.error || "Failed to mark notification as read.");
          }

          return response;
        }

        function renderNotifications(items, unreadCount) {
          unreadTotal = Math.max(0, Number(unreadCount || 0));
          if (dot) {
            if (unreadTotal > 0) {
              dot.textContent = String(unreadTotal > 99 ? "99+" : unreadTotal);
              dot.hidden = false;
              dot.classList.add("sbz-notify-dot--pulse");
            } else {
              dot.textContent = "0";
              dot.hidden = true;
              dot.classList.remove("sbz-notify-dot--pulse");
            }
          }

          if (statusEl) {
            statusEl.textContent = unreadTotal > 0
              ? unreadTotal + " unread notification" + (unreadTotal === 1 ? "" : "s")
              : "All notifications are read.";
          }
          if (markAllBtn) {
            markAllBtn.disabled = unreadTotal === 0;
          }

          if (!list) return;

          if (!items || items.length === 0) {
            list.innerHTML =
              '<li class="sbz-notify-item sbz-notify-item--system">' +
              '<div class="sbz-notify-item__badge">System</div>' +
              '<div class="sbz-notify-item__content">' +
              '<h3>No notifications are available right now</h3>' +
              '<p>Updates from tasks, announcements, and chat alerts are available right now.</p>' +
              '<div class="sbz-notify-item__meta"><span>Up to date</span></div>' +
              "</div></li>";
            return;
          }

          list.innerHTML = items.map(function (item) {
            const unreadClass = item.isRead ? "" : " sbz-notify-item--unread";
            const href = item.linkUrl ? escapeHtml(item.linkUrl) : "#";
            const linkHtml = item.linkUrl
              ? '<a href="' + href + '" class="sbz-notify-link" data-notification-id="' + escapeHtml(item.id) + '">Open →</a>'
              : "";

            return (
              '<li class="sbz-notify-item ' + badgeClass(item.type) + unreadClass + '" data-notification-id="' + escapeHtml(item.id) + '" data-notification-read="' + (item.isRead ? "1" : "0") + '">' +
                '<div class="sbz-notify-item__badge">' + escapeHtml(badgeLabel(item.type)) + "</div>" +
                '<div class="sbz-notify-item__content">' +
                  "<h3>" + escapeHtml(item.title || "Notification") + "</h3>" +
                  "<p>" + escapeHtml(item.body || "") + "</p>" +
                  '<div class="sbz-notify-item__meta">' +
                    "<span>" + escapeHtml(timeAgo(item.createdAt)) + "</span>" +
                    linkHtml +
                  "</div>" +
                "</div>" +
              "</li>"
            );
          }).join("");
        }

        async function loadNotifications() {
          const sessionId = getSessionId();
          if (!sessionId) {
            trigger.hidden = true;
            resetNotificationsUi();
            return;
          }

          try {
            const res = await apiNotifications(sessionId);
            if (res.status === 401 || res.status === 403) {
              trigger.hidden = true;
              resetNotificationsUi();
              return;
            }
            if (!res.ok) return;
            const json = await res.json();
            const notifications = Array.isArray(json.notifications) ? json.notifications : [];
            const unreadCount = Number(json.unreadCount || 0);

            if (notifications.length > 0) {
              renderNotifications(notifications, unreadCount);
              return;
            }

            try {
              const dashboardRes = await fetchJson("/api/dashboard/home");
              if (dashboardRes.ok && dashboardRes.payload) {
                const fallbackItems = buildFallbackNotificationsFromDashboard(dashboardRes.payload);
                if (fallbackItems.length > 0) {
                  renderNotifications(fallbackItems, Math.max(unreadCount, fallbackItems.length));
                  return;
                }
              }
            } catch (fallbackErr) {
              console.warn("Dashboard fallback notifications unavailable", fallbackErr);
            }

            renderNotifications([], unreadCount);
          } catch (err) {
            console.warn("Notifications unavailable", err);
            if (statusEl) {
              statusEl.textContent = "Notifications are temporarily unavailable.";
            }
          }
        }

        async function openNotifications() {
          overlay.classList.add("is-open");
          trigger.setAttribute("aria-expanded", "true");
          overlay.setAttribute("aria-hidden", "false");
          document.body.classList.add("sbz-notify-open");
          if (dot) dot.classList.remove("sbz-notify-dot--pulse");
          try {
            const sessionId = getSessionId();
            if (sessionId) {
              await loadNotifications();
              if (unreadTotal > 0) {
                await apiReadAllNotifications(sessionId);
                await loadNotifications();
              }
            }
          } catch (err) {
            console.warn("Failed to mark notifications as read", err);
          }
        }
  
        function closeNotifications() {
          overlay.classList.remove("is-open");
          trigger.setAttribute("aria-expanded", "false");
          overlay.setAttribute("aria-hidden", "true");
          document.body.classList.remove("sbz-notify-open");
        }
  
        trigger.addEventListener("click", () => {
          const isOpen = overlay.classList.contains("is-open");
          if (isOpen) closeNotifications();
          else void openNotifications();
        });
  
        if (backdrop) {
          backdrop.addEventListener("click", closeNotifications);
          backdrop.addEventListener("pointerdown", closeNotifications);
        }
        if (closeBtn) {
          closeBtn.addEventListener("click", function (event) {
            event.preventDefault();
            event.stopPropagation();
            closeNotifications();
          });
          closeBtn.addEventListener("pointerdown", function (event) {
            event.preventDefault();
            event.stopPropagation();
            closeNotifications();
          });
        }
        if (refreshBtn) refreshBtn.addEventListener("click", () => void loadNotifications());
        if (markAllBtn) {
          markAllBtn.addEventListener("click", async () => {
            const sessionId = getSessionId();
            if (!sessionId) return;
            try {
              await apiReadAllNotifications(sessionId);
              await loadNotifications();
            } catch (err) {
              console.warn("Failed to mark notifications as read", err);
            }
          });
        }

        overlay.addEventListener("click", function (event) {
          const target = event.target && event.target.closest ? event.target.closest(closeSelector) : null;
          if (!target) return;
          event.preventDefault();
          event.stopPropagation();
          closeNotifications();
        });

        if (panel && bodyEl) {
          panel.addEventListener("wheel", function (event) {
            if (!overlay.classList.contains("is-open")) return;
            const canScroll = bodyEl.scrollHeight > bodyEl.clientHeight;
            if (!canScroll) return;
            bodyEl.scrollTop += event.deltaY;
            event.preventDefault();
          }, { passive: false });
        }

        if (list) {
          list.addEventListener("click", async function (event) {
            const target = event.target && event.target.closest ? event.target.closest(".sbz-notify-link, .sbz-notify-item") : null;
            if (!target || !list.contains(target)) return;

            const notificationId = String(target.getAttribute("data-notification-id") || "").trim();
            const href = target.getAttribute("href");
            const isLink = target.classList && target.classList.contains("sbz-notify-link");

            if (!notificationId) return;

            if (isLink && href) {
              event.preventDefault();
            }

            try {
              await markNotificationRead(notificationId);
              await loadNotifications();
            } catch (err) {
              console.warn("Failed to mark notification as read", err);
            }

            if (isLink && href) {
              window.location.href = href;
            }
          });
        }

        document.addEventListener("keydown", (e) => {
          if (e.key === "Escape") closeNotifications();
        });

        void loadNotifications();
      })();

      (function setupPresenceHeartbeat() {
        if (!isStaffPath()) return;

        let timerId = null;

        async function beat() {
          const sessionId = getSessionId();
          if (!sessionId) return;
          try {
            await apiPresenceHeartbeat(sessionId);
          } catch (_err) {
            // Presence should never break the page.
          }
        }

        function start() {
          if (timerId) window.clearInterval(timerId);
          void beat();
          timerId = window.setInterval(beat, 60000);
        }

        start();

        document.addEventListener("visibilitychange", function () {
          if (document.visibilityState === "visible") {
            void beat();
          }
        });
      })();
    });
  
    // ─────────────────────────────────────────────
    // bfcache guard (Safari/Firefox):
    // - If restored from back/forward cache after logout, re-check token server-side.
    // ─────────────────────────────────────────────
    window.addEventListener("pageshow", function () {
      if (!isStaffPath()) return;
  
      if (!hasSession()) {
        redirectToLogin();
        return;
      }
  
      authGuard();
    });
  })();
  
