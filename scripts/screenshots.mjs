/**
 * Genera las capturas del README / portfolio contra el entorno local (web en :5173, API en :4000)
 * usando el Edge instalado (puppeteer-core, sin descargar navegadores).
 *   npm run screenshots
 * Antes: levantar `npm run db:local`, `npm run db:seed -w api`, `npm run dev:api` y `npm run dev:web`.
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const OUT = new URL('../docs/screenshots/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const EDGE = process.env.EDGE_PATH ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] });

async function newPage(opts) {
  const page = await browser.newPage();
  await page.setViewport(opts.viewport);
  await page.evaluateOnNewDocument((mode) => localStorage.setItem('turnos.mode', mode), opts.mode ?? 'dark');
  return page;
}
const shot = async (page, name, opts = {}) => {
  await sleep(opts.wait ?? 900);
  await page.screenshot({ path: `${OUT}${name}.png`, ...opts.shot });
  console.log('✓', name);
};
const clickText = async (page, selector, text) => {
  const ok = await page.evaluate(
    (sel, t) => {
      const el = [...document.querySelectorAll(sel)].find((e) => e.textContent.includes(t));
      el?.click();
      return !!el;
    },
    selector,
    text,
  );
  if (!ok) throw new Error(`No encontré "${text}" en ${selector}`);
};

/* ───────── Cliente (celular) ───────── */
const mobile = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
let page = await newPage({ viewport: mobile });
await page.goto(BASE, { waitUntil: 'networkidle0' });
await shot(page, '01-inicio-movil');

await page.goto(`${BASE}/reservar`, { waitUntil: 'networkidle0' });
await shot(page, '02-reserva-servicios-movil');

await clickText(page, '.choice', 'Corte + barba');
await sleep(500);
await clickText(page, '.choice', 'primero disponible');
await page.waitForSelector('button.cal-day:not(:disabled)');
// Primer día con disponibilidad a partir de pasado mañana
await page.evaluate(() => {
  const days = [...document.querySelectorAll('button.cal-day:not(:disabled)')];
  (days[2] ?? days[0]).click();
});
await page.waitForSelector('.slot');
await sleep(600);
await page.evaluate(() => document.querySelectorAll('.slot')[4]?.click());
await sleep(400);
await page.evaluate(() => window.scrollTo(0, 330));
await shot(page, '03-reserva-horarios-movil', { wait: 900 });

await clickText(page, '.sticky-cta .btn', 'Continuar');
await page.waitForSelector('#name');
await page.type('#name', 'Valentina Ríos');
await page.type('#phone', '11 5555 4321');
await page.type('#email', 'valentina.rios@example.com');
await clickText(page, '.sticky-cta .btn', 'Confirmar turno');
await page.waitForSelector('.ticket');
await shot(page, '04-confirmacion-movil', { wait: 2600 });
await page.close();

/* ───────── Modo claro ───────── */
page = await newPage({ viewport: mobile, mode: 'light' });
await page.goto(`${BASE}/reservar`, { waitUntil: 'networkidle0' });
await shot(page, '05-reserva-modo-claro-movil');
await page.close();

/* ───────── Panel (escritorio) ───────── */
const desktop = { width: 1440, height: 900, deviceScaleFactor: 1.5 };
page = await newPage({ viewport: desktop });
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
await shot(page, '06-login-usuarios-demo');
await clickText(page, '.demo-user', 'Administrador');
await page.waitForSelector('.kpi');
await shot(page, '07-dashboard', { wait: 2200 });

await page.goto(`${BASE}/admin/agenda`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.ag-col');
for (let i = 0; i < 7; i++) {
  const title = await page.$eval('.page-head h1', (e) => e.textContent);
  if (title.startsWith('Miércoles')) break;
  await clickText(page, 'button[aria-label="Siguiente"]', '');
  await sleep(500);
}
await sleep(1000);
await page.evaluate(() => {
  const s = document.querySelector('.agenda');
  if (s) s.scrollTop = 120;
});
await shot(page, '08-agenda-dia', { wait: 1000 });

await page.goto(`${BASE}/admin/profesionales`, { waitUntil: 'networkidle0' });
await shot(page, '09-equipo-y-horarios', { wait: 800 });
await page.goto(`${BASE}/admin/configuracion`, { waitUntil: 'networkidle0' });
await shot(page, '10-configuracion-por-rubro', { wait: 800 });
await page.close();

await browser.close();
console.log(`Capturas guardadas en ${OUT}`);
