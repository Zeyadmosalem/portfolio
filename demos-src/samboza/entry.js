// Boots the in-browser database before the real app loads.
import prelude from './prelude.sql?raw';
import { startBackend } from './backend.js';

const migrations = Object.entries(
  import.meta.glob('./migrations/*.sql', { query: '?raw', import: 'default', eager: true }),
).sort(([a], [b]) => a.localeCompare(b));

const root = document.getElementById('root');
const loading = document.createElement('div');
loading.id = 'demo-loading';
loading.innerHTML = '<div class="demo-spin"></div><p>Starting the demo database in your browser…</p><small></small>';
document.body.appendChild(loading);
const status = (msg) => { loading.querySelector('small').textContent = msg; };

try {
  await startBackend({ prelude, migrations, onStatus: status });
  loading.remove();
  await import('./demo-bar.js');
  await import('../src/main.tsx');
} catch (e) {
  console.error(e);
  loading.querySelector('p').textContent = 'The demo could not start in this browser.';
  status(String(e?.message ?? e));
  void root;
}
