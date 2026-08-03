(function () {
    const modal = document.getElementById("sbz-sub-modal");
    if (!modal || !window.SBZSubModal) return;
  
    const formStep = modal.querySelector(".sbz-step-form");
    const successStep = modal.querySelector(".sbz-step-success");
    const form = modal.querySelector("#sbz-subscribe-form");
    const msg = modal.querySelector(".sbz-message");
    const openInbox = modal.querySelector(".sbz-open-inbox");
  
    const hlEl = modal.querySelector(".sbz-hl");
    const bodyEl = modal.querySelector(".sbz-body");
    const ctaEl = modal.querySelector(".sbz-cta");
    const noBtn = modal.querySelector(".sbz-no");
  
    const channel = (SBZSubModal.channel || modal.dataset.channel || "insights").toLowerCase();
    const delayMs = Number(SBZSubModal.delayMs || 10000);
  
    const cooldownHoursClose = Number(SBZSubModal.cooldownHoursClose || 24);
    const cooldownDaysNo = Number(SBZSubModal.cooldownDaysNo || 7);
    const cooldownDaysSubmit = Number(SBZSubModal.cooldownDaysSubmit || 30);
  
    // Tracking config
    const trackingEnabled = Number(SBZSubModal.trackingEnabled || 0) === 1;
    const trackingSamplePct = Math.max(0, Math.min(100, Number(SBZSubModal.trackingSamplePct || 100)));
    const trackAction = String(SBZSubModal.trackAction || "sbz_log_modal_event");
  
    // ---- Safe storage (localStorage -> cookie fallback; Safari Private safe) ----
    function cookieSet(name, value, ms) {
      try {
        const d = new Date(Date.now() + (ms || 0));
        document.cookie =
          `${encodeURIComponent(name)}=${encodeURIComponent(String(value))}; ` +
          `expires=${d.toUTCString()}; path=/; SameSite=Lax`;
      } catch (_) {}
    }
    function cookieGet(name) {
      try {
        const n = encodeURIComponent(name) + "=";
        const parts = (document.cookie || "").split(";").map(s => s.trim());
        for (const p of parts) {
          if (p.indexOf(n) === 0) return decodeURIComponent(p.slice(n.length));
        }
      } catch (_) {}
      return null;
    }
    const storage = (() => {
      try {
        const k = "__sbz_ls_test__";
        window.localStorage.setItem(k, "1");
        window.localStorage.removeItem(k);
        return {
          get: (key) => window.localStorage.getItem(key),
          set: (key, val) => window.localStorage.setItem(key, String(val)),
          remove: (key) => window.localStorage.removeItem(key),
        };
      } catch (_) {
        return {
          get: (key) => cookieGet(key),
          set: (key, val) => cookieSet(key, val, 365 * 24 * 60 * 60 * 1000),
          remove: (key) => cookieSet(key, "", 0),
        };
      }
    })();
  
    // ---- Validate ajax URL (prevents Safari "string did not match expected pattern") ----
    const rawAjaxUrl = String(SBZSubModal.ajaxurl || "");
    let ajaxUrl = "";
    try {
      ajaxUrl = new URL(rawAjaxUrl, window.location.href).toString();
    } catch (e) {
      console.error("SBZ modal: invalid ajaxurl", rawAjaxUrl, e);
      return;
    }
  
    // Per-channel storage keys
    const keySubscribed = `sbz_modal_subscribed:${channel}`;
    const keyHideUntil = `sbz_modal_hide_until:${channel}`;
    const keySubmitUntil = `sbz_modal_submitted_until:${channel}`;
  
    // Session "human" signal (best-effort)
    const keyHuman = "sbz_modal_human_session";
  
    function nowMs() { return Date.now(); }
    function setUntil(key, ms) { storage.set(key, String(ms)); }
    function getUntil(key) { return Number(storage.get(key) || "0"); }
  
    function isSuppressed() {
      const t = nowMs();
      if ((storage.get(keySubscribed) || "") === "1") return true;
      if (getUntil(keyHideUntil) > t) return true;
      if (getUntil(keySubmitUntil) > t) return true;
      return false;
    }
  
    function randHex(bytes) {
      try {
        const arr = new Uint8Array(bytes);
        (window.crypto || window.msCrypto).getRandomValues(arr);
        return Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
      } catch (_) {
        let s = "";
        for (let i = 0; i < bytes; i++) s += Math.floor(Math.random() * 256).toString(16).padStart(2, "0");
        return s;
      }
    }
  
    // Visitor id (no PII)
    const vidKey = "sbz_modal_vid";
    let vid = storage.get(vidKey);
    if (!vid) {
      vid = randHex(16);
      try { storage.set(vidKey, vid); } catch (_) {}
    }
  
    // Impression id (per modal open)
    let imp = "";
  
    // Sampling (client-side best-effort; server also samples)
    const sampledIn = (function () {
      if (!trackingEnabled) return false;
      if (trackingSamplePct >= 100) return true;
      const r = Math.floor(Math.random() * 100) + 1;
      return r <= trackingSamplePct;
    })();
  
    function isHuman() {
      try { return sessionStorage.getItem(keyHuman) === "1"; } catch (_) { return false; }
    }
  
    function markHumanOnce() {
      try {
        if (sessionStorage.getItem(keyHuman) === "1") return;
        sessionStorage.setItem(keyHuman, "1");
      } catch (_) {}
      logEvent("human_first", { reason: "gesture" });
    }
  
    // Listen for real user gestures
    const humanEvents = ["pointerdown", "keydown", "scroll", "touchstart", "mousemove"];
    let humanListenerArmed = false;
    function armHumanListeners() {
      if (humanListenerArmed) return;
      humanListenerArmed = true;
  
      const onHuman = () => {
        markHumanOnce();
        humanEvents.forEach(ev => {
          try { document.removeEventListener(ev, onHuman, { passive: true }); } catch (_) {}
          try { document.removeEventListener(ev, onHuman); } catch (_) {}
        });
      };
  
      humanEvents.forEach(ev => {
        try { document.addEventListener(ev, onHuman, { passive: true }); }
        catch (_) { document.addEventListener(ev, onHuman); }
      });
    }
    armHumanListeners();
  
    function guessInboxUrl(email) {
      if (!email || typeof email !== "string") return "";
      const domain = (email.split("@")[1] || "").toLowerCase().trim();
      if (!domain) return "";
      if (domain === "gmail.com" || domain === "googlemail.com") return "https://mail.google.com/";
      if (domain === "outlook.com" || domain === "hotmail.com" || domain === "live.com") return "https://outlook.live.com/mail/";
      if (domain === "yahoo.com") return "https://mail.yahoo.com/";
      if (domain === "icloud.com" || domain === "me.com" || domain === "mac.com") return "https://www.icloud.com/mail/";
      return "";
    }
  
    function showSuccess(email) {
      formStep.hidden = true;
      successStep.hidden = false;
  
      const providerUrl = guessInboxUrl(email);
      if (providerUrl) {
        openInbox.href = providerUrl;
        openInbox.hidden = false;
      } else {
        openInbox.hidden = true;
      }
    }
  
    // Apply admin-configured copy
    try {
      const copy = SBZSubModal.copy || {};
      if (hlEl && copy.headline) hlEl.textContent = copy.headline;
      if (bodyEl && copy.body) bodyEl.textContent = copy.body;
      if (ctaEl && copy.cta) ctaEl.textContent = copy.cta;
    } catch (_) {}
  
    // --- Tracking transport (privacy-safe: no email) ---
    function postBodyParams(eventName, extra) {
      const params = new URLSearchParams();
      params.set("action", trackAction);
      params.set("nonce", String(SBZSubModal.nonce || "")); // MU can ignore; server should verify its own nonce if it uses this
      params.set("channel", channel);
      params.set("event", eventName);
  
      params.set("human", isHuman() ? "1" : "0");
      params.set("vid", String(vid || ""));
      params.set("imp", String(imp || ""));
  
      try { params.set("page_url", String(window.location.href || "")); } catch (_) {}
      try { params.set("ref", String(document.referrer || "")); } catch (_) {}
  
      if (extra && typeof extra === "object") {
        if (extra.reason) params.set("reason", String(extra.reason).slice(0, 80));
      }
  
      return params;
    }
  
    function sendViaBeacon(params) {
      try {
        if (!navigator.sendBeacon) return false;
        const blob = new Blob([params.toString()], { type: "application/x-www-form-urlencoded;charset=UTF-8" });
        return navigator.sendBeacon(ajaxUrl, blob);
      } catch (_) {
        return false;
      }
    }
  
    function sendViaFetch(params) {
      return fetch(ajaxUrl, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: params.toString(),
        keepalive: true
      }).catch(() => {});
    }
  
    function logEvent(eventName, extra) {
      if (!trackingEnabled || !sampledIn) return;
      if (!eventName) return;
  
      if (!imp && (eventName.startsWith("modal_") || eventName === "human_first")) {
        imp = randHex(16);
      }
  
      const params = postBodyParams(eventName, extra);
  
      const ok = sendViaBeacon(params);
      if (!ok) sendViaFetch(params);
    }
  
    function openModal() {
      modal.setAttribute("aria-hidden", "false");
      document.body.classList.add("sbz-modal-open");
  
      imp = randHex(16);
      logEvent("modal_shown");
    }
  
    function closeModal() {
      modal.setAttribute("aria-hidden", "true");
      document.body.classList.remove("sbz-modal-open");
    }
  
    // Close actions
    modal.addEventListener("click", (e) => {
      const isCloseBtn = e.target && e.target.classList && e.target.classList.contains("sbz-close");
      const isBackdrop = e.target === modal;
  
      if (isCloseBtn || isBackdrop) {
        const until = nowMs() + cooldownHoursClose * 60 * 60 * 1000;
        setUntil(keyHideUntil, until);
  
        logEvent("modal_closed", { reason: isBackdrop ? "backdrop" : "close_btn" });
        closeModal();
      }
    });
  
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modal.getAttribute("aria-hidden") === "false") {
        const until = nowMs() + cooldownHoursClose * 60 * 60 * 1000;
        setUntil(keyHideUntil, until);
  
        logEvent("modal_closed", { reason: "escape" });
        closeModal();
      }
    });
  
    if (noBtn) {
      noBtn.addEventListener("click", () => {
        const until = nowMs() + cooldownDaysNo * 24 * 60 * 60 * 1000;
        setUntil(keyHideUntil, until);
  
        logEvent("modal_no_thanks", { reason: "no_thanks" });
        closeModal();
      });
    }
  
    // Delay-open only if not suppressed and tab stays visible
    let timer = null;
  
    function arm() {
      if (timer || isSuppressed()) return;
      timer = setTimeout(() => {
        if (!isSuppressed()) openModal();
        timer = null;
      }, delayMs);
    }
  
    function disarm() {
      if (timer) clearTimeout(timer);
      timer = null;
    }
  
    if (document.visibilityState === "visible") arm();
    document.addEventListener("visibilitychange", () => {
      if (modal.getAttribute("aria-hidden") === "false") return;
      if (document.visibilityState === "visible") arm();
      else disarm();
    });
  
    // Submit -> MU secure handler via our AJAX forwarder
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      msg.textContent = "Submitting…";
  
      logEvent("modal_submit_attempt");
  
      const emailEl = form.querySelector('input[name="subscriber_email"]');
      const email = (emailEl?.value || "").trim();
  
      const data = new FormData(form);
      data.append("action", "sbz_subscribe_modal");
      data.append("nonce", SBZSubModal.nonce);
      data.append("channel", channel);
  
      try {
        const res = await fetch(ajaxUrl, {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "X-Requested-With": "XMLHttpRequest",
          },
          body: data,
        });
  
        const text = await res.text();
        let json = null;
        try { json = JSON.parse(text); } catch (_) {}
  
        if (!res.ok) {
          console.error("SBZ modal: HTTP error", res.status, text);
          logEvent("modal_submit_error", { reason: "http_" + String(res.status) });
          msg.textContent = "Please try again.";
          return;
        }
  
        if (!json || json.success !== true) {
          logEvent("modal_submit_error", { reason: "server" });
  
          const serverMsg = (json && json.data && json.data.message) ? json.data.message : "Please try again.";
          console.error("SBZ modal: server rejected", json || text);
          msg.textContent = serverMsg;
          return;
        }
  
        const until = nowMs() + cooldownDaysSubmit * 24 * 60 * 60 * 1000;
        setUntil(keySubmitUntil, until);
  
        logEvent("modal_submit_success");
  
        msg.textContent = "";
        showSuccess(email);
      } catch (err) {
        console.error("SBZ modal: fetch failed", err);
        logEvent("modal_submit_error", { reason: "network" });
        msg.textContent = "Network error. Please try again.";
      }
    });
  
    // “Got it” button is also .sbz-close; it will be tracked as close_btn above.
  })();
  