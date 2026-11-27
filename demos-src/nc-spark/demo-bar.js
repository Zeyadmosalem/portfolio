/* The strip along the bottom of the demo: who you are, one-click sign-in as each role, reset. */
import { demoSignInAs, resetDemo, demoSession, demoProfiles } from './supabase-mock.js';
import { DEMO_ACCOUNTS } from './seed.js';

const css = `
#demo-bar{position:fixed;left:0;right:0;bottom:0;z-index:2147483000;background:#140606;color:#f5dede;
  border-top:2px solid #c0262f;font:13px/1.35 system-ui,-apple-system,Segoe UI,sans-serif;padding:8px 12px;
  display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;justify-content:center}
#demo-bar b{color:#ff6b74}
#demo-bar button{font:inherit;background:#2a0d0d;color:#f5dede;border:1px solid #6b1f24;border-radius:6px;padding:3px 9px;cursor:pointer}
#demo-bar button:hover,#demo-bar button[aria-pressed=true]{background:#c0262f;border-color:#c0262f;color:#fff}
#demo-bar a{color:#ff9aa0}
body{padding-bottom:64px}
`;

function render() {
  const bar = document.getElementById('demo-bar');
  const me = demoSession()?.user?.email;
  const name = me ? demoProfiles().find((p) => p.email === me)?.name : null;
  bar.innerHTML = `<span><b>Demo</b> · mock data, stored only in your browser${name ? ` · signed in as ${name}` : ''}</span>
    <span>Try a role:</span>`;
  for (const acc of DEMO_ACCOUNTS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = acc.label;
    b.setAttribute('aria-pressed', String(me === acc.email));
    b.onclick = async () => {
      await demoSignInAs(acc.email);
      location.hash = '#/';
      setTimeout(render, 50);
    };
    bar.appendChild(b);
  }
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.textContent = 'Reset demo';
  reset.onclick = () => { resetDemo(); location.hash = '#/login'; location.reload(); };
  bar.appendChild(reset);
  const back = document.createElement('a');
  back.href = '../../#projects';
  back.textContent = 'Back to portfolio';
  bar.appendChild(back);
}

const style = document.createElement('style');
style.textContent = css;
document.head.appendChild(style);
const bar = document.createElement('div');
bar.id = 'demo-bar';
bar.setAttribute('role', 'region');
bar.setAttribute('aria-label', 'Demo controls');
document.body.appendChild(bar);
render();
window.addEventListener('hashchange', render);
