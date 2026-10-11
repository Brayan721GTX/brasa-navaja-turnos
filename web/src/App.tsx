import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { PublicLayout } from './components/PublicLayout';
import { Skeleton } from './components/ui';
import Home from './pages/Home';
import Booking from './pages/Booking';
import Confirmation from './pages/Confirmation';
import ManageAppointment from './pages/ManageAppointment';
import Login from './pages/Login';

// El panel (con gráficos y agenda) se carga aparte para que la reserva del cliente sea ligera
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'));
const Dashboard = lazy(() => import('./pages/admin/Dashboard'));
const Agenda = lazy(() => import('./pages/admin/Agenda'));
const Services = lazy(() => import('./pages/admin/Services'));
const Professionals = lazy(() => import('./pages/admin/Professionals'));
const CalendarSettings = lazy(() => import('./pages/admin/CalendarSettings'));
const Customers = lazy(() => import('./pages/admin/Customers'));
const Settings = lazy(() => import('./pages/admin/Settings'));
const Emails = lazy(() => import('./pages/admin/Emails'));

const Loading = () => (
  <div className="container" style={{ padding: 40 }}>
    <Skeleton h={28} w={240} />
    <div style={{ height: 16 }} />
    <Skeleton h={260} r={20} />
  </div>
);

/** Cada vez que cambia la página arranca desde arriba (y se evita que el navegador restaure el scroll anterior). */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  }, []);
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <ScrollToTop />
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/reservar" element={<Booking />} />
          <Route path="/confirmado/:token" element={<Confirmation />} />
          <Route path="/turno/:token" element={<ManageAppointment />} />
        </Route>
        <Route path="/login" element={<Login />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="agenda" element={<Agenda />} />
          <Route path="servicios" element={<Services />} />
          <Route path="profesionales" element={<Professionals />} />
          <Route path="calendario" element={<CalendarSettings />} />
          <Route path="clientes" element={<Customers />} />
          <Route path="configuracion" element={<Settings />} />
          <Route path="emails" element={<Emails />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
