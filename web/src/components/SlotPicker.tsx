import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarX, ChevronLeft, ChevronRight } from 'lucide-react';
import { DateTime } from 'luxon';
import { api } from '../lib/api';
import { addMonthsStr, fmtDayLong, fmtTime, minutesOfDay, monthOf, monthTitle, todayStr } from '../lib/format';
import type { Slot } from '../lib/types';
import { Empty, ErrorBox, Skeleton } from './ui';

interface Props {
  serviceId: string;
  /** null = "el primero disponible" */
  professionalId: string | null;
  tz: string;
  maxDaysAhead: number;
  value: Slot | null;
  onChange: (slot: Slot | null, date: string | null) => void;
  initialDate?: string | null;
}

const PARTS = [
  { label: 'Mañana', test: (m: number) => m < 13 * 60 },
  { label: 'Tarde', test: (m: number) => m >= 13 * 60 && m < 19 * 60 },
  { label: 'Noche', test: (m: number) => m >= 19 * 60 },
];

const DOW = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

export function SlotPicker({ serviceId, professionalId, tz, maxDaysAhead, value, onChange, initialDate }: Props) {
  const today = todayStr(tz);
  const [month, setMonth] = useState(monthOf(initialDate ?? today));
  const [date, setDate] = useState<string | null>(initialDate ?? null);
  const proKey = professionalId ?? 'any';
  const lastMonth = monthOf(DateTime.fromISO(today).plus({ days: maxDaysAhead }).toISODate()!);

  const days = useQuery({
    queryKey: ['days', serviceId, proKey, month],
    queryFn: () => api.get<{ days: Record<string, boolean> }>(`/public/availability/days?serviceId=${serviceId}&month=${month}${professionalId ? `&professionalId=${professionalId}` : ''}`),
  });

  const slots = useQuery({
    queryKey: ['slots', serviceId, proKey, date],
    enabled: !!date,
    queryFn: () => api.get<{ slots: Slot[] }>(`/public/availability/slots?serviceId=${serviceId}&date=${date}${professionalId ? `&professionalId=${professionalId}` : ''}`),
  });

  // Si cambia el profesional o servicio, se descarta la selección
  useEffect(() => {
    onChange(null, date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId, proKey]);

  const grid = useMemo(() => {
    const first = DateTime.fromISO(`${month}-01`);
    const blanks = first.weekday - 1;
    return { blanks, count: first.daysInMonth ?? 30 };
  }, [month]);

  const grouped = useMemo(() => {
    const list = slots.data?.slots ?? [];
    return PARTS.map((p) => ({ ...p, items: list.filter((s) => p.test(minutesOfDay(s.startsAt, tz))) })).filter((p) => p.items.length);
  }, [slots.data, tz]);

  const maxDate = DateTime.fromISO(today).plus({ days: maxDaysAhead }).toISODate()!;

  return (
    <div className="stack">
      <div className="cal">
        <div className="cal-head">
          <button className="btn icon sm ghost" disabled={month <= monthOf(today)} onClick={() => setMonth(addMonthsStr(month, -1))} aria-label="Mes anterior">
            <ChevronLeft size={18} />
          </button>
          <span>{monthTitle(month)}</span>
          <button className="btn icon sm ghost" disabled={month >= lastMonth} onClick={() => setMonth(addMonthsStr(month, 1))} aria-label="Mes siguiente">
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="cal-grid">
          {DOW.map((d, i) => (
            <div key={i} className="cal-dow">
              {d}
            </div>
          ))}
          {Array.from({ length: grid.blanks }).map((_, i) => (
            <div key={`b${i}`} className="cal-day blank" />
          ))}
          {Array.from({ length: grid.count }).map((_, i) => {
            const d = `${month}-${String(i + 1).padStart(2, '0')}`;
            const available = !!days.data?.days[d] && d >= today && d <= maxDate;
            return (
              <button
                key={d}
                className={`cal-day ${d === today ? 'today' : ''} ${d === date ? 'selected' : ''}`}
                disabled={!available}
                onClick={() => {
                  setDate(d);
                  onChange(null, d);
                }}
                aria-label={fmtDayLong(d, tz)}
                aria-pressed={d === date}
              >
                {days.isLoading ? <span className="skeleton" style={{ width: 22, height: 14 }} /> : i + 1}
              </button>
            );
          })}
        </div>
      </div>
      {days.isError && <ErrorBox error={days.error} onRetry={() => days.refetch()} />}

      {date && (
        <div>
          <div className="eyebrow">{fmtDayLong(date, tz)} · horarios libres</div>
          {slots.isLoading && (
            <div className="slots" style={{ marginTop: 10 }}>
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} h={52} r={14} />
              ))}
            </div>
          )}
          {slots.isError && <ErrorBox error={slots.error} onRetry={() => slots.refetch()} />}
          {slots.data && grouped.length === 0 && (
            <Empty icon={<CalendarX size={30} />} title="Se completó este día">
              Probá con otro día del calendario: los días con horarios libres están resaltados.
            </Empty>
          )}
          {grouped.map((part) => (
            <div key={part.label}>
              <div className="daypart muted small" style={{ fontWeight: 700 }}>
                {part.label}
              </div>
              <div className="slots">
                {part.items.map((s, i) => (
                  <button
                    key={s.startsAt}
                    className={`slot ${value?.startsAt === s.startsAt ? 'selected' : ''}`}
                    style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                    onClick={() => onChange(s, date)}
                    aria-pressed={value?.startsAt === s.startsAt}
                  >
                    {fmtTime(s.startsAt, tz)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {!date && <p className="muted small center">Elegí un día para ver los horarios disponibles.</p>}
    </div>
  );
}
