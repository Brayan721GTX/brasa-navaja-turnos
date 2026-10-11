import { DateTime } from 'luxon';

export const TZ_DEFAULT = 'America/Argentina/Buenos_Aires';

export const money = (n: number) => '$' + Math.round(n).toLocaleString('es-AR');

export const duration = (min: number) => {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
};

const dt = (iso: string, tz: string) => DateTime.fromISO(iso, { zone: tz }).setLocale('es-AR');

export const fmtTime = (iso: string, tz = TZ_DEFAULT) => dt(iso, tz).toFormat('HH:mm');
export const fmtDayLong = (iso: string, tz = TZ_DEFAULT) => cap(dt(iso, tz).toFormat("cccc d 'de' LLLL"));
export const fmtDayShort = (iso: string, tz = TZ_DEFAULT) => cap(dt(iso, tz).toFormat('ccc d LLL'));
export const fmtDateTime = (iso: string, tz = TZ_DEFAULT) => cap(dt(iso, tz).toFormat("ccc d/LL · HH:mm 'hs'"));
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** YYYY-MM-DD de un instante en la zona del negocio */
export const localDate = (iso: string | Date, tz = TZ_DEFAULT) =>
  (typeof iso === 'string' ? DateTime.fromISO(iso, { zone: tz }) : DateTime.fromJSDate(iso, { zone: tz })).toISODate()!;

export const todayStr = (tz = TZ_DEFAULT) => DateTime.now().setZone(tz).toISODate()!;

export const minutesOfDay = (iso: string, tz = TZ_DEFAULT) => {
  const d = dt(iso, tz);
  return d.hour * 60 + d.minute;
};

/** Instante UTC (ISO) de un día local + minutos desde medianoche */
export const toUtcIso = (date: string, minute: number, tz = TZ_DEFAULT) =>
  DateTime.fromISO(date, { zone: tz }).set({ hour: Math.floor(minute / 60), minute: minute % 60, second: 0, millisecond: 0 }).toUTC().toISO()!;

export const hhmm = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
export const parseHhmm = (s: string) => {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + (m || 0);
};

export const addDaysStr = (date: string, n: number) => DateTime.fromISO(date).plus({ days: n }).toISODate()!;
export const monthOf = (date: string) => date.slice(0, 7);
export const addMonthsStr = (month: string, n: number) => DateTime.fromISO(`${month}-01`).plus({ months: n }).toFormat('yyyy-LL');
export const monthTitle = (month: string) => cap(DateTime.fromISO(`${month}-01`).setLocale('es-AR').toFormat('LLLL yyyy'));
export const weekStartOf = (date: string) => DateTime.fromISO(date).startOf('week').toISODate()!;

export const waLink = (number: string | null, text: string) =>
  number ? `https://wa.me/${number.replace(/\D/g, '')}?text=${encodeURIComponent(text)}` : null;

export const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export const WEEKDAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
