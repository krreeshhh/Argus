(function () {
  const cfg = (window.SBZ_CHAT_CFG || {});
  const root = document.getElementById('sbz-chat-root');
  if (!root) return;

  // If printed inside <footer>, move it so it can float above it
  try { if (root.closest('footer')) document.body.appendChild(root); } catch (e) {}

  // ---- Debug disabled in production ----
  const DEBUG = false;
  const dbg   = DEBUG ? console.log.bind(console, '[SBZ_CHAT]') : () => {};
  const dwarn = DEBUG ? console.warn.bind(console, '[SBZ_CHAT]') : () => {};
  const derr  = DEBUG ? console.error.bind(console, '[SBZ_CHAT]') : () => {};

  // ---- Version for cache-busting (helps Safari) ----
  let ASSET_V = cfg.assetVersion || Date.now();
  try {
    const s = document.currentScript || Array.from(document.scripts).find(x => /chat\.js(\?|$)/.test(x.src || ''));
    if (s) {
      const ver = new URL(s.src, location.href).searchParams.get('ver');
      if (ver) ASSET_V = ver;
    }
  } catch(_) {}

  // ---- Site base discovery (supports subdirectory installs) ----
  function getSiteBase() {
    const restLink = document.querySelector('link[rel="https://api.w.org/"]');
    if (restLink && restLink.href) {
      try { return new URL(restLink.href, location.href).href.replace(/\/wp-json\/?$/i, '/'); } catch {}
    }
    return location.origin.replace(/\/$/,'') + '/';
  }
  const SITE_BASE = getSiteBase();
  const FRONT     = SITE_BASE; // /?sbz_chat=...

  // ---- Safe URL builder ----
  function safeURL(base) {
    try {
      const str = String(base);
      return new URL(str, location.href).toString();
    } catch (e) {
      dwarn("safeURL(): invalid base URL", base, e);
      if (typeof base === 'string') {
        try {
          const joined = (location.origin.replace(/\/$/,'') + '/' + base.replace(/^\//,''));
          return new URL(joined, location.href).toString();
        } catch (e2) {
          derr("safeURL(): fallback failed", base, e2);
        }
      }
      throw e;
    }
  }

  // ---- Query helper with cache-buster ----
  function q(base, params) {
    let u;
    try { u = new URL(safeURL(base)); } catch (e) { derr("q(): failed to construct URL from base", base, e); throw e; }
    Object.entries(params || {}).forEach(([k,v]) => {
      if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, String(v));
    });
    if (!u.searchParams.has('_v')) u.searchParams.set('_v', String(ASSET_V));
    return u.toString();
  }

  // ---- Compute AJAX endpoint robustly ----
  let AJAX = cfg.ajaxUrl || (SITE_BASE + 'wp-admin/admin-ajax.php');
  try { AJAX = safeURL(AJAX); }
  catch (e) { AJAX = safeURL(SITE_BASE + 'wp-admin/admin-ajax.php'); }

  dbg("Boot", { SITE_BASE, FRONT, AJAX, ASSET_V });

  // ---- Float above footer ----
  const defaultBottom  = Number(cfg.bottomOffset || 24);
  const extraGap       = Number(cfg.extraBottomGap || 12);
  const anchorSelector = cfg.anchorAboveSelector || 'footer';
  function computeBottom() {
    const foot = anchorSelector ? document.querySelector(anchorSelector) : null;
    if (!foot) return defaultBottom;
    const rect = foot.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    return (rect.top < vh) ? Math.max(0, vh - rect.top) + extraGap : defaultBottom;
  }
  function placeWidget(){ root.style.bottom = computeBottom() + 'px'; }
  placeWidget();
  window.addEventListener('scroll', placeWidget, { passive:true });
  window.addEventListener('resize', placeWidget);
  if ('ResizeObserver' in window) {
    const f = document.querySelector(anchorSelector);
    if (f) new ResizeObserver(placeWidget).observe(f);
  }

  // ---- HTTP helpers ----
  function fetchJSON(url, options = {}, timeout = 12000) {
    dbg("fetchJSON →", url, { method: options.method || 'GET' });
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    const opts = {
      credentials: 'same-origin', // includes HttpOnly cookie for same-origin
      headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest', ...(options.headers||{}) },
      signal: ctrl.signal,
      ...options
    };
    return fetch(url, opts).then(async r => {
      clearTimeout(t);
      const text = await r.text();
      dbg("fetchJSON status:", r.status, "raw:", text);
      let json; try { json = JSON.parse(text); } catch { json = { _raw: text }; }
      if (!r.ok) { const e = new Error('HTTP ' + r.status); e.status = r.status; e.body = json; throw e; }
      return json;
    });
  }

  // ---- API (Front-door first, then AJAX if FRONT truly fails) ----
  function callFront(kind, data) {
    dbg("callFront", kind, data);
    if (kind === 'open') {
      return fetchJSON(q(FRONT, { sbz_chat:'open', displayName: data?.displayName || '', email: data?.email || '', nonce: cfg.nonce || '' }));
    }
    if (kind === 'messages') {
      // NO sessionId in query; authentication via HttpOnly cookie
      return fetchJSON(q(FRONT, { sbz_chat:'messages', afterId: data.afterId || '', nonce: cfg.nonce || '' }));
    }
    // send -> POST (NO sessionId in body)
    const u = q(FRONT, { sbz_chat:'send' });
    const fd = new FormData();
    fd.append('message', data.message || '');
    if (data.cid) fd.append('cid', data.cid);
    if (cfg.nonce) fd.append('nonce', cfg.nonce);
    return fetchJSON(u, { method:'POST', body:fd });
  }

  function callAjax(kind, data) {
    dbg("callAjax", kind, data);
    const actions = cfg.ajaxActions || { open:'sbz_chat_open', send:'sbz_chat_send', messages:'sbz_chat_messages' };
    const act = (kind==='open') ? actions.open : (kind==='send') ? actions.send : actions.messages;

    if (kind === 'send') {
      const fd = new FormData();
      fd.append('action', act);
      fd.append('message', data.message || '');
      if (data.cid) fd.append('cid', data.cid);
      if (cfg.nonce) fd.append('nonce', cfg.nonce);
      return fetchJSON(AJAX, { method:'POST', body:fd });
    } else if (kind === 'open') {
      const url = q(AJAX, { action: act, displayName: data.displayName || '', email: data.email || '', nonce: cfg.nonce || '' });
      return fetchJSON(url);
    } else {
      const url = q(AJAX, { action: act, afterId: data.afterId || '', nonce: cfg.nonce || '' });
      return fetchJSON(url);
    }
  }

  function callAPI(kind, data) {
    dbg("callAPI", kind, data);
    return callFront(kind, data).catch(err => {
      // Only fall back for network-level failures or 404; avoid double-send on 4xx business logic
      if (err && (err.status === 0 || err.status === 404)) {
        dwarn("callFront failed with", err.status, "→ falling back to AJAX");
        return callAjax(kind, data);
      }
      throw err;
    });
  }

  // ---- UI helpers ----
  const h = (tag, attrs = {}, children = []) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') el.className = v;
      else if (k === 'for') el.htmlFor = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.substring(2), v);
      else el.setAttribute(k, v);
    }
    (Array.isArray(children) ? children : [children]).filter(Boolean).forEach(ch => {
      if (typeof ch === 'string') el.appendChild(document.createTextNode(ch));
      else el.appendChild(ch);
    });
    return el;
  };
  const escape = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const escapeWithBreaks = s => escape(s).replace(/\n/g, '<br>');

  // ---- State ----
  // Legacy cleanup: remove any old client-visible session id
  try { localStorage.removeItem('sbz_chat_id'); } catch(_) {}

  let hasSession = false;        // set true after successful /open (cookie established)
  let threadId   = null;
  let firedFirst = false;
  let lastId     = 0;
  let open       = false, pollTimer = null, greeted = false;
  let unread     = 0;
  let agentLabel = cfg.agentLabel || 'Skybriz Team';
  const visitorLabel = cfg.visitorLabel || 'You';
  let sendingLock = false; // idempotent client-side guard

  const renderedIds = new Set();
  const pendingQueue = []; // [{text, el, tmpAtISO}]
  const pendingById  = new Map();

  // ---- Load fallback CSS ONLY if chat.css failed to apply ----
  (function maybeInjectFallbackCSS(){
    if (document.getElementById('sbz-chat-fallback')) return;
    const probe = document.createElement('div');
    probe.className = 'sbz-chat-panel';
    probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;';
    document.body.appendChild(probe);
    const cs = window.getComputedStyle(probe);
    const bg  = (cs.backgroundImage || '') + ' ' + (cs.backgroundColor || '');
    const brd = cs.borderTopColor || '';
    const themed = /rgb|rgba|gradient/i.test(bg) || /rgb|rgba/i.test(brd);
    document.body.removeChild(probe);
    if (themed) { dbg("chat.css detected; skipping fallback CSS"); return; }
    const css = `
      #sbz-chat-root{position:fixed;right:24px;z-index:2147483647}
      .sbz-chat-button{width:52px;height:52px;border-radius:999px;border:0;background:#0ea5e9;color:#fff;position:relative}
      .sbz-badge{position:absolute;right:50%;bottom:-6px;transform:translateX(50%);min-width:18px;height:18px;line-height:18px;border-radius:999px;background:#dc2626;color:#fff;font-size:11px;font-weight:700;padding:0 6px;box-shadow:0 0 0 2px rgba(255,255,255,.9)}
      .sbz-chat-panel{position:fixed;right:24px;bottom:86px;width:320px;max-width:calc(100vw - 32px);background:#fff;border:1px solid #e6e7eb;border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,.12);display:none}
      .sbz-chat-panel.open{display:flex;flex-direction:column}
      .sbz-chat-header{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-bottom:1px solid #e6e7eb;background:#f8fafc}
      .sbz-chat-scroll{padding:12px;max-height:340px;overflow:auto}
      .sbz-msg{max-width:78%;margin:8px 0;padding:10px 12px;border-radius:14px;border:1px solid #e6e7eb;font-size:14px}
      .sbz-msg.agent{margin-left:auto;background:#eff8ff;border-color:#cae9ff}
      .sbz-msg.visitor{margin-right:auto;background:#fff}
      .sbz-msg.pending{opacity:.7}
      .sbz-composer{display:flex;gap:8px;padding:10px;border-top:1px solid #e6e7eb;background:#fff}
      .sbz-input{flex:1;min-height:36px;max-height:120px;resize:vertical;border:1px solid #e6e7eb;border-radius:10px;padding:8px 10px;font-size:14px}
      .sbz-send{border:none;background:#0ea5e9;color:#fff;border-radius:10px;padding:0 14px;font-weight:600}
    `;
    const style = document.createElement('style');
    style.id = 'sbz-chat-fallback';
    style.textContent = css;
    document.head.appendChild(style);
    dwarn("Injected fallback CSS (chat.css not detected)");
  })();

  // ---- Shell ----
  const bubble  = h('button', { class: 'sbz-chat-button', 'aria-label': 'Open chat' });
  const badge   = h('span', { class: 'sbz-badge', 'aria-hidden': 'true' });
  Object.assign(badge.style, {
    display:'none',
    position:'absolute',
    right:'50%',
    bottom:'-6px',
    transform:'translateX(50%)',
    minWidth:'18px', height:'18px', lineHeight:'18px', borderRadius:'999px',
    background:'#dc2626', color:'#fff', fontSize:'11px', fontWeight:'700',
    padding:'0 6px', boxShadow:'0 0 0 2px rgba(255,255,255,.9)'
  });
  bubble.appendChild((() => { const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox','0 0 24 24');
    svg.innerHTML = '<path fill="currentColor" d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Z"/>'; return svg; })());
  bubble.style.position = 'relative';
  bubble.appendChild(badge);

  const panel   = h('div', { class: 'sbz-chat-panel', role: 'dialog', 'aria-modal': 'false', 'aria-label': 'Live chat' });
  const header  = h('div', { class: 'sbz-chat-header' }, [
    h('div', { class: 'sbz-chat-title' }, [
      h('span', { class: 'sbz-status-dot', title: 'Online' }),
      h('strong', {}, [ (cfg.brand || cfg.siteName || 'Skybriz') + ' — Chat' ])
    ]),
    h('div', { class: 'sbz-header-actions' }, [
      h('button', { 'aria-label': 'Close', onclick: () => toggle(false) }, '×')
    ])
  ]);
  const scroll  = h('div', { class: 'sbz-chat-scroll', id: 'sbzChatScroll' });
  const composer= h('div', { class: 'sbz-composer' });
  const input   = h('textarea', { class: 'sbz-input', placeholder: 'Type your message…', rows: '1', 'aria-label': 'Message' });
  const sendBtn = h('button', { class: 'sbz-send', disabled: true }, 'Send');
  composer.append(input, sendBtn);
  panel.append(header, scroll, composer);
  root.append(panel, bubble);

  function setBadge(n) {
    unread = n;
    if (!cfg.notify) return;
    if (unread > 0) { badge.textContent = String(unread); badge.style.display = 'inline-block'; }
    else { badge.style.display = 'none'; badge.textContent = ''; }
  }

  // Auto-resize textarea
  input.addEventListener('input', () => {
    sendBtn.disabled = !input.value.trim();
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  });

  bubble.addEventListener('click', () => toggle(true));

  function toggle(next) {
    const wasOpen = open;
    open = (typeof next === 'boolean') ? next : !open;
    panel.classList.toggle('open', open);
    dbg("toggle()", { open });
    if (open) {
      setBadge(0);
      input.focus();
      startPolling();
      if (!greeted && cfg.welcome) {
        renderServerMessage({ role: 'agent', text: cfg.welcome, createdAt: new Date().toISOString() }, false);
        greeted = true;
      }
    } else {
      stopPolling();
      if (wasOpen && threadId && window.SBZ_CHAT_BRIDGE && typeof window.SBZ_CHAT_BRIDGE.end === 'function') {
        try { window.SBZ_CHAT_BRIDGE.end(threadId); } catch(_){}
      }
    }
  }

  function startPolling() {
    if (pollTimer) return;
    dbg("startPolling()");
    pollTimer = setInterval(fetchMessages, cfg.pollEveryMs || 4000);
    fetchMessages();
  }
  function stopPolling() { if (pollTimer) { dbg("stopPolling()"); clearInterval(pollTimer); pollTimer = null; } }
  function scrollToBottom() { requestAnimationFrame(() => { scroll.scrollTop = scroll.scrollHeight; }); }

  function relTime(iso) {
    if (!iso) return '';
    try {
      const t = (typeof iso === 'string') ? new Date(iso) : iso;
      const diff = Math.max(0, (Date.now() - t.getTime())/1000);
      if (diff < 45) return 'just now';
      if (diff < 3600) return Math.round(diff/60) + 'm ago';
      if (diff < 86400) return Math.round(diff/3600) + 'h ago';
      return Math.round(diff/86400) + 'd ago';
    } catch { return ''; }
  }

  function bubbleHTML(name, text, whenISO, extraMeta) {
    const timeLabel = whenISO ? (' • ' + escape(relTime(whenISO))) : '';
    const metaTail  = extraMeta ? (' • ' + escape(extraMeta)) : '';
    return `
      <div class="sbz-text">${escapeWithBreaks(text || '')}</div>
      <div class="sbz-meta"><strong>${escape(name)}</strong>${timeLabel}${metaTail}</div>
    `;
  }

  function renderServerMessage(m, bumpId = true) {
    const id = Number(m.id || 0);
    const role = (m.role === 'agent') ? 'agent' : 'visitor';
    const name = (role === 'agent')
      ? ((m && m.origin === 'mia') ? 'Mia — AI Assistant' : agentLabel)
      : visitorLabel;

    if (id && renderedIds.has(id)) return;

    if (id && pendingById.has(id)) {
      const el = pendingById.get(id);
      el.classList.remove('pending');
      el.dataset.id = String(id);
      el.querySelector('.sbz-meta').innerHTML = `<strong>${escape(name)}</strong> • ${escape(relTime(m.createdAt))}`;
      renderedIds.add(id);
      if (bumpId && id > lastId) lastId = id;
      pendingById.delete(id);
      for (let i=0;i<pendingQueue.length;i++) if (pendingQueue[i].el === el) { pendingQueue.splice(i,1); break; }
      return;
    }

    if (role === 'visitor' && pendingQueue.length) {
      const idx = pendingQueue.findIndex(p => (p.text === (m.text || '')));
      if (idx !== -1) {
        const p = pendingQueue[idx];
        p.el.classList.remove('pending');
        if (id) {
          p.el.dataset.id = String(id);
          renderedIds.add(id);
          if (bumpId && id > lastId) lastId = id;
        }
        p.el.querySelector('.sbz-meta').innerHTML = `<strong>${escape(name)}</strong> • ${escape(relTime(m.createdAt))}`;
        pendingQueue.splice(idx,1);
        return;
      }
    }

    const el = h('div', { class: 'sbz-msg ' + role });
    el.innerHTML = bubbleHTML(name, m.text || '', m.createdAt || '');
    if (id) {
      el.dataset.id = String(id);
      renderedIds.add(id);
      if (bumpId && id > lastId) lastId = id;
    }
    scroll.appendChild(el);
  }

  function renderPendingVisitor(text) {
    const el = h('div', { class: 'sbz-msg visitor pending' });
    el.innerHTML = bubbleHTML(visitorLabel, text || '', new Date().toISOString(), 'sending…');
    scroll.appendChild(el);
    pendingQueue.push({ text, el, tmpAtISO: new Date().toISOString() });
    return el;
  }

  // Create/ensure an anonymous session (HttpOnly cookie) — no client token
  function ensureSession() {
    if (hasSession) return Promise.resolve(true);

    // Use a localStorage flag so we don't keep creating threads every page load
    const FLAG = 'sbz_chat_has_cookie';
    const seen = (() => { try { return localStorage.getItem(FLAG) === '1'; } catch(_) { return false; } })();

    if (seen) {
      hasSession = true; // assume cookie is still good; if not, the server will 404 on messages and we’ll re-open
      return Promise.resolve(true);
    }

    dbg("No session cookie yet, requesting /open…");
    return callAPI('open', { displayName: '', email: '' })
      .then(j => {
        hasSession = true;
        try { localStorage.setItem(FLAG, '1'); } catch(_){}
        dbg("Anonymous chat established", { postId: j && j.postId });
        if (j && typeof j.postId !== 'undefined' && j.postId !== null) {
          threadId = Number(j.postId) || null;
          if (threadId && window.SBZ_CHAT_BRIDGE && typeof window.SBZ_CHAT_BRIDGE.thread === 'function') {
            try { window.SBZ_CHAT_BRIDGE.thread(threadId); } catch(_){}
          }
        }
        return true;
      })
      .catch(err => { derr("Failed to open chat:", err); hasSession = false; });
  }

  // Send
  sendBtn.addEventListener('click', onSend);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } });

  function onSend() {
    if (sendingLock) return; // debounce/idempotent client guard
    const text = (input.value || '').trim();
    if (!text) return;
    sendingLock = true;

    const pendingEl = renderPendingVisitor(text);
    scrollToBottom();

    const cid = 'm' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,8);

    ensureSession().then(() => {
      sendBtn.disabled = true;
      return callAPI('send', { message: text, cid });
    }).then((resp) => {
      dbg("Send response:", resp);
      if (!firedFirst && window.SBZ_CHAT_BRIDGE && typeof window.SBZ_CHAT_BRIDGE.firstMessage === 'function') {
        try { window.SBZ_CHAT_BRIDGE.firstMessage(); } catch(_) {}
        firedFirst = true;
      }
      if (resp && Number(resp.id)) {
        const id = Number(resp.id);
        pendingEl.dataset.id = String(id);
        pendingById.set(id, pendingEl);
      }
      input.value = '';
      input.dispatchEvent(new Event('input'));
      setTimeout(fetchMessages, 350);
    }).catch(err => {
      derr("Send failed:", err);
      input.value = '';
      input.dispatchEvent(new Event('input'));
    }).finally(() => { sendBtn.disabled = false; sendingLock = false; });
  }

  // Poll
  function fetchMessages() {
    const doFetch = () => {
      const payload = {}; if (lastId) payload.afterId = String(lastId);
      dbg("Fetching messages, afterId:", lastId || 0);

      callAPI('messages', payload)
        .then(j => {
          dbg("Messages response:", j);
          if (!threadId && j && typeof j.postId !== 'undefined' && j.postId !== null) {
            threadId = Number(j.postId) || null;
            if (threadId && window.SBZ_CHAT_BRIDGE && typeof window.SBZ_CHAT_BRIDGE.thread === 'function') {
              try { window.SBZ_CHAT_BRIDGE.thread(threadId); } catch(_){}
            }
          }
          if (j && j.agentLabel) agentLabel = j.agentLabel;
          const list = j && j.messages || [];
          if (list.length) {
            let newAgents = 0;
            list.forEach(m => {
              if (!m || !('role' in m)) return;
              renderServerMessage(m, true);
              if (!open && m.role === 'agent') newAgents++;
            });
            if (!open && newAgents) setBadge(unread + newAgents);
            scrollToBottom();
          }
        })
        .catch(err => {
          // If server says 404 (no session), re-open and retry once
          if (err && err.status === 404) {
            dwarn("No active chat session (404). Re-opening…");
            hasSession = false;
            try { localStorage.removeItem('sbz_chat_has_cookie'); } catch(_){}
            ensureSession().then(() => {
              // retry once after open
              const p = {}; if (lastId) p.afterId = String(lastId);
              return callAPI('messages', p).then(j => {
                const list = j && j.messages || [];
                if (list.length) {
                  let newAgents = 0;
                  list.forEach(m => {
                    if (!m || !('role' in m)) return;
                    renderServerMessage(m, true);
                    if (!open && m.role === 'agent') newAgents++;
                  });
                  if (!open && newAgents) setBadge(unread + newAgents);
                  scrollToBottom();
                }
              });
            }).catch(e2 => derr("Re-open failed:", e2));
            return;
          }
          derr("Fetch messages failed:", err);
        });
    };

    if (!hasSession) {
      ensureSession().then(() => doFetch());
      return;
    }
    doFetch();
  }

  // ---- Initial layout corrections ----
  function syncPositions(){
    placeWidget();
    if (panel.classList.contains('open')) {
      panel.style.right = '24px';
    }
  }
  setInterval(syncPositions, 1000);
})();
