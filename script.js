(() => {
  const root = document.documentElement;
  const nav = document.querySelector('.nav');
  const toggle = document.querySelector('.nav__toggle');
  const links = document.getElementById('nav-links');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const canObserve = 'IntersectionObserver' in window;
  const fmt = new Intl.NumberFormat('en-US');

  if (!reduced && canObserve) root.classList.add('js');

  // Footer year
  document.getElementById('year').textContent = new Date().getFullYear();

  // Sticky nav border + scroll progress bar
  const onScroll = () => {
    nav.classList.toggle('is-scrolled', window.scrollY > 8);
    const max = root.scrollHeight - window.innerHeight;
    root.style.setProperty('--p', max > 0 ? (window.scrollY / max).toFixed(4) : 0);
  };
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

  // Logo wiggle when clicked (nav + contact)
  const brand = document.querySelector('.brand');
  const wiggle = () => {
    brand.classList.remove('is-wiggling');
    void brand.offsetWidth;
    brand.classList.add('is-wiggling');
  };
  brand.addEventListener('animationend', () => brand.classList.remove('is-wiggling'));
  const contactLogo = document.querySelector('.contact__logo');
  if (contactLogo) contactLogo.addEventListener('click', () => { window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' }); wiggle(); });

  // Active nav link for the section in view
  if (canObserve) {
    const navLinks = [...links.querySelectorAll('a[href^="#"]:not(.btn)')];
    const sections = navLinks.map((a) => document.querySelector(a.getAttribute('href'))).filter(Boolean);
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        navLinks.forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === '#' + entry.target.id));
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach((s) => spy.observe(s));
  }

  // Terminal: wrap each line so it can "type" in
  const code = document.querySelector('#term code');
  const lines = code.innerHTML.split('\n');
  code.innerHTML = lines.map((l) => `<span class="ln">${l || ' '}</span>`).join('');

  if (reduced || !canObserve) return;

  // ---- Motion from here on ----

  // Cursor glow
  if (finePointer) {
    let raf = 0;
    window.addEventListener('pointermove', (e) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        root.style.setProperty('--mx', e.clientX + 'px');
        root.style.setProperty('--my', e.clientY + 'px');
      });
    }, { passive: true });
  }

  // Terminal lines appear one by one, then the PASS count ticks up
  const lnEls = [...code.querySelectorAll('.ln')];
  const passCount = document.getElementById('pass-count');
  const passTarget = 2938;
  passCount.textContent = '0';
  const countTo = (el, end, dur, suffix = '', done) => {
    const start = performance.now();
    const step = (now) => {
      const p = Math.min((now - start) / dur, 1);
      el.textContent = fmt.format(Math.round(end * (1 - Math.pow(1 - p, 3)))) + suffix;
      if (p < 1) requestAnimationFrame(step); else if (done) done();
    };
    requestAnimationFrame(step);
  };
  lnEls.forEach((ln, i) => {
    setTimeout(() => {
      ln.classList.add('on');
      if (ln.contains(passCount)) {
        countTo(passCount, passTarget, 900, '', () => {
          const badge = ln.querySelector('.t-pass');
          if (badge) badge.classList.add('pop');
        });
      }
    }, 900 + i * 260);
  });

  // Reveal on scroll
  const targets = document.querySelectorAll('.section h2, .card, .layers li, .skills > div, .extra, .about__body, .kicker');
  targets.forEach((el) => el.classList.add('reveal'));
  // Staggered children
  document.querySelectorAll('.chips, .bullets, .facts, .metrics').forEach((list) => {
    list.classList.add('stagger');
    [...list.children].forEach((c, i) => c.style.setProperty('--i', i));
  });
  // Stagger sibling cards / layers
  document.querySelectorAll('.layers li, .projects .card').forEach((el, i, all) => {
    const idx = [...el.parentElement.children].indexOf(el);
    el.style.transitionDelay = idx * 90 + 'ms';
  });

  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      entry.target.querySelectorAll('.stagger').forEach((s) => s.classList.add('is-visible'));
      if (entry.target.classList.contains('stagger')) entry.target.classList.add('is-visible');
      io.unobserve(entry.target);
    });
  }, { threshold: 0.12 });
  targets.forEach((el) => io.observe(el));
  document.querySelectorAll('.stagger').forEach((el) => io.observe(el));

  // Clear the reveal delay once a card is in, so hover feels instant
  document.querySelectorAll('.projects .card, .layers li').forEach((el) => {
    el.addEventListener('transitionend', () => { el.style.transitionDelay = ''; }, { once: true });
  });

  // Count-up stats
  const countIo = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      countTo(el, Number(el.dataset.count), 1200, el.dataset.suffix || '');
      countIo.unobserve(el);
    });
  }, { threshold: 0.6 });
  document.querySelectorAll('[data-count]').forEach((el) => countIo.observe(el));

  // Card tilt + spotlight following the pointer
  if (finePointer) {
    document.querySelectorAll('[data-tilt]').forEach((card) => {
      card.addEventListener('pointermove', (e) => {
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width;
        const y = (e.clientY - r.top) / r.height;
        card.style.setProperty('--cx', x * 100 + '%');
        card.style.setProperty('--cy', y * 100 + '%');
        card.style.setProperty('--ry', ((x - 0.5) * 6).toFixed(2) + 'deg');
        card.style.setProperty('--rx', ((0.5 - y) * 6).toFixed(2) + 'deg');
      });
      card.addEventListener('pointerleave', () => {
        card.style.setProperty('--rx', '0deg');
        card.style.setProperty('--ry', '0deg');
      });
    });
  }
})();
