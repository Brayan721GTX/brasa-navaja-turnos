// Genera las imágenes de compartir (WhatsApp/redes) y el ícono de iOS a partir de SVG.
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const mark = (x, y, s) => `
<g transform="translate(${x} ${y}) scale(${s / 48})">
  <rect width="48" height="48" rx="14" fill="#C8895A"/>
  <path d="M24 8c1 6 8 9 8 18a8 8 0 0 1-16 0c0-4 2-6 4-8 .2 3 1.6 4 3 4.4C23.4 19 22 13 24 8z" fill="#1A1109"/>
  <path d="M12 36L38 10" stroke="#C8895A" stroke-width="4.5" stroke-linecap="round"/>
</g>`;

const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="g" cx="82%" cy="8%" r="70%"><stop offset="0" stop-color="#C8895A" stop-opacity=".30"/><stop offset="1" stop-color="#C8895A" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="1200" height="630" fill="#0F0E0D"/>
  <rect width="1200" height="630" fill="url(#g)"/>
  <rect x="48" y="48" width="1104" height="534" rx="28" fill="none" stroke="#2E2A25" stroke-width="2"/>
  ${mark(96, 96, 84)}
  <text x="206" y="152" font-family="Georgia, 'Times New Roman', serif" font-weight="700" font-size="46" fill="#ECE7DF">Brasa &amp; Navaja</text>
  <text x="96" y="340" font-family="Georgia, 'Times New Roman', serif" font-weight="700" font-size="104" fill="#ECE7DF">Reservá tu turno</text>
  <text x="96" y="446" font-family="Georgia, 'Times New Roman', serif" font-style="italic" font-size="104" fill="#E0A472">en minutos.</text>
  <text x="96" y="520" font-family="Arial, sans-serif" font-size="30" fill="#8D867B">Elegí servicio, barbero y horario · Sin crear cuenta</text>
  <g transform="translate(790 70)"><rect width="314" height="52" rx="26" fill="#C8895A" fill-opacity=".16" stroke="#C8895A" stroke-opacity=".5"/>
  <text x="157" y="34" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-size="21" fill="#E0A472">Demo de portfolio</text></g>
</svg>`;

const touch = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 180 180"><rect width="180" height="180" fill="#0F0E0D"/>${mark(24, 24, 132)}</svg>`;

await sharp(Buffer.from(og)).png().toFile('public/og.png');
await sharp(Buffer.from(touch)).png().toFile('public/apple-touch-icon.png');
writeFileSync('public/og.svg', og);
console.log('Imágenes generadas en public/');
