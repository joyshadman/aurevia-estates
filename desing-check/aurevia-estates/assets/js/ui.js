// Aurevia Estates — light visual interactions only (no business logic)
document.addEventListener('DOMContentLoaded', () => {
  // Mobile menu
  document.querySelectorAll('[data-menu-toggle]').forEach((btn) => {
    const menu = document.getElementById(btn.dataset.menuToggle);
    btn.addEventListener('click', () => { menu.hidden = !menu.hidden; });
  });

  // Favourite hearts
  document.querySelectorAll('[data-fav]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const on = btn.getAttribute('aria-pressed') === 'true';
      btn.setAttribute('aria-pressed', String(!on));
      btn.querySelector('svg').setAttribute('fill', on ? 'none' : 'currentColor');
    });
  });

  // Image fallback: keep the tinted frame if a photo fails to load
  document.querySelectorAll('img').forEach((img) => {
    img.addEventListener('error', () => { img.style.visibility = 'hidden'; }, { once: true });
  });

  // Grid / list toggle (discovery page)
  const results = document.getElementById('results');
  document.querySelectorAll('[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-view]').forEach((b) => b.classList.remove('bg-charcoal', 'text-white'));
      btn.classList.add('bg-charcoal', 'text-white');
      results.dataset.mode = btn.dataset.view;
    });
  });

  // Gallery thumbnails (details page)
  const hero = document.getElementById('gallery-main');
  document.querySelectorAll('[data-thumb]').forEach((t) => {
    t.addEventListener('click', () => {
      hero.src = t.dataset.thumb;
      document.querySelectorAll('[data-thumb]').forEach((x) => x.classList.remove('ring-2', 'ring-burgundy'));
      t.classList.add('ring-2', 'ring-burgundy');
    });
  });

  // Mock form submissions → confirmation state
  document.querySelectorAll('form[data-confirm]').forEach((form) => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      form.hidden = true;
      document.getElementById(form.dataset.confirm).hidden = false;
    });
  });

  // Language selector (assistant page) — visual only
  document.querySelectorAll('[data-lang]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-lang]').forEach((b) => b.setAttribute('aria-pressed', 'false'));
      btn.setAttribute('aria-pressed', 'true');
      document.querySelectorAll('[data-lang-text]').forEach((el) => {
        const bn = btn.dataset.lang === 'bn';
        el.textContent = el.dataset[bn ? 'bn' : 'en'];
        el.classList.toggle('font-bangla', bn);
      });
    });
  });
});
