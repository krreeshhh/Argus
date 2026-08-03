// feedback-submit.js (hardened+diagnostic)
(() => {
  "use strict";

  const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
  const ALLOWED_EXTS = new Set(["pdf","png","jpg","jpeg","webp","heic","heif"]);

  function notify(form, msg, ok = false) {
    const box = form.querySelector(".form-message");
    if (box) {
      box.innerHTML = msg;
      box.className = "form-message " + (ok ? "ok" : "err");
    } else if (typeof window.showToast === "function") {
      window.showToast(msg, ok ? "success" : "error");
    } else {
      alert(msg.replace(/<[^>]+>/g, ""));
    }
  }

  function cleanText(s) {
    if (!s) return "";
    return s.replace(/[\u00A0\u1680\u180E\u2000-\u200B\u202F\u205F\u3000\u200C\u200D\uFEFF]/g, " ")
            .replace(/[^\S\r\n]+/g, " ")
            .trim();
  }

  function sanitizeFormFields(form) {
    const fields = form.querySelectorAll("input[type='text'], input[type='email'], input[type='tel'], input[type='search'], textarea");
    fields.forEach(el => { el.value = cleanText(el.value); });
  }

  function validateFileInput(fileInput) {
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) return { ok: true };
    if (fileInput.files.length > 1) return { ok: false, msg: "Please upload only one file." };

    const f = fileInput.files[0];

    if (/\r|\n|%0a|%0d/i.test(f.name)) return { ok: false, msg: "Suspicious filename." };
    if (f.size > MAX_BYTES) return { ok: false, msg: "File too large. Max 10MB." };

    const dot = f.name.lastIndexOf(".");
    const ext = dot >= 0 ? f.name.slice(dot + 1).toLowerCase() : "";
    if (!ALLOWED_EXTS.has(ext)) {
      return { ok: false, msg: "Unsupported file type. Allowed: pdf, png, jpg, jpeg, webp, heic, heif." };
    }
    return { ok: true };
  }

  // Parse WP’s JSON even on non-2xx. Fallback to text when JSON fails.
  async function parseResponse(res) {
    let data = null, raw = "";
    try { data = await res.json(); } catch {
      try { raw = await res.text(); } catch {}
    }
    return { res, data, raw };
  }

  // Build an end-user message from server JSON or raw text
  function extractErrorMessage(parsed) {
    const { res, data, raw } = parsed;
    // Prefer WordPress JSON shape: { success:false, data:{ message, code?, error_id? } }
    const msg = data?.data?.message || data?.message;
    const code = data?.data?.code || data?.code;
    const eid  = data?.data?.error_id || data?.error_id;

    if (msg) {
      let full = `❌ ${msg}`;
      if (eid) full += ` (Support code: ${eid})`;
      if (code) full += ` [${code}]`;
      return full;
    }

    // JSON without message: show status + any raw
    if (raw && typeof raw === "string") {
      const snippet = raw.length > 300 ? raw.slice(0, 300) + "…" : raw;
      return `❌ Server error ${res.status} ${res.statusText || ""}. Details: ${snippet}`;
    }

    return `❌ Something went wrong. (HTTP ${res.status})`;
  }

  document.addEventListener("DOMContentLoaded", () => {
    const forms = document.querySelectorAll(".ajax-feedback");
    if (!forms.length) return;

    forms.forEach(form => {
      const submitBtn = form.querySelector("button[type='submit']");
      const formType  = form.getAttribute("data-form-type"); // general | rental | contractor
      if (!submitBtn || !formType) return;

      form.addEventListener("submit", (e) => {
        e.preventDefault();

        if (!window.feedback_ajax_obj || !feedback_ajax_obj.ajax_url || !feedback_ajax_obj.nonce) {
          notify(form, "❌ Configuration error. Please reload and try again.");
          return;
        }

        sanitizeFormFields(form);

        const fileInput = form.querySelector("input[type='file'][name='attachment']");
        const fileCheck = validateFileInput(fileInput);
        if (!fileCheck.ok) {
          notify(form, `❌ ${fileCheck.msg}`);
          return;
        }

        const fd = new FormData(form);
        fd.set("action", `submit_${formType}_feedback`);
        fd.set("security", feedback_ajax_obj.nonce);

        submitBtn.disabled = true;
        const originalText = submitBtn.textContent;
        submitBtn.textContent = "Submitting…";

        const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
        const timeoutId = controller ? setTimeout(() => controller.abort(), 30_000) : null;

        fetch(feedback_ajax_obj.ajax_url, {
          method: "POST",
          body: fd,
          credentials: "same-origin",
          headers: { "X-Requested-With": "XMLHttpRequest", "Accept": "application/json" },
          signal: controller ? controller.signal : undefined,
          referrerPolicy: "same-origin",
        })
        .then(parseResponse)
        .then(({ res, data, raw }) => {
          if (res.ok && data && data.success) {
            const okMsg = (data.data && data.data.message) || "Your feedback has been received.";
            form.innerHTML = `
              <div class="form-success fade-in">
                <h2>🎉 Thank you!</h2>
                <p>${okMsg}</p>
              </div>
            `;
            return;
          }
          // Not ok or success:false
          const msg = extractErrorMessage({ res, data, raw });
          notify(form, msg);
          // Console diagnostics for admins/devs
          console.warn("Feedback error", { status: res.status, json: data, raw });
        })
        .catch((err) => {
          if (err && err.name === "AbortError") {
            notify(form, "❌ Request timed out. Please try again.");
          } else {
            notify(form, "❌ Network error. Please try again.");
          }
          console.error("Feedback submit network error:", err);
        })
        .finally(() => {
          if (timeoutId) clearTimeout(timeoutId);
          if (document.body.contains(submitBtn)) {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
          }
        });
      });
    });
  });
})();
