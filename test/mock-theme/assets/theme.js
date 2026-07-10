document.addEventListener('DOMContentLoaded', function() {
  var toggle = document.querySelector('.mobile-menu-toggle');
  if (toggle) {
    toggle.addEventListener('click', function() {
      document.querySelector('.mobile-menu').classList.toggle('is-open');
    });
  }
});
