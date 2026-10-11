import { DateTime } from 'luxon';
import { prisma } from '../../src/lib/prisma';
import { DEFAULT_TZ, localToUtc } from '../../src/lib/time';

export async function resetDb() {
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
}

/** Negocio, N profesionales (9 a 18 todos los días) y un servicio de 45 min que todos hacen. */
export async function createFixtures(proCount = 1) {
  await prisma.business.create({
    data: {
      id: 1,
      name: 'Test',
      tagline: '',
      industry: 'Barbería',
      heroTitle: 'x',
      heroSubtitle: '',
      bookingIntro: '',
      cancellationPolicy: 'x',
      cancellationHours: 4,
      timezone: DEFAULT_TZ,
      slotStepMinutes: 15,
      minNoticeMinutes: 60,
      maxDaysAhead: 30,
    },
  });
  const service = await prisma.service.create({ data: { name: 'Corte', durationMin: 45, price: 10000 } });
  const pros = [];
  for (let i = 0; i < proCount; i++) {
    const pro = await prisma.professional.create({
      data: {
        name: `Pro ${i + 1}`,
        position: i,
        services: { create: [{ serviceId: service.id }] },
        hours: { create: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startMinute: 9 * 60, endMinute: 18 * 60 })) },
      },
    });
    pros.push(pro);
  }
  return { service, pros };
}

/** Día local dentro de N días (por defecto una semana, para no chocar con el aviso mínimo). */
export const futureDate = (days = 7) => DateTime.now().setZone(DEFAULT_TZ).plus({ days }).toISODate()!;

export const at = (date: string, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return localToUtc(date, h * 60 + m, DEFAULT_TZ);
};

export const customer = (n = 1) => ({ name: `Cliente ${n}`, phone: `+54 9 11 5555-000${n}`, email: `cliente${n}@example.com` });
