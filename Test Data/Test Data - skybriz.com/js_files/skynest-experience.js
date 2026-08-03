(function () {
  const cfg = window.SKYBRIZ_SKYNEST_CFG || {};

  function emitTrack(name, detail = {}) {
    const payload = {
      event_category: 'SkyNest',
      event_label: detail.label || '',
      ...detail,
    };

    document.dispatchEvent(new CustomEvent('skynest:track', { detail: { name, ...payload } }));

    if (typeof window.gtag === 'function') {
      window.gtag('event', name, payload);
    }

    if (Array.isArray(window.dataLayer)) {
      window.dataLayer.push({ event: name, skynest: payload });
    }
  }

  function slugify(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function propertySlug(property) {
    const title = slugify(property?.title || 'rental');
    const city = slugify(property?.city || '');
    const rawId = String(property?.propertyId || property?.id || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
    const suffix = rawId ? rawId.slice(0, 8) : '';
    return [title, city, suffix].filter(Boolean).join('-');
  }

  function propertyUrl(property) {
    const base = String(cfg.propertyBaseUrl || '/property/').replace(/\/+$/, '');
    const slug = propertySlug(property);
    return slug ? `${base}/${slug}/` : String(cfg.browseUrl || '/skynest/browse/');
  }

  function enrichProperty(property) {
    if (!property || typeof property !== 'object') return property;
    const next = { ...property };
    next.slug = next.slug || propertySlug(next);
    next.permalink = next.permalink || propertyUrl(next);
    return next;
  }

  function findPropertyBySlug(slug) {
    if (!slug || !Array.isArray(window.properties)) return null;
    return window.properties.find((property) => enrichProperty(property).slug === slug) || null;
  }

  function openOverlay(el) {
    if (!el) return;
    el.hidden = false;
    el.removeAttribute('hidden');
    el.setAttribute('aria-hidden', 'false');
    el.classList.remove('hidden');
    el.classList.add('visible');
  }

  function closeOverlay(el) {
    if (!el) return;
    el.classList.add('hidden');
    el.classList.remove('visible');
    el.setAttribute('aria-hidden', 'true');
    window.setTimeout(() => {
      if (el.classList.contains('hidden')) {
        el.hidden = true;
        el.setAttribute('hidden', '');
      }
    }, 320);
  }

  function getPathName() {
    return `${window.location.pathname}`.replace(/\/+$/, '/') || '/';
  }

  function browsePath() {
    try {
      return new URL(String(cfg.browseUrl || '/skynest/browse/'), window.location.origin).pathname.replace(/\/+$/, '/') || '/';
    } catch {
      return '/skynest/browse/';
    }
  }

  function propertySlugFromPath(path) {
    const match = String(path || '').match(/\/property\/([^/]+)\/?$/);
    return match ? match[1] : '';
  }

  document.addEventListener('click', (event) => {
    const node = event.target.closest('[data-skynest-track]');
    if (!node) return;
    emitTrack(node.getAttribute('data-skynest-track') || 'skynest_click', {
      label: node.textContent ? node.textContent.trim() : '',
      property: node.getAttribute('data-skynest-property') || '',
      href: node.getAttribute('href') || '',
    });
  }, true);

  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (form && form.id === 'add-property-form') {
      emitTrack('owner_form_submit', { label: 'Add property form submit' });
    }
  }, true);

  window.addEventListener('load', () => {
    if (document.getElementById('add-property-form')) {
      emitTrack('owner_form_view', { label: 'Add property overlay present' });
    }

    if (cfg.isProperty) {
      emitTrack('property_detail_view', {
        label: document.title || 'Property detail',
        path: window.location.pathname,
      });
    }
  });

  window.SkybrizSkynest = {
    emitTrack,
    slugify,
    propertySlug,
    propertyUrl,
    enrichProperty,
    findPropertyBySlug,
    openOverlay,
    closeOverlay,
    browsePath,
    propertySlugFromPath,
    syncBrowseState() {
      if (!cfg.isBrowse) return;
      const path = getPathName();
      const singleOverlay = document.getElementById('single-property-overlay');
      const listingOverlay = document.getElementById('property-listing-overlay');
      const slug = propertySlugFromPath(path);

      if (!slug) {
        closeOverlay(singleOverlay);
        return;
      }

      const property = findPropertyBySlug(slug);
      if (!property || typeof window.openSinglePropertyOverlay !== 'function') return;

      closeOverlay(listingOverlay);
      window.openSinglePropertyOverlay(property, { skipHistory: true });
    },
  };

  window.addEventListener('popstate', () => {
    if (window.SkybrizSkynest?.syncBrowseState) {
      window.SkybrizSkynest.syncBrowseState();
    }
  });
})();
