/* SKYBRIZ Live Chat — Engagement (JS)
   Location: /assets/sbz-chat-engagement.js */

   (function () {
    'use strict';
  
    const F = window.SBZ_CHAT_FEATURES || {};
    if (!F || !F.nonce) return;
  
    // Build REST base robustly and match PHP routes (/skybriz/v1/chat/*)
    const apiRoot = (window.wpApiSettings && window.wpApiSettings.root) || '/wp-json/';
    const BASE = (
      (window.SBZ_CHAT_FEATURES && window.SBZ_CHAT_FEATURES.rest_base) || // e.g. ".../skybriz/v1/chat/"
      (apiRoot.replace(/\/+$/, '') + '/skybriz/v1/chat/')
    ).replace(/\/+$/, '') + '/';
  
    const api = (path, opts = {}) =>
      fetch(
        BASE + String(path).replace(/^\/+/, ''), // tolerate leading "/" in callers
        Object.assign(
          {
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin'
          },
          opts
        )
      ).then(r => (r.ok ? r.json() : Promise.reject(r)));
  
    /* ——— Proactive Trigger ——— */
    let proactiveShown = false;
    function maybeProactive() {
      if (!F.proactive_enabled || proactiveShown) return;
      const secs = Number(F.proactive_after_seconds || 45);
      const sc = Number(F.proactive_scroll_percent || 50);
      const timeOk = performance.now() / 1000 >= secs;
      const scrollOk =
        ((window.scrollY + window.innerHeight) / document.documentElement.scrollHeight) * 100 >= sc;
      if (timeOk && scrollOk) {
        proactiveShown = true;
        document.documentElement.classList.add('sbz-proactive-visible');
        api('/event', {
          method: 'POST',
          body: JSON.stringify({ nonce: F.nonce, type: 'proactive_shown' })
        }).catch(() => {});
      }
    }
    window.addEventListener('scroll', maybeProactive, { passive: true });
    setTimeout(maybeProactive, Number(F.proactive_after_seconds || 45) * 1000);
  
    /* ——— Protected by SKYBRIZ badge (sticky + footer aware) ——— */
    if (F.badge_enabled) {
      const badge = document.createElement('div');
      badge.className = 'sbz-protected-badge';
      badge.innerHTML = '<span class="sbz-shield" aria-hidden="true"></span>Protected by <b>SKYBRIZ</b>';
      document.body.appendChild(badge);
  
      const BASE_BOTTOM = Number(F.badge_bottom || 50); // px
      const FOOT_GAP = 12; // px
  
      function computeBadgeBottom() {
        let bottom = BASE_BOTTOM;
        const foot = document.querySelector('footer');
        if (foot) {
          const rect = foot.getBoundingClientRect();
          const vh = window.innerHeight || document.documentElement.clientHeight;
          if (rect.top < vh) {
            bottom = Math.max(BASE_BOTTOM, vh - rect.top + FOOT_GAP);
          }
        }
        return bottom;
      }
  
      function placeBadge() {
        badge.style.bottom = computeBadgeBottom() + 'px';
      }
  
      placeBadge();
      window.addEventListener('scroll', placeBadge, { passive: true });
      window.addEventListener('resize', placeBadge);
      if ('ResizeObserver' in window) {
        const f = document.querySelector('footer');
        if (f) new ResizeObserver(placeBadge).observe(f);
      }
    }
  
    /* ——— Rating Modal ——— */
    let idleTimer = null,
      lastActivity = Date.now(),
      currentThread = null;
  
    function resetIdle() {
      lastActivity = Date.now();
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(checkIdle, 120000);
    }
    function checkIdle() {
      if (Date.now() - lastActivity >= 120000 && F.rating_enabled) showRating();
    }
    resetIdle();
    ['click', 'keydown', 'mousemove', 'touchstart'].forEach(ev =>
      window.addEventListener(ev, resetIdle, { passive: true })
    );
  
    // your chat code should dispatch these:
    // window.dispatchEvent(new CustomEvent('sbz:chat:thread',{detail:{threadId}}))
    // window.dispatchEvent(new CustomEvent('sbz:chat:end',{detail:{threadId}}))
    window.addEventListener('sbz:chat:thread', e => {
      currentThread = e && e.detail && e.detail.threadId ? e.detail.threadId : null;
    });
    window.addEventListener('sbz:chat:end', e => {
      currentThread = e && e.detail && e.detail.threadId ? e.detail.threadId : null;
      showRating();
    });
  
    // --- Rating frequency caps (client-side UX throttle) ---
    const DAY = 24 * 60 * 60 * 1000;
    const RATED_KEY = t => `sbz_rated:${t}`; // per-thread
    const SKIP_KEY = t => `sbz_rate_skip:${t}`; // per-thread
    const GLOBAL_KEY = 'sbz_rate_global'; // cross-threads
  
    const now = () => Date.now();
    function ratedRecently(threadId, days = 30) {
      try {
        const v = parseInt(localStorage.getItem(RATED_KEY(threadId)) || '0', 10);
        return v && now() - v < days * DAY;
      } catch (_) {
        return false;
      }
    }
    function skippedRecently(threadId, hours = 24) {
      try {
        const v = parseInt(localStorage.getItem(SKIP_KEY(threadId)) || '0', 10);
        return v && now() - v < hours * 60 * 60 * 1000;
      } catch (_) {
        return false;
      }
    }
    function globalCapped(days = 3) {
      try {
        const v = parseInt(localStorage.getItem(GLOBAL_KEY) || '0', 10);
        return v && now() - v < days * DAY;
      } catch (_) {
        return false;
      }
    }
    function markRated(threadId) {
      try {
        localStorage.setItem(RATED_KEY(threadId), String(now()));
        localStorage.setItem(GLOBAL_KEY, String(now()));
      } catch (_) {}
    }
    function markSkipped(threadId) {
      try {
        localStorage.setItem(SKIP_KEY(threadId), String(now()));
        localStorage.setItem(GLOBAL_KEY, String(now()));
      } catch (_) {}
    }
  
    function showRating() {
      if (!currentThread) return;
      if (document.querySelector('.sbz-rating-wrap')) return;
  
      // Frequency caps: once per thread (30d), skip snooze (24h), global cooldown (3d)
      if (ratedRecently(currentThread) || skippedRecently(currentThread) || globalCapped()) return;
  
      const w = document.createElement('div');
      w.className = 'sbz-rating-wrap';
      w.innerHTML = `
        <div class="sbz-rating-card" role="dialog" aria-label="Rate your chat">
          <div class="sbz-rating-title">How was this chat?</div>
          <div class="sbz-stars" role="radiogroup" aria-label="Rating">
            ${[1, 2, 3, 4, 5]
              .map(i => `<button class="sbz-star" data-v="${i}" aria-label="${i} stars" type="button">★</button>`)
              .join('')}
          </div>
          <textarea class="sbz-rating-comment" maxlength="500" placeholder="Optional comment (max 500 chars)"></textarea>
          <div class="sbz-rating-actions">
            <button class="sbz-rate-submit" type="button">Submit</button>
            <button class="sbz-rate-skip" type="button">Skip</button>
          </div>
        </div>`;
  
      document.body.appendChild(w);
  
      w.querySelector('.sbz-rate-skip').onclick = () => {
        markSkipped(currentThread);
        w.remove();
      };
  
      w.querySelector('.sbz-rate-submit').onclick = async () => {
        const active = w.querySelector('.sbz-star.active');
        if (!active) {
          alert('Please pick a rating');
          return;
        }
        const score = Number(active.getAttribute('data-v'));
        const comment = (w.querySelector('.sbz-rating-comment').value || '').trim();
        try {
          await api('/feedback', {
            method: 'POST',
            body: JSON.stringify({
              nonce: F.nonce,
              thread_id: currentThread,
              score,
              comment
            })
          });
          markRated(currentThread);
          w.remove();
        } catch (e) {
          alert('Unable to submit feedback.');
        }
      };
  
      w.querySelectorAll('.sbz-star').forEach(b => {
        b.addEventListener('click', () => {
          w.querySelectorAll('.sbz-star').forEach(x => x.classList.remove('active'));
          b.classList.add('active');
        });
      });
    }
  
    /* ——— Engagement Points Logging (to Node) ———
       Fire once per session after first user message:
       window.dispatchEvent(new Event('sbz:chat:firstMessage')); */
    let pointsFired = false;
    window.addEventListener('sbz:chat:firstMessage', async () => {
      if (pointsFired || !F.points_logging_enabled) return;
      pointsFired = true;
      try {
        const token = sessionStorage.getItem('jwt') || localStorage.getItem('jwt');
        if (!token) return; // guests won't earn points
        await fetch('/api/log-engagement', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          body: JSON.stringify({
            activityType: 'chat_started',
            contentId: 'live_chat',
            pointsEarned: 1,
            meta: { source: 'live_chat_widget' }
          })
        });
      } catch (_) {
        /* no-op */
      }
    });
  })();
  