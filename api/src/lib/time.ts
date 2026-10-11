import { DateTime } from 'luxon';

export const DEFAULT_TZ = 'America/Argentina/Buenos_Aires';

/** Fecha local YYYY-MM-DD de un instante, en la zona del negocio. */
export const toLocalDate = (d: Date, tz: string): string => DateTime.fromJSDate(d, { zone: tz }).toISODate()!;

export const isValidDateStr = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s) && DateTime.fromISO(s).isValid;

/** Instante UTC de "fecha local + minutos desde medianoche" en la zona del negocio. */
export const localToUtc = (date: string, minuteOfDay: number, tz: string): Date => {
  const base = DateTime.fromISO(date, { zone: tz });
  return base.set({ hour: Math.floor(minuteOfDay / 60), minute: minuteOfDay % 60, second: 0, millisecond: 0 }).toJSDate();
};

/** Inicio y fin (UTC) del día local. */
export const dayBounds = (date: string, tz: string): { start: Date; end: Date } => {
  const s = DateTime.fromISO(date, { zone: tz }).startOf('day');
  return { start: s.toJSDate(), end: s.plus({ days: 1 }).toJSDate() };
};

/** 0 = domingo ... 6 = sábado (convención de la base). */
export const weekdayOf = (date: string, tz: string): number => DateTime.fromISO(date, { zone: tz }).weekday % 7;

export const addDays = (date: string, n: number): string => DateTime.fromISO(date).plus({ days: n }).toISODate()!;

export const todayLocal = (tz: string, now = new Date()): string => toLocalDate(now, tz);

export const formatLocal = (d: Date, tz: string, fmt: string): string =>
  DateTime.fromJSDate(d, { zone: tz }).setLocale('es-AR').toFormat(fmt);

export const overlaps = (aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean =>
  aStart.getTime() < bEnd.getTime() && aEnd.getTime() > bStart.getTime();
