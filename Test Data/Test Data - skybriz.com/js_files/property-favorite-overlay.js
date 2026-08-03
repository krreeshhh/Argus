// 📁 favorites/property-favorite-overlay.js

import { fetchFavorites } from './fetch-favorites.js';

document.addEventListener('DOMContentLoaded', () => {
  const favoriteBtn = document.getElementById('favorites-btn');
  const overlay = document.getElementById('property-favorite-overlay');
  const closeBtn = document.getElementById('close-favorite-overlay-btn');

  if (!favoriteBtn) {
    return;
  }
  if (!overlay) {
    return;
  }
  if (!closeBtn) {
    return;
  }

  favoriteBtn.addEventListener('click', async () => {
    const isActive = favoriteBtn.classList.toggle('active');
    favoriteBtn.setAttribute('aria-pressed', isActive);

    if (isActive) {
      await fetchFavorites(); // ✅ Load favorites from server before proceeding

      if (!window.favorites || !Array.isArray(window.favorites)) {
        if (typeof window.showToast === 'function') {
          window.showToast("❌ Something went wrong loading your favorites.");
        }
        return;
      }

      if (window.favorites.length === 0) {
        if (typeof window.showToast === 'function') {
          window.showToast("⚠️ You haven't favorited any properties yet.");
        }
        return;
      }

      renderFavoriteList(window.favorites);

      const container = document.getElementById('overlay-favorite-list');
      if (container) {
        const count = container.children.length;
        if (count === 0) {
          if (typeof window.showToast === 'function') {
            window.showToast("⚠️ No favorite properties found to display.");
          }
        }
      }

      overlay.classList.remove('hidden');
      overlay.classList.add('visible');
    } else {
      overlay.classList.add('hidden');
      overlay.classList.remove('visible');
    }
  });

  closeBtn.addEventListener('click', () => {
    overlay.classList.add('hidden');
    overlay.classList.remove('visible');
    favoriteBtn.classList.remove('active');
    favoriteBtn.setAttribute('aria-pressed', false);
  });
});
