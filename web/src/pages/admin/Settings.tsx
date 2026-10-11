import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Trash2, Wand2 } from 'lucide-react';
import { api } from '../../lib/api';
import { applyBrand } from '../../lib/business';
import type { BusinessAdmin } from '../../lib/types';
import { ErrorBox, LogoMark, Skeleton, Spinner, errText, useToast } from '../../components/ui';

type Form = Omit<BusinessAdmin, 'demoMode' | 'maxDaysAhead'> & { maxDaysAhead: number };

/** Plantillas por rubro: cambian marca, textos y etiquetas en un click (los servicios se cargan aparte). */
const PRESETS: { key: string; name: string; patch: Partial<Form> }[] = [
  {
    key: 'barberia',
    name: 'Barbería',
    patch: { industry: 'Barbería', accentColor: '#C8895A', baseColor: '#0F0E0D', professionalLabel: 'Barbero', professionalPlural: 'Barberos', heroTitle: 'Reservá tu turno en minutos', heroSubtitle: 'Elegí servicio, barbero y horario. Sin llamadas, sin esperas, sin crear cuenta.' },
  },
  {
    key: 'peluqueria',
    name: 'Peluquería',
    patch: { industry: 'Peluquería', accentColor: '#D98BA8', baseColor: '#14101A', professionalLabel: 'Estilista', professionalPlural: 'Estilistas', heroTitle: 'Tu mejor versión, con turno', heroSubtitle: 'Cortes, color y tratamientos. Elegí tu estilista y reservá en un minuto.' },
  },
  {
    key: 'consultorio',
    name: 'Consultorio',
    patch: { industry: 'Consultorio', accentColor: '#5BB5C4', baseColor: '#0C1416', professionalLabel: 'Profesional', professionalPlural: 'Profesionales', heroTitle: 'Pedí tu turno online', heroSubtitle: 'Elegí especialidad, profesional y horario. Recibís la confirmación por email.' },
  },
  {
    key: 'estetica',
    name: 'Estética',
    patch: { industry: 'Centro de estética', accentColor: '#C9A27A', baseColor: '#16120F', professionalLabel: 'Especialista', professionalPlural: 'Especialistas', heroTitle: 'Un momento para vos', heroSubtitle: 'Tratamientos faciales, corporales y más. Reservá tu turno cuando quieras.' },
  },
  {
    key: 'gimnasio',
    name: 'Gimnasio',
    patch: { industry: 'Gimnasio', accentColor: '#9BD05A', baseColor: '#0E120C', professionalLabel: 'Entrenador', professionalPlural: 'Entrenadores', heroTitle: 'Reservá tu clase', heroSubtitle: 'Clases, evaluaciones y entrenamiento personalizado. Asegurá tu lugar online.' },
  },
];

