(function () {
  "use strict";

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function initSlider(root) {
    const slider = root.querySelector("[data-slider]");
    if (!slider) return;

    const track = slider.querySelector(".sbz-sci-slider__track");
    const slides = Array.from(slider.querySelectorAll(".sbz-sci-slide"));
    const prev = slider.querySelector("[data-prev]");
    const next = slider.querySelector("[data-next]");
    const thumbs = Array.from(root.querySelectorAll("[data-slide-to]"));
    const current = root.querySelector("[data-slide-current]");
    const total = root.querySelector("[data-slide-total]");
    const openers = Array.from(root.querySelectorAll("[data-open-lightbox]"));
    const lightbox = root.querySelector("[data-lightbox]");
    const lightboxImage = root.querySelector("[data-lightbox-image]");
    const lightboxCurrent = root.querySelector("[data-lightbox-current]");
    const lightboxTotal = root.querySelector("[data-lightbox-total]");
    const lightboxClose = root.querySelector("[data-close-lightbox]");
    const lightboxPrev = root.querySelector("[data-lightbox-prev]");
    const lightboxNext = root.querySelector("[data-lightbox-next]");
    let index = 0;
    let startX = 0;
    let deltaX = 0;

    if (!slides.length) return;

    function getSlideImage(newIndex) {
      return slides[newIndex]?.querySelector("img") || null;
    }

    function renderLightbox() {
      if (!lightbox || lightbox.hidden || !lightboxImage) return;
      const img = getSlideImage(index);
      if (!img) return;
      lightboxImage.src = img.currentSrc || img.src || "";
      lightboxImage.alt = img.alt || "";
      if (img.srcset) lightboxImage.srcset = img.srcset;
      if (lightboxCurrent) lightboxCurrent.textContent = String(index + 1);
      if (lightboxTotal) lightboxTotal.textContent = String(slides.length);
    }

    function render() {
      track.style.transform = "translateX(-" + (index * 100) + "%)";
      if (current) current.textContent = String(index + 1);
      if (total) total.textContent = String(slides.length);
      thumbs.forEach(function (thumb) {
        thumb.classList.toggle("is-active", parseInt(thumb.getAttribute("data-slide-to"), 10) === index);
      });
      renderLightbox();
    }

    function goTo(newIndex) {
      if (newIndex < 0) index = slides.length - 1;
      else if (newIndex >= slides.length) index = 0;
      else index = newIndex;
      render();
    }

    function openLightbox() {
      if (!lightbox) return;
      lightbox.hidden = false;
      document.body.classList.add("sbz-sci-no-scroll");
      renderLightbox();
    }

    function closeLightbox() {
      if (!lightbox) return;
      lightbox.hidden = true;
      document.body.classList.remove("sbz-sci-no-scroll");
    }

    prev?.addEventListener("click", function () { goTo(index - 1); });
    next?.addEventListener("click", function () { goTo(index + 1); });
    thumbs.forEach(function (thumb) {
      thumb.addEventListener("click", function () { goTo(parseInt(thumb.getAttribute("data-slide-to"), 10) || 0); });
    });

    track.addEventListener("touchstart", function (event) {
      startX = event.touches[0].clientX;
      deltaX = 0;
    }, { passive: true });
    track.addEventListener("touchmove", function (event) {
      deltaX = event.touches[0].clientX - startX;
    }, { passive: true });
    track.addEventListener("touchend", function () {
      if (Math.abs(deltaX) > 40) goTo(deltaX > 0 ? index - 1 : index + 1);
    });

    openers.forEach(function (opener) {
      opener.addEventListener("click", function (event) {
        if (event.target.closest("[data-prev]") || event.target.closest("[data-next]")) return;
        openLightbox();
      });
    });

    lightboxClose?.addEventListener("click", closeLightbox);
    lightboxPrev?.addEventListener("click", function () { goTo(index - 1); });
    lightboxNext?.addEventListener("click", function () { goTo(index + 1); });
    lightbox?.addEventListener("click", function (event) { if (event.target === lightbox) closeLightbox(); });
    document.addEventListener("keydown", function (event) {
      if (!lightbox || lightbox.hidden) return;
      if (event.key === "Escape") closeLightbox();
      if (event.key === "ArrowLeft") goTo(index - 1);
      if (event.key === "ArrowRight") goTo(index + 1);
    });

    render();
  }

  async function trackView(entryId) {
    if (!entryId) return;
    try {
      await fetch(SBZSkyCastInteractive.restRoot + "track-view", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-WP-Nonce": SBZSkyCastInteractive.nonce,
        },
        body: JSON.stringify({ entry_id: parseInt(entryId, 10) }),
      });
    } catch (error) {
      // Quiet on purpose.
    }
  }

  async function loadResults(entryId, container) {
    if (!entryId || !container) return;
    try {
      const response = await fetch(SBZSkyCastInteractive.restRoot + "results/" + encodeURIComponent(entryId), {
        headers: { "X-WP-Nonce": SBZSkyCastInteractive.nonce },
      });
      const data = await response.json();
      if (!data || !data.success) {
        container.textContent = data?.message || SBZSkyCastInteractive.i18n.resultsUnavailable;
        return;
      }

      const results = data.data || {};
      if (Array.isArray(results.breakdown)) {
        container.innerHTML = results.breakdown.map(function (item) {
          return '<div class="sbz-sci-result-row"><span>' +
            escapeHtml(item.label || item.key || "") +
            '</span><strong>' +
            escapeHtml(String(item.count || 0)) +
            (typeof item.percent !== "undefined" ? ' <small>(' + escapeHtml(String(item.percent)) + '%)</small>' : '') +
            '</strong></div>';
        }).join("");
        return;
      }

      container.textContent = SBZSkyCastInteractive.i18n.resultsUnavailable;
    } catch (error) {
      container.textContent = SBZSkyCastInteractive.i18n.submitError;
    }
  }

  function setLockAnswer(root, answerText) {
    const answer = root.querySelector("[data-lock-answer]");
    if (!answer) return;
    if (answerText) {
      answer.hidden = false;
      answer.textContent = answerText;
    } else {
      answer.hidden = true;
      answer.textContent = "";
    }
  }

  function lockForm(root, titleText, feedbackText, answerText) {
    const form = root.querySelector("[data-sbz-form]");
    const lock = root.querySelector("[data-sbz-locked]");
    const statusCheck = root.querySelector("[data-sbz-status-check]");
    if (statusCheck) statusCheck.hidden = true;
    if (form) {
      form.hidden = true;
      form.setAttribute("data-form-locked", "1");
    }
    if (lock) {
      lock.hidden = false;
      const title = lock.querySelector("[data-lock-title]");
      const message = lock.querySelector("[data-lock-message]");
      if (title && titleText) title.textContent = titleText;
      if (message && feedbackText) message.textContent = feedbackText;
    }
    setLockAnswer(root, answerText);
  }

  function unlockForm(root) {
    const form = root.querySelector("[data-sbz-form]");
    const lock = root.querySelector("[data-sbz-locked]");
    const statusCheck = root.querySelector("[data-sbz-status-check]");
    if (statusCheck) statusCheck.hidden = true;
    if (lock) lock.hidden = true;
    setLockAnswer(root, "");
    if (form) {
      form.hidden = false;
      form.removeAttribute("data-form-locked");
    }
  }

  async function fetchStatus(entryId) {
    const response = await fetch(SBZSkyCastInteractive.restRoot + "status/" + encodeURIComponent(entryId), {
      headers: { "X-WP-Nonce": SBZSkyCastInteractive.nonce, "Cache-Control": "no-store" },
      cache: "no-store",
      credentials: "same-origin",
    });
    const data = await response.json();
    return data && data.success ? (data.data || {}) : null;
  }

  async function initForm(root) {
    const form = root.querySelector("[data-sbz-form]");
    if (!form) return;

    const entryId = root.getAttribute("data-entry-id");
    const feedback = form.querySelector("[data-feedback]");
    const results = root.querySelector("[data-results]");
    const commentRequired = root.getAttribute("data-comment-required") === "1";
    const formRenderedAt = Date.now();
    const statusCheck = root.querySelector("[data-sbz-status-check]");

    root.dataset.sbzAuth = "0";

    if (root.getAttribute("data-results-public") === "1" && results) {
      loadResults(entryId, results);
    }

    if (statusCheck) {
      statusCheck.hidden = false;
      statusCheck.textContent = SBZSkyCastInteractive.i18n.checkingStatus || SBZSkyCastInteractive.i18n.loading;
    }

    try {
      const status = await fetchStatus(entryId);
      const session = status && status.session ? status.session : {};
      const isAuthenticated = !!(session && session.is_authenticated && session.user_id);
      root.dataset.sbzAuth = isAuthenticated ? "1" : "0";

      if (status && status.player_banned) {
        const answerText = status.existing_response && status.existing_response.choice_label ? status.existing_response.choice_label : "";
        lockForm(root, SBZSkyCastInteractive.i18n.bannedMessage, SBZSkyCastInteractive.i18n.bannedMessage, answerText);
      } else if (status && status.already_participated) {
        const answerText = status.existing_response && status.existing_response.choice_label ? status.existing_response.choice_label : "";
        lockForm(root, SBZSkyCastInteractive.i18n.alreadyParticipated, SBZSkyCastInteractive.i18n.responseLocked, answerText);
      } else {
        unlockForm(root);
        if (!isAuthenticated && feedback) {
          feedback.textContent = SBZSkyCastInteractive.i18n.signedOutReady || "";
        }
      }
    } catch (error) {
      unlockForm(root);
    }

    form.addEventListener("submit", async function (event) {
      event.preventDefault();

      if (root.dataset.sbzAuth !== "1") {
        feedback.textContent = SBZSkyCastInteractive.i18n.signInRequired;
        if (SBZSkyCastInteractive.signInUrl) {
          window.location.href = SBZSkyCastInteractive.signInUrl;
        }
        return;
      }

      const choice = form.querySelector('input[name="choice"]:checked');
      const honeypot = form.querySelector('input[name="website"]');
      const commentField = form.querySelector('textarea[name="comment"]');

      if (!choice) {
        feedback.textContent = SBZSkyCastInteractive.i18n.voteRequired;
        return;
      }
      if (commentRequired && commentField && !commentField.value.trim()) {
        feedback.textContent = SBZSkyCastInteractive.i18n.commentRequired;
        return;
      }

      feedback.textContent = SBZSkyCastInteractive.i18n.loading;
      if (window.SkybrizTrack && typeof window.SkybrizTrack.logEvent === "function") {
        window.SkybrizTrack.logEvent("skycast_vote_attempt");
      }
      try {
        const response = await fetch(SBZSkyCastInteractive.restRoot + "interact", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-WP-Nonce": SBZSkyCastInteractive.nonce,
            "Cache-Control": "no-store",
          },
          cache: "no-store",
          credentials: "same-origin",
          body: JSON.stringify({
            entry_id: parseInt(entryId, 10),
            choice: choice.value,
            comment: commentField ? commentField.value : "",
            honeypot: honeypot ? honeypot.value : "",
            form_rendered_ms: formRenderedAt,
          }),
        });
        const data = await response.json();
        const message = data?.message || (data?.success ? SBZSkyCastInteractive.i18n.responseSubmitted : SBZSkyCastInteractive.i18n.submitError);
        feedback.textContent = message;
        if ((data?.success || data?.already_participated) && window.SkybrizTrack && typeof window.SkybrizTrack.logEvent === "function") {
          window.SkybrizTrack.logEvent("skycast_vote_success");
        }
        if (data?.success || data?.already_participated || response.status === 409) {
          lockForm(
            root,
            SBZSkyCastInteractive.i18n.alreadyParticipated,
            data?.success ? (data?.data?.moderation_status === "pending" ? message : SBZSkyCastInteractive.i18n.responseLocked) : (SBZSkyCastInteractive.i18n.responseLocked || message),
            (function(){ var label = choice.closest("label"); return label && label.innerText ? label.innerText.trim() : ""; })()
          );
        }
        if ((data?.success || data?.already_participated) && results) {
          loadResults(entryId, results);
        }
      } catch (error) {
        feedback.textContent = SBZSkyCastInteractive.i18n.submitError;
      }
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("[data-sbz-entry]").forEach(function (root) {
      initSlider(root);
      initForm(root);
      trackView(root.getAttribute("data-entry-id"));
    });
  });
})();
