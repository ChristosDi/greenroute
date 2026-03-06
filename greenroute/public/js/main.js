// public/js/main.js — Global client-side utilities for GreenRoute

(function() {
  'use strict';

  // Auto-dismiss alerts after 5 seconds
  document.querySelectorAll('.alert').forEach(function(alert) {
    setTimeout(function() {
      alert.style.transition = 'opacity 0.3s, transform 0.3s';
      alert.style.opacity = '0';
      alert.style.transform = 'translateY(-10px)';
      setTimeout(function() { alert.remove(); }, 300);
    }, 5000);
  });

  // Confirm delete actions
  document.querySelectorAll('[data-confirm]').forEach(function(el) {
    el.addEventListener('click', function(e) {
      if (!confirm(el.getAttribute('data-confirm'))) {
        e.preventDefault();
      }
    });
  });

  // Close sidebar on navigation (mobile)
  document.querySelectorAll('.nav-link').forEach(function(link) {
    link.addEventListener('click', function() {
      var sidebar = document.getElementById('sidebar');
      var overlay = document.getElementById('sidebarOverlay');
      if (sidebar) sidebar.classList.remove('open');
      if (overlay) overlay.classList.remove('active');
    });
  });

})();
