import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { Business } from './types';

type Mode = 'dark' | 'light';

interface Ctx {
  business: Business | undefined;
  isLoading: boolean;
  mode: Mode;
  toggleMode: () => void;
}

const BusinessContext = createContext<Ctx | null>(null);

const luminance = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** Inyecta la marca del negocio como variables CSS (así el sistema se adapta a cualquier rubro). */
export function applyBrand(accent: string, base: string) {
  const root = document.documentElement.style;
  root.setProperty('--brand', accent);
  root.setProperty('--brand-base', base);
  root.setProperty('--accent-ink', luminance(accent) > 0.34 ? '#1a1109' : '#ffffff');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', base);
}

const readMode = (): Mode => {
  try {
    const saved = localStorage.getItem('turnos.mode');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* sin storage */
  }
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
};

export function BusinessProvider({ children }: { children: ReactNode }) {
  const { data, isLoading } = useQuery({ queryKey: ['business'], queryFn: () => api.get<Business>('/public/business'), staleTime: 5 * 60_000 });
  const [mode, setMode] = useState<Mode>(readMode);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = mode;
    try {
      localStorage.setItem('turnos.mode', mode);
    } catch {
      /* sin storage */
    }
  }, [mode]);

  useEffect(() => {
    if (!data) return;
    applyBrand(data.accentColor, data.baseColor);
    document.title = `${data.name} · Reservá tu turno`;
  }, [data]);

  const value = useMemo<Ctx>(
    () => ({ business: data, isLoading, mode, toggleMode: () => setMode((m) => (m === 'dark' ? 'light' : 'dark')) }),
    [data, isLoading, mode],
  );
  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>;
}

export const useBusiness = () => {
  const ctx = useContext(BusinessContext);
  if (!ctx) throw new Error('useBusiness fuera de BusinessProvider');
  return ctx;
};
