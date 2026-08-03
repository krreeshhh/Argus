// 📁 property-map.js
// This is the main entry point that pulls everything together and runs the map + rendering logic

import { fetchProperties } from './property-data.js';
import { initMap } from './map-init.js';
import { renderPropertyList } from './property-render.js';

function waitForGoogleMaps(timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();

    function check() {
      if (window.google && window.google.maps) {
        resolve();
        return;
      }
      if (Date.now() - started >= timeoutMs) {
        reject(new Error('Google Maps failed to load'));
        return;
      }
      window.setTimeout(check, 100);
    }

    check();
  });
}

window.addEventListener("DOMContentLoaded", async () => {
  const loader = document.getElementById('map-loading');
  if (typeof window.showSpinner === 'function') {
    if (loader) {
      window.showSpinner('#map-loading', 'Loading properties...');
    } else {
      window.showSpinner('Loading properties...');
    }
  }

  try {
    const data = await fetchProperties();
    const enrich = window.SkybrizSkynest?.enrichProperty;
    window.properties = Array.isArray(data)
      ? data.map((property) => (typeof enrich === 'function' ? enrich(property) : property))
      : [];

    await waitForGoogleMaps();
    initMap();
    renderPropertyList(window.properties);
    window.SkybrizSkynest?.syncBrowseState?.();

  } catch (err) {
    const grid = document.getElementById('overlay-property-list');
    if (grid) {
      grid.innerHTML = `<p style="color:#e74c3c; text-align:center;">⚠️ Failed to load properties. Please try again later.</p>`;
    }
    if (typeof window.showToast === 'function') {
      window.showToast('Failed to load rentals. Please try again.', 'error');
    }
  } finally {
    if (typeof window.hideSpinner === 'function') {
      if (loader) {
        window.hideSpinner('#map-loading');
      } else {
        window.hideSpinner();
      }
    }
  }
});
