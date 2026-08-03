// map/property-data.js

/* tiny string table (base64) → atob */
const __T = (function () {
  const __A = [
    "Y2FjaGVkUHJvcGVydGllcw==",              // 0 -> cachedProperties
    "Y2FjaGVkUHJvcGVydGllc1RpbWVzdGFtcA==",  // 1 -> cachedPropertiesTimestamp
    "anNvbg==",                              // 2 -> json
    "c3RyaW5naWZ5",                          // 3 -> stringify
    "bm8tc3RvcmU=",                          // 4 -> no-store
    "YXBwbGljYXRpb24vanNvbg==",              // 5 -> application/json
    "R0VU",                                  // 6 -> GET
    "L3dwLWpzb24vc2t5YnJpei92MS9wcm9wZXJ0aWVz" // 7 -> /wp-json/skybriz/v1/properties
  ];
  const __C = Object.create(null);
  return i => __C[i] || (__C[i] = atob(__A[i]));
})();

const CACHE_KEY      = __T(0);
const CACHE_TIME_KEY = __T(1);
const CACHE_MS       = 10 * 60 * 1000; // 10 min

/* ==== PUBLIC API ==== */
export async function fetchProperties() {
  const now   = Date.now();
  const last  = parseInt(localStorage.getItem(CACHE_TIME_KEY), 10);
  const cache = localStorage.getItem(CACHE_KEY);

  if (cache && last && (now - last < CACHE_MS)) {
    try { return JSON.parse(cache); } catch(_) {}
  }

  try {
    const res = await fetch(__T(7), {
      method: __T(6),
      credentials: "include",
      cache: __T(4),
      headers: { "Accept": __T(5) }
    });

    if (!res.ok) {
      return [];
    }

    const data = await res[__T(2)]();
    if (!Array.isArray(data)) return [];

    localStorage.setItem(CACHE_KEY, JSON[__T(3)](data));
    localStorage.setItem(CACHE_TIME_KEY, String(now));
    return data;
  } catch(_) {
    return [];
  }
}

export default fetchProperties;

// Optional global for non-module callers
if (typeof window !== "undefined") {
  window.fetchProperties = fetchProperties;
}
