document.addEventListener('DOMContentLoaded', function () {
  const dropdown = document.querySelector('.insight-category-dropdown');
  if (!dropdown) return;

  const toggleBtn = dropdown.querySelector('.dropdown-toggle');
  const menu = dropdown.querySelector('.dropdown-menu');

  toggleBtn.addEventListener('click', function (e) {
    e.stopPropagation(); // Prevent event bubbling up to document
    const isOpen = dropdown.classList.toggle('open');
    toggleBtn.setAttribute('aria-expanded', isOpen);
    menu.setAttribute('aria-hidden', !isOpen);
  });

  // Close dropdown on outside click
  document.addEventListener('click', function (e) {
    if (!dropdown.contains(e.target)) {
      dropdown.classList.remove('open');
      toggleBtn.setAttribute('aria-expanded', false);
      menu.setAttribute('aria-hidden', true);
    }
  });

  // Close dropdown when an item is clicked
  menu.querySelectorAll('a').forEach(item => {
    item.addEventListener('click', () => {
      dropdown.classList.remove('open');
      toggleBtn.setAttribute('aria-expanded', false);
      menu.setAttribute('aria-hidden', true);
    });
  });
});
