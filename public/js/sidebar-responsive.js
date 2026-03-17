// Sidebar responsive - incluir en todas las páginas
(function() {
  document.addEventListener('DOMContentLoaded', function() {
    // Crear overlay
    const overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    document.body.appendChild(overlay);

    // Crear botón hamburguesa
    const btn = document.createElement('button');
    btn.className = 'hamburger';
    btn.setAttribute('aria-label', 'Abrir menú');
    btn.innerHTML = '<span></span><span></span><span></span>';
    document.body.appendChild(btn);

    const sidebar = document.querySelector('.sidebar');

    function abrirMenu() {
      sidebar.classList.add('open');
      overlay.classList.add('open');
      btn.classList.add('open');
      document.body.style.overflow = 'hidden';
    }

    function cerrarMenu() {
      sidebar.classList.remove('open');
      overlay.classList.remove('open');
      btn.classList.remove('open');
      document.body.style.overflow = '';
    }

    btn.addEventListener('click', () => {
      sidebar.classList.contains('open') ? cerrarMenu() : abrirMenu();
    });

    overlay.addEventListener('click', cerrarMenu);

    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', cerrarMenu);
    });
  });
})();