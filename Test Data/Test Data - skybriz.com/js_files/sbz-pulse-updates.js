(function () {
    "use strict";
  
    function qs(sel, root) { return (root || document).querySelector(sel); }
    function qsa(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }
  
    function clampStr(s, max) {
      s = String(s || "").trim();
      if (s.length > max) s = s.slice(0, max);
      return s;
    }
  
    // Client-side sanitization (server still enforces)
    function sanitizeQuery(s) {
      s = clampStr(s, 60);
      s = s.replace(/[\x00-\x1F\x7F]/g, "");
      s = s.replace(/[^a-zA-Z0-9\s\-\.\,\!\?\&\:\'\"\(\)\/]/g, "");
      return s.trim();
    }
  
    function debounce(fn, wait) {
      var t = null;
      return function () {
        var args = arguments;
        clearTimeout(t);
        t = setTimeout(function () { fn.apply(null, args); }, wait);
      };
    }
  
    function escHtml(s) {
      s = String(s || "");
      return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }
  
    async function fetchJSON(url, opts) {
      var res = await fetch(url, opts || {});
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    }
  
    function buildItemHTML(item) {
      var badgeClass =
        item.type === "breaking" ? "is-breaking" :
        item.type === "must_know" ? "is-must" : "is-info";
  
      var links = "";
      if (item.sourceUrl) {
        links += '<a class="sbz-pulse-link" href="' + escHtml(item.sourceUrl) + '" target="_blank" rel="noopener noreferrer">Source</a>';
      }
      if (item.readMoreUrl) {
        links += '<a class="sbz-pulse-link" href="' + escHtml(item.readMoreUrl) + '" target="_blank" rel="noopener noreferrer">Read more</a>';
      } else if (item.permalink) {
        // Always allow landing page (SEO + no dead ends)
        links += '<a class="sbz-pulse-link" href="' + escHtml(item.permalink) + '">Open</a>';
      }
  
      return (
        '<div class="sbz-pulse-item" data-id="' + (item.id || "") + '">' +
          '<div class="sbz-pulse-top">' +
            '<span class="sbz-pulse-badge ' + badgeClass + '">' + escHtml(item.typeLabel || item.type) + '</span>' +
            '<span class="sbz-pulse-region">' + escHtml(item.regionLabel || "") + '</span>' +
            (item.isPinned ? '<span class="sbz-pulse-pin" title="Pinned">📌</span>' : "") +
          '</div>' +
          (item.title ? '<div class="sbz-pulse-title">' + escHtml(item.title) + "</div>" : "") +
          '<div class="sbz-pulse-summary">' + escHtml(item.summary || "") + "</div>" +
          '<div class="sbz-pulse-meta">' +
            '<span class="sbz-pulse-time">' + escHtml(item.publishedAtLabel || "") + "</span>" +
            '<span class="sbz-pulse-links">' + links + "</span>" +
          "</div>" +
        "</div>"
      );
    }
  
    function initOne(root) {
      var endpoint = root.getAttribute("data-endpoint");
      if (!endpoint) return;
  
      var tabLatestBtn  = qs('[data-sbz-tab="latest"]', root);
      var tabArchiveBtn = qs('[data-sbz-tab="archive"]', root);
      var paneLatest    = qs('[data-sbz-pane="latest"]', root);
      var paneArchive   = qs('[data-sbz-pane="archive"]', root);
  
      var carouselHost  = qs(".sbz-pulse-carousel", root);
      var carouselDots  = qs(".sbz-pulse-dots", root);
      var carouselStatus= qs(".sbz-pulse-status", root);
  
      var searchInput   = qs(".sbz-pulse-search input", root);
      var filterType    = qs('select[name="sbzPulseType"]', root);
      var filterRegion  = qs('select[name="sbzPulseRegion"]', root);
      var resultsHost   = qs(".sbz-pulse-results", root);
      var pagerPrev     = qs('[data-sbz-page="prev"]', root);
      var pagerNext     = qs('[data-sbz-page="next"]', root);
      var pagerLabel    = qs(".sbz-pulse-page-label", root);
  
      var latestItems = [];
      var latestIndex = 0;
      var rotateTimer = null;
  
      var archivePage = 1;
      var archiveTotalPages = 1;
  
      var aborter = null;
  
      function setTab(tab) {
        var isLatest = tab === "latest";
        tabLatestBtn.classList.toggle("is-active", isLatest);
        tabArchiveBtn.classList.toggle("is-active", !isLatest);
  
        paneLatest.hidden = !isLatest;
        paneArchive.hidden = isLatest;
  
        // stop rotation when leaving latest
        if (!isLatest && rotateTimer) {
          clearInterval(rotateTimer);
          rotateTimer = null;
        }
  
        if (isLatest) {
          startRotation();
        }
      }
  
      function setStatus(msg, kind) {
        if (!carouselStatus) return;
        carouselStatus.textContent = msg || "";
        carouselStatus.classList.remove("is-ok", "is-warn", "is-muted");
        carouselStatus.classList.add(kind || "is-muted");
      }
  
      function renderDots() {
        if (!carouselDots) return;
        carouselDots.innerHTML = "";
        latestItems.forEach(function (_, i) {
          var b = document.createElement("button");
          b.type = "button";
          b.className = "sbz-pulse-dot" + (i === latestIndex ? " is-active" : "");
          b.setAttribute("aria-label", "Update " + (i + 1));
          b.addEventListener("click", function () {
            latestIndex = i;
            renderLatest();
          });
          carouselDots.appendChild(b);
        });
      }
  
      function renderLatest() {
        if (!carouselHost) return;
        if (!latestItems.length) {
          carouselHost.innerHTML = '<div class="sbz-pulse-empty">No updates yet.</div>';
          renderDots();
          return;
        }
        var item = latestItems[latestIndex];
        carouselHost.innerHTML = buildItemHTML(item);
        renderDots();
      }
  
      function startRotation() {
        if (!latestItems.length) return;
        if (rotateTimer) return;
  
        rotateTimer = setInterval(function () {
          if (!latestItems.length) return;
          latestIndex = (latestIndex + 1) % latestItems.length;
          renderLatest();
        }, 5500);
      }
  
      async function loadLatest() {
        try {
          setStatus("Loading updates…", "is-muted");
          var url = endpoint + "?mode=latest&per_page=6";
          var data = await fetchJSON(url, { credentials: "same-origin" });
  
          latestItems = Array.isArray(data.items) ? data.items : [];
          latestIndex = 0;
  
          if (latestItems.length) {
            setStatus("Live updates", "is-ok");
          } else {
            setStatus("No updates yet", "is-warn");
          }
  
          renderLatest();
          startRotation();
        } catch (e) {
          console.warn("Updates latest failed:", e);
          setStatus("Updates unavailable", "is-warn");
          latestItems = [];
          renderLatest();
        }
      }
  
      function renderArchive(data) {
        var items = (data && Array.isArray(data.items)) ? data.items : [];
        archiveTotalPages = Math.max(1, (data && data.totalPages) ? Number(data.totalPages) : 1);
  
        if (pagerLabel) pagerLabel.textContent = "Page " + archivePage + " of " + archiveTotalPages;
        if (pagerPrev) pagerPrev.disabled = archivePage <= 1;
        if (pagerNext) pagerNext.disabled = archivePage >= archiveTotalPages;
  
        if (!resultsHost) return;
  
        if (!items.length) {
          resultsHost.innerHTML = '<div class="sbz-pulse-empty">No matches.</div>';
          return;
        }
  
        resultsHost.innerHTML = items.map(buildItemHTML).join("");
      }
  
      async function loadArchive() {
        try {
          var q = searchInput ? sanitizeQuery(searchInput.value) : "";
          var type = filterType ? String(filterType.value || "all") : "all";
          var region = filterRegion ? String(filterRegion.value || "all") : "all";
  
          // Cancel in-flight request (prevents race while typing)
          if (aborter) aborter.abort();
          aborter = new AbortController();
  
          if (resultsHost) resultsHost.innerHTML = '<div class="sbz-pulse-loading">Searching…</div>';
  
          var url =
            endpoint +
            "?mode=archive" +
            "&page=" + encodeURIComponent(String(archivePage)) +
            "&per_page=10" +
            "&type=" + encodeURIComponent(type) +
            "&region=" + encodeURIComponent(region) +
            "&q=" + encodeURIComponent(q);
  
          var data = await fetchJSON(url, {
            credentials: "same-origin",
            signal: aborter.signal
          });
  
          renderArchive(data);
        } catch (e) {
          if (e && e.name === "AbortError") return;
          console.warn("Updates archive failed:", e);
          if (resultsHost) resultsHost.innerHTML = '<div class="sbz-pulse-empty">Archive unavailable.</div>';
        }
      }
  
      var loadArchiveDebounced = debounce(function () {
        archivePage = 1;
        loadArchive();
      }, 260);
  
      // Tabs
      if (tabLatestBtn) tabLatestBtn.addEventListener("click", function () { setTab("latest"); });
      if (tabArchiveBtn) tabArchiveBtn.addEventListener("click", function () {
        setTab("archive");
        // initial archive load once opened
        loadArchive();
      });
  
      // Live search while typing
      if (searchInput) {
        searchInput.addEventListener("input", function () {
          // small UX: if only 1 char, don’t hammer server
          var q = sanitizeQuery(searchInput.value);
          if (q.length === 1) return;
          loadArchiveDebounced();
        });
      }
      if (filterType) filterType.addEventListener("change", loadArchiveDebounced);
      if (filterRegion) filterRegion.addEventListener("change", loadArchiveDebounced);
  
      // Pagination
      if (pagerPrev) pagerPrev.addEventListener("click", function () {
        if (archivePage > 1) {
          archivePage--;
          loadArchive();
        }
      });
      if (pagerNext) pagerNext.addEventListener("click", function () {
        if (archivePage < archiveTotalPages) {
          archivePage++;
          loadArchive();
        }
      });
  
      // Init
      setTab("latest");
      loadLatest();
    }
  
    document.addEventListener("DOMContentLoaded", function () {
      qsa(".sbz-pulse-updates").forEach(initOne);
    });
  })();
  