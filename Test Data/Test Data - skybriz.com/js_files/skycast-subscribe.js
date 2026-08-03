// Skycast subscribe (AJAX + nonce)
(function () {
    document.addEventListener("DOMContentLoaded", function () {
      var form = document.querySelector(".skycast-subscribe-form");
      if (!form) return;
  
      var emailInput = form.querySelector('input[name="subscriber_email"], input[type="email"]');
      var statusEl = document.createElement("div");
      statusEl.className = "skycast-subscribe-status";
      statusEl.setAttribute("role", "status");
      statusEl.style.marginTop = "0.5rem";
      form.appendChild(statusEl);
  
      form.addEventListener("submit", async function (e) {
        e.preventDefault();
  
        var email = (emailInput && emailInput.value || "").trim();
        statusEl.textContent = "";
        if (!email) {
          statusEl.textContent = "Please enter an email.";
          return;
        }
  
        var ajaxurl = (window.SBZSub && SBZSub.ajaxurl) ? SBZSub.ajaxurl : "/wp-admin/admin-ajax.php";
        var nonce   = (window.SBZSub && SBZSub.nonce)   ? SBZSub.nonce   : "";
  
        var fd = new FormData();
        fd.append("action", "skycast_subscribe");
        fd.append("nonce", nonce);
        fd.append("subscriber_email", email);
        var optin = form.querySelector('input[name="marketing_opt_in"]');
        if (optin && optin.checked) fd.append("marketing_opt_in", "1");
  
        try {
          var res  = await fetch(ajaxurl, {
            method: "POST",
            body: fd,
            credentials: "same-origin",
            headers: { "X-Requested-With": "XMLHttpRequest" },
          });
          var text = await res.text();
          var json = JSON.parse(text);
          if (!json.success) throw new Error(json.data || "Unable to subscribe.");
          statusEl.textContent = "Thanks! You’re subscribed.";
          form.reset();
        } catch (err) {
          statusEl.textContent = err.message || "Network error. Please try again.";
        }
      });
    });
  })();
  
