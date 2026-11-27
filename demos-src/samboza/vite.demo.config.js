// Builds Samboza for the portfolio demo. Supabase is replaced by an in-browser
// Postgres (PGlite) running the real migrations; see demo/backend.js.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('..', import.meta.url)),
  base: './',
  plugins: [
    react(),
    {
      name: 'samboza-demo',
      enforce: 'pre',
      transform(code, id) {
        if (id.endsWith('/src/App.tsx')) return code.replace(/BrowserRouter/g, 'HashRouter');
        // The real app's copy names the real family. The demo family is made up, so is its copy.
        if (id.endsWith('/src/lib/i18n/en.ts')) {
          return code.replace(/\bAbdo\b/g, 'Karim').replace(/\bGhada\b/g, 'Laila').replace(/\bJoe\b/g, 'Sami')
            .replace(/\bMarwa\b/g, 'Salma').replace(/\bZeyad\b/g, 'Omar').replace(/\bRewan\b/g, 'Nada');
        }
        if (id.endsWith('/src/lib/i18n/ar.ts')) {
          const word = (w) => new RegExp(`(?<![\\u0600-\\u06FF])${w}(?![\\u0600-\\u06FF])`, 'g');
          return code.replace(word('عبده'), 'كريم').replace(word('غادة'), 'ليلى').replace(word('جو'), 'سامي')
            .replace(word('مروة'), 'سلمى').replace(word('زياد'), 'عمر').replace(word('روان'), 'ندى');
        }
        // No service worker in the demo: it would cache a page that lives inside the portfolio.
        if (id.endsWith('/src/main.tsx')) return code.replace("'serviceWorker' in navigator && import.meta.env.PROD", 'false');
        return null;
      },
      transformIndexHtml: {
        order: 'pre',
        handler: (html) => html
          .replace('/src/main.tsx', '/demo/entry.js')
          .replace('<link rel="manifest" href="./manifest.webmanifest" />', '')
          .replace('<title>Samboza Family Finance</title>', '<title>Samboza · demo</title><meta name="robots" content="noindex">'),
      },
    },
  ],
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://samboza-demo.invalid'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('demo-anon-key'),
  },
  envDir: '/nonexistent-so-no-env-file-is-read',
  optimizeDeps: { exclude: ['@electric-sql/pglite'] },
  build: { outDir: 'dist-demo', emptyOutDir: true, sourcemap: false, target: 'es2022' },
  worker: { format: 'es' },
});
