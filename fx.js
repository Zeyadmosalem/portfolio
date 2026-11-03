// Pixel art effects from pixelfx (github.com/patch-gg/pixelfx, MIT), recolored in the site's dark red.
//  - the hero skull burns in a looping spirit flame
//  - buttons and project cards throw a hit spark where the cursor enters
//  - copying the email address pops a collect burst
import { createFrame, clearFrame, createFx, composite, spiritFlame, hitSpark, collectBurst } from './vendor/pixelfx/pixelfx.bundle.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const FLAME = ['#0b0303', '#2a0707', '#4a0c0c', '#6e1010', '#8f1414', '#b92a22', '#d9523a', '#f08a6a', '#ffd9c9'];
const SPARK = ['#3d0808', '#7a1212', '#b01e1e', '#d8401f', '#f07a3a', '#ffc9a0', '#ffffff'];
const BURST = ['#1a0404', '#3d0808', '#6e1010', '#8f1414', '#c0281e', '#e8603a', '#ffb08a', '#ffe3d6'];

/* ---------- The burning skull ---------- */
const altar = document.querySelector('.altar__fx');
let flame = null, flameFrame = null, flameImg = null, flameCtx = null;
if (altar) {
  const [w, h] = spiritFlame.meta.size;            // 80 x 124 art pixels
  altar.width = w; altar.height = h;
  flameCtx = altar.getContext('2d');
  flameFrame = createFrame(w, h);
  flameImg = new ImageData(w, h);
  const [ox, oy] = spiritFlame.meta.origin;
  flame = createFx(spiritFlame, { x: ox, y: oy, palette: FLAME, seed: 7 });
}

/* ---------- Full-screen overlay for one-shot effects ---------- */
const S = 3; // screen pixels per art pixel, same as the hero field
const layer = document.createElement('canvas');
layer.className = 'fx-layer';
layer.setAttribute('aria-hidden', 'true');
document.body.appendChild(layer);
const lctx = layer.getContext('2d');
let LW = 0, LH = 0, lframe = null, limg = null;
const sizeLayer = () => {
  LW = Math.ceil(innerWidth / S); LH = Math.ceil(innerHeight / S);
  layer.width = LW; layer.height = LH;
  lframe = createFrame(LW, LH);
  limg = new ImageData(LW, LH);
};
sizeLayer();
addEventListener('resize', sizeLayer);

const live = [];
const spawn = (mod, clientX, clientY, opts) => {
  if (reduced) return;
  if (live.length > 12) live.shift();
  live.push(createFx(mod, { x: Math.round(clientX / S), y: Math.round(clientY / S), seed: (Math.random() * 1e6) | 0, ...opts }));
  start();
};

// hit spark where the cursor comes in; aim the long ray in the direction it was moving
let lastX = 0, lastY = 0, lastSpark = 0;
addEventListener('pointermove', (e) => { lastX = e.clientX; lastY = e.clientY; }, { passive: true });
document.querySelectorAll('.pill, .work__link, .shot').forEach((el) => {
  el.addEventListener('pointerenter', (e) => {
    const now = performance.now();
    if (now - lastSpark < 120 || e.pointerType === 'touch') return;
    lastSpark = now;
    const angle = Math.atan2(e.clientY - lastY, e.clientX - lastX) || 0;
    spawn(hitSpark, e.clientX, e.clientY, { palette: SPARK, angle, height: 0, light: 0.8 });
  });
});

// collect burst over the copy button
document.addEventListener('px:burst', (e) => {
  const r = e.detail.el.getBoundingClientRect();
  spawn(collectBurst, r.left + r.width / 2, r.top + r.height / 2, { palette: BURST, light: 0.9 });
});

/* ---------- Loop ---------- */
let raf = 0, running = false, prev = 0, altarVisible = true;
const tick = (t) => {
  const dt = Math.min(0.05, (t - prev) / 1000 || 0.016);
  prev = t;

  if (flame && altarVisible) {
    flame.update(dt);
    clearFrame(flameFrame);
    flame.draw(flameFrame);
    composite(flameFrame, flameImg.data, null);
    flameCtx.putImageData(flameImg, 0, 0);
  }

  if (live.length) {
    clearFrame(lframe);
    for (let i = live.length - 1; i >= 0; i--) {
      const fx = live[i];
      fx.update(dt);
      fx.draw(lframe);
      if (fx.done()) live.splice(i, 1);
    }
    composite(lframe, limg.data, null);
    lctx.putImageData(limg, 0, 0);
    if (!live.length) lctx.clearRect(0, 0, LW, LH);
  }

  if ((flame && altarVisible) || live.length) raf = requestAnimationFrame(tick);
  else running = false;
};
function start() {
  if (running) return;
  running = true; prev = performance.now();
  raf = requestAnimationFrame(tick);
}

if (flame) {
  if (reduced) {
    // one still frame of the flame
    flame.update(0.8); flame.draw(flameFrame);
    composite(flameFrame, flameImg.data, null);
    flameCtx.putImageData(flameImg, 0, 0);
  } else {
    new IntersectionObserver(([en]) => { altarVisible = en.isIntersecting; if (altarVisible) start(); }).observe(altar);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) start(); });
    start();
  }
}
