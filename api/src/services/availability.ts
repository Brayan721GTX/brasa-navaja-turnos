import type { Business, Professional, Service, TimeBlock } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { badRequest, notFound } from '../lib/errors';
import { addDays, dayBounds, isValidDateStr, toLocalDate, weekdayOf } from '../lib/time';
import { computeSlots, type Interval, type MinuteRange } from './slots';

export const getBusiness = async (): Promise<Business> => {
  const b = await prisma.business.findUnique({ where: { id: 1 } });
  if (!b) throw notFound('El negocio todavía no está configurado');
  return b;
};

export interface AvailabilityContext {
  business: Business;
  professionals: Professional[];
  /** professionalId → día de la semana → franjas */
  hours: Map<string, Map<number, MinuteRange[]>>;
  /** professionalId → intervalos ocupados por turnos */
  appointments: Map<string, Interval[]>;
  blocks: TimeBlock[];
  holidays: Set<string>;
}

interface LoadOptions {
  fromDate: string;
  toDate: string; // inclusivo
  professionals: Professional[];
  excludeAppointmentId?: string;
}

/** Carga de una sola vez todo lo necesario para calcular horarios en un rango de días. */
export async function loadContext(business: Business, opts: LoadOptions): Promise<AvailabilityContext> {
  const { fromDate, toDate, professionals, excludeAppointmentId } = opts;
  const from = dayBounds(fromDate, business.timezone).start;
  const to = dayBounds(toDate, business.timezone).end;
  const proIds = professionals.map((p) => p.id);

  const [hoursRows, apptRows, blocks, holidayRows] = await Promise.all([
    prisma.workingHours.findMany({ where: { professionalId: { in: proIds } } }),
    prisma.appointment.findMany({
      where: {
        professionalId: { in: proIds },
        status: { not: 'CANCELLED' },
        startsAt: { lt: to },
        endsAt: { gt: from },
        ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
      },
      select: { professionalId: true, startsAt: true, endsAt: true },
    }),
    prisma.timeBlock.findMany({
      where: { startsAt: { lt: to }, endsAt: { gt: from }, OR: [{ professionalId: null }, { professionalId: { in: proIds } }] },
    }),
    prisma.holiday.findMany({ where: { date: { gte: fromDate, lte: toDate } } }),
  ]);

  const hours = new Map<string, Map<number, MinuteRange[]>>();
  for (const h of hoursRows) {
    const byDay = hours.get(h.professionalId) ?? new Map<number, MinuteRange[]>();
    byDay.set(h.weekday, [...(byDay.get(h.weekday) ?? []), { startMinute: h.startMinute, endMinute: h.endMinute }]);
    hours.set(h.professionalId, byDay);
  }
  const appointments = new Map<string, Interval[]>();
  for (const a of apptRows) {
    appointments.set(a.professionalId, [...(appointments.get(a.professionalId) ?? []), { start: a.startsAt, end: a.endsAt }]);
  }
  return { business, professionals, hours, appointments, blocks, holidays: new Set(holidayRows.map((h) => h.date)) };
}

export function slotsForProfessional(
  ctx: AvailabilityContext,
  professionalId: string,
  date: string,
  durationMin: number,
  now = new Date(),
): Date[] {
  const { business } = ctx;
  const busy: Interval[] = [
    ...(ctx.appointments.get(professionalId) ?? []),
    ...ctx.blocks
      .filter((b) => b.professionalId === null || b.professionalId === professionalId)
      .map((b) => ({ start: b.startsAt, end: b.endsAt })),
  ];
  return computeSlots({
    date,
    tz: business.timezone,
    durationMin,
    stepMin: business.slotStepMinutes,
    workingRanges: ctx.hours.get(professionalId)?.get(weekdayOf(date, business.timezone)) ?? [],
    busy,
    isHoliday: ctx.holidays.has(date),
    now,
    minNoticeMin: business.minNoticeMinutes,
    maxDaysAhead: business.maxDaysAhead,
  });
}

/** Profesionales activos que realizan el servicio (y, si se pide uno, valida que sea elegible). */
export async function eligibleProfessionals(
  serviceId: string,
  professionalId?: string | null,
): Promise<{ service: Service; pros: Professional[] }> {
  const service = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!service || !service.active) throw notFound('El servicio no existe o no está disponible');
  let pros = await prisma.professional.findMany({
    where: { active: true, services: { some: { serviceId } } },
    orderBy: { position: 'asc' },
  });
  if (professionalId) {
    pros = pros.filter((p) => p.id === professionalId);
    if (pros.length === 0) throw badRequest('Ese profesional no realiza este servicio');
  }
  return { service, pros };
}

export interface Slot {
  startsAt: string;
  professionalId: string;
}

/**
 * Horarios libres de un día. Sin professionalId ("el primero disponible") junta los de todos y le asigna
 * a cada horario el profesional menos ocupado ese día.
 */
export async function getSlots(params: { serviceId: string; professionalId?: string | null; date: string }): Promise<Slot[]> {
  if (!isValidDateStr(params.date)) throw badRequest('Fecha inválida (usá YYYY-MM-DD)');
  const business = await getBusiness();
  const { service, pros } = await eligibleProfessionals(params.serviceId, params.professionalId);
  if (pros.length === 0) return [];
  const ctx = await loadContext(business, { fromDate: params.date, toDate: params.date, professionals: pros });
  return slotsFromContext(ctx, pros, params.date, service.durationMin);
}

export function slotsFromContext(
  ctx: AvailabilityContext,
  pros: Professional[],
  date: string,
  durationMin: number,
  now = new Date(),
): Slot[] {
  const load = (proId: string) =>
    (ctx.appointments.get(proId) ?? []).filter((i) => toLocalDate(i.start, ctx.business.timezone) === date).length;
  const byTime = new Map<number, Slot>();
  const ranked = [...pros].sort((a, b) => load(a.id) - load(b.id) || a.position - b.position);
  for (const pro of ranked) {
    for (const s of slotsForProfessional(ctx, pro.id, date, durationMin, now)) {
      if (!byTime.has(s.getTime())) byTime.set(s.getTime(), { startsAt: s.toISOString(), professionalId: pro.id });
    }
  }
  return [...byTime.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
}

/** Qué días de un mes tienen al menos un horario libre (para pintar el calendario). */
export async function getMonthAvailability(params: {
  serviceId: string;
  professionalId?: string | null;
  month: string;
}): Promise<Record<string, boolean>> {
  if (!/^\d{4}-\d{2}$/.test(params.month)) throw badRequest('Mes inválido (usá YYYY-MM)');
  const first = `${params.month}-01`;
  if (!isValidDateStr(first)) throw badRequest('Mes inválido');
  const business = await getBusiness();
  const { service, pros } = await eligibleProfessionals(params.serviceId, params.professionalId);
  const days: string[] = [];
  for (let d = first; d.startsWith(params.month); d = addDays(d, 1)) days.push(d);
  if (pros.length === 0) return Object.fromEntries(days.map((d) => [d, false]));
  const ctx = await loadContext(business, { fromDate: days[0], toDate: days[days.length - 1], professionals: pros });
  const result: Record<string, boolean> = {};
  for (const d of days) result[d] = slotsFromContext(ctx, pros, d, service.durationMin).length > 0;
  return result;
}
