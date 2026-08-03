// 📁 map-init.js
// Initializes Google Map and loads markers using global property data

export let map;
export let markers = [];
export let infoWindows = [];

// ✅ Make initMap globally available for Google Maps API callback
window.initMap = initMap;

function safeText(v, fallback = "N/A") {
  if (v === null || v === undefined) return fallback;
  const s = String(v);
  return s.trim() === "" ? fallback : s;
}

function buildInfoWindowContent(property) {
  const wrap = document.createElement("div");

  const title = document.createElement("h3");
  title.textContent = safeText(property?.title);

  const addr = document.createElement("p");
  addr.textContent = safeText(property?.address);

  const price = document.createElement("p");
  const strong = document.createElement("strong");
  strong.textContent = `$${safeText(property?.rentAmount, "N/A")}/mo`;
  price.appendChild(strong);

  wrap.appendChild(title);
  wrap.appendChild(addr);
  wrap.appendChild(price);
  return wrap;
}

function isSecureGeoContext() {
  const host = String(window.location.hostname || "").toLowerCase();
  const isLoopback = host === "localhost" || host === "127.0.0.1" || host === "::1";
  return window.isSecureContext || isLoopback;
}

export function initMap() {
  const mapContainer = document.getElementById("map");
  if (!mapContainer) {
    return;
  }

  // Attempt geolocation first
  if (navigator.geolocation && isSecureGeoContext()) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const userLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        renderMap(userLocation);
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          showGeoWarning();
        }
        renderMap({ lat: 40.7128, lng: -74.0060 }); // Default: NYC
      }
    );
  } else {
    renderMap({ lat: 40.7128, lng: -74.0060 });
  }
}

function renderMap(center) {
  map = new google.maps.Map(document.getElementById("map"), {
    zoom: 12,
    center,
  });

  if (!Array.isArray(window.properties)) {
    return;
  }

  window.properties.forEach((property) => {
    const lat = parseFloat(property.latitude || property.lat);
    const lng = parseFloat(property.longitude || property.lng);

    if (isNaN(lat) || isNaN(lng)) {
      return;
    }

    const infoWindow = new google.maps.InfoWindow({
      content: buildInfoWindowContent(property),
    });

    const position = { lat, lng };
    const AdvancedMarkerElement = google?.maps?.marker?.AdvancedMarkerElement;
    const marker = typeof AdvancedMarkerElement === "function"
      ? new AdvancedMarkerElement({
          position,
          map,
          title: property.title,
        })
      : new google.maps.Marker({
          position,
          map,
          title: property.title,
        });

    markers.push(marker);
    infoWindows.push(infoWindow);

    const openInfo = () => {
      closeAllInfoWindows();
      infoWindow.open({ map, anchor: marker });
    };

    if (typeof marker.addListener === "function") {
      marker.addListener("click", openInfo);
    } else if (typeof marker.addEventListener === "function") {
      marker.addEventListener("click", openInfo);
    }
  });
}

function showGeoWarning() {
  const overlay = document.createElement("div");
  overlay.className = "geo-warning-overlay";
  overlay.innerHTML = `
    <div class="geo-warning-modal">
      <p>
        📍 Location permission was denied.<br>
        Please enable location services in your browser settings to see nearby listings.
      </p>
      <button class="geo-warning-close">OK</button>
    </div>
  `;

  document.body.appendChild(overlay);

  // ✅ Use overlay.querySelector to ensure scoped selection
  const closeButton = overlay.querySelector(".geo-warning-close");
  if (closeButton) {
    closeButton.addEventListener("click", () => {
      overlay.classList.add("hidden"); // optional fade out
      setTimeout(() => overlay.remove(), 300); // wait for CSS transition
    });
  }
}

export function closeAllInfoWindows() {
  infoWindows.forEach((iw) => iw.close());
}
