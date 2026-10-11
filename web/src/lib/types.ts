export interface Business {
  name: string;
  tagline: string;
  industry: string;
  logoUrl: string | null;
  accentColor: string;
  baseColor: string;
  heroTitle: string;
  heroSubtitle: string;
  bookingIntro: string;
  cancellationPolicy: string;
  cancellationHours: number;
  professionalLabel: string;
  professionalPlural: string;
  whatsappNumber: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  instagram: string | null;
  timezone: string;
  maxDaysAhead: number;
  demoMode: boolean;
}

export interface BusinessAdmin extends Business {
  slotStepMinutes: number;
  minNoticeMinutes: number;
}

export interface PublicService {
  id: string;
  name: string;
  description: string | null;
  durationMin: number;
  price: number;
  category: string | null;
  professionalIds: string[];
}

export interface PublicProfessional {
  id: string;
  name: string;
  bio: string | null;
  photoUrl: string | null;
  color: string;
  serviceIds: string[];
}

export interface Slot {
  startsAt: string;
  professionalId: string;
}

export type AppointmentStatus = 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW';

export interface PublicAppointment {
  token: string;
  status: AppointmentStatus;
  startsAt: string;
  endsAt: string;
  price: number;
  service: { id: string; name: string; durationMin: number };
  professional: { id: string; name: string };
  customer: { name: string; email: string | null; phone: string };
  canManage: boolean;
  manageReason: string | null;
  cancellationPolicy: string;
  calendarUrl: string;
  manageUrl: string;
}

export interface EmailPreview {
  to: string;
  subject: string;
  html: string;
}

export interface BookingResult {
  appointment: PublicAppointment;
  emailPreview: EmailPreview | null;
}

export type Role = 'ADMIN' | 'PROFESSIONAL';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  professionalId: string | null;
  isDemo: boolean;
}

export interface AdminAppointment {
  id: string;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  source: 'ONLINE' | 'ADMIN';
  price: number;
  notes: string | null;
  service: { id: string; name: string; durationMin: number };
  professional: { id: string; name: string; color: string };
  customer: { id: string; name: string; phone: string; email: string | null };
}

export interface AdminService {
  id: string;
  name: string;
  description: string | null;
  durationMin: number;
  price: number;
  category: string | null;
  active: boolean;
  position: number;
  professionalIds: string[];
}

export interface HoursRange {
  weekday: number;
  startMinute: number;
  endMinute: number;
}

export interface AdminProfessional {
  id: string;
  name: string;
  bio: string | null;
  photoUrl: string | null;
  color: string;
  position: number;
  active: boolean;
  serviceIds: string[];
  hours: HoursRange[];
  account: { email: string; isDemo: boolean } | null;
}

export interface Holiday {
  id: string;
  date: string;
  name: string;
}

export interface TimeBlock {
  id: string;
  professionalId: string | null;
  professional: { id: string; name: string; color: string } | null;
  startsAt: string;
  endsAt: string;
  reason: string | null;
}

export interface CustomerRow {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  totalAppointments: number;
  completed: number;
  cancelled: number;
  totalSpent: number;
  lastVisit: string | null;
}

export interface CustomerDetail {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  history: { id: string; startsAt: string; status: AppointmentStatus; price: number; service: string; professional: string }[];
}

export interface Dashboard {
  today: string;
  weekStart: string;
  weekEnd: string;
  todayCount: number;
  weekCount: number;
  weekRevenue: number;
  monthRevenue: number;
  cancellationRate: number;
  cancelledLast30: number;
  totalLast30: number;
  occupancy: { professionalId: string; name: string; color: string; bookedMinutes: number; availableMinutes: number; percent: number }[];
  topServices: { name: string; count: number; revenue: number }[];
  series: { date: string; appointments: number; revenue: number }[];
  upcoming: { id: string; startsAt: string; service: string; professional: string; professionalColor: string; customer: string }[];
}

export interface EmailLogRow {
  id: string;
  to: string;
  subject: string;
  html: string;
  sent: boolean;
  createdAt: string;
}
