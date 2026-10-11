import { localToUtc, overlaps, todayLocal, addDays } from '../lib/time';

export interface Interval {
  start: Date;
  end: Date;
}

export interface MinuteRange {
  startMinute: number;
  endMinute: number;
}

export interface SlotInput {
  /** Día local YYYY-MM-DD */
  date: string;
  tz: string;
  durationMin: number;
  stepMin: number;
  /** Franjas de trabajo del profesional para ese día de la semana */
  workingRanges: MinuteRange[];
  /** Turnos activos + bloqueos que ocupan al profesional (UTC) */
  busy: Interval[];
  isHoliday: boolean;
  now: Date;
  minNoticeMin: number;
  maxDaysAhead: number;
}

/**
 * Calcula los horarios de inicio libres para un profesional en un día.
 * Función pura (sin base de datos) para poder testearla a fondo.
 */
export function computeSlots(input: SlotInput): Date[] {
  const { date, tz, durationMin, stepMin, workingRanges, busy, isHoliday, now, minNoticeMin, maxDaysAhead } = input;
  if (isHoliday || durationMin <= 0 || stepMin <= 0) return [];

  const today = todayLocal(tz, now);
  if (date < today || date > addDays(today, maxDaysAhead)) return [];

  const earliest = now.getTime() + minNoticeMin * 60_000;
  const slots: Date[] = [];

  for (const range of workingRanges) {
    for (let m = range.startMinute; m + durationMin <= range.endMinute; m += stepMin) {
      const start = localToUtc(date, m, tz);
      const end = new Date(start.getTime() + durationMin * 60_000);
      if (start.getTime() < earliest) continue;
      if (busy.some((b) => overlaps(start, end, b.start, b.end))) continue;
      slots.push(start);
    }
  }

  // Sin duplicados (por si dos franjas se pisan) y ordenados
  const unique = new Map(slots.map((s) => [s.getTime(), s]));
  return [...unique.values()].sort((a, b) => a.getTime() - b.getTime());
}
