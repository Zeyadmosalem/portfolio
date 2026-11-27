/* Strip along the bottom of the demo: one-click sign-in as each role, reset, back link. */
import { DEMO_URL, demoUsers, resetBackend } from './backend.js';
import { DEMO_PEOPLE } from './seed.js';

const css = `
#demo-bar{position:fixed;left:0;right:0;bottom:0;z-index:2147483000;background:#140606;color:#f5dede;
  border-top:2px solid #c0262f;font:13px/1.35 system-ui,-apple-system,Segoe UI,sans-serif;padding:8px 12px;
  display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;justify-content:center}
#demo-bar b{color:#ff6b74}
#demo-bar button{font:inherit;background:#2a0d0d;color:#f5dede;border:1px solid #6b1f24;border-radius:6px;padding:3px 9px;cursor:pointer}
#demo-bar button:hover,#demo-bar button[aria-pressed=true]{background:#c0262f;border-color:#c0262f;color:#fff}
#demo-bar a{color:#ff9aa0}
body{padding-bottom:70px}
`;
const STORAGE_KEY = 'samboza-auth';

function currentEmail() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')?.user?.email ?? null; } catch { return null; }
}

async function signInAs(email) {
  const res = await fetch(`${DEMO_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'demo' }),
  });
  const session = await res.json();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  location.hash = '#/';
  location.reload();
}

async function render() {
  const bar = document.getElementById('demo-bar');
  const me = currentEmail();
  const users = await demoUsers();
  const who = users.find((u) => u.email === me);
  bar.innerHTML = `<span><b>Demo</b> · a made-up family, stored only in your browser${who ? ` · you are ${who.display_name}` : ''}</span><span>Be:</span>`;
  for (const p of DEMO_PEOPLE.filter((x) => x.email)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = `${p.name} (${p.label})`;
    b.setAttribute('aria-pressed', String(me === p.email));
    b.onclick = () => signInAs(p.email);
    bar.appendChild(b);
  }
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.textContent = 'Reset demo';
  reset.onclick = async () => { await resetBackend(); location.hash = '#/'; location.reload(); };
  bar.appendChild(reset);
  const back = document.createElement('a');
  back.href = '../../#projects';
  back.textContent = 'Back to portfolio';
  bar.appendChild(back);
}

const style = document.createElement('style');
style.textContent = css + `
#demo-loading{position:fixed;inset:0;display:grid;place-content:center;justify-items:center;gap:10px;background:#0e101b;color:#e8e8f0;font:15px system-ui,sans-serif;text-align:center;padding:16px}
#demo-loading small{color:#9a9ab0}`;
document.head.appendChild(style);
const bar = document.createElement('div');
bar.id = 'demo-bar';
bar.setAttribute('role', 'region');
bar.setAttribute('aria-label', 'Demo controls');
document.body.appendChild(bar);
render();
