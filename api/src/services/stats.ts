import { DateTime } from 'luxon';
import { prisma } from '../lib/prisma';
import { addDays, dayBounds, toLocalDate, todayLocal } from '../lib/time';
import { getBusiness } from './availability';

/** Datos del dashboard. Si professionalId viene, todo se limita a esa agenda. */
export async function getDashboard(professionalId?: string, now = new Date()) {
  const business = await getBusiness();
  const tz = business.timezone;
  const today = todayLocal(tz, now);
  const weekday = DateTime.fromISO(today, { zone: tz }).weekday; // 1 = lunes
  const weekStart = addDays(today, -(weekday - 1));
  const weekEnd = addDays(weekStart, 6);
  const rangeStart = addDays(today, -29);
  const seriesStart = addDays(today, -13);
  const seriesEnd = addDays(today, 14);

  const from = dayBounds(addDays(today, -29) < weekStart ? rangeStart : weekStart, tz).start;
  const to = dayBounds(seriesEnd, tz).end;
  const scope = professionalId ? { professionalId } : {};

  const [appointments, pros, hours, holidays, upcoming] = await Promise.all([
    prisma.appointment.findMany({
      where: { ...scope, startsAt: { gte: from, lt: to } },
      include: { service: { select: { name: true } } },
    }),
    prisma.professional.findMany({
      where: { active: true, ...(professionalId ? { id: professionalId } : {}) },
      orderBy: { position: 'asc' },
    }),
    prisma.workingHours.findMany({ where: professionalId ? { professionalId } : {} }),
    prisma.holiday.findMany({ where: { date: { gte: weekStart, lte: weekEnd } } }),
    prisma.appointment.findMany({
      where: { ...scope, status: 'CONFIRMED', startsAt: { gte: now } },
      orderBy: { startsAt: 'asc' },
      take: 6,
      include: { service: { select: { name: true } }, professional: { select: { name: true, color: true } }, customer: { select: { name: true } } },
    }),
  ]);

  const local = (d: Date) => toLocalDate(d, tz);
  const active = appointments.filter((a) => a.status !== 'CANCELLED');
  const revenueOf = (list: typeof appointments) =>
    list.filter((a) => a.status === 'CONFIRMED' || a.status === 'COMPLETED').reduce((s, a) => s + a.price, 0);

  const todayList = active.filter((a) => local(a.startsAt) === today);
  const weekList = active.filter((a) => local(a.startsAt) >= weekStart && local(a.startsAt) <= weekEnd);
  const last30 = appointments.filter((a) => local(a.startsAt) >= rangeStart && local(a.startsAt) <= today);

  // Ocupación de la semana: minutos reservados / minutos de trabajo disponibles
  const holidaySet = new Set(holidays.map((h) => h.date));
  const occupancy = pros.map((p) => {
    let available = 0;
    for (let i = 0; i < 7; i++) {
      const d = addDays(weekStart, i);
      if (holidaySet.has(d)) continue;
      const wd = DateTime.fromISO(d, { zone: tz }).weekday % 7;
      available += hours.filter((h) => h.professionalId === p.id && h.weekday === wd).reduce((s, h) => s + (h.endMinute - h.startMinute), 0);
    }
    const booked = weekList
      .filter((a) => a.professionalId === p.id)
      .reduce((s, a) => s + (a.endsAt.getTime() - a.startsAt.getTime()) / 60_000, 0);
    return {
      professionalId: p.id,
      name: p.name,
      color: p.color,
      bookedMinutes: Math.round(booked),
      availableMinutes: available,
      percent: available > 0 ? Math.min(100, Math.round((booked / available) * 100)) : 0,
    };
  });

  const byService = new Map<string, { name: string; count: number; revenue: number }>();
  for (const a of last30.filter((x) => x.status !== 'CANCELLED')) {
    const row = byService.get(a.serviceId) ?? { name: a.service.name, count: 0, revenue: 0 };
    row.count += 1;
    if (a.status === 'COMPLETED' || a.status === 'CONFIRMED') row.revenue += a.price;
    byService.set(a.serviceId, row);
  }

  const series: { date: string; appointments: number; revenue: number }[] = [];
  for (let d = seriesStart; d <= seriesEnd; d = addDays(d, 1)) {
    const day = active.filter((a) => local(a.startsAt) === d);
    series.push({ date: d, appointments: day.length, revenue: revenueOf(day) });
  }

  const cancelled = last30.filter((a) => a.status === 'CANCELLED').length;

  return {
    generatedAt: now.toISOString(),
    today,
    weekStart,
    weekEnd,
    todayCount: todayList.length,
    weekCount: weekList.length,
    weekRevenue: revenueOf(weekList),
    monthRevenue: revenueOf(last30),
    cancellationRate: last30.length ? Math.round((cancelled / last30.length) * 1000) / 10 : 0,
    cancelledLast30: cancelled,
    totalLast30: last30.length,
    occupancy,
    topServices: [...byService.values()].sort((a, b) => b.count - a.count).slice(0, 6),
    series,
    upcoming: upcoming.map((a) => ({
      id: a.id,
      startsAt: a.startsAt.toISOString(),
      service: a.service.name,
      professional: a.professional.name,
      professionalColor: a.professional.color,
      customer: a.customer.name,
    })),
  };
}
