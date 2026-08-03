// 📁 /toast/toast.js

(function () {
    if (window.showToast) return;
  
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'toast-container';
      toastContainer.className = 'toast-container';
      document.body.appendChild(toastContainer);
    }
  
    window.showToast = function (message, type = 'default') {
      const toast = document.createElement('div');
      toast.className = `toast toast-${type}`;
      toast.textContent = message;
      toastContainer.appendChild(toast);
  
      toast.addEventListener('animationend', (e) => {
        if (e.animationName === 'fadeOut') {
          toast.remove();
        }
      });
    };
  })();
  