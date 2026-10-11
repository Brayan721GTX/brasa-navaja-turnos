import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Banknote, CalendarCheck, CalendarDays, CalendarX2, CalendarPlus } from 'lucide-react';
import { DateTime } from 'luxon';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useBusiness } from '../../lib/business';
import { fmtDateTime, money } from '../../lib/format';
import type { Dashboard as Data } from '../../lib/types';
import { Empty, ErrorBox, Skeleton } from '../../components/ui';

const tip = {
  contentStyle: { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, fontSize: 13, color: 'var(--text)' },
  labelStyle: { color: 'var(--muted)', fontWeight: 700 },
  cursor: { stroke: 'var(--line)' },
};
const dayLabel = (d: string) => DateTime.fromISO(d).setLocale('es-AR').toFormat('d LLL');

function Kpi({ icon, label, value, sub, delay }: { icon: React.ReactNode; label: string; value: string; sub?: string; delay: number }) {
  return (
    <div className="kpi" style={{ animationDelay: `${delay}ms` }}>
      <div className="row eyebrow" style={{ gap: 8 }}>
        {icon} {label}
      </div>
      <div className="v">{value}</div>
      {sub && <div className="s">{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { business } = useBusiness();
  const tz = business?.timezone;
  const q = useQuery({ queryKey: ['admin', 'dashboard'], queryFn: () => api.admin.get<Data>('/dashboard') });
  const d = q.data;

  return (
    <div className="stack" style={{ gap: 0 }}>
      <div className="page-head">
        <div>
          <div className="eyebrow">{user?.role === 'ADMIN' ? 'Todo el negocio' : 'Tu agenda'}</div>
          <h1 className="display">Hola, {user?.name.split(' ')[0]} 👋</h1>
        </div>
        <Link to="/admin/agenda" className="btn primary">
          <CalendarPlus size={17} /> Ir a la agenda
        </Link>
      </div>

      {q.isError && <ErrorBox error={q.error} onRetry={() => q.refetch()} />}

      <div className="kpis">
        {q.isLoading
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} h={118} r={18} />)
          : d && (
              <>
                <Kpi delay={0} icon={<CalendarCheck size={15} />} label="Turnos de hoy" value={String(d.todayCount)} sub={`${d.weekCount} en la semana`} />
                <Kpi delay={60} icon={<CalendarDays size={15} />} label="Ingresos de la semana" value={money(d.weekRevenue)} sub="Estimado (confirmados + completados)" />
                <Kpi delay={120} icon={<Banknote size={15} />} label="Últimos 30 días" value={money(d.monthRevenue)} sub={`${d.totalLast30} turnos`} />
                <Kpi delay={180} icon={<CalendarX2 size={15} />} label="Tasa de cancelación" value={`${d.cancellationRate}%`} sub={`${d.cancelledLast30} de ${d.totalLast30} turnos`} />
              </>
            )}
      </div>

      <div className="dash-grid">
        <div className="card">
          <h3 className="title">Turnos por día · 2 semanas atrás y 2 adelante</h3>
          {q.isLoading ? (
            <Skeleton h={260} r={14} />
          ) : (
            d && (
              <div style={{ height: 370 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={d.series} margin={{ left: -18, right: 6, top: 8 }}>
                    <defs>
                      <linearGradient id="fillAcc" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--line)" strokeDasharray="3 5" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={dayLabel} tick={{ fill: 'var(--muted)', fontSize: 11 }} tickLine={false} axisLine={false} interval={2} />
                    <YAxis tick={{ fill: 'var(--muted)', fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip {...tip} labelFormatter={(l) => dayLabel(String(l))} formatter={(v) => [v, 'Turnos']} />
                    <ReferenceLine x={d.today} stroke="var(--muted)" strokeDasharray="4 4" label={{ value: 'Hoy', fill: 'var(--muted)', fontSize: 11, position: 'insideTopRight' }} />
                    <Area type="monotone" dataKey="appointments" stroke="var(--accent)" strokeWidth={2.5} fill="url(#fillAcc)" animationDuration={900} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )
          )}
        </div>

        <div className="card">
          <h3 className="title">Próximos turnos</h3>
          {q.isLoading && <Skeleton h={220} r={14} />}
          {d && d.upcoming.length === 0 && (
            <Empty icon={<CalendarDays size={28} />} title="Sin turnos próximos">
              Cuando alguien reserve, lo vas a ver acá.
            </Empty>
          )}
          {d?.upcoming.map((u) => (
            <div key={u.id} className="list-row">
              <span className="dot" style={{ background: u.professionalColor }} />
              <div className="grow">
                <div style={{ fontWeight: 700 }}>{u.customer}</div>
                <div className="muted small">
                  {u.service}
                  {user?.role === 'ADMIN' ? ` · ${u.professional}` : ''}
                </div>
              </div>
              <span className="small nowrap muted">{fmtDateTime(u.startsAt, tz)}</span>
            </div>
          ))}
        </div>

        <div className="card">
          <h3 className="title">Ocupación de la semana</h3>
          {q.isLoading && <Skeleton h={160} r={14} />}
          {d?.occupancy.map((o) => (
            <div key={o.professionalId} className="bar-row">
              <div className="row between small">
                <span className="row" style={{ gap: 8 }}>
                  <span className="dot" style={{ background: o.color }} />
                  <b>{o.name}</b>
                </span>
                <span className="muted">
                  {o.percent}% · {Math.round(o.bookedMinutes / 60)} h de {Math.round(o.availableMinutes / 60)} h
                </span>
              </div>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${o.percent}%`, background: o.color }} />
              </div>
            </div>
          ))}
        </div>

        <div className="card">
          <h3 className="title">Servicios más pedidos · 30 días</h3>
          {q.isLoading && <Skeleton h={220} r={14} />}
          {d && d.topServices.length === 0 && <Empty icon={<CalendarDays size={28} />} title="Todavía no hay datos" />}
          {d && d.topServices.length > 0 && (
            <div style={{ height: 250 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.topServices} layout="vertical" margin={{ left: 0, right: 16 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={118} tick={{ fill: 'var(--text)', fontSize: 12 }} tickLine={false} axisLine={false} />
                  <Tooltip {...tip} cursor={{ fill: 'var(--surface-2)' }} formatter={(v, _n, p) => [`${v} turnos · ${money((p.payload as { revenue: number }).revenue)}`, '']} />
                  <Bar dataKey="count" radius={[0, 8, 8, 0]} animationDuration={900} barSize={18}>
                    {d.topServices.map((_, i) => (
                      <Cell key={i} fill="var(--accent)" fillOpacity={1 - i * 0.13} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
