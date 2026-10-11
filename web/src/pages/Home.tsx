import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Clock, MapPin, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import { useBusiness } from '../lib/business';
import { duration, money } from '../lib/format';
import type { PublicProfessional, PublicService } from '../lib/types';
import { Avatar, Skeleton } from '../components/ui';

export default function Home() {
  const { business } = useBusiness();
  const services = useQuery({ queryKey: ['services'], queryFn: () => api.get<PublicService[]>('/public/services') });
  const pros = useQuery({ queryKey: ['professionals'], queryFn: () => api.get<PublicProfessional[]>('/public/professionals') });

  const title = business?.heroTitle ?? ' ';
  // La última palabra del título va en cursiva con el color de acento
  const words = title.split(' ');
  const last = words.pop();

  return (
    <main>
      <section className="hero">
        <div className="container">
          <div className="eyebrow">{business?.tagline}</div>
          <h1 className="display">
            {words.join(' ')} <span className="italic-accent">{last}</span>
          </h1>
          <p className="lead">{business?.heroSubtitle}</p>
          <div className="hero-actions">
            <Link to="/reservar" className="btn primary" style={{ padding: '15px 26px', fontSize: 16 }}>
              Reservar turno <ArrowRight size={18} />
            </Link>
            <a href="#servicios" className="btn ghost" style={{ padding: '15px 22px' }}>
              Ver servicios
            </a>
          </div>
          <div className="hero-meta">
            <span>
              <Clock size={16} /> Reserva en 1 minuto
            </span>
            <span>
              <ShieldCheck size={16} /> Sin crear cuenta
            </span>
            {business?.address && (
              <span>
                <MapPin size={16} /> {business.address}
              </span>
            )}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <h2 className="display">{business?.professionalPlural ?? 'Equipo'}</h2>
          <div className="team">
            {pros.isLoading && Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} h={96} r={20} />)}
            {pros.data?.map((p) => (
              <div key={p.id} className="card team-card">
                <Avatar name={p.name} color={p.color} photoUrl={p.photoUrl} size="lg" />
                <div>
                  <div style={{ fontWeight: 800, fontSize: 17 }}>{p.name}</div>
                  <p className="muted small" style={{ marginTop: 4 }}>
                    {p.bio}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="servicios">
        <div className="container narrow" style={{ maxWidth: 760 }}>
          <h2 className="display">Servicios y precios</h2>
          <div className="card">
            {services.isLoading && (
              <div className="stack">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} h={22} />
                ))}
              </div>
            )}
            <div className="price-list">
              {services.data?.map((s) => (
                <div key={s.id} className="price-row">
                  <div>
                    <div style={{ fontWeight: 700 }}>{s.name}</div>
                    <div className="muted small">
                      {duration(s.durationMin)}
                      {s.description ? ` · ${s.description}` : ''}
                    </div>
                  </div>
                  <span className="dots" />
                  <span className="display accent" style={{ fontSize: 20 }}>
                    {money(s.price)}
                  </span>
                </div>
              ))}
            </div>
            <Link to="/reservar" className="btn primary block mt">
              Elegir mi horario <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
