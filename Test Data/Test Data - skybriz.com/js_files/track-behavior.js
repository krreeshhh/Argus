(function () {
  "use strict";

  if (window.__SBZ_TRACK_INIT__) return;
  window.__SBZ_TRACK_INIT__ = true;

  var cfg = window.skybrizTrack || {};
  var restBase = typeof cfg.restBase === "string" && cfg.restBase ? cfg.restBase : "/wp-json/skybriz/v1/";
  var endpoint = restBase.replace(/\/+$/, "/") + "log-visit";
  var nonce = typeof cfg.nonce === "string" ? cfg.nonce : "";

  var ua = navigator.userAgent || "";
  if (!ua || /Headless|bot|crawler|spider|preview|facebookexternalhit|slackbot|discordbot/i.test(ua)) return;

  var PAGE_KEY = "skybriz_behavior_pageview";
  var SID_KEY = "skybriz_session_id";
  var HEARTBEAT_MS = 15000;
  var lastFlushAt = 0;
  var started = false;
  var pageHiddenFlushed = false;
  var visibleSince = document.visibilityState === "visible" ? Date.now() : 0;
  var accumulatedVisibleMs = 0;

  function log() {
    return;
  }

  function warn() {
    return;
  }

  function getCookie(name) {
    var parts = document.cookie.split("; ");
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].indexOf(name + "=") === 0) return parts[i].split("=")[1];
    }
    return "";
  }

  function setCookie(name, value, minutes) {
    try {
      document.cookie = name + "=" + value + "; path=/; samesite=lax; max-age=" + (minutes * 60);
    } catch (_) {}
  }

  function safeRandomId(prefix) {
    try {
      if (window.crypto && crypto.randomUUID) {
        return prefix + crypto.randomUUID().replace(/-/g, "");
      }
    } catch (_) {}
    return prefix + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function normalizePath(path) {
    if (!path) return "/";
    return path.charAt(0) === "/" ? path : "/" + path;
  }

  function currentPath() {
    return normalizePath(location.pathname || "/");
  }

  function currentPage() {
    return currentPath() + (location.search || "");
  }

  function getSessionId() {
    var sid = "";
    try {
      sid = sessionStorage.getItem(SID_KEY) || "";
      if (!sid) {
        sid = safeRandomId("s-");
        sessionStorage.setItem(SID_KEY, sid);
      }
      return sid;
    } catch (_) {
      sid = getCookie(SID_KEY) || safeRandomId("s-");
      setCookie(SID_KEY, sid, 30);
      return sid;
    }
  }

  var sessionId = getSessionId();
  var pageviewId = safeRandomId("pv-");
  var requestId = safeRandomId("rq-");
  try {
    sessionStorage.setItem(PAGE_KEY, JSON.stringify({
      id: pageviewId,
      path: currentPage(),
      started_at: Date.now()
    }));
  } catch (_) {}

  function buildFingerprint() {
    try {
      var tz = (Intl.DateTimeFormat().resolvedOptions().timeZone || "tz?") + "";
      return "fp-" + [
        navigator.platform || "",
        navigator.language || "",
        screen.width || 0,
        screen.height || 0,
        tz
      ].join("|");
    } catch (_) {
      return "fp-" + [
        navigator.platform || "",
        navigator.language || "",
        (screen && screen.width) ? screen.width : 0,
        (screen && screen.height) ? screen.height : 0,
        "tz?"
      ].join("|");
    }
  }

  var fingerprint = buildFingerprint();

  function detectBrowserName() {
    var uaLower = (ua || "").toLowerCase();
    if (uaLower.indexOf("edg/") !== -1 || uaLower.indexOf(" edge/") !== -1) return "Edge";
    if (uaLower.indexOf("opr/") !== -1 || uaLower.indexOf(" opera") !== -1) return "Opera";
    if (uaLower.indexOf("firefox/") !== -1) return "Firefox";
    if (uaLower.indexOf("chrome/") !== -1 && uaLower.indexOf("edg/") === -1 && uaLower.indexOf("opr/") === -1) return "Chrome";
    if (uaLower.indexOf("safari/") !== -1 && uaLower.indexOf("chrome/") === -1) return "Safari";
    if (uaLower.indexOf("trident/") !== -1 || uaLower.indexOf("msie ") !== -1) return "Internet Explorer";
    return "Other";
  }

  function buildDeviceSummary() {
    var platform = (navigator.platform || "Unknown").toString().slice(0, 48);
    var browser = detectBrowserName();
    return (platform + " | " + browser).slice(0, 120);
  }

  function getUtmParams() {
    try {
      var search = new URLSearchParams(location.search);
      var keys = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];
      var out = {};
      var hasAny = false;
      for (var i = 0; i < keys.length; i++) {
        var value = search.get(keys[i]);
        if (value) {
          out[keys[i]] = value;
          hasAny = true;
        }
      }
      return hasAny ? out : null;
    } catch (_) {
      return null;
    }
  }

  function getConsentState() {
    var consent = getCookie("sbz_cookie_consent");
    if (consent === "yes") return "granted";
    if (!consent) return "not_set";
    return "unknown";
  }

  function syncVisibleTime() {
    if (document.visibilityState === "visible" && visibleSince) {
      var delta = Date.now() - visibleSince;
      if (delta > 0) accumulatedVisibleMs += delta;
      visibleSince = Date.now();
    }
  }

  function engagedSeconds() {
    var total = accumulatedVisibleMs;
    if (document.visibilityState === "visible" && visibleSince) {
      total += Date.now() - visibleSince;
    }
    var seconds = Math.round(total / 1000);
    if (seconds < 0) seconds = 0;
    if (seconds > 86400) seconds = 86400;
    return seconds;
  }

  function buildPayload(action, isFinal, extra) {
    var extraData = extra && typeof extra === "object" ? extra : {};
    return {
      action: action,
      page: currentPage(),
      duration: engagedSeconds(),
      device: buildDeviceSummary(),
      fingerprint: fingerprint,
      session_id: sessionId,
      pageview_id: pageviewId,
      request_id: extraData.request_id || requestId,
      event_type: extraData.event_type || "",
      consent_state: extraData.consent_state || getConsentState(),
      referrer: document.referrer || "",
      utm: getUtmParams(),
      final: !!isFinal
    };
  }

  function sendPayload(action, isFinal, transport, extra) {
    syncVisibleTime();

    var payload = buildPayload(action, isFinal, extra);
    lastFlushAt = Date.now();

    if (transport === "beacon" && navigator.sendBeacon) {
      try {
        var blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
        var ok = navigator.sendBeacon(endpoint, blob);
        return ok;
      } catch (_) {}
    }

    try {
      fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-WP-Nonce": nonce,
          "X-Requested-With": "XMLHttpRequest"
        },
        body: JSON.stringify(payload),
        keepalive: transport === "keepalive",
        credentials: "same-origin",
        cache: "no-store"
      }).then(function (res) {
        return res.text().catch(function () {});
      }).catch(function () {
        return;
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  function startSession() {
    if (started) return;
    started = true;
    sendPayload("start", false, "fetch");
  }

  function heartbeat() {
    if (!started) startSession();
    if (document.visibilityState !== "visible") return;
    if (Date.now() - lastFlushAt < HEARTBEAT_MS - 1000) return;
    sendPayload("heartbeat", false, "fetch");
  }

  function finalFlush(reason) {
    if (!started) startSession();
    pageHiddenFlushed = true;
    var sent = sendPayload("final", true, "beacon");
    if (!sent) {
      sendPayload("final", true, "keepalive");
    }
  }

  startSession();

  var timer = window.setInterval(heartbeat, HEARTBEAT_MS);

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") {
      if (visibleSince) {
        accumulatedVisibleMs += Math.max(0, Date.now() - visibleSince);
        visibleSince = 0;
      }
      finalFlush("visibilitychange");
      return;
    }

    visibleSince = Date.now();
    pageHiddenFlushed = false;
    heartbeat();
  }, { capture: true });

  window.addEventListener("pagehide", function () {
    if (document.visibilityState === "visible" && visibleSince) {
      accumulatedVisibleMs += Math.max(0, Date.now() - visibleSince);
      visibleSince = 0;
    }
    if (!pageHiddenFlushed) {
      finalFlush("pagehide");
    }
  }, { capture: true });

  window.addEventListener("pageshow", function (event) {
    if (event.persisted) {
      visibleSince = Date.now();
      pageHiddenFlushed = false;
      heartbeat();
    }
  }, { capture: true });

  window.addEventListener("focus", function () {
    if (document.visibilityState === "visible" && !visibleSince) {
      visibleSince = Date.now();
    }
    heartbeat();
  }, { capture: true });

  window.addEventListener("blur", function () {
    if (document.visibilityState === "visible" && visibleSince) {
      accumulatedVisibleMs += Math.max(0, Date.now() - visibleSince);
      visibleSince = 0;
    }
  }, { capture: true });

  window.setTimeout(function () {
    heartbeat();
  }, 5000);

  window.addEventListener("beforeunload", function () {
    if (document.visibilityState === "visible" && visibleSince) {
      accumulatedVisibleMs += Math.max(0, Date.now() - visibleSince);
      visibleSince = 0;
    }
  }, { capture: true });
})();