export default function Settings() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['admin', 'business'], queryFn: () => api.admin.get<BusinessAdmin>('/business') });
  const [f, setF] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (q.data && !f) setF(q.data);
  }, [q.data, f]);

  // Vista previa en vivo de los colores
  useEffect(() => {
    if (f) applyBrand(f.accentColor, f.baseColor);
  }, [f?.accentColor, f?.baseColor]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useMutation({
    mutationFn: (v: Form) => {
      const { ...rest } = v as Form & Record<string, unknown>;
      delete rest.updatedAt;
      delete rest.id;
      return api.admin.put<BusinessAdmin>('/business', rest);
    },
    onSuccess: (b) => {
      toast('Configuración guardada');
      setF(b);
      void qc.invalidateQueries({ queryKey: ['business'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'business'] });
    },
    onError: (e) => setError(errText(e)),
  });

  if (q.isLoading || !f) {
    return q.isError ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : <Skeleton h={400} r={18} />;
  }
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF({ ...f, [k]: v });
  const num = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => set(k, Number(e.target.value) as never);
  const txt = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(k, e.target.value as never);

  const onLogo = (file?: File) => {
    if (!file) return;
    if (file.size > 300_000) {
      toast('El logo debe pesar menos de 300 KB', true);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => set('logoUrl', String(reader.result));
    reader.readAsDataURL(file);
  };

  return (
    <form
      className="stack"
      style={{ gap: 20, maxWidth: 860 }}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        save.mutate(f);
      }}
    >
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <div className="eyebrow">Tu marca</div>
          <h1 className="display">Configuración del negocio</h1>
        </div>
        <button className="btn primary" disabled={save.isPending}>
          {save.isPending && <Spinner />} Guardar cambios
        </button>
      </div>

      <section className="card stack">
        <div className="row">
          <Wand2 size={18} className="accent" />
          <h3 className="display" style={{ fontSize: 20 }}>Adaptá el sistema a tu rubro</h3>
        </div>
        <p className="muted small">Aplicá una plantilla de colores y textos y después ajustá lo que quieras. Los servicios y el equipo se editan en sus secciones.</p>
        <div className="preset-grid">
          {PRESETS.map((p) => (
            <button type="button" key={p.key} className="preset" onClick={() => setF({ ...f, ...p.patch })}>
              <div className="row" style={{ gap: 6, marginBottom: 6 }}>
                <span className="dot" style={{ background: p.patch.accentColor }} />
                <span className="dot" style={{ background: p.patch.baseColor, outline: '1px solid var(--line)' }} />
              </div>
              <b>{p.name}</b>
              <div className="muted tiny">{p.patch.professionalPlural}</div>
            </button>
          ))}
        </div>
      </section>

      <section className="card stack">
        <h3 className="display" style={{ fontSize: 20 }}>Identidad</h3>
        <div className="logo-drop">
          <div className="logo-preview">
            <LogoMark size={64} />
          </div>
          <div className="stack-sm">
            <div className="row wrap">
              <label className="btn sm" style={{ cursor: 'pointer' }}>
                <ImagePlus size={15} /> Subir logo
                <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" hidden onChange={(e) => onLogo(e.target.files?.[0])} />
              </label>
              {f.logoUrl && (
                <button type="button" className="btn sm ghost" onClick={() => set('logoUrl', null)}>
                  <Trash2 size={14} /> Usar el isotipo por defecto
                </button>
              )}
            </div>
            <span className="muted tiny">PNG, JPG, SVG o WebP, hasta 300 KB.</span>
          </div>
        </div>
        <div className="form-grid two">
          <div className="field"><label htmlFor="bn">Nombre</label><input id="bn" className="input" value={f.name} onChange={txt('name')} /></div>
          <div className="field"><label htmlFor="bi">Rubro</label><input id="bi" className="input" value={f.industry} onChange={txt('industry')} /></div>
        </div>
        <div className="field"><label htmlFor="bt">Frase de marca</label><input id="bt" className="input" value={f.tagline} onChange={txt('tagline')} /></div>
        <div className="form-grid two">
          <div className="field">
            <label htmlFor="ca">Color de acento</label>
            <input id="ca" type="color" className="input" value={f.accentColor} onChange={txt('accentColor')} />
          </div>
          <div className="field">
            <label htmlFor="cb">Color de fondo (modo oscuro)</label>
            <input id="cb" type="color" className="input" value={f.baseColor} onChange={txt('baseColor')} />
          </div>
        </div>
        <p className="muted tiny">Los colores se ven en vivo en todo el panel mientras los cambiás.</p>
      </section>

      <section className="card stack">
        <h3 className="display" style={{ fontSize: 20 }}>Textos del sitio</h3>
        <div className="field"><label htmlFor="ht">Título principal</label><input id="ht" className="input" value={f.heroTitle} onChange={txt('heroTitle')} /></div>
        <div className="field"><label htmlFor="hs">Subtítulo</label><textarea id="hs" className="textarea" style={{ minHeight: 70 }} value={f.heroSubtitle} onChange={txt('heroSubtitle')} /></div>
        <div className="field"><label htmlFor="bin">Texto al iniciar la reserva</label><input id="bin" className="input" value={f.bookingIntro} onChange={txt('bookingIntro')} /></div>
        <div className="form-grid two">
          <div className="field"><label htmlFor="pl">Cómo le decís al profesional (singular)</label><input id="pl" className="input" value={f.professionalLabel} onChange={txt('professionalLabel')} /></div>
          <div className="field"><label htmlFor="pp">Plural</label><input id="pp" className="input" value={f.professionalPlural} onChange={txt('professionalPlural')} /></div>
        </div>
      </section>

      <section className="card stack">
        <h3 className="display" style={{ fontSize: 20 }}>Política de cancelación y reglas de reserva</h3>
        <div className="field"><label htmlFor="cp">Texto de la política</label><textarea id="cp" className="textarea" style={{ minHeight: 70 }} value={f.cancellationPolicy} onChange={txt('cancellationPolicy')} /></div>
        <div className="form-grid three">
          <div className="field"><label htmlFor="ch">Cancelar hasta (hs antes)</label><input id="ch" type="number" min={0} className="input" value={f.cancellationHours} onChange={num('cancellationHours')} /></div>
          <div className="field"><label htmlFor="mn">Aviso mínimo para reservar (min)</label><input id="mn" type="number" min={0} step={15} className="input" value={f.minNoticeMinutes} onChange={num('minNoticeMinutes')} /></div>
          <div className="field"><label htmlFor="md">Reservar hasta (días)</label><input id="md" type="number" min={1} max={180} className="input" value={f.maxDaysAhead} onChange={num('maxDaysAhead')} /></div>
        </div>
        <div className="field" style={{ maxWidth: 280 }}>
          <label htmlFor="ss">Intervalo entre horarios</label>
          <select id="ss" className="select" value={f.slotStepMinutes} onChange={(e) => set('slotStepMinutes', Number(e.target.value))}>
            {[5, 10, 15, 20, 30, 60].map((n) => <option key={n} value={n}>Cada {n} minutos</option>)}
          </select>
        </div>
      </section>

      <section className="card stack">
        <h3 className="display" style={{ fontSize: 20 }}>Contacto</h3>
        <div className="form-grid two">
          <div className="field"><label htmlFor="wa">WhatsApp (con código de país)</label><input id="wa" className="input" placeholder="5491155550123" value={f.whatsappNumber ?? ''} onChange={txt('whatsappNumber')} /></div>
          <div className="field"><label htmlFor="ph">Teléfono</label><input id="ph" className="input" value={f.phone ?? ''} onChange={txt('phone')} /></div>
          <div className="field"><label htmlFor="em">Email</label><input id="em" type="email" className="input" value={f.email ?? ''} onChange={txt('email')} /></div>
          <div className="field"><label htmlFor="ig">Instagram</label><input id="ig" className="input" value={f.instagram ?? ''} onChange={txt('instagram')} /></div>
        </div>
        <div className="field"><label htmlFor="ad">Dirección</label><input id="ad" className="input" value={f.address ?? ''} onChange={txt('address')} /></div>
      </section>

      {error && <div className="alert" role="alert">{error}</div>}
      <div>
        <button className="btn primary" disabled={save.isPending}>
          {save.isPending && <Spinner />} Guardar cambios
        </button>
      </div>
    </form>
  );
}
