// Socket bootstrap for the property contact flow.
// Uses the SkyNest auth bridge as the source of truth for session + socket auth.

(function () {
  if (typeof io === 'undefined') {
    console.warn('Socket.IO client not loaded. Skipping property socket init.');
    return;
  }

  const SOCKET_URL = 'https://skynest-image-du76smmzva-uc.a.run.app';
  const SOCKET_PATH = '/chat';
  let inflightToken = null;
  let activeToken = null;
  let connectPromise = null;

  function getRestNonce() {
    return (window.SBZ_AUTH && window.SBZ_AUTH.nonce)
      || (window.SBZ_COOKIE && window.SBZ_COOKIE.nonce)
      || (window.wpApiSettings && window.wpApiSettings.nonce)
      || '';
  }

  async function fetchMe() {
    try {
      const resp = await fetch('/wp-json/skybriz/v1/me', {
        credentials: 'include',
        cache: 'no-store'
      });
      if (!resp.ok) return null;
      return await resp.json().catch(() => null);
    } catch {
      return null;
    }
  }

  async function sharedSocketToken(forceRefresh) {
    if (!forceRefresh && typeof window.getSocketToken === 'function') {
      const token = await window.getSocketToken();
      if (token) {
        activeToken = token;
        return token;
      }
    }
    return fetchSocketToken(forceRefresh);
  }

  async function fetchSocketToken(forceRefresh) {
    if (!forceRefresh && activeToken) return activeToken;
    if (!forceRefresh && inflightToken) return inflightToken;

    inflightToken = fetch('/wp-json/skybriz/v1/socket-token', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-WP-Nonce': getRestNonce()
      }
    })
      .then(async (resp) => {
        if (!resp.ok) return null;
        const json = await resp.json().catch(() => null);
        activeToken = json?.token || null;
        return activeToken;
      })
      .catch(() => null)
      .finally(() => {
        inflightToken = null;
      });

    return inflightToken;
  }

  async function connect(forceRefresh) {
    if (!forceRefresh && window.socket && window.socket.connected) {
      return window.socket;
    }
    if (!forceRefresh && connectPromise) {
      return connectPromise;
    }

    connectPromise = (async () => {
    const me = await fetchMe();
    if (!me || !me.userId) return null;

    const token = await sharedSocketToken(forceRefresh);
    if (!token) return null;

    if (window.socket && window.socket.connected) return;
    if (window.socket) {
      try { window.socket.disconnect(); } catch {}
      window.socket = null;
    }

    const socket = io(SOCKET_URL, {
      path: SOCKET_PATH,
      auth: { token },
      transports: ['websocket', 'polling'],
      withCredentials: false
    });

    const ready = new Promise((resolve, reject) => {
      const cleanup = () => {
        socket.off('connect', onConnect);
        socket.off('connect_error', onError);
      };

      const onConnect = () => {
        window.socket = socket;
        cleanup();
        resolve(socket);
      };

      const onError = (err) => {
        cleanup();
        reject(err);
      };

      socket.on('connect', onConnect);
      socket.on('connect_error', onError);
    });

    socket.on('connect_error', async (err) => {
      const text = String(err?.message || '').toLowerCase();
      if (text.includes('expired') || text.includes('invalid') || text.includes('unauthorized')) {
        activeToken = null;
        if (typeof window.__sbzAccessToken !== 'undefined') {
          window.__sbzAccessToken = null;
        }
        const refreshed = await sharedSocketToken(true);
        if (refreshed) {
          socket.auth = { token: refreshed };
          socket.connect();
          return;
        }
      }
      console.error('Property socket failed:', err?.message || err);
    });

    socket.on('disconnect', () => {
      if (window.socket === socket) window.socket = null;
    });

    window.socket = socket;
      return ready.catch((err) => {
        if (window.socket === socket) {
          window.socket = null;
        }
        return Promise.reject(err);
      });
    })().finally(() => {
      connectPromise = null;
    });

    return connectPromise;
  }

  window.ensurePropertySocket = function (forceRefresh) {
    return connect(!!forceRefresh);
  };

  window.addEventListener('auth:login', () => {
    connect(true).catch(() => {});
  });

  window.addEventListener('auth:logout', () => {
    activeToken = null;
    if (typeof window.__sbzAccessToken !== 'undefined') {
      window.__sbzAccessToken = null;
    }
    try {
      if (window.socket) window.socket.disconnect();
    } catch {}
    window.socket = null;
  });
})();
