/* Skybriz analytics beacon (no PII) — updated */
(function () {
    "use strict";
  
    var ctx = window.SBZPC_EVT || {};
    if (!ctx.ajax_url || !ctx.nonce) return; // nothing to do if not localized
  
    // Map friendly aliases → canonical event types
    function normalizeType(raw) {
      var t = String(raw || "").toLowerCase().trim();
      if (!t) return "";
      if (t === "contact") t = "contact_click";
      if (t === "profile_click" || t === "card" || t === "profile" || t === "open") t = "view";
      // allowed: view, contact_click, connect, shortlist
      return t;
    }
  
    function post(type, partnerId) {
      type = normalizeType(type);
      if (!type) return;
      var pid = Number(partnerId || ctx.partner_id || 0) || 0;
      if (!pid) return;
  
      var fd = new FormData();
      fd.append("action", "sbzpc_track_event");
      fd.append("type", type);                     // server accepts "type"
      fd.append("partner_id", String(pid));
      fd.append("nonce", ctx.nonce);
  
      if (navigator.sendBeacon) {
        try { navigator.sendBeacon(ctx.ajax_url, fd); return; } catch (e) {}
      }
      // fetch fallback
      fetch(ctx.ajax_url, { method: "POST", body: fd, credentials: "same-origin" }).catch(function(){});
    }
  
    // Delegate clicks
    document.addEventListener("click", function (e) {
      // 1) Preferred: any element marked with data-sbzpc-click + partner id
      var el = e.target.closest("[data-sbzpc-click]");
      if (el) {
        var type = el.getAttribute("data-sbzpc-click");
        var pid  = parseInt(el.getAttribute("data-partner-id") || "0", 10) || 0;
        post(type, pid);
        return;
      }
  
      // 2) Back-compat: directory cards
      var card = e.target.closest('a.sbzpc-card-body[data-partner-id]');
      if (card) {
        var pidCard = parseInt(card.getAttribute("data-partner-id") || "0", 10) || 0;
        // treat as a profile view
        post("view", pidCard);
        return;
      }
  
      // 3) Back-compat: explicit contact & shortlist hooks on profile pages
      var contact = e.target.closest("[data-sbzpc-contact][data-partner-id]");
      if (contact) {
        var pidC = parseInt(contact.getAttribute("data-partner-id") || "0", 10) || 0;
        post("contact_click", pidC);
        return;
      }
  
      var shortlist = e.target.closest("[data-sbzpc-shortlist][data-partner-id]");
      if (shortlist) {
        var pidS = parseInt(shortlist.getAttribute("data-partner-id") || "0", 10) || 0;
        post("shortlist", pidS);
        return;
      }
    }, { capture: true, passive: true });
  })();
  