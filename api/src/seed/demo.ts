import type { Prisma, PrismaClient } from '@prisma/client';
import { DateTime } from 'luxon';
import { hashPassword } from '../services/auth';
import { addDays, DEFAULT_TZ, localToUtc, todayLocal } from '../lib/time';
import { newManageToken } from '../services/booking';

/** Credenciales de las cuentas de demo (se muestran en la pantalla de login). */
export const DEMO_ACCOUNTS = {
  admin: { email: 'admin@brasaynavaja.demo', password: 'Demo1234!', name: 'Administración' },
  teo: { email: 'teo@brasaynavaja.demo', password: 'Demo1234!' },
  lucas: { email: 'lucas@brasaynavaja.demo', password: 'Demo1234!' },
  joaco: { email: 'joaco@brasaynavaja.demo', password: 'Demo1234!' },
};

// Generador pseudoaleatorio con semilla: la demo se ve igual de "real" cada noche, sin sorpresas
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ['Martín', 'Nicolás', 'Facundo', 'Santiago', 'Tomás', 'Agustín', 'Federico', 'Gonzalo', 'Ezequiel', 'Matías', 'Lautaro', 'Bruno', 'Franco', 'Ramiro', 'Julián', 'Sebastián', 'Maximiliano', 'Damián', 'Cristian', 'Emiliano', 'Ignacio', 'Leandro', 'Pablo', 'Diego', 'Hernán'];
const LAST = ['Gómez', 'Rodríguez', 'Fernández', 'López', 'Martínez', 'Pérez', 'Sánchez', 'Romero', 'Díaz', 'Álvarez', 'Torres', 'Ruiz', 'Acosta', 'Benítez', 'Medina', 'Herrera', 'Suárez', 'Aguirre', 'Giménez', 'Molina', 'Castro', 'Ortiz', 'Silva', 'Rojas', 'Peralta'];

const ascii = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const HOLIDAYS = [
  ['2026-10-12', 'Día del Respeto a la Diversidad Cultural'],
  ['2026-11-23', 'Día de la Soberanía Nacional (trasladado)'],
  ['2026-12-07', 'Feriado puente turístico'],
  ['2026-12-08', 'Inmaculada Concepción de María'],
  ['2026-12-25', 'Navidad'],
  ['2027-01-01', 'Año Nuevo'],
] as const;

type Pro = 'teo' | 'lucas' | 'joaco';

const SERVICES = [
  { key: 'corte', name: 'Corte de pelo', description: 'Corte a tijera o máquina, lavado y peinado final.', durationMin: 45, price: 12000, category: 'Cabello', pros: ['teo', 'lucas', 'joaco'] as Pro[] },
  { key: 'degrade', name: 'Degradé + diseño', description: 'Fade a medida con perfilado y líneas.', durationMin: 60, price: 15000, category: 'Cabello', pros: ['teo', 'lucas'] as Pro[] },
  { key: 'barba', name: 'Perfilado de barba', description: 'Recorte, perfilado con navaja y aceite de barba.', durationMin: 30, price: 8000, category: 'Barba', pros: ['teo', 'lucas', 'joaco'] as Pro[] },
  { key: 'combo', name: 'Corte + barba', description: 'El combo completo, con toalla caliente.', durationMin: 75, price: 18500, category: 'Combos', pros: ['teo', 'lucas', 'joaco'] as Pro[] },
  { key: 'afeitado', name: 'Afeitado clásico a navaja', description: 'Toalla caliente, espuma artesanal y navaja.', durationMin: 30, price: 9500, category: 'Barba', pros: ['joaco', 'teo'] as Pro[] },
  { key: 'color', name: 'Color / Platinado', description: 'Decoloración o color completo con tratamiento.', durationMin: 120, price: 38000, category: 'Color', pros: ['lucas'] as Pro[] },
  { key: 'infantil', name: 'Corte infantil', description: 'Para los más chicos (hasta 12 años).', durationMin: 30, price: 9000, category: 'Cabello', pros: ['teo', 'joaco'] as Pro[] },
  { key: 'facial', name: 'Limpieza facial express', description: 'Exfoliación, vapor y mascarilla negra.', durationMin: 30, price: 7500, category: 'Cuidado', pros: ['joaco', 'lucas'] as Pro[] },
];

