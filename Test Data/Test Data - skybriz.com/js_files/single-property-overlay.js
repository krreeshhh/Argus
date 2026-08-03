function safeText(v, fallback = "N/A") {
  if (v === null || v === undefined) return fallback;
  const s = String(v);
  return s.trim() === "" ? fallback : s;
}

function safeUrl(url, fallback = "") {
  if (!url) return fallback;
  try {
    const u = new URL(String(url), window.location.origin);
    if (u.protocol === "http:" || u.protocol === "https:") return u.href;
    return fallback;
  } catch {
    return fallback;
  }
}

function getSkynestHelpers() {
  return window.SkybrizSkynest || {};
}

function openSinglePropertyOverlay(property, options = {}) {
  const helpers = getSkynestHelpers();
  const browseUrl = helpers.browsePath ? helpers.browsePath() : "/skynest/browse/";
  const nextProperty = typeof helpers.enrichProperty === "function" ? helpers.enrichProperty(property) : property;
  const overlay = document.getElementById("single-property-overlay");
  const listingOverlay = document.getElementById("property-listing-overlay");
  const content = document.getElementById("single-property-content");
  if (!overlay || !content) return;

  const closeOverlayView = (historyMode = "auto") => {
    if (typeof helpers.closeOverlay === "function") {
      helpers.closeOverlay(overlay);
      if (listingOverlay) helpers.closeOverlay(listingOverlay);
    } else {
      overlay.classList.remove("visible");
      overlay.classList.add("hidden");
    }

    if (historyMode === "replace") {
      window.history.replaceState({ skynestView: "browse" }, "", browseUrl);
    } else if (historyMode === "push") {
      window.history.pushState({ skynestView: "browse" }, "", browseUrl);
    } else if (window.location.pathname !== browseUrl) {
      window.history.replaceState({ skynestView: "browse" }, "", browseUrl);
    }
  };

  // Clear safely
  content.replaceChildren();

  // Close button (no innerHTML)
  const closeBtn = document.createElement("button");
  closeBtn.id = "close-single-property-btn";
  closeBtn.className = "close-btn";
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "Close Single Property View");
  closeBtn.textContent = "Close";
  closeBtn.addEventListener("click", () => {
    closeOverlayView();
  });
  content.appendChild(closeBtn);

  // Owner block
  const owner = document.createElement("div");
  owner.className = "property-owner";

  const ownerImg = document.createElement("img");
  ownerImg.className = "owner-avatar";
  ownerImg.alt = "Owner Profile Image";
  ownerImg.src = safeUrl(nextProperty?.ownerProfileImageUrl, "https://via.placeholder.com/80");

  const ownerName = document.createElement("div");
  ownerName.className = "owner-name";
  ownerName.textContent = safeText(nextProperty?.ownerUserName, "Unknown Owner");

  owner.appendChild(ownerImg);
  owner.appendChild(ownerName);
  content.appendChild(owner);

  // Slider images (validated URLs only)
  const sliderImages = Array.isArray(nextProperty?.imageUrls) && nextProperty.imageUrls.length > 0
    ? nextProperty.imageUrls
    : nextProperty?.image
      ? [nextProperty.image]
      : ["https://via.placeholder.com/800x450?text=No+Image"];

  const slider = document.createElement("div");
  slider.className = "custom-slider";
  slider.id = "propertySlider";

  const wrapper = document.createElement("div");
  wrapper.className = "slider-wrapper";

  sliderImages.forEach((rawUrl, index) => {
    const slide = document.createElement("div");
    slide.className = "slide" + (index === 0 ? " active" : "");

    const img = document.createElement("img");
    img.alt = `Property Image ${index + 1}`;
    img.src = safeUrl(rawUrl, "https://via.placeholder.com/800x450?text=No+Image");

    slide.appendChild(img);
    wrapper.appendChild(slide);
  });

  const prev = document.createElement("button");
  prev.className = "slider-nav prev";
  prev.type = "button";
  prev.innerHTML = "&#10094;"; // static entity only

  const next = document.createElement("button");
  next.className = "slider-nav next";
  next.type = "button";
  next.innerHTML = "&#10095;"; // static entity only

  const counter = document.createElement("div");
  counter.className = "slide-counter";

  slider.appendChild(wrapper);
  slider.appendChild(prev);
  slider.appendChild(next);
  slider.appendChild(counter);

  content.appendChild(slider);

  // Title + Description
  const title = document.createElement("h1");
  title.className = "property-title";
  title.textContent = safeText(nextProperty?.title);

  const descWrap = document.createElement("div");
  descWrap.className = "property-description";

  const descH2 = document.createElement("h2");
  descH2.textContent = "Description";

  const descP = document.createElement("p");
  descP.textContent = safeText(nextProperty?.propertyDescription ?? nextProperty?.description, "No description provided.");

  descWrap.appendChild(descH2);
  descWrap.appendChild(descP);

  content.appendChild(title);
  content.appendChild(descWrap);

  // Details (helper)
  const meta = document.createElement("div");
  meta.className = "property-meta";

  function addSectionHeading(text) {
    const h2 = document.createElement("h2");
    h2.className = "section-title";
    h2.textContent = text;
    meta.appendChild(h2);
  }

  function addRow(label, value) {
    const p = document.createElement("p");
    const strong = document.createElement("strong");
    strong.textContent = label;
    p.appendChild(strong);
    p.appendChild(document.createTextNode(" " + safeText(value)));
    meta.appendChild(p);
  }

  addSectionHeading("📍 Location");
  addRow("Available:", nextProperty?.dateAvailable ?? nextProperty?.available_date ?? "N/A");
  addRow("Address:", nextProperty?.address ?? "N/A");
  addRow("City:", nextProperty?.city ?? "N/A");
  addRow("State:", nextProperty?.state ?? "N/A");
  addRow("Zip Code:", nextProperty?.zipCode ?? "N/A");

  addSectionHeading("🛏️ Unit Details");
  addRow("Bedrooms:", nextProperty?.numberOfRooms ?? "N/A");
  addRow("Bathrooms:", nextProperty?.numberOfBathrooms ?? "N/A");
  addRow("Laundry Options:", nextProperty?.laundryOptions ?? "N/A");
  addRow("Has Garage:", nextProperty?.hasGarage ? "Yes" : "No");
  addRow("Number of Garages:", nextProperty?.numberOfGarages ?? "N/A");

  addSectionHeading("❄️ Systems & Amenities");
  addRow("Type of Cooling:", nextProperty?.typeOfCooling ?? "N/A");
  addRow("Type of Heating:", nextProperty?.typeOfHeating ?? "N/A");
  addRow("Pets Allowed:", nextProperty?.petsAllowed ? "Yes" : "No");

  addSectionHeading("💸 Financial Information");
  addRow("Rent:", `$${safeText(nextProperty?.rentAmount ?? nextProperty?.rent ?? "N/A")}`);
  addRow("Deposit:", `$${safeText(nextProperty?.deposit ?? "N/A")}`);
  addRow("Pet Fee:", `$${safeText(nextProperty?.petFee ?? "N/A")}`);
  addRow("Credit Score Required:", nextProperty?.creditScoreRequired ?? "N/A");

  content.appendChild(meta);

  const links = document.createElement("div");
  links.className = "cta-section";

  const detailLink = document.createElement("a");
  detailLink.className = "apply-button";
  detailLink.href = safeUrl(nextProperty?.permalink || helpers.propertyUrl?.(nextProperty), browseUrl);
  detailLink.textContent = "Open full details";
  detailLink.setAttribute("data-skynest-track", "overlay_detail_page_click");
  if (nextProperty?.slug) detailLink.setAttribute("data-skynest-property", String(nextProperty.slug));
  links.appendChild(detailLink);

  content.appendChild(links);

  // CTA (no inline onclick)
  const cta = document.createElement("div");
  cta.className = "cta-section";

  const applyBtn = document.createElement("button");
  applyBtn.className = "apply-button";
  applyBtn.type = "button";
  applyBtn.textContent = "Apply Now";
  applyBtn.addEventListener("click", () => {
    window.showToast?.("🚧 The Apply feature is not yet available.");
  });

  // 24h contact lock
  const contactId = safeText(nextProperty?.propertyId ?? nextProperty?.id, "");
  const contactKey = contactId ? `contacted_${contactId}` : "";
  const last = contactKey ? localStorage.getItem(contactKey) : null;
  const isDisabled = last && (Date.now() - parseInt(last, 10) < 86400000);

  const contactBtn = document.createElement("button");
  contactBtn.id = "contact-button";
  contactBtn.className = "contact-button";
  contactBtn.type = "button";
  contactBtn.textContent = isDisabled ? "Already Contacted" : "Contact Manager";
  if (isDisabled) contactBtn.disabled = true;

  // Set data-* safely (attributes are fine when set via setAttribute)
  if (contactId) contactBtn.setAttribute("data-property-id", contactId);
  if (nextProperty?.ownerId) contactBtn.setAttribute("data-owner-id", String(nextProperty.ownerId));
  contactBtn.setAttribute("data-owner-name", safeText(nextProperty?.ownerUserName, "Unknown Owner"));
  contactBtn.setAttribute("data-address", safeText(nextProperty?.address, "N/A"));
  contactBtn.setAttribute("data-skynest-track", "overlay_contact_click");
  if (nextProperty?.slug) contactBtn.setAttribute("data-skynest-property", String(nextProperty.slug));

  cta.appendChild(applyBtn);
  cta.appendChild(contactBtn);

  content.appendChild(cta);

  // Show overlay
  if (typeof helpers.openOverlay === "function") {
    helpers.openOverlay(overlay);
    if (listingOverlay) helpers.closeOverlay(listingOverlay);
  } else {
    overlay.classList.remove("hidden");
    overlay.classList.add("visible");
  }

  if (!options.skipHistory) {
    const propertyUrl = safeUrl(nextProperty?.permalink || helpers.propertyUrl?.(nextProperty), "");
    if (propertyUrl && propertyUrl !== window.location.href) {
      window.history.pushState(
        { skynestView: "property", propertySlug: nextProperty?.slug || "" },
        "",
        propertyUrl
      );
    }
  }

  // Init slider
  function tryInitSlider(attempt = 0) {
    const s = document.getElementById("propertySlider");
    if (s && typeof window.initPropertySlider === "function") {
      window.initPropertySlider();
    } else if (attempt < 10) {
      requestAnimationFrame(() => tryInitSlider(attempt + 1));
    }
  }
  requestAnimationFrame(() => tryInitSlider());

  // Init contact handler
  if (typeof window.initContactButtonHandler === "function") {
    window.initContactButtonHandler();
  }

  if (typeof helpers.emitTrack === "function") {
    helpers.emitTrack("overlay_property_view", {
      label: safeText(nextProperty?.title, "Property"),
      property: nextProperty?.slug || "",
    });
  }
}

window.openSinglePropertyOverlay = openSinglePropertyOverlay;
