// 📁 property-render.js
// Safe render: NO innerHTML with untrusted fields

function safeText(v, fallback = "N/A") {
  if (v === null || v === undefined) return fallback;
  const s = String(v);
  return s.trim() === "" ? fallback : s;
}

function safeMoney(v, fallback = "N/A") {
  if (v === null || v === undefined || v === "") return fallback;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return fallback;
  // keep it simple; format on server if you prefer
  return String(n);
}

function safeUrl(url) {
  // Allow only http(s) URLs. Everything else becomes empty -> placeholder used.
  if (!url) return "";
  try {
    const u = new URL(String(url), window.location.origin);
    if (u.protocol === "http:" || u.protocol === "https:") return u.href;
    return "";
  } catch {
    return "";
  }
}

export function renderPropertyList(properties) {
  const container = document.getElementById("overlay-property-list");
  if (!container) return;

  container.replaceChildren(); // clears safely
  container.classList.add("property-grid");

  if (!Array.isArray(properties) || properties.length === 0) {
    const p = document.createElement("p");
    p.textContent = "No properties available.";
    container.appendChild(p);
    return;
  }

  const placeholder = "https://via.placeholder.com/400x250?text=No+Image";

  properties.forEach((property) => {
    const nextProperty = typeof window.SkybrizSkynest?.enrichProperty === "function"
      ? window.SkybrizSkynest.enrichProperty(property)
      : property;

    const item = document.createElement("div");
    item.className = "property-item";
    item.setAttribute("role", "listitem");
    item.tabIndex = 0;

    // Image
    const rawImg = Array.isArray(nextProperty?.imageUrls) && nextProperty.imageUrls.length > 0
      ? nextProperty.imageUrls[0]
      : "";

    const img = document.createElement("img");
    img.loading = "lazy";
    img.alt = safeText(nextProperty?.title, "Property image");
    img.src = safeUrl(rawImg) || placeholder;

    // Info wrapper
    const info = document.createElement("div");
    info.className = "info";

    const left = document.createElement("div");

    const h3 = document.createElement("h3");
    h3.textContent = safeText(nextProperty?.title);

    const pPrice = document.createElement("p");
    const strongPrice = document.createElement("strong");
    strongPrice.textContent = "Price:";
    pPrice.appendChild(strongPrice);
    pPrice.appendChild(document.createTextNode(` $${safeMoney(nextProperty?.rentAmount)}`));

    const pAddr = document.createElement("p");
    const strongAddr = document.createElement("strong");
    strongAddr.textContent = "Address:";
    pAddr.appendChild(strongAddr);
    pAddr.appendChild(document.createTextNode(` ${safeText(nextProperty?.address)}`));

    left.appendChild(h3);
    left.appendChild(pPrice);
    left.appendChild(pAddr);

    // Favorite button
    const favBtn = document.createElement("button");
    favBtn.className = "save-fav-btn";
    favBtn.type = "button";
    favBtn.setAttribute("aria-label", `Save ${safeText(nextProperty?.title)} to favorites`);
    favBtn.textContent = "♡";

    favBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isFav = favBtn.classList.toggle("favorited");
      favBtn.textContent = isFav ? "❤" : "♡";

      if (typeof window.showToast === "function") {
        window.showToast(isFav ? "✅ Added to favorites" : "❌ Removed from favorites");
      }
    });

    info.appendChild(left);
    info.appendChild(favBtn);

    item.appendChild(img);
    item.appendChild(info);

    // Open single property overlay
    const openProperty = () => {
      try {
        if (typeof openSinglePropertyOverlay === "function") {
          openSinglePropertyOverlay(nextProperty);
        }
      } catch {
        // Silent fail
      }
    };

    item.addEventListener("click", openProperty);
    item.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openProperty();
      }
    });

    container.appendChild(item);
  });
}

// 🔄 Make renderPropertyList available to non-module scripts
window.renderPropertyList = renderPropertyList;
