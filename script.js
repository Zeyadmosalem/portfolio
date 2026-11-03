(() => {
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasIO = 'IntersectionObserver' in window;

  document.getElementById('year').textContent = new Date().getFullYear();

  /* ---------- Nav ---------- */
  const nav = document.querySelector('.nav');
  const toggle = document.querySelector('.nav__toggle');
  const links = document.getElementById('nav-links');
  const onScroll = () => nav.classList.toggle('is-scrolled', scrollY > 10);
  onScroll();
  addEventListener('scroll', onScroll, { passive: true });

  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!open));
    toggle.setAttribute('aria-label', open ? 'Open menu' : 'Close menu');
    links.classList.toggle('is-open', !open);
  });
  links.addEventListener('click', (e) => {
    if (e.target.closest('a') && links.classList.contains('is-open')) toggle.click();
  });

  if (hasIO) {
    const navLinks = [...links.querySelectorAll('a[href^="#"]:not(.pill)')];
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) navLinks.forEach((a) => a.classList.toggle('is-active', a.hash === '#' + en.target.id));
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    navLinks.forEach((a) => { const s = document.querySelector(a.hash); if (s) spy.observe(s); });
  }

  /* ---------- Copy email ---------- */
  const toast = document.querySelector('.toast');
  let toastTimer;
  const showToast = (msg) => {
    toast.textContent = msg;
    toast.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-on'), 2200);
  };
  document.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const text = btn.dataset.copy;
      let ok = false;
      try { await navigator.clipboard.writeText(text); ok = true; } catch {
        const ta = document.createElement('textarea');
        ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { ok = document.execCommand('copy'); } catch { ok = false; }
        ta.remove();
      }
      const label = btn.querySelector('[data-copy-label]');
      if (ok) {
        label.textContent = 'Copied';
        showToast('Email address copied');
        document.dispatchEvent(new CustomEvent('px:burst', { detail: { el: btn } }));
        setTimeout(() => { label.textContent = 'Copy'; }, 2000);
      } else {
        showToast('Copy failed. The address is ' + text);
      }
    });
  });

  /* ---------- Screenshot viewer (Glisse.js) ---------- */
  if (window.jQuery && jQuery.fn.glisse) {
    jQuery('.shot').glisse({ speed: 300, changeSpeed: 450, effect: 'roll', fullscreen: false });
  }

  /* ---------- Reveal on scroll ---------- */
  if (!reduced && hasIO) {
    root.classList.add('motion');
    const els = document.querySelectorAll('.section__head, .work__item, .app, .steps li, .facts div, .about > p, .contact__card, .numbers__grid div');
    els.forEach((el) => {
      el.classList.add('reveal');
      const sibs = [...el.parentElement.children].filter((c) => c.classList.contains('reveal'));
      el.style.transitionDelay = Math.min(sibs.indexOf(el), 5) * 70 + 'ms';
    });
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        en.target.classList.add('is-in');
        en.target.addEventListener('transitionend', () => { en.target.style.transitionDelay = ''; }, { once: true });
        io.unobserve(en.target);
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    els.forEach((el) => io.observe(el));
  }

  /* ---------- Hero particle field ----------
     Drawn at a third of screen resolution and scaled up with hard edges, so every
     particle is a chunky pixel. Near the pointer they turn to face it and gather
     into a ring around it, then ease back home when it moves away. */
  const canvas = document.querySelector('.field');
  const hero = document.querySelector('.hero');
  const ctx = canvas.getContext('2d');
  const S = 3;                    // screen pixels per art pixel
  let W = 0, H = 0, parts = [];
  const INK = [201, 170, 163], RED = [192, 40, 30], HOT = [240, 120, 80];

  const build = () => {
    const r = hero.getBoundingClientRect();
    W = Math.ceil(r.width / S); H = Math.ceil(r.height / S);
    canvas.width = W; canvas.height = H;
    ctx.imageSmoothingEnabled = false;
    const gap = r.width < 720 ? 11 : 13;
    parts = [];
    for (let y = gap / 2; y < H; y += gap) {
      for (let x = gap / 2; x < W; x += gap) {
        const hx = x + (Math.random() - 0.5) * gap * 0.9;
        const hy = y + (Math.random() - 0.5) * gap * 0.9;
        parts.push({ hx, hy, x: hx, y: hy, vx: 0, vy: 0, a: Math.random() * Math.PI * 2,
          len: 1 + (Math.random() * 2 | 0), ph: Math.random() * Math.PI * 2, sp: 0.4 + Math.random() * 0.6,
          red: Math.random() < 0.2 });
      }
    }
  };

  const ptr = { x: 0, y: 0, tx: 0, ty: 0, active: false, last: 0 };
  const R = () => Math.min(58, Math.max(30, W * 0.11));
  const col = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

  const draw = (t) => {
    ctx.clearRect(0, 0, W, H);
    const ring = R(), reach = ring * 2.3, time = t / 1000;
    if (!ptr.active || t - ptr.last > 4000) {
      if (W * S < 960) {
        // narrow screens: the text fills the top, so circle the skull below it
        ptr.tx = W * 0.5 + Math.cos(time * 0.35) * W * 0.22;
        ptr.ty = H * 0.84 + Math.sin(time * 0.5) * H * 0.06;
      } else {
        ptr.tx = W * 0.3 + Math.cos(time * 0.35) * W * 0.14;
        ptr.ty = H * 0.5 + Math.sin(time * 0.5) * H * 0.24;
      }
    }
    ptr.x += (ptr.tx - ptr.x) * 0.08;
    ptr.y += (ptr.ty - ptr.y) * 0.08;

    for (const p of parts) {
      const fx = p.hx + Math.sin(time * p.sp + p.ph) * 1.4;
      const fy = p.hy + Math.cos(time * p.sp * 0.8 + p.ph) * 1.4;
      const dx = fx - ptr.x, dy = fy - ptr.y;
      const d = Math.hypot(dx, dy) || 0.001;
      let w = 1 - d / reach;
      w = w > 0 ? w * w * (3 - 2 * w) : 0;
      let tx = fx, ty = fy;
      if (w > 0) {
        const ux = dx / d, uy = dy / d, rr = ring + (d - ring) * 0.28;
        const sw = w * 0.35 + time * 0.15 * w, cs = Math.cos(sw), sn = Math.sin(sw);
        tx = fx + (ptr.x + (ux * cs - uy * sn) * rr - fx) * w;
        ty = fy + (ptr.y + (ux * sn + uy * cs) * rr - fy) * w;
      }
      p.vx = (p.vx + (tx - p.x) * 0.055) * 0.84;
      p.vy = (p.vy + (ty - p.y) * 0.055) * 0.84;
      p.x += p.vx; p.y += p.vy;

      const faceA = Math.atan2(p.y - ptr.y, p.x - ptr.x);
      const flowA = p.ph + Math.sin(time * 0.2 + p.hx * 0.012) * 0.6;
      let da = (w > 0 ? faceA : flowA) - p.a;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      p.a += da * (0.08 + w * 0.15);

      // a short run of whole pixels along the angle
      const L = p.len + Math.round(w * 2);
      const c = w > 0.55 ? HOT : p.red || w > 0.15 ? RED : INK;
      ctx.fillStyle = col(c, 0.22 + w * 0.75);
      const ox = Math.round(p.x), oy = Math.round(p.y);
      const sx = Math.cos(p.a), sy = Math.sin(p.a);
      for (let i = 0; i < L; i++) ctx.fillRect(Math.round(ox + sx * i), Math.round(oy + sy * i), 1, 1);
    }
  };

  let raf = 0, running = false;
  const loop = (t) => { draw(t); raf = requestAnimationFrame(loop); };
  const start = () => { if (!running) { running = true; raf = requestAnimationFrame(loop); } };
  const stop = () => { running = false; cancelAnimationFrame(raf); };

  build();
  ptr.x = ptr.tx = W * 0.3; ptr.y = ptr.ty = H * 0.5;

  if (reduced) {
    // one calm frame, no movement
    draw(0);
  } else {
    hero.addEventListener('pointermove', (e) => {
      const r = hero.getBoundingClientRect();
      ptr.tx = (e.clientX - r.left) / S; ptr.ty = (e.clientY - r.top) / S;
      ptr.active = true; ptr.last = performance.now();
    }, { passive: true });
    hero.addEventListener('pointerleave', () => { ptr.active = false; });

    if (hasIO) {
      new IntersectionObserver(([en]) => (en.isIntersecting ? start() : stop())).observe(hero);
    } else start();
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  }

  let resizeT;
  addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => { build(); if (reduced) draw(0); }, 150);
  });

})();
