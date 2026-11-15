import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import seguridad from './seguridad.json';

// Cabeceras de seguridad (las mismas de vercel.json) para probar la build con `vite preview`.
// En desarrollo (`vite`) no se aplican: la recarga en caliente usa scripts en línea.
const { _comentario: _, 'Strict-Transport-Security': _hsts, ...cabeceras } = seguridad;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:4000' },
  },
  preview: {
    port: 4173,
    proxy: { '/api': 'http://localhost:4000' },
    headers: { ...cabeceras, 'Content-Security-Policy': cabeceras['Content-Security-Policy'].replace('; upgrade-insecure-requests', '') },
  },
});
