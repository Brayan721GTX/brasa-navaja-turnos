import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Check, Clock, Sparkles } from 'lucide-react';
import { api } from '../lib/api';
import { useBusiness } from '../lib/business';
import { duration, fmtDayLong, fmtTime, money } from '../lib/format';
import type { BookingResult, PublicProfessional, PublicService, Slot } from '../lib/types';
import { Avatar, ErrorBox, Skeleton, Spinner, errText } from '../components/ui';
import { SlotPicker } from '../components/SlotPicker';

const STEPS = ['Servicio', 'Profesional', 'Horario', 'Tus datos'];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function Booking() {
  const { business } = useBusiness();
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [back, setBack] = useState(false);
  const [service, setService] = useState<PublicService | null>(null);
  const [professionalId, setProfessionalId] = useState<string | null | undefined>(undefined); // undefined = sin elegir, null = "el primero"
  const [slot, setSlot] = useState<Slot | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', email: '', notes: '' });
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const services = useQuery({ queryKey: ['services'], queryFn: () => api.get<PublicService[]>('/public/services') });
  const pros = useQuery({ queryKey: ['professionals'], queryFn: () => api.get<PublicProfessional[]>('/public/professionals') });

  const tz = business?.timezone ?? 'America/Argentina/Buenos_Aires';
  const label = business?.professionalLabel ?? 'Profesional';

  const eligible = useMemo(() => (pros.data ?? []).filter((p) => service && p.serviceIds.includes(service.id)), [pros.data, service]);
  const grouped = useMemo(() => {
    const map = new Map<string, PublicService[]>();
    for (const s of services.data ?? []) map.set(s.category ?? 'Servicios', [...(map.get(s.category ?? 'Servicios') ?? []), s]);
    return [...map.entries()];
  }, [services.data]);

  const chosenPro = slot ? pros.data?.find((p) => p.id === slot.professionalId) : undefined;

  const go = (n: number) => {
    setBack(n < step);
    setStep(n);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const errors = {
    name: form.name.trim().length < 2 ? 'Ingresá tu nombre' : '',
    phone: form.phone.replace(/\D/g, '').length < 8 ? 'Ingresá un teléfono válido' : '',
    email: !EMAIL_RE.test(form.email.trim()) ? 'Ingresá un email válido' : '',
  };
  const valid = !errors.name && !errors.phone && !errors.email;

  const book = useMutation({
    mutationFn: () =>
      api.post<BookingResult>('/public/appointments', {
        serviceId: service!.id,
        professionalId: professionalId ?? null,
        startsAt: slot!.startsAt,
        customer: { name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim() },
        notes: form.notes.trim() || null,
      }),
    onSuccess: (res) => {
      try {
        if (res.emailPreview) sessionStorage.setItem(`email.${res.appointment.token}`, JSON.stringify(res.emailPreview));
      } catch {
        /* sin storage */
      }
      nav(`/confirmado/${res.appointment.token}`, { replace: true, state: { fresh: true } });
    },
    onError: (e: unknown) => {
      setServerError(errText(e));
      // Si el horario se ocupó, lo mandamos a elegir otro
      if ((e as { code?: string }).code === 'SLOT_TAKEN') {
        setSlot(null);
        go(2);
      }
    },
  });

  const submit = () => {
    setTouched(true);
    if (!valid) return;
    setServerError(null);
    book.mutate();
  };

  return (
    <main className="booking">
      <div className="container narrow">
        <div className="stepper">
          <div className="progress" aria-hidden="true">
            {STEPS.map((_, i) => (
              <i key={i} className={i <= step ? 'done' : ''} />
            ))}
          </div>
          <div className="stepper-row">
            {step > 0 ? (
              <button className="btn sm ghost" onClick={() => go(step - 1)}>
                <ArrowLeft size={16} /> Atrás
              </button>
            ) : (
              <Link to="/" className="btn sm ghost">
                <ArrowLeft size={16} /> Inicio
              </Link>
            )}
            <span className="eyebrow">
              Paso {step + 1} de 4 · {STEPS[step]}
            </span>
          </div>
        </div>

        {serverError && (
          <div className="alert" style={{ marginBottom: 16 }} role="alert">
            {serverError}
          </div>
        )}

        {/* ── 1. Servicio ── */}
        {step === 0 && (
          <section className={`step-panel ${back ? 'back' : ''}`} key="s0">
            <h1 className="display step-title">¿Qué te hacemos hoy?</h1>
            <p className="muted">{business?.bookingIntro}</p>
            {services.isLoading && (
              <div className="svc-list">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} h={74} r={16} />
                ))}
              </div>
            )}
            {services.isError && <ErrorBox error={services.error} onRetry={() => services.refetch()} />}
            {grouped.map(([cat, list]) => (
              <div key={cat} className="svc-group">
                <div className="eyebrow">{cat}</div>
                <div className="svc-list">
                  {list.map((s) => (
                    <button
                      key={s.id}
                      className={`choice ${service?.id === s.id ? 'selected' : ''}`}
                      onClick={() => {
                        setService(s);
                        setProfessionalId(undefined);
                        setSlot(null);
                        go(1);
                      }}
                    >
                      <div className="grow">
                        <div className="name">{s.name}</div>
                        <div className="muted small row" style={{ gap: 6 }}>
                          <Clock size={13} /> {duration(s.durationMin)}
                        </div>
                        {s.description && <div className="muted tiny" style={{ marginTop: 2 }}>{s.description}</div>}
                      </div>
                      <div className="price">{money(s.price)}</div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}

        {/* ── 2. Profesional ── */}
        {step === 1 && service && (
          <section className={`step-panel ${back ? 'back' : ''}`} key="s1">
            <h1 className="display step-title">¿Con quién?</h1>
            <p className="muted">
              {service.name} · {duration(service.durationMin)} · {money(service.price)}
            </p>
            <div className="pros-grid mt">
              <button
                className={`choice ${professionalId === null ? 'selected' : ''}`}
                onClick={() => {
                  setProfessionalId(null);
                  setSlot(null);
                  go(2);
                }}
              >
                <span className="avatar" style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}>
                  <Sparkles size={22} />
                </span>
                <div className="grow">
                  <div className="name">El primero disponible</div>
                  <div className="muted small">Te asignamos el horario más cercano</div>
                </div>
              </button>
              {pros.isLoading && <Skeleton h={84} r={16} />}
              {eligible.map((p) => (
                <button
                  key={p.id}
                  className={`choice ${professionalId === p.id ? 'selected' : ''}`}
                  onClick={() => {
                    setProfessionalId(p.id);
                    setSlot(null);
                    go(2);
                  }}
                >
                  <Avatar name={p.name} color={p.color} photoUrl={p.photoUrl} />
                  <div className="grow">
                    <div className="name">{p.name}</div>
                    <div className="muted small">{p.bio}</div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ── 3. Día y horario ── */}
        {step === 2 && service && professionalId !== undefined && (
          <section className={`step-panel ${back ? 'back' : ''}`} key="s2">
            <h1 className="display step-title">¿Qué día y a qué hora?</h1>
            <div className="chips" style={{ margin: '10px 0 18px' }}>
              <button className="chip plain selected" onClick={() => go(1)}>
                {professionalId === null ? 'Primero disponible' : pros.data?.find((p) => p.id === professionalId)?.name} · cambiar
              </button>
            </div>
            <SlotPicker
              serviceId={service.id}
              professionalId={professionalId}
              tz={tz}
              maxDaysAhead={business?.maxDaysAhead ?? 30}
              value={slot}
              onChange={(s) => setSlot(s)}
            />
          </section>
        )}

        {/* ── 4. Datos ── */}
        {step === 3 && service && slot && (
          <section className={`step-panel ${back ? 'back' : ''}`} key="s3">
            <h1 className="display step-title">Casi listo</h1>
            <p className="muted">Sin crear cuenta. Te mandamos la confirmación por email.</p>

            <div className="card mt summary">
              <div className="r">
                <span>Servicio</span>
                <b>{service.name}</b>
              </div>
              <div className="r">
                <span>{label}</span>
                <b>{chosenPro?.name}</b>
              </div>
              <div className="r">
                <span>Cuándo</span>
                <b>
                  {fmtDayLong(slot.startsAt, tz)} · {fmtTime(slot.startsAt, tz)} hs
                </b>
              </div>
              <div className="r total">
                <span>Total</span>
                <b>{money(service.price)}</b>
              </div>
            </div>

            <form
              className="stack mt"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
              noValidate
            >
              <div className="field">
                <label htmlFor="name">Nombre y apellido</label>
                <input id="name" className={`input ${touched && errors.name ? 'invalid' : ''}`} autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                {touched && errors.name && <span className="error">{errors.name}</span>}
              </div>
              <div className="form-grid two">
                <div className="field">
                  <label htmlFor="phone">Teléfono / WhatsApp</label>
                  <input id="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="11 5555-1234" className={`input ${touched && errors.phone ? 'invalid' : ''}`} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  {touched && errors.phone && <span className="error">{errors.phone}</span>}
                </div>
                <div className="field">
                  <label htmlFor="email">Email</label>
                  <input id="email" type="email" inputMode="email" autoComplete="email" className={`input ${touched && errors.email ? 'invalid' : ''}`} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  {touched && errors.email && <span className="error">{errors.email}</span>}
                </div>
              </div>
              <div className="field">
                <label htmlFor="notes">Algo que debamos saber (opcional)</label>
                <textarea id="notes" className="textarea" maxLength={300} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <p className="muted small">{business?.cancellationPolicy}</p>
              <button type="submit" hidden />
            </form>
          </section>
        )}
      </div>

      {step === 2 && slot && (
        <div className="sticky-cta">
          <div className="container narrow">
            <div className="grow small">
              <b>{fmtDayLong(slot.startsAt, tz)}</b>
              <div className="muted">{fmtTime(slot.startsAt, tz)} hs</div>
            </div>
            <button className="btn primary" style={{ padding: '14px 28px' }} onClick={() => go(3)}>
              Continuar
            </button>
          </div>
        </div>
      )}
      {step === 3 && (
        <div className="sticky-cta">
          <div className="container narrow">
            <button className="btn primary block" style={{ padding: 16, fontSize: 16 }} disabled={book.isPending} onClick={submit}>
              {book.isPending ? <Spinner /> : <Check size={18} />} Confirmar turno
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