const PROS: { key: Pro; name: string; bio: string; color: string; position: number; hours: Record<number, [number, number][]> }[] = [
  {
    key: 'teo',
    name: 'Teo Ledesma',
    bio: 'Especialista en degradés y cortes modernos. 9 años detrás del sillón.',
    color: '#C8895A',
    position: 0,
    hours: { 2: [[600, 1200]], 3: [[600, 1200]], 4: [[600, 1200]], 5: [[600, 1200]], 6: [[600, 1080]] },
  },
  {
    key: 'lucas',
    name: 'Lucas Ferrero',
    bio: 'Colorista y barbero. Platinados, mechas y barbas de revista.',
    color: '#8FA3B8',
    position: 1,
    hours: { 2: [[660, 780], [840, 1200]], 3: [[660, 780], [840, 1200]], 4: [[660, 780], [840, 1260]], 5: [[660, 780], [840, 1260]], 6: [[600, 1080]] },
  },
  {
    key: 'joaco',
    name: 'Joaquín Ibarra',
    bio: 'Barbería clásica: navaja, toalla caliente y mucho oficio.',
    color: '#A8B98A',
    position: 2,
    hours: { 1: [[540, 780], [900, 1140]], 2: [[540, 780], [900, 1140]], 3: [[540, 780], [900, 1140]], 4: [[540, 780], [900, 1140]], 5: [[540, 780], [900, 1140]], 6: [[540, 900]] },
  },
];

