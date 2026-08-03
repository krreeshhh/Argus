// 📁 favorites/fetch-favorites.js

const FAVORITE_CACHE_KEY = 'cachedFavorites';
const FAVORITE_CACHE_TIME_KEY = 'cachedFavoritesTimestamp';
const FAVORITE_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export async function fetchFavorites() {
  const now = Date.now();
  const lastFetch = parseInt(localStorage.getItem(FAVORITE_CACHE_TIME_KEY), 10);
  const cached = localStorage.getItem(FAVORITE_CACHE_KEY);

  if (cached && lastFetch && (now - lastFetch < FAVORITE_CACHE_DURATION)) {
    try {
      window.favorites = JSON.parse(cached);
      return window.favorites;
    } catch (e) {
      // Ignore parse errors silently in production
    }
  }

  const token = sessionStorage.getItem('jwt') || localStorage.getItem('jwt');

  if (!token) {
    window.favorites = [];
    return [];
  }

  try {
    const res = await fetch('https://skynest-image-du76smmzva-uc.a.run.app/api/favorites', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!res.ok) {
      throw new Error(`Server responded with status ${res.status}`);
    }

    const json = await res.json();

    if (!Array.isArray(json)) {
      window.favorites = [];
      return [];
    }

    window.favorites = json;

    localStorage.setItem(FAVORITE_CACHE_KEY, JSON.stringify(json));
    localStorage.setItem(FAVORITE_CACHE_TIME_KEY, now.toString());

    return json;
  } catch (err) {
    window.favorites = [];
    return [];
  }
}
