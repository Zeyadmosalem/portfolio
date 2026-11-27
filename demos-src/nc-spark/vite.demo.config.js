// Builds NC Spark for the portfolio demo: the Supabase client is swapped for an
// in-browser mock (demo/supabase-mock.js), Edge Functions run from their real
// source against it, and routing uses the URL hash so GitHub Pages can serve it.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const mock = fileURLToPath(new URL('./supabase-mock.js', import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL('..', import.meta.url)),
  base: './',
  plugins: [
    react(),
    {
      name: 'nc-spark-demo',
      enforce: 'pre',
      resolveId(id) {
        if (id === '@supabase/supabase-js' || id.startsWith('jsr:@supabase/supabase-js')) return mock;
        return null;
      },
      transform(code, id) {
        if (id.endsWith('/src/App.jsx')) return code.replace(/BrowserRouter/g, 'HashRouter');
        return null;
      },
      transformIndexHtml: {
        order: 'pre',
        handler: (html) => html.replace('/src/main.jsx', '/demo/entry.js')
          .replace('<title>nc-spark</title>', '<title>NC Spark · demo</title>')
          .replace('<head>', '<head><meta name="robots" content="noindex">'),
      },
    },
  ],
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://demo.invalid'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('demo-anon-key'),
  },
  build: { outDir: 'dist-demo', emptyOutDir: true },
});
