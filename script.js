(() => {
  const nav = document.querySelector('.nav');
  const toggle = document.querySelector('.nav__toggle');
  const links = document.getElementById('nav-links');

  // Sticky nav border on scroll
  const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 8);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  // Mobile menu
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!open));
    toggle.setAttribute('aria-label', open ? 'Open menu' : 'Close menu');
    links.classList.toggle('is-open', !open);
  });
  links.addEventListener('click', (e) => {
    if (e.target.closest('a') && links.classList.contains('is-open')) toggle.click();
  });

  // Footer year
  document.getElementById('year').textContent = new Date().getFullYear();

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || !('IntersectionObserver' in window)) return;

  // Reveal sections on scroll
  const targets = document.querySelectorAll('.section h2, .card, .layers li, .skills > div, .extra, .about__body');
  targets.forEach((el) => el.classList.add('reveal'));
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  targets.forEach((el) => io.observe(el));

  // Count-up stats
  const fmt = new Intl.NumberFormat('en-US');
  const counters = document.querySelectorAll('[data-count]');
  const countIo = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const end = Number(el.dataset.count);
      const suffix = el.dataset.suffix || '';
      const start = performance.now();
      const dur = 1100;
      const step = (now) => {
        const p = Math.min((now - start) / dur, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = fmt.format(Math.round(end * eased)) + suffix;
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      countIo.unobserve(el);
    });
  }, { threshold: 0.6 });
  counters.forEach((el) => countIo.observe(el));
})();
