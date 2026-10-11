import { describe, it, expect } from 'vitest';
import { DateTime } from 'luxon';
import { computeSlots, type SlotInput } from '../src/services/slots';
import { localToUtc, toLocalDate, weekdayOf } from '../src/lib/time';

const TZ = 'America/Argentina/Buenos_Aires';
// "Ahora": lunes 12/10/2026 08:00 hora Argentina (11:00 UTC)
const NOW = new Date('2026-10-12T11:00:00Z');

const base = (over: Partial<SlotInput> = {}): SlotInput => ({
  date: '2026-10-13',
  tz: TZ,
  durationMin: 45,
  stepMin: 15,
  workingRanges: [{ startMinute: 10 * 60, endMinute: 12 * 60 }],
  busy: [],
  isHoliday: false,
  now: NOW,
  minNoticeMin: 60,
  maxDaysAhead: 30,
  ...over,
});

const labels = (slots: Date[]) => slots.map((s) => DateTime.fromJSDate(s, { zone: TZ }).toFormat('HH:mm'));

describe('computeSlots', () => {
  it('genera horarios cada 15 min que entran completos en la franja', () => {
    // 10:00-12:00 con 45 min: último inicio posible 11:15
    expect(labels(computeSlots(base()))).toEqual(['10:00', '10:15', '10:30', '10:45', '11:00', '11:15']);
  });

  it('respeta la duración del servicio (servicios largos dejan menos horarios)', () => {
    expect(labels(computeSlots(base({ durationMin: 120 })))).toEqual(['10:00']);
    expect(computeSlots(base({ durationMin: 121 }))).toEqual([]);
  });

  it('excluye horarios que se pisan con un turno existente', () => {
    const busy = [{ start: localToUtc('2026-10-13', 10 * 60 + 30, TZ), end: localToUtc('2026-10-13', 11 * 60 + 15, TZ) }];
    // El turno ocupa 10:30-11:15. Un servicio de 45' no puede empezar entre 09:46 y 11:14.
    expect(labels(computeSlots(base({ busy })))).toEqual(['11:15']);
  });

  it('un turno que termina justo cuando empieza otro NO es conflicto', () => {
    const busy = [{ start: localToUtc('2026-10-13', 10 * 60, TZ), end: localToUtc('2026-10-13', 10 * 60 + 45, TZ) }];
    expect(labels(computeSlots(base({ busy })))[0]).toBe('10:45');
  });

  it('un bloqueo (almuerzo/vacaciones) quita horarios igual que un turno', () => {
    const busy = [{ start: localToUtc('2026-10-13', 10 * 60, TZ), end: localToUtc('2026-10-13', 12 * 60, TZ) }];
    expect(computeSlots(base({ busy }))).toEqual([]);
  });

  it('feriado: no hay horarios', () => {
    expect(computeSlots(base({ isHoliday: true }))).toEqual([]);
  });

  it('día sin franjas de trabajo: no hay horarios', () => {
    expect(computeSlots(base({ workingRanges: [] }))).toEqual([]);
  });

  it('turno cortado: soporta varias franjas en el mismo día', () => {
    const slots = computeSlots(
      base({
        durationMin: 60,
        workingRanges: [
          { startMinute: 9 * 60, endMinute: 10 * 60 },
          { startMinute: 15 * 60, endMinute: 16 * 60 },
        ],
      }),
    );
    expect(labels(slots)).toEqual(['09:00', '15:00']);
  });

  it('respeta el aviso mínimo: hoy no ofrece horarios dentro de la próxima hora', () => {
    // Hoy 08:00, aviso 60 min → desde las 09:00
    const slots = computeSlots(
      base({ date: '2026-10-12', workingRanges: [{ startMinute: 8 * 60, endMinute: 10 * 60 }], durationMin: 30 }),
    );
    expect(labels(slots)).toEqual(['09:00', '09:15', '09:30']);
  });

  it('no ofrece días pasados', () => {
    expect(computeSlots(base({ date: '2026-10-11' }))).toEqual([]);
  });

  it('el límite de anticipación es inclusivo', () => {
    // hoy 12/10 + 30 = 11/11 permitido, 12/11 no
    expect(computeSlots(base({ date: '2026-11-11' })).length).toBeGreaterThan(0);
    expect(computeSlots(base({ date: '2026-11-12' }))).toEqual([]);
  });

  it('maneja bien la zona horaria: 10:00 en Argentina es 13:00 UTC', () => {
    const first = computeSlots(base())[0];
    expect(first.toISOString()).toBe('2026-10-13T13:00:00.000Z');
    expect(toLocalDate(first, TZ)).toBe('2026-10-13');
  });

  it('un turno a las 22:00 argentinas (01:00 UTC del día siguiente) sigue siendo del día local correcto', () => {
    const late = localToUtc('2026-10-13', 22 * 60, TZ);
    expect(late.toISOString()).toBe('2026-10-14T01:00:00.000Z');
    expect(toLocalDate(late, TZ)).toBe('2026-10-13');
  });
});

describe('weekdayOf', () => {
  it('0 = domingo, 1 = lunes, 6 = sábado', () => {
    expect(weekdayOf('2026-10-11', TZ)).toBe(0);
    expect(weekdayOf('2026-10-12', TZ)).toBe(1);
    expect(weekdayOf('2026-10-17', TZ)).toBe(6);
  });
});
