// This is map/property-listing-overlay.js

document.addEventListener('DOMContentLoaded', () => {
  const listingBtn = document.getElementById('listing-btn');
  const overlay = document.getElementById('property-listing-overlay');
  const closeBtn = document.getElementById('close-listing-overlay-btn');
  const openOverlay = window.SkybrizSkynest?.openOverlay;
  const closeOverlay = window.SkybrizSkynest?.closeOverlay;

  if (!listingBtn) {
    return;
  }
  if (!overlay) {
    return;
  }
  if (!closeBtn) {
    return;
  }

  listingBtn.addEventListener('click', () => {
    const isActive = listingBtn.classList.toggle('active');
    listingBtn.setAttribute('aria-pressed', isActive);

    if (isActive) {
      if (!window.properties || !Array.isArray(window.properties)) {
        if (typeof window.showToast === 'function') {
          window.showToast("❌ Something went wrong loading the listings.");
        }
        return;
      }

      if (window.properties.length === 0) {
        if (typeof window.showToast === 'function') {
          window.showToast("⚠️ No listings available right now.");
        }
        return;
      }

      renderPropertyList(window.properties);

      const container = document.getElementById('overlay-property-list');
      if (container) {
        const count = container.children.length;
        if (count === 0) {
          if (typeof window.showToast === 'function') {
            window.showToast("⚠️ No properties found to display.");
          }
        }
      }

      if (typeof openOverlay === 'function') {
        openOverlay(overlay);
      } else {
        overlay.classList.remove('hidden');
        overlay.classList.add('visible');
      }
    } else {
      if (typeof closeOverlay === 'function') {
        closeOverlay(overlay);
      } else {
        overlay.classList.add('hidden');
        overlay.classList.remove('visible');
      }
    }
  });

  closeBtn.addEventListener('click', () => {
    if (typeof closeOverlay === 'function') {
      closeOverlay(overlay);
    } else {
      overlay.classList.add('hidden');
      overlay.classList.remove('visible');
    }
    listingBtn.classList.remove('active');
    listingBtn.setAttribute('aria-pressed', false);
  });
});