/** Borra todo y vuelve a crear los datos de ejemplo (usado por el seed y por el reset nocturno). */
export async function resetDemoData(prisma: PrismaClient, now = new Date()): Promise<{ appointments: number; customers: number }> {
  const tz = DEFAULT_TZ;
  const rand = rng(20261011);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];

  await prisma.$transaction([
    prisma.emailLog.deleteMany(),
    prisma.appointment.deleteMany(),
    prisma.customer.deleteMany(),
    prisma.timeBlock.deleteMany(),
    prisma.holiday.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.user.deleteMany(),
    prisma.workingHours.deleteMany(),
    prisma.professionalService.deleteMany(),
    prisma.professional.deleteMany(),
    prisma.service.deleteMany(),
    prisma.business.deleteMany(),
  ]);

  await prisma.business.create({
    data: {
      id: 1,
      name: 'Brasa & Navaja',
      tagline: 'Barbería de oficio. Estilo con carácter.',
      industry: 'Barbería',
      accentColor: '#C8895A',
      baseColor: '#0F0E0D',
      heroTitle: 'Reservá tu turno en minutos',
      heroSubtitle: 'Elegí servicio, barbero y horario. Sin llamadas, sin esperas, sin crear cuenta.',
      bookingIntro: 'Cuatro pasos y listo. Te confirmamos por email al instante.',
      cancellationPolicy: 'Podés cancelar o reprogramar hasta 4 horas antes sin costo. Pasado ese plazo, escribinos por WhatsApp.',
      cancellationHours: 4,
      professionalLabel: 'Barbero',
      professionalPlural: 'Barberos',
      whatsappNumber: '5491155550123',
      phone: '+54 11 5555-0123',
      email: 'hola@brasaynavaja.demo',
      address: 'Av. Corrientes 1234, CABA',
      instagram: '@brasaynavaja',
      timezone: tz,
      slotStepMinutes: 15,
      minNoticeMinutes: 60,
      maxDaysAhead: 30,
    },
  });

  const services: Record<string, string> = {};
  for (const [i, s] of SERVICES.entries()) {
    const created = await prisma.service.create({
      data: { name: s.name, description: s.description, durationMin: s.durationMin, price: s.price, category: s.category, position: i },
    });
    services[s.key] = created.id;
  }

  const pros: Record<Pro, string> = { teo: '', lucas: '', joaco: '' };
  for (const p of PROS) {
    const created = await prisma.professional.create({
      data: {
        name: p.name,
        bio: p.bio,
        color: p.color,
        position: p.position,
        services: { create: SERVICES.filter((s) => s.pros.includes(p.key)).map((s) => ({ serviceId: services[s.key] })) },
        hours: {
          create: Object.entries(p.hours).flatMap(([wd, ranges]) =>
            ranges.map(([startMinute, endMinute]) => ({ weekday: Number(wd), startMinute, endMinute })),
          ),
        },
      },
    });
    pros[p.key] = created.id;
  }

  await prisma.user.createMany({
    data: [
      { email: DEMO_ACCOUNTS.admin.email, name: DEMO_ACCOUNTS.admin.name, role: 'ADMIN', isDemo: true, passwordHash: await hashPassword(DEMO_ACCOUNTS.admin.password) },
      { email: DEMO_ACCOUNTS.teo.email, name: 'Teo Ledesma', role: 'PROFESSIONAL', isDemo: true, professionalId: pros.teo, passwordHash: await hashPassword(DEMO_ACCOUNTS.teo.password) },
      { email: DEMO_ACCOUNTS.lucas.email, name: 'Lucas Ferrero', role: 'PROFESSIONAL', isDemo: true, professionalId: pros.lucas, passwordHash: await hashPassword(DEMO_ACCOUNTS.lucas.password) },
      { email: DEMO_ACCOUNTS.joaco.email, name: 'Joaquín Ibarra', role: 'PROFESSIONAL', isDemo: true, professionalId: pros.joaco, passwordHash: await hashPassword(DEMO_ACCOUNTS.joaco.password) },
    ],
  });

  await prisma.holiday.createMany({ data: HOLIDAYS.map(([date, name]) => ({ date, name })) });

  // Clientes ficticios (dominio example.com: reservado, nunca llega a gente real)
  const customerIds: string[] = [];
  const used = new Set<string>();
  while (customerIds.length < 42) {
    const first = pick(FIRST);
    const last = pick(LAST);
    const email = `${ascii(first)}.${ascii(last)}${customerIds.length}@example.com`;
    if (used.has(email)) continue;
    used.add(email);
    const c = await prisma.customer.create({
      data: { name: `${first} ${last}`, email, phone: `+54 9 11 ${Math.floor(2000 + rand() * 7999)}-${Math.floor(1000 + rand() * 8999)}` },
    });
    customerIds.push(c.id);
  }

  const today = todayLocal(tz, now);
  const holidaySet = new Set<string>(HOLIDAYS.map(([d]) => d));

  // Bloqueos de ejemplo
  const nextTue = (() => {
    let d = addDays(today, 1);
    while (DateTime.fromISO(d).weekday !== 2) d = addDays(d, 1);
    return d;
  })();
  await prisma.timeBlock.createMany({
    data: [
      { professionalId: pros.lucas, startsAt: localToUtc(addDays(nextTue, 1), 840, tz), endsAt: localToUtc(addDays(nextTue, 1), 1020, tz), reason: 'Capacitación de color' },
      { professionalId: pros.joaco, startsAt: localToUtc(addDays(today, 9), 540, tz), endsAt: localToUtc(addDays(today, 9), 1140, tz), reason: 'Día libre' },
      { professionalId: pros.teo, startsAt: localToUtc(addDays(today, 3), 780, tz), endsAt: localToUtc(addDays(today, 3), 840, tz), reason: 'Almuerzo' },
    ],
  });

  // Agenda realista: 3 semanas de historia + 2 semanas hacia adelante
  const serviceByKey = Object.fromEntries(SERVICES.map((s) => [s.key, s]));
  const weighted = ['corte', 'corte', 'corte', 'combo', 'combo', 'barba', 'barba', 'degrade', 'degrade', 'afeitado', 'infantil', 'color', 'facial'];
  const rows: Prisma.AppointmentCreateManyInput[] = [];

  for (let offset = -21; offset <= 14; offset++) {
    const date = addDays(today, offset);
    if (holidaySet.has(date)) continue;
    const wd = DateTime.fromISO(date).weekday % 7;
    const isPast = offset < 0;
    for (const p of PROS) {
      const ranges = p.hours[wd];
      if (!ranges) continue;
      const blocked = (p.key === 'joaco' && offset === 9) ? true : false;
      if (blocked) continue;
      // Más ocupación en el pasado inmediato y los próximos días; más hueco hacia el final
      const fill = isPast ? 0.5 + rand() * 0.2 : offset <= 3 ? 0.42 + rand() * 0.15 : Math.max(0.12, 0.4 - offset * 0.02 + rand() * 0.1);
      for (const [start, end] of ranges) {
        let cursor = start;
        while (cursor < end) {
          if (rand() > fill) {
            cursor += 15 * (1 + Math.floor(rand() * 3));
            continue;
          }
          const key = pick(weighted);
          const svc = serviceByKey[key];
          if (!svc.pros.includes(p.key) || cursor + svc.durationMin > end) {
            cursor += 15;
            continue;
          }
          if (p.key === 'teo' && offset === 3 && cursor >= 780 && cursor < 840) {
            cursor += 15;
            continue;
          }
          if (p.key === 'lucas' && offset >= 0 && date === addDays(nextTue, 1) && cursor + svc.durationMin > 840 && cursor < 1020) {
            cursor += 15;
            continue;
          }
          const startsAt = localToUtc(date, cursor, tz);
          const endsAt = new Date(startsAt.getTime() + svc.durationMin * 60_000);
          let status: 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
          const r = rand();
          if (startsAt < now) status = r < 0.09 ? 'CANCELLED' : r < 0.13 ? 'NO_SHOW' : 'COMPLETED';
          else status = r < 0.06 ? 'CANCELLED' : 'CONFIRMED';
          rows.push({
            manageToken: newManageToken(),
            professionalId: pros[p.key],
            serviceId: services[key],
            customerId: pick(customerIds),
            startsAt,
            endsAt,
            status,
            source: rand() < 0.72 ? 'ONLINE' : 'ADMIN',
            price: svc.price,
            cancelledAt: status === 'CANCELLED' ? new Date(startsAt.getTime() - 86_400_000) : null,
          });
          cursor += svc.durationMin + (rand() < 0.4 ? 15 : 0);
        }
      }
    }
  }

  // Los cancelados no ocupan lugar en la base (restricción parcial), pero los activos no se pisan por construcción
  await prisma.appointment.createMany({ data: rows });
  await prisma.systemState.upsert({
    where: { key: 'lastDemoReset' },
    update: { value: now.toISOString() },
    create: { key: 'lastDemoReset', value: now.toISOString() },
  });
  return { appointments: rows.length, customers: customerIds.length };
}
